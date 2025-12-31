
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const { id } = req.query;

    if (!id) {
        return res.status(400).send('Missing tracking ID');
    }

    // Initialize Supabase
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_KEY;

    console.log("Tracking request for ID:", id);
    console.log("Supabase URL present:", !!supabaseUrl);
    console.log("Supabase Key present:", !!supabaseKey);

    if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);

        try {
            // Check current status
            const { data: current, error: selectError } = await supabase
                .from('emails')
                .select('status')
                .eq('tracking_id', id)
                .single();

            if (selectError) console.error("Select Error:", selectError);

            if (current && current.status !== 'opened') {
                const { error: updateError } = await supabase
                    .from('emails')
                    .update({
                        status: 'opened',
                        opened_at: new Date().toISOString()
                    })
                    .eq('tracking_id', id);

                if (updateError) console.error("Update Error:", updateError);
                else console.log("Successfully updated status to opened");
            } else {
                console.log("Already opened or not found");
            }
        } catch (error) {
            console.error('Tracking Logic Error:', error);
        }
    } else {
        console.error("Missing Environment Variables on Server");
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
