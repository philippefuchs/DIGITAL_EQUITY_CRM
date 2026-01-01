import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. D'ABORD : On répond aux règles de sécurité (CORS)
  // On le fait avant tout le reste pour être sûr que ça part.
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 2. GESTION DU "PREFLIGHT" (La demande de permission de Chrome)
  // Si Chrome demande "Je peux venir ?", on répond "Oui" tout de suite.
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. Vérification de la méthode
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 4. Initialisation de Supabase (À L'INTÉRIEUR du try/catch)
    // C'est ici que ça plantait avant si les clés manquaient.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Les clés Supabase (URL ou KEY) sont manquantes sur Vercel !");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 5. Récupération des données
    const { name, job, linkedinUrl, email, photoUrl } = req.body;

    // 6. Envoi vers Supabase
    const { data, error } = await supabase
      .from('leads')
      .upsert({
        contact_name: name,
        job_title: job,
        linkedin_profile: linkedinUrl,
        email: email || null,
        image_url: photoUrl || null,
        source: 'chrome_extension',
        status: 'new_lead',
        //⚠️ REMETTEZ VOTRE ID UTILISATEUR ICI
        user_id: 'votre-uuid-supabase-a-coller-ici', 
      }, { 
        onConflict: 'linkedin_profile',
        ignoreDuplicates: true 
      })
      .select();

    if (error) throw error;

    return res.status(200).json({ success: true, lead: data });

  } catch (error) {
    console.error('Erreur API:', error);
    // On renvoie l'erreur au lieu de laisser le serveur planter
    return res.status(500).json({ error: error.message });
  }
}