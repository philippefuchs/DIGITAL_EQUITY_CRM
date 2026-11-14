import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. RECEPTION DES DONNÉES
        const {
            name, job, linkedinUrl, email, photoUrl, company, address, website
        } = req.body || {};

        // 2. PRÉPARATION BASIQUE
        const nameParts = (name || "").split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || "";

        let finalPhotoUrl = photoUrl;
        if (photoUrl && photoUrl.startsWith('data:image')) finalPhotoUrl = null;

        // --- 🚨 LA SÉCURITÉ ANTI-ÉCRASEMENT ---

        // A. On regarde si le contact existe déjà (1) par URL LinkedIn, (2) sinon par email + même nom
        const COLS = 'id, first_name, last_name, linkedin_url, email, address, website, photo_url, category, status';
        let existingContact: any = null;
        let matchedByEmail = false;

        if (linkedinUrl) {
            const { data: byLinkedin } = await supabase
                .from('contacts')
                .select(COLS)
                .eq('linkedin_url', linkedinUrl)
                .maybeSingle();
            existingContact = byLinkedin;
        }

        if (!existingContact && email && email.trim() !== "") {
            const { data: byEmail } = await supabase
                .from('contacts')
                .select(COLS)
                .ilike('email', email.trim())
                .limit(10);
            const norm = (v: any) => (v || '').toString().trim().toLowerCase();
            existingContact = (byEmail || []).find(
                (c: any) => norm(c.first_name) === norm(firstName) && norm(c.last_name) === norm(lastName)
            ) || null;
            matchedByEmail = !!existingContact;
        }

        // B. On décide quelle donnée garder
        // Logique : Si la nouvelle donnée est vide ET que l'ancienne existe, on garde l'ancienne.

        const safeEmail = (email && email.trim() !== "")
            ? email
            : (existingContact?.email || null);

        const safeAddress = (address && address.trim() !== "")
            ? address
            : (existingContact?.address || null);

        const safeWebsite = (website && website.trim() !== "")
            ? website
            : (existingContact?.website || null);

        // Pour la photo, on garde l'ancienne si la nouvelle est vide ou nulle
        const safePhoto = finalPhotoUrl || existingContact?.photo_url || null;


        // 3. INSERTION / MISE À JOUR
        // Catégorie et statut : on ne touche jamais à ceux d'un contact existant,
        // un nouveau contact arrive en "Prospect" / "New".
        const payload: any = {
            linkedin_url: (matchedByEmail && existingContact?.linkedin_url) ? existingContact.linkedin_url : linkedinUrl,
            first_name: firstName,
            last_name: lastName,
            title: job,
            company: company,
            email: safeEmail,
            address: safeAddress,
            website: safeWebsite,
            photo_url: safePhoto,
            category: existingContact?.category || 'prospect',
            status: existingContact?.status || 'New',
            data: {
                source: 'chrome_extension',
                imported_at: new Date().toISOString(),
                last_updated: new Date().toISOString()
            }
        };

        const { data, error } = matchedByEmail
            ? await supabase.from('contacts').update(payload).eq('id', existingContact.id).select()
            : await supabase.from('contacts').upsert(payload, { onConflict: 'linkedin_url', ignoreDuplicates: false }).select();

        if (error) throw error;

        return res.status(200).json({ success: true, contact: data });

    } catch (error) {
        console.error('Erreur API:', error);
        return res.status(500).json({ error: error.message });
    }
}
