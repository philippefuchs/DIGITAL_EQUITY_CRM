import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Send, X, Loader2, MailCheck, MailX, Download } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useCategories } from './CategoryProvider';
import { loadTemplates } from '../services/templateService';
import {
  DEFAULT_OPTIONS, FollowUp, FollowUpData, FollowUpOptions, OpenFilter, SendReport,
  computeFollowUps, fillPlaceholders, loadFollowUpData, sendFollowUps,
} from '../services/relance';

const fullName = (f: FollowUp) =>
  `${f.contact.first_name || ''} ${f.contact.last_name || ''}`.trim() || f.contact.email || 'Sans nom';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

const FollowUps: React.FC = () => {
  const { toast } = useToast();
  const { categories } = useCategories();
  const [data, setData] = useState<FollowUpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [opts, setOpts] = useState<FollowUpOptions>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('leadgen_followup_options') || 'null');
      return saved ? { ...DEFAULT_OPTIONS, ...saved } : DEFAULT_OPTIONS;
    } catch { return DEFAULT_OPTIONS; }
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [composing, setComposing] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; subject: string; body: string }[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<SendReport | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setData(await loadFollowUpData());
    } catch (e: any) {
      toast.error(e?.message || 'Chargement impossible.');
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => { try { localStorage.setItem('leadgen_followup_options', JSON.stringify(opts)); } catch { /* stockage indisponible */ } }, [opts]);

  const list = useMemo(() => (data ? computeFollowUps(data, opts) : []), [data, opts]);
  const selected = useMemo(() => list.filter(f => picked.has(f.contact.id)), [list, picked]);
  const allPicked = list.length > 0 && selected.length === list.length;

  const set = <K extends keyof FollowUpOptions>(k: K, v: FollowUpOptions[K]) => { setOpts(o => ({ ...o, [k]: v })); setPicked(new Set()); };

  const openComposer = async () => {
    setReport(null);
    setComposing(true);
    try {
      const t = await loadTemplates();
      setTemplates(t.map(x => ({ id: String(x.id), name: x.name, subject: x.subject, body: x.body })));
    } catch { setTemplates([]); }
  };

  const send = async () => {
    if (!subject.trim() || !body.trim()) { toast.error('Objet et message sont obligatoires.'); return; }
    setProgress({ done: 0, total: selected.length });
    try {
      const r = await sendFollowUps(selected.map(s => s.contact), subject, body, (done, total) => setProgress({ done, total }));
      setReport(r);
      if (r.sent) toast.success(`${r.sent} relance(s) envoyée(s).`);
      if (r.failed.length) toast.error(`${r.failed.length} échec(s), voir le détail.`);
      setPicked(new Set());
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Envoi impossible.');
    } finally { setProgress(null); }
  };

  const exportCsv = () => {
    const rows = [['Prénom', 'Nom', 'Email', 'Société', 'Statut', 'Emails envoyés', 'Dernier envoi', 'Ouvert'],
      ...(selected.length ? selected : list).map(f => [
        f.contact.first_name || '', f.contact.last_name || '', f.contact.email || '', f.contact.company || '',
        f.contact.status || '', String(f.sent), fmtDate(f.lastSentAt), f.opened ? 'oui' : 'non'])];
    const csv = '﻿' + rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `a_relancer_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const sending = progress !== null;
  const preview = selected[0];

  return (
    <div className="space-y-6 p-2 pb-20">
      <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">À relancer</h3>
            <p className="text-xs text-slate-500 mt-2 max-w-2xl">
              Personnes à qui un email est parti, sans réponse importée depuis, ni désinscription, ni statut Perdu ou Clos.
              Les réponses lues dans la messagerie doivent d'abord être importées (écran Réponses) pour que cette liste soit juste.
            </p>
          </div>
          <button onClick={refresh} disabled={loading} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-black uppercase flex items-center gap-2 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 text-xs font-bold text-slate-700">
          <label className="space-y-1">Dernier email il y a au moins (jours)
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={365} value={opts.minDays}
                onChange={e => set('minDays', Math.max(0, Math.min(365, Math.floor(Number(e.target.value) || 0))))}
                className="w-20 border border-slate-200 rounded-lg p-2"
              />
              <div className="flex gap-1">
                {[3, 7, 14, 30].map(d => (
                  <button key={d} type="button" onClick={() => set('minDays', d)}
                    className={`px-2 py-1 rounded-lg text-[11px] border ${opts.minDays === d ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 hover:bg-slate-50'}`}>{d}</button>
                ))}
              </div>
            </div>
          </label>
          <label className="space-y-1">Ouverture
            <select value={opts.open} onChange={e => set('open', e.target.value as OpenFilter)} className="w-full border border-slate-200 rounded-lg p-2">
              <option value="all">Tous</option>
              <option value="unopened">Jamais ouvert</option>
              <option value="opened">Ouvert, sans réponse</option>
            </select>
          </label>
          <label className="space-y-1">Catégorie
            <select value={opts.category} onChange={e => set('category', e.target.value)} className="w-full border border-slate-200 rounded-lg p-2">
              <option value="all">Toutes</option>
              {categories.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select>
          </label>
          <label className="space-y-1">Emails déjà reçus
            <select value={opts.maxSent} onChange={e => set('maxSent', Number(e.target.value))} className="w-full border border-slate-200 rounded-lg p-2">
              <option value={0}>Peu importe</option>
              {[1, 2, 3].map(n => <option key={n} value={n}>{n} au plus</option>)}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={opts.includeActive} onChange={e => set('includeActive', e.target.checked)} />
            Inclure les membres « Active »
          </label>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-slate-100">
          <label className="flex items-center gap-2 text-xs font-black uppercase">
            <input type="checkbox" checked={allPicked} onChange={e => setPicked(e.target.checked ? new Set(list.map(f => f.contact.id)) : new Set())} />
            {loading ? 'Chargement…' : `${list.length} personne(s) à relancer · ${selected.length} sélectionnée(s)`}
          </label>
          <div className="flex gap-2">
            <button onClick={exportCsv} disabled={!list.length} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-black uppercase flex items-center gap-2 hover:bg-slate-50 disabled:opacity-40">
              <Download size={14} /> CSV
            </button>
            <button onClick={openComposer} disabled={!selected.length}
              className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-40">
              <Send size={14} /> Relancer la sélection
            </button>
          </div>
        </div>

        {!loading && list.length === 0 && (
          <p className="p-10 text-center text-sm text-slate-400">Personne à relancer avec ces critères.</p>
        )}
        <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
          {list.map(f => (
            <li key={f.contact.id} className="flex items-center gap-4 px-5 py-3 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={picked.has(f.contact.id)}
                onChange={e => { const n = new Set(picked); if (e.target.checked) n.add(f.contact.id); else n.delete(f.contact.id); setPicked(n); }} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 truncate">{fullName(f)} <span className="font-normal text-slate-500">{f.contact.company ? `· ${f.contact.company}` : ''}</span></p>
                <p className="text-[11px] text-slate-500 truncate">{f.contact.email} · dernier objet : {f.lastSubject || '—'}</p>
              </div>
              <div className="text-[11px] text-slate-600 text-right whitespace-nowrap">
                <p>{f.daysSince} j · {fmtDate(f.lastSentAt)}</p>
                <p>{f.sent} email(s) reçu(s)</p>
              </div>
              <span className={`flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-full ${f.opened ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {f.opened ? <MailCheck size={12} /> : <MailX size={12} />}{f.opened ? 'Ouvert' : 'Non ouvert'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {composing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[28px] p-8 w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black uppercase italic">Relance : {selected.length} destinataire(s)</h4>
              <button onClick={() => !sending && setComposing(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>

            {!report && (
              <>
                <label className="block text-xs font-bold text-slate-700 space-y-1">Partir d'un modèle (facultatif)
                  <select defaultValue="" onChange={e => { const t = templates.find(x => x.id === e.target.value); if (t) { setSubject(t.subject); setBody(t.body); } }}
                    className="w-full border border-slate-200 rounded-lg p-2" disabled={sending}>
                    <option value="">— écrire un message —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-700 space-y-1">Objet
                  <input value={subject} onChange={e => setSubject(e.target.value)} disabled={sending} className="w-full border border-slate-200 rounded-lg p-2 font-normal" />
                </label>
                <label className="block text-xs font-bold text-slate-700 space-y-1">Message (champs : {'{{Prénom}} {{Nom}} {{company}}'})
                  <textarea value={body} onChange={e => setBody(e.target.value)} disabled={sending} rows={9} className="w-full border border-slate-200 rounded-lg p-2 font-normal" />
                </label>
                {preview && body && (
                  <div className="text-[11px] bg-slate-50 rounded-xl p-3 text-slate-600">
                    <p className="font-black uppercase mb-1">Aperçu pour {fullName(preview)}</p>
                    <p className="font-bold">{fillPlaceholders(subject, preview.contact)}</p>
                    <div className="mt-1 max-h-32 overflow-y-auto" dangerouslySetInnerHTML={{ __html: fillPlaceholders(body, preview.contact).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\n/g, '<br/>') }} />
                  </div>
                )}
                <p className="text-[11px] text-amber-700">
                  {selected.length} email(s) vont partir immédiatement, avec le suivi d'ouverture. Gardez cet onglet ouvert jusqu'à la fin.
                  Les contacts « New » passeront à « Contacted ».
                </p>
                {progress && (
                  <div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
                    <p className="text-[11px] text-slate-500 mt-1">{progress.done} / {progress.total}</p>
                  </div>
                )}
                <button onClick={send} disabled={sending || !subject.trim() || !body.trim()}
                  className="w-full py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-40">
                  {sending ? <><Loader2 size={14} className="animate-spin" /> Envoi en cours…</> : <><Send size={14} /> Envoyer {selected.length} relance(s)</>}
                </button>
              </>
            )}

            {report && (
              <div className="space-y-3 text-sm">
                <p className="font-bold text-emerald-700">{report.sent} relance(s) envoyée(s).</p>
                {report.failed.length > 0 && (
                  <ul className="text-[11px] text-rose-700 space-y-1 max-h-40 overflow-y-auto">
                    {report.failed.map((f, i) => <li key={i}>{f.name} : {f.error}</li>)}
                  </ul>
                )}
                <button onClick={() => { setComposing(false); setReport(null); }} className="px-5 py-2 rounded-xl border border-slate-200 text-xs font-black uppercase">Fermer</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FollowUps;
