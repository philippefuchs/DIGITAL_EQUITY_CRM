
import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { Mail, Check, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface EmailRecord {
    id: string;
    subject: string;
    status: 'sent' | 'opened' | 'clicked';
    created_at: string;
    opened_at?: string;
}

interface EmailHistoryProps {
    contactId: string;
}

const EmailHistory: React.FC<EmailHistoryProps> = ({ contactId }) => {
    const [emails, setEmails] = useState<EmailRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!contactId || contactId === 'new' || !supabase) return;

        // 1. Fetch initial data
        const fetchEmails = async () => {
            console.log("Fetching emails for contactId:", contactId);
            const { data, error } = await supabase
                .from('emails')
                .select('*')
                .eq('lead_id', contactId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error("Error fetching emails:", error);
            } else {
                console.log("Emails fetched:", data);
                if (data) setEmails(data as EmailRecord[]);
            }
            setLoading(false);
        };

        fetchEmails();

        // 2. Subscribe to Realtime changes
        const channel = supabase
            .channel('email-tracking')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'emails',
                    filter: `lead_id=eq.${contactId}`
                },
                (payload) => {
                    // Update local state when a status changes (e.g. sent -> opened)
                    setEmails((prev) => prev.map(email =>
                        email.id === payload.new.id ? { ...email, ...payload.new } : email
                    ));
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'emails',
                    filter: `lead_id=eq.${contactId}`
                },
                (payload) => {
                    setEmails((prev) => [payload.new as EmailRecord, ...prev]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };

    }, [contactId]);

    if (loading) return <div className="text-center py-4 text-xs text-slate-400">Chargement...</div>;

    if (emails.length === 0) {
        return (
            <div className="text-center py-10 opacity-50">
                <Mail size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Aucun email envoyé</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {emails.map(email => (
                <div key={email.id} className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex items-center justify-between group hover:border-indigo-100 transition">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${email.status === 'opened' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                            {email.status === 'opened' ? <Eye size={18} /> : <Check size={18} />}
                        </div>
                        <div>
                            <h4 className="font-bold text-sm text-slate-900">{email.subject || '(Sans objet)'}</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-1">
                                {formatDistanceToNow(new Date(email.created_at), { addSuffix: true, locale: fr })}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${email.status === 'opened'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                            }`}>
                            {email.status === 'opened' ? 'LU' : 'ENVOYÉ'}
                        </span>
                        {email.status === 'opened' && email.opened_at && (
                            <p className="text-[9px] text-emerald-600/60 font-bold mt-1">
                                {new Date(email.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default EmailHistory;
