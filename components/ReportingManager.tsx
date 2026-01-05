
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileSpreadsheet, Download, Users, UserCheck, Calendar,
  HelpCircle, RefreshCw, Briefcase, Mail, ChevronRight,
  TrendingUp, Database, ArrowRight, ShieldCheck, Clock, FileText, Zap, Ticket, UserX, Target, Info, Eraser
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { Contact, Campaign, OutcomeDetail } from '../types';

const ReportingManager: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string>(new Date().toLocaleTimeString());
  const [selectedCampId, setSelectedCampId] = useState<string>('all');

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: c } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
      const { data: p } = await supabase.from('contacts').select('*');
      const { data: e } = await supabase.from('emails').select('*').order('created_at', { ascending: false });

      if (c) {
        setCampaigns(c.map((camp: any) => {
          let tIds: string[] = [];
          const rawIds = camp.target_contact_ids || camp.targetContactIds || camp.target_ids;
          if (Array.isArray(rawIds)) tIds = rawIds.map(id => String(id));
          else if (typeof rawIds === 'string') {
            try {
              const parsed = JSON.parse(rawIds);
              if (Array.isArray(parsed)) tIds = parsed.map(id => String(id));
            } catch {
              tIds = rawIds.split(',').map(id => id.trim()).filter(id => id);
            }
          }

          return {
            ...camp,
            id: String(camp.id),
            outcomes: camp.outcomes || {},
            targetContactIds: tIds,
            createdAt: camp.created_at || camp.createdAt
          };
        }));
      }
      if (p) {
        setContacts(p.map((item: any) => ({
          ...item,
          id: String(item.id),
          firstName: (item.first_name || item.firstName || item.prenom || '').toString().trim(),
          lastName: (item.last_name || item.lastName || item.nom || '').toString().trim(),
          company: (item.company || item.societe || '').toString().trim(),
          email: (item.email || '').toString().trim().toLowerCase()
        })));
      }
      if (e) setEmails(e);
      setLastSync(new Date().toLocaleTimeString());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) loadData();
  }, [loadData]);

  const handleCleanup = async () => {
    if (selectedCampId === 'all' || !supabase) return;
    const camp = campaigns.find(c => c.id === selectedCampId);
    if (!camp) return;

    if (!window.confirm(`Voulez-vous vraiment supprimer l'historique de tracking pour "${camp.name}" ?\n\nCela nettoiera les logs erronés (doublons/erreurs) de cette campagne.\n\nNote : Le compteur officiel de 13 envoyés sur la carte restera inchangé.`)) return;

    try {
      setLoading(true);

      // 1. Delete by campaign_id (the new robust way)
      const { error: errId } = await supabase.from('emails').delete().eq('campaign_id', selectedCampId);
      if (errId) console.error("Cleanup by ID failed:", errId);

      // 2. Delete by Subject (legacy way for logs without campaign_id)
      if (camp.subject) {
        const baseSubject = camp.subject.replace(/\{\{.*?\}\}/g, '').trim();
        if (baseSubject.length > 5) {
          const { error: errSub } = await supabase.from('emails')
            .delete()
            .ilike('subject', `%${baseSubject}%`)
            .in('lead_id', camp.targetContactIds);
          if (errSub) console.error("Cleanup by subject fallback failed:", errSub);
        }
      }

      await loadData();
      alert("Historique nettoyé. Votre liste détaillée est maintenant synchronisée !");
    } catch (err) {
      alert("Erreur lors du nettoyage : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const relevantCampaigns = selectedCampId === 'all'
      ? campaigns
      : campaigns.filter(c => c.id === selectedCampId);

    const targetContactIds = new Set<string>();
    relevantCampaigns.forEach(c => {
      (c.targetContactIds || []).forEach(id => targetContactIds.add(String(id)));
    });

    const impactedCount = targetContactIds.size;
    const sentCount = emails.filter(e => {
      if (selectedCampId === 'all') return true;
      const camp = campaigns.find(c => c.id === selectedCampId);
      if (!camp) return false;

      // Matching logic: ID or Subject+Date
      if (String(e.campaign_id) === String(camp.id)) return true;
      if (!e.campaign_id && camp.subject && e.subject && camp.createdAt) {
        const baseSubject = camp.subject.replace(/\{\{.*?\}\}/g, '').trim();
        const isMatch = baseSubject.length > 5 && e.subject.includes(baseSubject);
        const isAfter = new Date(e.created_at || e.createdAt) >= new Date(camp.createdAt);
        return isMatch && isAfter;
      }
      return false;
    }).length;

    const positiveCount = relevantCampaigns.reduce((acc, camp) => {
      const outcomes = camp.outcomes || {};
      return acc + Object.values(outcomes).filter((o: any) =>
        ['Meeting', 'Positive', 'Registered'].includes(o.status)
      ).length;
    }, 0);

    const rdvCount = relevantCampaigns.reduce((acc, camp) => {
      const outcomes = camp.outcomes || {};
      return acc + Object.values(outcomes).filter((o: any) => o.status === 'Meeting').length;
    }, 0);

    return { impactedCount, sentCount, positiveCount, rdvCount };
  }, [campaigns, emails, selectedCampId]);

  const downloadCSV = (rows: any[], filename: string) => {
    if (rows.length === 0) {
      alert("Aucune donnée à exporter.");
      return;
    }
    const csv = [
      Object.keys(rows[0]).join(','),
      ...rows.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const exportAllLeads = () => {
    const list = contacts.filter(c => c.category === 'prospect');
    const rows = list.map(c => ({
      'Prénom': c.firstName,
      'Nom': c.lastName,
      'Email': c.email,
      'Société': c.company,
      'Titre': c.title || '',
      'Secteur': c.sector || 'N/A',
      'Statut': c.status,
      'Score IA': c.score || '',
      'Notes': c.notes || ''
    }));
    downloadCSV(rows, `export_leads_complet_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportAllMembres = () => {
    const list = contacts.filter(c => c.category === 'member');
    const rows = list.map(c => ({
      'Prénom': c.firstName,
      'Nom': c.lastName,
      'Email': c.email,
      'Société': c.company,
      'Titre': c.title || '',
      'Secteur': c.sector || 'N/A',
      'Statut': c.status,
      'Notes': c.notes || ''
    }));
    downloadCSV(rows, `base_membres_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportAllEmailsSent = () => {
    const rows = emails.map(e => {
      const contact = contacts.find(c => String(c.id) === String(e.lead_id));
      const camp = campaigns.find(c => String(c.id) === String(e.campaign_id));
      return {
        'Date Envoi': new Date(e.created_at || e.createdAt).toLocaleString(),
        'Contact': contact ? `${contact.firstName} ${contact.lastName}` : 'Inconnu',
        'Email Destination': e.email || contact?.email || '',
        'Campagne': camp?.name || 'Manuelle / Autre',
        'Objet': e.subject || '',
        'Statut': e.opened_at ? 'OUVERT' : 'ENVOYÉ',
        'Date Ouverture': e.opened_at ? new Date(e.opened_at).toLocaleString() : '-'
      };
    });
    downloadCSV(rows, `historique_emails_envoyes_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportAllContacts = () => {
    const rows = contacts.map(c => ({
      'Prénom': c.firstName,
      'Nom': c.lastName,
      'Email': c.email,
      'Société': c.company,
      'Titre': c.title || '',
      'Secteur': c.sector || 'N/A',
      'Catégorie': c.category === 'member' ? 'Membre' : 'Lead',
      'Statut': c.status,
      'Score IA': c.score || '',
      'Notes': c.notes || ''
    }));
    downloadCSV(rows, `base_de_donnees_complete_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportByOutcome = (status: string, label: string) => {
    const rows: any[] = [];
    campaigns.forEach(camp => {
      Object.entries(camp.outcomes || {}).forEach(([cid, o]: [string, any]) => {
        if (o.status === status) {
          const contact = contacts.find(c => String(c.id) === String(cid));
          if (contact) {
            rows.push({
              'Campagne': camp.name,
              'Contact': `${contact.firstName} ${contact.lastName}`,
              'Email': contact.email,
              'Société': contact.company,
              'Résultat': status,
              'Précisions': o.attendees ? `${o.attendees} pers.` : ''
            });
          }
        }
      });
    });
    downloadCSV(rows, `export_${label.toLowerCase().replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportUnread = () => {
    // Contacts who received an email but it's not opened
    const unreadLeads = new Set(emails.filter(e => !e.opened_at).map(e => String(e.lead_id)));
    const rows: any[] = [];
    unreadLeads.forEach(lid => {
      const contact = contacts.find(c => String(c.id) === lid);
      if (contact) {
        const lastEmail = emails.find(e => String(e.lead_id) === lid);
        rows.push({
          'Nom': contact.firstName,
          'Prénom': contact.lastName,
          'Email': contact.email,
          'Société': contact.company,
          'Dernière Campagne': lastEmail?.subject || 'N/A',
          'Date Envoi': lastEmail ? new Date(lastEmail.created_at || lastEmail.createdAt).toLocaleDateString() : '?'
        });
      }
    });
    downloadCSV(rows, `relances_non_lues_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportImpact = () => {
    const relevantCampaigns = selectedCampId === 'all'
      ? campaigns
      : campaigns.filter(c => c.id === selectedCampId);

    const rows: any[] = [];
    relevantCampaigns.forEach(camp => {
      (camp.targetContactIds || []).forEach(contactId => {
        const contact = contacts.find(c => String(c.id) === String(contactId));
        if (contact) {
          const outcome = camp.outcomes?.[contactId];
          const emailRecord = emails.find(e => {
            if (String(e.lead_id) !== String(contactId)) return false;
            if (String(e.campaign_id) === String(camp.id)) return true;
            if (!e.campaign_id && camp.subject && e.subject && camp.createdAt) {
              const baseSubject = camp.subject.replace(/\{\{.*?\}\}/g, '').trim();
              const isMatch = baseSubject.length > 5 && e.subject.includes(baseSubject);
              const isAfter = new Date(e.created_at || e.createdAt) >= new Date(camp.createdAt);
              return isMatch && isAfter;
            }
            return false;
          });

          rows.push({
            'Campagne': camp.name,
            'Contact': `${contact.firstName} ${contact.lastName}`,
            'Email': contact.email,
            'Société': contact.company,
            'Type Cible': contact.category || 'Prospect',
            'Email Envoyé': emailRecord ? 'OUI' : 'NON',
            'Date Envoi': emailRecord ? new Date(emailRecord.created_at || emailRecord.createdAt).toLocaleString() : '-',
            'Posture / Status': outcome?.status || 'Non Qualifié',
            'Détails': outcome?.attendees ? `${outcome.attendees} personnes` : '-'
          });
        }
      });
    });
    downloadCSV(rows, `impact_report_${selectedCampId}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  return (
    <div className="space-y-12 p-2 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm gap-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl -z-10"></div>
        <div>
          <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic leading-none text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Reporting & Impact</h3>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] mt-3 italic flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            Dernière synchronisation : {lastSync}
          </p>
        </div>
        <div className="flex gap-4">
          <button onClick={loadData} className="p-5 bg-slate-50 text-slate-400 border border-slate-100 rounded-3xl hover:text-indigo-600 transition active:rotate-180">
            <RefreshCw size={24} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={exportImpact}
            className="px-10 py-5 bg-slate-900 text-white font-black rounded-[32px] text-[11px] uppercase tracking-[0.2em] shadow-xl flex items-center gap-4 transition hover:bg-indigo-600 active:scale-95 italic border-b-4 border-slate-700"
          >
            <Download size={22} strokeWidth={3} /> Exporter l'Impact
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {[
          { label: 'Leads Potentiels', val: stats.impactedCount, icon: <Users size={28} />, color: 'indigo', action: exportAllLeads, btnLabel: 'Export Leads' },
          { label: 'Emails Envoyés', val: stats.sentCount, icon: <Mail size={28} />, color: 'emerald', action: exportAllEmailsSent, btnLabel: 'Historique Emails' },
          { label: 'Retours Positifs', val: stats.positiveCount, icon: <Zap size={28} />, color: 'amber', action: () => exportByOutcome('Positive', 'Interets Positifs'), btnLabel: 'Listes Intérêts' },
          { label: 'Rendez-vous', val: stats.rdvCount, icon: <Calendar size={28} />, color: 'violet', action: () => exportByOutcome('Meeting', 'Rendez-vous'), btnLabel: 'Liste RDV' }
        ].map((s, idx) => (
          <div key={idx} className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm group hover:-translate-y-2 transition-all duration-500 hover:shadow-2xl flex flex-col justify-between">
            <div>
              <div className={`w-14 h-14 rounded-2xl bg-${s.color}-50 text-${s.color}-600 flex items-center justify-center mb-8 shadow-sm group-hover:rotate-12 transition-transform`}>
                {s.icon}
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">{s.label}</p>
              <h4 className="text-5xl font-black italic tracking-tighter text-slate-900 mt-2">{s.val}</h4>
            </div>
            <button onClick={s.action} className="mt-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors">
              <Download size={14} strokeWidth={3} /> {s.btnLabel}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-white p-10 lg:p-14 rounded-[60px] border border-slate-200 shadow-sm space-y-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-b border-slate-50 pb-12">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-[24px] bg-slate-900 text-white flex items-center justify-center shadow-xl rotate-3">
              <ArrowRight size={32} strokeWidth={2.5} />
            </div>
            <div>
              <h4 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900 leading-none">Extraction de Listes Clients</h4>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-3">Téléchargez vos segments au format CSV</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Audit Leads Complet', icon: <Users />, color: 'indigo', action: exportAllLeads },
            { label: 'Audit Membres', icon: <UserCheck />, color: 'emerald', action: exportAllMembres },
            { label: 'Historique Emails', icon: <Mail />, color: 'sky', action: exportAllEmailsSent },
            { label: 'Base Complète (Backup)', icon: <Database />, color: 'slate', action: exportAllContacts },
            { label: 'Inscriptions Event', icon: <Ticket />, color: 'amber', action: () => exportByOutcome('Registered', 'Inscriptions') },
            { label: 'Rendez-vous Qualifiés', icon: <Calendar />, color: 'violet', action: () => exportByOutcome('Meeting', 'Rendez-vous') },
            { label: 'Intérêts Positifs', icon: <Zap />, color: 'fuchsia', action: () => exportByOutcome('Positive', 'Interets') },
            { label: 'Refus / Négatifs', icon: <UserX />, color: 'rose', action: () => exportByOutcome('Negative', 'Refus') },
            { label: 'Relances Non Lues', icon: <Clock />, color: 'sky', action: exportUnread }
          ].map((item, idx) => (
            <button
              key={idx}
              onClick={item.action}
              className="flex items-center justify-between p-8 bg-slate-50 rounded-[32px] border border-slate-100 hover:bg-white hover:shadow-xl hover:-translate-y-1 transition-all group"
            >
              <div className="flex items-center gap-5">
                <div className={`p-3 rounded-xl bg-${item.color}-50 text-${item.color}-600 group-hover:bg-${item.color}-600 group-hover:text-white transition-all`}>
                  {React.cloneElement(item.icon as React.ReactElement, { size: 20 })}
                </div>
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-600 group-hover:text-slate-900">{item.label}</span>
              </div>
              <Download size={16} className="text-slate-300 group-hover:text-indigo-600" />
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white p-10 lg:p-14 rounded-[60px] border border-slate-200 shadow-sm space-y-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-b border-slate-50 pb-12">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-[24px] bg-slate-900 text-white flex items-center justify-center shadow-xl rotate-3">
              <Database size={32} strokeWidth={2.5} />
            </div>
            <div>
              <h4 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900 leading-none">Détails des Contacts Impactés</h4>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-3">Analyse granulaire par campagne</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-[32px] border border-slate-100 min-w-[320px]">
              <Target size={18} className="text-slate-400 ml-4" />
              <select
                value={selectedCampId}
                onChange={(e) => setSelectedCampId(e.target.value)}
                className="bg-transparent border-none text-[11px] font-black uppercase tracking-widest text-slate-600 outline-none w-full p-4 cursor-pointer italic"
              >
                <option value="all">Toutes les Campagnes</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({(c.targetContactIds || []).length})
                  </option>
                ))}
              </select>
            </div>

            {selectedCampId !== 'all' && (
              <button
                onClick={handleCleanup}
                disabled={loading}
                className="px-6 py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-rose-100 transition-all italic border border-rose-100 disabled:opacity-50"
                title="Supprimer les logs d'emails de cette campagne pour corriger les erreurs d'affichage"
              >
                <Eraser size={16} /> Nettoyer l'Historique
              </button>
            )}
          </div>
        </div>

        <div className="mx-8 lg:mx-12 p-6 bg-amber-50 rounded-[32px] border border-amber-100 flex items-start gap-5 animate-in slide-in-from-top-4 duration-500">
          <div className="p-3 bg-amber-500 text-white rounded-xl shadow-md rotate-3">
            <Info size={18} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase text-amber-700 tracking-tight italic leading-tight">Note sur la précision du tracking</p>
            <p className="text-[10px] font-bold text-amber-600/80 mt-1 leading-relaxed">
              Le système a été mis à jour le 05/01 pour une précision accrue. Les envois effectués avant cette date peuvent afficher des doublons ou des erreurs tant que l'historique n'est pas nettoyé via SQL.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[32px] border border-slate-100 bg-slate-50/30">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-white/50">
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Contact</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Société</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 italic text-center">Date d'envoi</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 italic text-center">Email</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 italic text-center">Posture / Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns
                .filter(c => selectedCampId === 'all' || c.id === selectedCampId)
                .flatMap(camp => (camp.targetContactIds || []).map(cid => ({ camp, cid })))
                .map(({ camp, cid }, idx) => {
                  const contact = contacts.find(c => String(c.id) === String(cid));
                  if (!contact) return null;
                  const outcome = camp.outcomes?.[cid];

                  const emailRecord = emails.find(e => {
                    if (String(e.lead_id) !== String(cid)) return false;
                    if (String(e.campaign_id) === String(camp.id)) return true;
                    if (!e.campaign_id && camp.subject && e.subject && camp.createdAt) {
                      const baseSubject = camp.subject.replace(/\{\{.*?\}\}/g, '').trim();
                      const isMatch = baseSubject.length > 5 && e.subject.includes(baseSubject);
                      const isAfter = new Date(e.created_at || e.createdAt) >= new Date(camp.createdAt);
                      return isMatch && isAfter;
                    }
                    return false;
                  });

                  const emailSent = !!emailRecord;

                  return (
                    <tr key={`${camp.id}-${cid}-${idx}`} className="hover:bg-white transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black italic text-xs shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            {contact.firstName[0]}{contact.lastName[0]}
                          </div>
                          <div>
                            <p className="text-[13px] font-black italic uppercase tracking-tighter text-slate-900 leading-none">{contact.firstName} {contact.lastName}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 italic group-hover:text-indigo-500 transition-colors">{contact.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">{contact.company || 'N/A'}</p>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <div className="flex flex-col items-center">
                          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter leading-none italic">
                            {emailRecord ? new Date(emailRecord.created_at || emailRecord.createdAt).toLocaleDateString() : '-'}
                          </p>
                          <p className="text-[8px] font-medium text-slate-400 uppercase tracking-widest mt-1">
                            {emailRecord ? new Date(emailRecord.created_at || emailRecord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </p>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex justify-center">
                          <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest italic border ${emailRecord?.opened_at ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                            emailSent ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              'bg-rose-50 text-rose-600 border-rose-100'
                            }`}>
                            {emailRecord?.opened_at ? 'OUVERT' : emailSent ? 'ENVOYÉ' : 'À ENVOYER'}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex justify-center">
                          <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest italic border ${outcome?.status === 'Meeting' ? 'bg-violet-50 text-violet-600 border-violet-100' :
                            outcome?.status === 'Positive' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                              outcome?.status === 'Registered' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                outcome?.status === 'Negative' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                  'bg-slate-50 text-slate-400 border-slate-100'}`}>
                            {outcome?.status || 'Non Qualifié'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportingManager;
