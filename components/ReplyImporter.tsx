import React, { useEffect, useMemo, useState } from 'react';
import { Inbox, Copy, Download, Search, CheckCircle2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import {
  ApplyResult, CLASSES, CLASS_ORDER, CampaignLite, ContactIndex, MatchContact, MatchKind, ParsedReply, REPLY_IMPORT_PROMPT,
  ReplyClass, applyImport, findAlreadyImported, loadCampaigns, loadContactIndex, matchRow, parseReplies,
  proposeOutcome, proposeStatus, proposeTag,
} from '../services/replyImport';

interface PreviewRow {
  key: number;
  row: ParsedReply;
  kind: MatchKind;
  candidates: MatchContact[];
  contactId: string;
  include: boolean;
  duplicate: boolean;
  applyStatus: boolean;
  applyTag: boolean;
  applyOutcome: boolean;
}

const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fullName = (c: MatchContact) => `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Sans nom';

const ReplyImporter: React.FC = () => {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignLite[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [index, setIndex] = useState<ContactIndex | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [search, setSearch] = useState<Record<number, string>>({});

  useEffect(() => {
    loadCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
  }, []);

  const campaign = useMemo(() => campaigns.find(c => c.id === campaignId) || null, [campaigns, campaignId]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(REPLY_IMPORT_PROMPT);
      toast.success('Consigne copiée. Il suffit de la coller dans Claude.');
    } catch {
      toast.error('Copie impossible : utilisez le bouton Télécharger.');
    }
  };

  const downloadPrompt = () => {
    const blob = new Blob([REPLY_IMPORT_PROMPT], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'consigne-analyse-reponses.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const analyse = async () => {
    setResult(null);
    const parsed = parseReplies(text);
    setIssues(parsed.errors);
    if (parsed.rows.length === 0) { setRows([]); return; }
    setBusy(true);
    try {
      const idx = await loadContactIndex();
      setIndex(idx);
      const base: PreviewRow[] = parsed.rows.map((row, key) => {
        const m = matchRow(row, idx);
        const contactId = m.kind === 'email' && m.candidates.length === 1 ? m.candidates[0].id : '';
        return { key, row, kind: m.kind, candidates: m.candidates, contactId, include: contactId !== '', duplicate: false, applyStatus: true, applyTag: true, applyOutcome: true };
      });
      const dups = await findAlreadyImported(base.filter(r => r.contactId).map(r => ({ index: r.key, contactId: r.contactId, row: r.row })));
      setRows(base.map(r => (dups.has(r.key) ? { ...r, duplicate: true, include: false } : r)));
    } catch (e: any) {
      toast.error(e?.message || 'Analyse impossible.');
    } finally {
      setBusy(false);
    }
  };

  const patchRow = (key: number, patch: Partial<PreviewRow>) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));

  const patchParsed = (key: number, patch: Partial<ParsedReply>) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, row: { ...r.row, ...patch } } : r)));

  const chooseContact = async (key: number, contactId: string) => {
    const r = rows.find(x => x.key === key);
    if (!r) return;
    if (!contactId) { patchRow(key, { contactId: '', include: false, duplicate: false }); return; }
    const dups = await findAlreadyImported([{ index: key, contactId, row: r.row }]);
    patchRow(key, { contactId, duplicate: dups.has(key), include: !dups.has(key) });
  };

  const ready = rows.filter(r => r.include && r.contactId);
  const toCheck = rows.filter(r => !r.contactId).length;
  const dupCount = rows.filter(r => r.duplicate).length;

  const runImport = async () => {
    if (ready.length === 0) return;
    if (!window.confirm(`Importer ${ready.length} réponse(s) dans le CRM ?`)) return;
    setBusy(true);
    try {
      const res = await applyImport(
        ready.map(r => ({ contactId: r.contactId, row: r.row, applyStatus: r.applyStatus, applyTag: r.applyTag, applyOutcome: r.applyOutcome })),
        campaignId || null
      );
      setResult(res);
      if (res.imported > 0) {
        toast.success(`${res.imported} réponse(s) importée(s).`);
        setRows([]);
        setText('');
        setIssues([]);
        loadCampaigns().then(setCampaigns).catch(() => undefined);
      }
      if (res.errors.length) toast.error(`${res.errors.length} erreur(s), voir le détail.`);
    } catch (e: any) {
      toast.error(e?.message || 'Import impossible.');
    } finally {
      setBusy(false);
    }
  };

  const Chip: React.FC<{ n: number; label: string; hex: string }> = ({ n, label, hex }) => (
    <span className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border bg-white" style={{ color: hex, borderColor: hex + '55' }}>
      {n} {label}
    </span>
  );

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg"><Inbox size={26} /></div>
        <div>
          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900">Importer des réponses</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Les réponses reçues par email, classées et ajoutées aux fiches</p>
        </div>
      </div>

      {/* Mode d'emploi */}
      <div className="bg-white rounded-[32px] border border-slate-100 p-8 space-y-5">
        <h3 className="text-sm font-black uppercase italic tracking-widest text-slate-900">Comment faire</h3>
        <ol className="text-sm text-slate-600 space-y-2 list-decimal pl-5">
          <li>Copiez la consigne ci-dessous et collez-la dans Claude (connecté à la messagerie). Indiquez la période à analyser.</li>
          <li>Claude lit les réponses, les classe et renvoie un tableau. Copiez ce tableau et collez-le dans la zone plus bas.</li>
          <li>Vérifiez l'aperçu, corrigez si besoin, puis validez. Rien n'est enregistré avant votre validation, et aucun contact n'est créé.</li>
        </ol>
        <div className="flex flex-wrap gap-3">
          <button onClick={copyPrompt} className="px-6 py-3 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase italic tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition"><Copy size={14} /> Copier la consigne pour Claude</button>
          <button onClick={downloadPrompt} className="px-6 py-3 rounded-2xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase italic tracking-widest flex items-center gap-2 hover:bg-slate-200 transition"><Download size={14} /> Télécharger (.txt)</button>
        </div>
      </div>

      {/* Collage */}
      <div className="bg-white rounded-[32px] border border-slate-100 p-8 space-y-4">
        <h3 className="text-sm font-black uppercase italic tracking-widest text-slate-900">Tableau renvoyé par Claude</h3>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={7}
          placeholder='Collez ici le tableau JSON : [ {"email": "...", "classification": "present", ...} ]'
          className="w-full px-5 py-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none text-xs font-mono focus:ring-2 focus:ring-indigo-500"
        />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Campagne concernée</label>
            <select value={campaignId} onChange={e => setCampaignId(e.target.value)} className="px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold outline-none max-w-xs">
              <option value="">Aucune (historique des fiches seulement)</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}{c.goal === 'Event' ? ' (événement)' : ''}</option>)}
            </select>
          </div>
          <button onClick={analyse} disabled={busy || !text.trim()} className="px-8 py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase italic tracking-widest flex items-center gap-2 disabled:opacity-40 hover:bg-slate-700 transition">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Analyser
          </button>
        </div>
        {issues.length > 0 && (
          <ul className="text-xs text-amber-700 bg-amber-50 rounded-2xl p-4 space-y-1">
            {issues.map((m, i) => <li key={i} className="flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {m}</li>)}
          </ul>
        )}
      </div>

      {/* Résultat de l'import */}
      {result && (
        <div className={`rounded-[32px] border p-8 ${result.errors.length ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <div className="flex items-center gap-3 text-sm font-black uppercase italic tracking-widest text-slate-900"><CheckCircle2 size={18} className="text-emerald-600" /> Import terminé</div>
          <p className="text-sm text-slate-700 mt-3">
            {result.imported} réponse(s) ajoutée(s) à l'historique · {result.statusUpdated} statut(s) mis à jour · {result.tagged} étiquette(s) ajoutée(s) · {result.outcomesUpdated} résultat(s) de campagne
          </p>
          {result.errors.length > 0 && (
            <ul className="text-xs text-amber-800 mt-3 space-y-1 list-disc pl-5">{result.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
          )}
        </div>
      )}

      {/* Aperçu */}
      {rows.length > 0 && index && (
        <div className="bg-white rounded-[32px] border border-slate-100 p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-sm font-black uppercase italic tracking-widest text-slate-900">Aperçu avant import</h3>
            <div className="flex flex-wrap gap-2">
              <Chip n={ready.length} label="prêtes" hex="#10b981" />
              <Chip n={toCheck} label="à rattacher" hex="#f59e0b" />
              <Chip n={dupCount} label="déjà importées" hex="#64748b" />
            </div>
          </div>

          <div className="space-y-4">
            {rows.map(r => {
              const contact = r.contactId ? index.byId.get(r.contactId) : undefined;
              const info = CLASSES[r.row.cls];
              const nextStatus = contact ? proposeStatus(contact.status, r.row.cls) : null;
              const tag = proposeTag(r.row.cls, r.row.event);
              const outcome = campaign && contact ? (campaign.targets.includes(contact.id) ? proposeOutcome(r.row.cls, campaign.goal) : 'hors') : null;
              const q = search[r.key] || '';
              const found = q.trim().length >= 2
                ? index.all.filter(c => norm(`${fullName(c)} ${c.company || ''} ${c.email || ''}`).includes(norm(q.trim()))).slice(0, 8)
                : [];
              return (
                <div key={r.key} className={`rounded-[24px] border p-5 space-y-3 ${r.duplicate ? 'bg-slate-50 border-slate-200 opacity-70' : r.contactId ? 'bg-white border-slate-100' : 'bg-amber-50/50 border-amber-200'}`}>
                  <div className="flex flex-wrap items-start gap-4">
                    <input type="checkbox" checked={r.include} disabled={!r.contactId} onChange={e => patchRow(r.key, { include: e.target.checked })} className="mt-1.5 w-4 h-4" />
                    <div className="flex-1 min-w-[260px]">
                      <div className="text-xs font-black text-slate-900">{r.row.name || r.row.email || 'Expéditeur inconnu'} <span className="font-bold text-slate-400">{r.row.email}</span></div>
                      {contact ? (
                        <div className="text-[11px] text-slate-500 mt-1">
                          Fiche : <b>{fullName(contact)}</b>{contact.company ? ` · ${contact.company}` : ''}{contact.status ? ` · ${contact.status}` : ''}
                          {r.kind === 'name' && <span className="text-amber-600 font-bold"> · rapprochée par le nom, à vérifier</span>}
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-700 font-bold mt-1">Aucune fiche rattachée{r.kind === 'none' ? ' : adresse inconnue' : ''}. Choisissez-en une ou laissez cette ligne de côté.</div>
                      )}
                      {r.duplicate && <div className="text-[11px] text-slate-500 font-bold mt-1">Déjà importée : ignorée par défaut.</div>}
                    </div>
                    <select
                      value={r.row.cls}
                      onChange={e => patchParsed(r.key, { cls: e.target.value as ReplyClass })}
                      className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none border"
                      style={{ color: info.hex, borderColor: info.hex + '66', background: info.hex + '12' }}
                      title={info.help}
                    >
                      {CLASS_ORDER.map(k => <option key={k} value={k}>{CLASSES[k].label}</option>)}
                    </select>
                  </div>

                  <input
                    value={r.row.summary}
                    onChange={e => patchParsed(r.key, { summary: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Résumé de la réponse"
                  />

                  {(!r.contactId || r.candidates.length > 1 || r.kind === 'name') && (
                    <div className="flex flex-wrap items-start gap-3">
                      {r.candidates.length > 0 && (
                        <select value={r.contactId} onChange={e => void chooseContact(r.key, e.target.value)} className="px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-bold outline-none">
                          <option value="">Choisir la fiche…</option>
                          {r.candidates.map(c => <option key={c.id} value={c.id}>{fullName(c)}{c.company ? ` · ${c.company}` : ''}{c.email ? ` · ${c.email}` : ''}</option>)}
                        </select>
                      )}
                      <div className="relative">
                        <input value={q} onChange={e => setSearch(s => ({ ...s, [r.key]: e.target.value }))} placeholder="Chercher une fiche (nom, société, email)" className="px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs outline-none w-72" />
                        {found.length > 0 && (
                          <div className="absolute z-10 mt-1 w-96 max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
                            {found.map(c => (
                              <button key={c.id} onClick={() => { setSearch(s => ({ ...s, [r.key]: '' })); void chooseContact(r.key, c.id); }} className="block w-full text-left px-4 py-2 text-xs hover:bg-indigo-50">
                                <b>{fullName(c)}</b> <span className="text-slate-400">{c.company || ''} {c.email ? `· ${c.email}` : ''}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {contact && (
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-slate-600">
                      {nextStatus && (
                        <label className="flex items-center gap-2"><input type="checkbox" checked={r.applyStatus} onChange={e => patchRow(r.key, { applyStatus: e.target.checked })} /> Statut : {contact.status || 'New'} → <b>{nextStatus}</b></label>
                      )}
                      {tag && (
                        <label className="flex items-center gap-2"><input type="checkbox" checked={r.applyTag} onChange={e => patchRow(r.key, { applyTag: e.target.checked })} /> Étiquette : <b>{tag}</b></label>
                      )}
                      {outcome && outcome !== 'hors' && (
                        <label className="flex items-center gap-2"><input type="checkbox" checked={r.applyOutcome} onChange={e => patchRow(r.key, { applyOutcome: e.target.checked })} /> Campagne : <b>{outcome === 'Registered' ? `Inscrit (${r.row.attendees} pers.)` : outcome === 'Negative' ? 'Refus' : outcome === 'Positive' ? 'Intérêt' : 'Email invalide'}</b></label>
                      )}
                      {outcome === 'hors' && <span className="text-amber-600 font-bold">Cette personne n'est pas ciblée par la campagne choisie : seul l'historique de la fiche sera complété.</span>}
                      {r.row.cls === 'desinscription' && <span className="text-rose-600 font-bold">Les personnes désinscrites sont exclues des prochains envois de campagne.</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => { setRows([]); setIssues([]); }} className="px-6 py-3 rounded-2xl bg-slate-100 text-slate-500 text-[10px] font-black uppercase italic tracking-widest flex items-center gap-2 hover:bg-slate-200 transition"><X size={14} /> Annuler</button>
            <button onClick={runImport} disabled={busy || ready.length === 0} className="px-10 py-4 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase italic tracking-widest flex items-center gap-2 disabled:opacity-40 hover:bg-emerald-700 transition shadow-lg">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Importer {ready.length} réponse(s)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReplyImporter;
