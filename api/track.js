
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const { id } = req.query;

    if (!id) {
        return res.status(400).send('Missing tracking ID');
    }

    // Initialize Supabase with Service Role Key to bypass RLS
    // Note: Vercel defines system env vars, make sure VITE_SUPABASE_URL is accessible or use standard SUPABASE_URL
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_KEY; // Fallback to anon key if service key missing, but RLS might block

    if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);

        try {
            // Check current status first to not overwrite 'opened_at' if already opened
            const { data: current } = await supabase
                .from('emails')
                .select('status')
                .eq('tracking_id', id)
                .single();

            if (current && current.status !== 'opened') {
                await supabase
                    .from('emails')
                    .update({
                        status: 'opened',
                        opened_at: new Date().toISOString()
                    })
                    .eq('tracking_id', id);
            }
        } catch (error) {
            console.error('Tracking Error:', error);
        }
    }

    // Return transparent 1x1 GIF
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Content-Length', pixel.length);
    // Prevent caching strictly
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    res.status(200).send(pixel);
}
