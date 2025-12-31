import React, { useState, useEffect } from 'react';
import { Send, Image as ImageIcon, Sparkles, BookOpen, X } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { supabase } from '../services/supabase';
import { useToast } from './ToastProvider';
import { EmailTemplate } from '../types';

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

    // Templates
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);

    useEffect(() => {
        const PREDEFINED: EmailTemplate[] = [
            {
                id: 'def_1',
                name: 'Invitation Salon',
                subject: 'Invitation : Venez nous rencontrer !',
                body: "Bonjour {{Prénom}},\n\nNous serions ravis de vous accueillir sur notre stand lors du prochain salon. Ce serait l'occasion idéale pour échanger sur vos projets.\n\nCordialement,",
                category: 'Prospect',
                createdAt: new Date().toISOString()
            },
            {
                id: 'def_2',
                name: 'Demande de RDV',
                subject: 'Proposition de rendez-vous',
                body: "Bonjour {{Prénom}},\n\nJe souhaiterais échanger avec vous concernant vos besoins. Auriez-vous des disponibilités la semaine prochaine ?\n\nBien à vous,",
                category: 'Prospect',
                createdAt: new Date().toISOString()
            },
            {
                id: 'def_3',
                name: 'Relance Simple',
                subject: 'Re: Notre dernier échange',
                body: "Bonjour {{Prénom}},\n\nJe me permets de revenir vers vous suite à mon précédent message. Avez-vous eu le temps d'y réfléchir ?\n\nCordialement,",
                category: 'Relance',
                createdAt: new Date().toISOString()
            }
        ];

        const stored = localStorage.getItem('leadgen_email_templates');
        if (stored) {
            try {
                const custom = JSON.parse(stored);
                setTemplates([...PREDEFINED, ...custom]);
            } catch (e) {
                console.error("Error loading templates", e);
                setTemplates(PREDEFINED);
            }
        } else {
            setTemplates(PREDEFINED);
        }
    }, []);

    const applyTemplate = (tpl: EmailTemplate) => {
        let newSubject = tpl.subject || '';
        let newBody = tpl.body || '';

        // Replace placeholders
        const firstName = contactName.split(' ')[0] || '';
        const lastName = contactName.split(' ').slice(1).join(' ') || '';

        const replace = (text: string) => {
            return text
                .replace(/\{\{Prénom\}\}/gi, firstName)
                .replace(/\{\{Nom\}\}/gi, lastName)
                // We don't have company in props easily, leaving generic or empty
                .replace(/\{\{company\}\}/gi, 'votre société');
        };

        setSubject(replace(newSubject));
        setMessage(replace(newBody));
        setShowTemplates(false);
        showToast("Modèle appliqué !", "success");
    };

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
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm relative">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Send size={16} /> Nouveau Message
                </h3>
                <button
                    type="button"
                    onClick={() => setShowTemplates(!showTemplates)}
                    className="text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                    <BookOpen size={14} /> Modèles
                </button>
            </div>

            {/* Template Selector Overlay */}
            {showTemplates && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-10 rounded-[32px] p-6 flex flex-col animate-in fade-in duration-200">
                    <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-900">Choisir un modèle</h4>
                        <button onClick={() => setShowTemplates(false)} className="text-slate-400 hover:text-rose-500"><X size={16} /></button>
                    </div>

                    {templates.length > 0 ? (
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                            {templates.map((tpl, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => applyTemplate(tpl)}
                                    className="w-full text-left p-3 rounded-xl hover:bg-indigo-50 border border-transparent hover:border-indigo-100 group transition-all"
                                >
                                    <p className="text-[11px] font-bold text-slate-800 uppercase truncate group-hover:text-indigo-700">{tpl.name}</p>
                                    <p className="text-[10px] text-slate-400 truncate mt-1">{tpl.subject}</p>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                            <BookOpen size={24} className="text-slate-200 mb-2" />
                            <p className="text-[10px] uppercase font-black text-slate-400">Aucun modèle trouvé</p>
                            <p className="text-[9px] text-slate-300 mt-1 max-w-[200px] leading-relaxed">
                                Créez vos modèles dans l'onglet "Campagnes" pour qu'ils apparaissent ici.
                            </p>
                        </div>
                    )}
                </div>
            )}

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
