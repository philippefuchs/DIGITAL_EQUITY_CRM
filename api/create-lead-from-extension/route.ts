import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 1. Initialisation de Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 2. Gestion des droits d'accès (CORS) - Pour que Chrome accepte de parler au serveur
function setCorsHeaders(res: NextResponse) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return res;
}

export async function OPTIONS() {
  const response = NextResponse.json({});
  return setCorsHeaders(response);
}

// 3. La logique de création
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // On récupère toutes les infos envoyées par l'extension
    const { name, job, linkedinUrl, email, photoUrl } = body;

    // 4. Insertion dans Supabase
    const { data, error } = await supabase
      .from('leads')
      .upsert({
        contact_name: name,         
        job_title: job,             
        linkedin_profile: linkedinUrl,
        email: email || null,       
        image_url: photoUrl || null, // On sauvegarde la photo ici !
        source: 'chrome_extension',
        status: 'new_lead',
        
        // ⚠️ TRES IMPORTANT : Mettez votre ID ici pour le test
        // Allez dans Supabase > Authentication > Users pour copier votre UID
        user_id: 'votre-uuid-supabase-a-coller-ici', 
        
      }, { 
        onConflict: 'linkedin_profile', // Evite les doublons si le profil existe déjà
        ignoreDuplicates: true 
      })
      .select();

    if (error) {
      console.error('Erreur Supabase:', error);
      const response = NextResponse.json({ error: error.message }, { status: 500 });
      return setCorsHeaders(response);
    }

    const response = NextResponse.json({ success: true, lead: data });
    return setCorsHeaders(response);

  } catch (error) {
    const response = NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    return setCorsHeaders(response);
  }
}