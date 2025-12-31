
import React, { useState } from 'react';
import { Send, Image as ImageIcon, Sparkles } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { supabase } from '../services/supabase';
import { useToast } from './ToastProvider';

interface EmailSenderProps {
    contactId: string;
    contactEmail: string;
    contactName: string;
    onSuccess?: () => void;
}

const EmailSender: React.FC<EmailSenderProps> = ({ contactId, contactEmail, contactName, onSuccess }) => {
    const { showToast } = useToast();
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);

        // 1. Charger la configuration (Priority: localStorage > Supabase)
        let configToUse: any = null;
        try {
            const savedConfig = localStorage.getItem('leadgen_emailjs_config');
            if (savedConfig) {
                configToUse = JSON.parse(savedConfig);
            } else {
                // Fallback if supabase is available
                if (supabase) {
                    const { data: s } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
                    if (s?.data) configToUse = s.data;
                }
            }
        } catch (err) {
            console.error("Config Error:", err);
        }

        if (!configToUse?.emailjsServiceId || !configToUse?.emailjsTemplateId || !configToUse?.emailjsPublicKey) {
            showToast("Erreur: EmailJS non configuré. Allez dans Maintenance (ou Settings).", "error");
            setSending(false);
            return;
        }

        // Wait for Supabase connection if needed, though we checked config
        if (!supabase) {
            showToast("Erreur: Supabase non connecté.", "error");
            setSending(false);
            return;
        }

        try {
            // 2. Créer l'entrée en base pour obtenir le tracking_id
            const { data: emailRecord, error: dbError } = await supabase
                .from('emails')
                .insert([{
                    // Use loose ID handling to support both Int and UUID
                    lead_id: (contactId && contactId !== 'new') ? contactId : null,
                    status: 'sent',
                    subject: subject,
                    body: message
                }])
                .select()
                .single();

            if (dbError) throw dbError;

            // 3. Construire le pixel de tracking
            const trackingUrl = `${window.location.origin}/api/track?id=${emailRecord.tracking_id}`;
            const pixelHtml = `<img src="${trackingUrl}" width="1" height="1" style="display:none;" alt="" />`;

            // 4. Envoyer via EmailJS
            const templateParams = {
                to_email: contactEmail,
                to_name: contactName,
                subject: subject,
                message: message,
                tracking_pixel: pixelHtml,
                // Support extended variable names to match what CampaignManager uses
                email: contactEmail,
                recipient_email: contactEmail,
                firstName: contactName.split(' ')[0],
                lastName: contactName.split(' ').slice(1).join(' '),
                company: "",
                from_name: configToUse.senderName || "LeadGen Pro",
                reply_to: configToUse.senderEmail || ''
            };

            await emailjs.send(
                configToUse.emailjsServiceId,
                configToUse.emailjsTemplateId,
                templateParams,
                configToUse.emailjsPublicKey
            );

            // 5. Interaction Log
            await supabase.from('interactions').insert([{
                contact_id: (contactId && contactId !== 'new') ? contactId : null,
                type: 'email',
                content: `Email envoyé: "${subject}"`
            }]);

            showToast("Email envoyé avec succès !", "success");
            setSubject('');
            setMessage('');
            if (onSuccess) onSuccess();

        } catch (error: any) {
            console.error("Email error:", error);
            let errorMessage = "Une erreur inconnue est survenue";

            if (error?.message) errorMessage = error.message;
            else if (error?.text) errorMessage = error.text; // EmailJS specific
            else if (typeof error === 'string') errorMessage = error;

            showToast(`Erreur d'envoi: ${errorMessage}`, "error");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                <Send size={16} /> Nouveau Message
            </h3>
            <form onSubmit={handleSend} className="space-y-4">
                <div>
                    <input
                        required
                        placeholder="Objet..."
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/10"
                    />
                </div>
                <div>
                    <textarea
                        required
                        rows={6}
                        placeholder="Votre message..."
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        className="w-full p-4 bg-slate-50 rounded-2xl font-medium text-sm outline-none resize-none focus:ring-2 focus:ring-indigo-500/10"
                    />
                </div>
                <div className="flex justify-between items-center">
                    <button type="button" className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1 hover:text-indigo-600 transition">
                        <Sparkles size={14} /> Générer avec IA (Coming Soon)
                    </button>
                    <button
                        type="submit"
                        disabled={sending}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
                    >
                        {sending ? 'Envoi...' : <>Envoyer <Send size={14} /></>}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EmailSender;
