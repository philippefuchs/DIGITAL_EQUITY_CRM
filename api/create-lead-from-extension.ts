import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // CONFIGURATION DES HEADERS (CORS)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. RÉCUPÉRATION DES DONNÉES ENVOYÉES PAR L'EXTENSION
        const {
            name,
            job,
            linkedinUrl,
            email,
            photoUrl,
            company,
            address, // ✅ On récupère l'adresse
            website  // ✅ On récupère le site web
        } = req.body || {};

        // 2. DÉCOUPAGE PRÉNOM / NOM
        const nameParts = (name || "").split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || "";

        // 3. NETTOYAGE PHOTO
        let finalPhotoUrl = photoUrl;
        if (photoUrl && photoUrl.startsWith('data:image')) finalPhotoUrl = null;

        // 4. INSERTION EN BASE DE DONNÉES
        const { data, error } = await supabase
            .from('contacts')
            .upsert({
                linkedin_url: linkedinUrl, // La clé unique
                first_name: firstName,
                last_name: lastName,
                title: job,
                company: company,

                // ✅ C'est ici que l'enregistrement se fait
                email: email || null,
                address: address || null,
                website: website || null,

                photo_url: finalPhotoUrl,
                data: {
                    source: 'chrome_extension',
                    imported_at: new Date().toISOString()
                }
            }, {
                onConflict: 'linkedin_url',
                ignoreDuplicates: false // false = on met à jour les infos si le contact existe déjà
            })
            .select();

        if (error) throw error;

        return res.status(200).json({ success: true, contact: data });

    } catch (error) {
        console.error('Erreur API:', error);
        return res.status(500).json({ error: error.message });
    }
}
