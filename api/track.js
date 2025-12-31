
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

    // CORS Headers (Critical for email tracking pixels served to Gmail/Outlook)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (supabaseUrl && supabaseKey) {
        // Service Role Client (No Auth Persistence)
        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        try {
            // Check current status
            const { data: current, error: selectError } = await supabase
                .from('emails')
                .select('status, lead_id')
                .eq('tracking_id', id)
                .single();

            if (selectError) console.error("Select Error:", selectError);

            if (current && current.status !== 'opened') {
                // 1. Update Email Status
                const { error: updateError } = await supabase
                    .from('emails')
                    .update({
                        status: 'opened',
                        opened_at: new Date().toISOString()
                    })
                    .eq('tracking_id', id);

                if (updateError) console.error("Update Error:", updateError);
                else console.log("Successfully updated status to opened");

                // 2. Boost Contact Score (+5 points, max 100)
                if (current.lead_id) {
                    try {
                        const { data: contact, error: contactError } = await supabase
                            .from('contacts')
                            .select('score, score_reason')
                            .eq('id', current.lead_id)
                            .maybeSingle();

                        if (contact && !contactError) {
                            const currentScore = contact.score || 0;
                            const newScore = Math.min(currentScore + 5, 100);

                            // Prevent spamming reason if already high, but usually we log every meaningful interaction
                            const reasonLine = `[${new Date().toLocaleDateString('fr-FR')}] Email Campaign Lu (+5 pts)`;
                            const newReason = contact.score_reason
                                ? `${contact.score_reason}\n${reasonLine}`
                                : reasonLine;

                            const { error: scoreError } = await supabase
                                .from('contacts')
                                .update({
                                    score: newScore,
                                    score_reason: newReason
                                })
                                .eq('id', current.lead_id);

                            if (scoreError) console.error("Score Update Error:", scoreError);
                            else console.log(`Score boosted for lead ${current.lead_id}: ${currentScore} -> ${newScore}`);
                        }
                    } catch (scoreErr) {
                        console.error("Score Logic Error:", scoreErr);
                    }
                }

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
