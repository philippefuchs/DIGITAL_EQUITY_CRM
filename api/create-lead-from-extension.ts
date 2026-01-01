import { createClient } from '@supabase/supabase-js';

// Initialisation de Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// C'est la syntaxe standard pour les "Vercel Functions" (pas Next.js)
export default async function handler(req, res) {
  
  // 1. FORCER LES HEADERS CORS (Sécurité)
  // On les met ici aussi pour être sûr que le serveur répond toujours
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 2. GESTION DU "PREFLIGHT" (La demande de permission de Chrome)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 3. Vérifier que c'est bien une requête POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Sur Vercel Functions, req.body est déjà un objet JSON
    const { name, job, linkedinUrl, email, photoUrl } = req.body;

    // 4. Envoi vers Supabase
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
        
        // ⚠️ REMETTEZ VOTRE ID UTILISATEUR ICI
        user_id: 'votre-uuid-supabase-a-coller-ici', 
      }, { 
        onConflict: 'linkedin_profile',
        ignoreDuplicates: true 
      })
      .select();

    if (error) throw error;

    // Succès !
    return res.status(200).json({ success: true, lead: data });

  } catch (error) {
    console.error('Erreur API:', error);
    return res.status(500).json({ error: error.message });
  }
}