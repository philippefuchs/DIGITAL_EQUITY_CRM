import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // --- HEADERS ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // --- CONNEXION ---
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) throw new Error("Clés Supabase manquantes");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- PRÉPARATION ---
    const { name, job, linkedinUrl, email, photoUrl } = req.body || {};

    const nameParts = (name || "").split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || "";

    // --- INSERTION ---
    const { data, error } = await supabase
      .from('contacts')
      .upsert({
        first_name: firstName,
        last_name: lastName,
        title: job,
        email: email || null,
        linkedin_url: linkedinUrl,
        
        // ✅ ON UTILISE LA NOUVELLE COLONNE
        photo_url: photoUrl || null, 

        // On garde 'data' pour les infos techniques si besoin
        data: {
            source: 'chrome_extension',
            imported_at: new Date().toISOString()
        }
      }, { 
        onConflict: 'linkedin_url', 
        ignoreDuplicates: true 
      })
      .select();

    if (error) throw error;

    return res.status(200).json({ success: true, contact: data });

  } catch (error) {
    console.error('Erreur API:', error);
    return res.status(500).json({ error: error.message });
  }
}