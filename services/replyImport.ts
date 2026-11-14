import { supabase } from './supabase';
import { fetchAllRows } from './pagination';

/**
 * Import des réponses aux campagnes : un assistant (Claude) lit la messagerie, produit un tableau JSON,
 * l'application le rapproche des contacts (par email), affiche un aperçu, puis enregistre après validation.
 * Rien n'est créé sans validation, et aucun contact n'est jamais créé par cet import.
 */

export type ReplyClass =
  | 'present' | 'absent' | 'interesse' | 'a_rappeler' | 'refus'
  | 'desinscription' | 'reponse_automatique' | 'rebond' | 'autre';

export type OutcomeStatus = 'Registered' | 'Negative' | 'Positive' | 'Bounced';

export interface ClassInfo {
  label: string;
  hex: string;
  help: string;
  /** Statut CRM proposé (jamais de régression, voir proposeStatus). */
  status?: 'Contacted' | 'Interested' | 'Lost';
  /** Résultat dans la campagne choisie (voir proposeOutcome). */
  outcome?: OutcomeStatus;
}

export const CLASSES: Record<ReplyClass, ClassInfo> = {
  present: { label: 'Présent', hex: '#10b981', status: 'Interested', outcome: 'Registered', help: 'Confirme sa venue ou sa participation' },
  absent: { label: 'Absent', hex: '#f59e0b', outcome: 'Negative', help: 'Ne pourra pas venir (sans refuser la relation)' },
  interesse: { label: 'Intéressé', hex: '#6366f1', status: 'Interested', outcome: 'Positive', help: 'Veut en savoir plus, demande un rendez-vous ou un document' },
  a_rappeler: { label: 'À rappeler', hex: '#0ea5e9', status: 'Contacted', help: 'Demande à être recontacté plus tard ou par téléphone' },
  refus: { label: 'Refus', hex: '#ef4444', status: 'Lost', outcome: 'Negative', help: 'Pas intéressé' },
  desinscription: { label: 'Désinscription', hex: '#be123c', status: 'Lost', outcome: 'Negative', help: 'Demande à ne plus recevoir de messages' },
  reponse_automatique: { label: 'Réponse automatique', hex: '#94a3b8', help: 'Absence du bureau, accusé automatique' },
  rebond: { label: 'Email invalide', hex: '#64748b', outcome: 'Bounced', help: 'Message non délivré, adresse inexistante' },
  autre: { label: 'Autre', hex: '#64748b', help: 'Réponse à lire, sans classement clair' },
};

export const CLASS_ORDER = Object.keys(CLASSES) as ReplyClass[];

const STATUS_RANK: Record<string, number> = { New: 0, Contacted: 1, Interested: 2 };

/** Statut proposé pour un contact, ou null s'il ne doit pas changer. Jamais de régression d'un membre actif ou d'un dossier clos. */
export function proposeStatus(current: string | null | undefined, cls: ReplyClass): string | null {
  const wanted = CLASSES[cls].status;
  if (!wanted) return null;
  const cur = (current || 'New').trim();
  if (cur === 'Active' || cur === 'Closed') return null;
  if (wanted === 'Lost') return cur === 'Lost' ? null : 'Lost';
  if (cur === 'Lost') return null;
  const curRank = STATUS_RANK[cur] ?? 0;
  return (STATUS_RANK[wanted] ?? 0) > curRank ? wanted : null;
}

/** Étiquette ajoutée à la fiche (utile pour filtrer, et pour exclure les désinscrits des envois). */
export function proposeTag(cls: ReplyClass, event?: string): string | null {
  const ev = (event || '').replace(/[,;]/g, ' ').trim();
  if (cls === 'present') return ev ? `Présent – ${ev}` : 'Présent';
  if (cls === 'desinscription') return UNSUBSCRIBED_TAG;
  if (cls === 'rebond') return 'Email invalide';
  return null;
}

export const UNSUBSCRIBED_TAG = 'Désinscrit';

export function isUnsubscribed(tags: unknown): boolean {
  return Array.isArray(tags) && tags.some(t => String(t).trim().toLowerCase() === UNSUBSCRIBED_TAG.toLowerCase());
}

/** Résultat à écrire dans la campagne, ou null. */
export function proposeOutcome(cls: ReplyClass, campaignGoal?: string | null): OutcomeStatus | null {
  const o = CLASSES[cls].outcome;
  if (!o) return null;
  if (o === 'Positive' && campaignGoal === 'Event') return null; // pas de bouton « Intérêt » sur une campagne événement
  return o;
}

// ---------------------------------------------------------------- lecture du tableau

export interface ParsedReply {
  email: string;
  name: string;
  date: string;       // 'YYYY-MM-DDTHH:mm:ss' (sans fuseau, comme la colonne)
  cls: ReplyClass;
  summary: string;
  event: string;
  ref: string;
  attendees: number;
}

const norm = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const KEY_ALIASES: Record<string, string> = {
  email: 'email', mail: 'email', from: 'email', expediteur: 'email', adresse: 'email',
  nom: 'name', name: 'name', contact: 'name',
  date: 'date', received: 'date', recu: 'date',
  classification: 'cls', classement: 'cls', categorie: 'cls', type: 'cls', reponse: 'cls',
  resume: 'summary', summary: 'summary', synthese: 'summary', commentaire: 'summary',
  evenement: 'event', event: 'event',
  ref: 'ref', id: 'ref', message_id: 'ref', messageid: 'ref', thread: 'ref',
  personnes: 'attendees', nb_personnes: 'attendees', attendees: 'attendees', participants: 'attendees',
};

const CLASS_SYNONYMS: Record<string, ReplyClass> = {
  present: 'present', presente: 'present', confirme: 'present', participe: 'present', inscrit: 'present', oui: 'present', registered: 'present',
  absent: 'absent', absente: 'absent', decline: 'absent', indisponible: 'absent', non_disponible: 'absent',
  interesse: 'interesse', interessee: 'interesse', interested: 'interesse', positif: 'interesse', positive: 'interesse',
  a_rappeler: 'a_rappeler', rappeler: 'a_rappeler', rappel: 'a_rappeler', callback: 'a_rappeler',
  refus: 'refus', refuse: 'refus', pas_interesse: 'refus', non: 'refus', not_interested: 'refus', negatif: 'refus',
  desinscription: 'desinscription', desinscrit: 'desinscription', unsubscribe: 'desinscription', stop: 'desinscription',
  reponse_automatique: 'reponse_automatique', automatique: 'reponse_automatique', auto: 'reponse_automatique',
  absence: 'reponse_automatique', out_of_office: 'reponse_automatique', ooo: 'reponse_automatique',
  rebond: 'rebond', bounce: 'rebond', email_invalide: 'rebond', erreur_livraison: 'rebond', non_delivre: 'rebond',
  autre: 'autre', other: 'autre',
};

export function normalizeClass(v: unknown): ReplyClass {
  const k = norm(v).replace(/[\s\-']+/g, '_');
  return CLASS_SYNONYMS[k] || 'autre';
}

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi;

export function extractEmails(v: unknown): string[] {
  return Array.from(new Set((String(v ?? '').match(EMAIL_RE) || []).map(e => e.toLowerCase())));
}

function normalizeDate(v: unknown): string {
  const s = String(v ?? '').trim();
  let d: Date | null = null;
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (fr) d = new Date(Date.UTC(+fr[3], +fr[2] - 1, +fr[1], fr[4] ? +fr[4] : 12, fr[5] ? +fr[5] : 0));
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(`${s}T12:00:00Z`);
  else if (s) { const t = new Date(s); if (!isNaN(t.getTime())) d = t; }
  if (!d || isNaN(d.getTime())) d = new Date();
  return d.toISOString().slice(0, 19);
}

/** Extrait chaque objet {...} de premier niveau d'un texte (tolère le texte autour et les blocs ```json). */
function splitObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start >= 0) { out.push(text.slice(start, i + 1)); start = -1; } if (depth < 0) depth = 0; }
  }
  return out;
}

export function parseReplies(input: string): { rows: ParsedReply[]; errors: string[] } {
  const errors: string[] = [];
  const rows: ParsedReply[] = [];
  const text = (input || '').replace(/```[a-zA-Z]*/g, ' ').replace(/[“”]/g, '"');
  if (!text.trim()) return { rows, errors: ['Le champ est vide.'] };

  const objects: any[] = [];
  let parsedWhole = false;
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a >= 0 && b > a) {
    try {
      const arr = JSON.parse(text.slice(a, b + 1));
      if (Array.isArray(arr)) { objects.push(...arr); parsedWhole = true; }
    } catch { /* on retombe sur l'extraction objet par objet */ }
  }
  if (!parsedWhole) {
    for (const chunk of splitObjects(text)) {
      try { objects.push(JSON.parse(chunk)); }
      catch { errors.push(`Un bloc illisible a été ignoré : « ${chunk.slice(0, 60)}… »`); }
    }
  }
  if (objects.length === 0) { errors.push('Aucune réponse trouvée. Collez le tableau JSON produit par Claude.'); return { rows, errors }; }
  if (objects.length > 500) { errors.push('Plus de 500 lignes : seules les 500 premières sont lues.'); objects.length = 500; }

  objects.forEach((o, i) => {
    if (!o || typeof o !== 'object') { errors.push(`Ligne ${i + 1} ignorée (format inattendu).`); return; }
    const f: Record<string, any> = {};
    for (const [k, v] of Object.entries(o)) {
      const key = KEY_ALIASES[norm(k).replace(/[\s\-]+/g, '_')];
      if (key && f[key] === undefined) f[key] = v;
    }
    const emails = extractEmails(f.email);
    const name = String(f.name ?? '').trim() || String(f.email ?? '').replace(EMAIL_RE, '').replace(/[<>"]/g, '').trim();
    if (emails.length === 0 && !name) { errors.push(`Ligne ${i + 1} ignorée : ni email ni nom.`); return; }
    const att = parseInt(String(f.attendees ?? ''), 10);
    rows.push({
      email: emails[0] || '',
      name,
      date: normalizeDate(f.date),
      cls: normalizeClass(f.cls),
      summary: String(f.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
      event: String(f.event ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      ref: String(f.ref ?? '').trim().slice(0, 200),
      attendees: Number.isFinite(att) && att > 0 ? Math.min(att, 99) : 1,
    });
  });
  return { rows, errors };
}

// ---------------------------------------------------------------- rapprochement

export interface MatchContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
  status: string | null;
  category: string | null;
  tags: string[] | null;
  notes: string | null;
}

export interface ContactIndex {
  all: MatchContact[];
  byId: Map<string, MatchContact>;
  byEmail: Map<string, MatchContact[]>;
}

export async function loadContactIndex(): Promise<ContactIndex> {
  const { data, error } = await fetchAllRows<MatchContact>('contacts', 'id, first_name, last_name, company, email, status, category, tags, notes', { orderBy: 'created_at' });
  if (error) throw new Error(error.message || 'Lecture des contacts impossible.');
  const all = (data || []).map(c => ({ ...c, id: String(c.id) }));
  const byId = new Map<string, MatchContact>();
  const byEmail = new Map<string, MatchContact[]>();
  const add = (mail: string, c: MatchContact) => {
    const list = byEmail.get(mail) || [];
    if (!list.includes(c)) list.push(c);
    byEmail.set(mail, list);
  };
  for (const c of all) {
    byId.set(c.id, c);
    extractEmails(c.email).forEach(m => add(m, c));
    // « Autre email : x » écrit lors de la fusion des doublons
    for (const m of (c.notes || '').matchAll(/Autre email\s*:\s*(\S+)/gi)) extractEmails(m[1]).forEach(e => add(e, c));
  }
  return { all, byId, byEmail };
}

export type MatchKind = 'email' | 'name' | 'none';

export function matchRow(row: ParsedReply, idx: ContactIndex): { kind: MatchKind; candidates: MatchContact[] } {
  if (row.email) {
    const hit = idx.byEmail.get(row.email);
    if (hit && hit.length) return { kind: 'email', candidates: hit };
  }
  const n = norm(row.name);
  if (n.length >= 3) {
    const tokens = n.split(/[\s,]+/).filter(t => t.length > 1);
    const found = idx.all.filter(c => {
      const full = norm(`${c.first_name || ''} ${c.last_name || ''}`);
      const rev = norm(`${c.last_name || ''} ${c.first_name || ''}`);
      return full === n || rev === n || (tokens.length >= 2 && tokens.every(t => full.includes(t)));
    }).slice(0, 6);
    if (found.length) return { kind: 'name', candidates: found };
  }
  return { kind: 'none', candidates: [] };
}

// ---------------------------------------------------------------- anti-doublon

const dupKey = (contactId: string, summary: string) => `${contactId}|${norm(summary).replace(/\s+/g, ' ')}`;

/** Renvoie l'ensemble des index de lignes déjà importées (même référence de message, ou même contact et même résumé). */
export async function findAlreadyImported(
  items: { index: number; contactId: string; row: ParsedReply }[]
): Promise<Set<number>> {
  const dups = new Set<number>();
  if (!supabase || items.length === 0) return dups;
  const ids = Array.from(new Set(items.map(i => i.contactId)));
  const existing: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase.from('interactions').select('contact_id, content, metadata').eq('type', 'email_reply').in('contact_id', ids.slice(i, i + 100));
    if (data) existing.push(...data);
  }
  const refs = new Set<string>();
  const keys = new Set<string>();
  for (const e of existing) {
    const cid = String(e.contact_id);
    if (e.metadata?.ref) refs.add(`${cid}|${e.metadata.ref}`);
    // le texte enregistré est « Libellé — résumé\nÉvénement : x » : on ne compare que le résumé
    const summaryOnly = String(e.content || '').replace(/^[^—\n]*—\s*/, '').replace(/\nÉvénement\s*:.*$/s, '');
    keys.add(dupKey(cid, summaryOnly));
  }
  for (const it of items) {
    if (it.row.ref && refs.has(`${it.contactId}|${it.row.ref}`)) dups.add(it.index);
    else if (it.row.summary && keys.has(dupKey(it.contactId, it.row.summary))) dups.add(it.index);
  }
  return dups;
}

// ---------------------------------------------------------------- campagnes

export interface CampaignLite {
  id: string;
  name: string;
  goal: string | null;
  targets: string[];
  outcomes: Record<string, any>;
}

export async function loadCampaigns(): Promise<CampaignLite[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('campaigns').select('id, name, goal, target_contact_ids, outcomes, created_at').order('created_at', { ascending: false }).limit(60);
  return (data || []).map((c: any) => ({
    id: String(c.id),
    name: c.name || 'Sans nom',
    goal: c.goal || null,
    targets: Array.isArray(c.target_contact_ids) ? c.target_contact_ids.map(String) : [],
    outcomes: c.outcomes || {},
  }));
}

// ---------------------------------------------------------------- écriture

export interface ApplyItem {
  contactId: string;
  row: ParsedReply;       // classement et résumé éventuellement corrigés dans l'aperçu
  applyStatus: boolean;
  applyTag: boolean;
  applyOutcome: boolean;
}

export interface ApplyResult {
  imported: number;
  statusUpdated: number;
  tagged: number;
  outcomesUpdated: number;
  errors: string[];
}

export async function applyImport(items: ApplyItem[], campaignId: string | null): Promise<ApplyResult> {
  const res: ApplyResult = { imported: 0, statusUpdated: 0, tagged: 0, outcomesUpdated: 0, errors: [] };
  if (!supabase) { res.errors.push('Base de données non connectée.'); return res; }

  let campaign: CampaignLite | undefined;
  if (campaignId) campaign = (await loadCampaigns()).find(c => c.id === campaignId);
  const newOutcomes: Record<string, any> = { ...(campaign?.outcomes || {}) };
  let outcomesChanged = false;

  for (const it of items) {
    const { row, contactId } = it;
    const label = CLASSES[row.cls].label;
    try {
      const { error } = await supabase.from('interactions').insert([{
        contact_id: contactId,
        type: 'email_reply',
        content: `${label} — ${row.summary || 'Réponse reçue (voir la messagerie).'}${row.event ? `\nÉvénement : ${row.event}` : ''}`,
        metadata: { source: 'import_reponses', classification: row.cls, event: row.event || null, ref: row.ref || null, email: row.email || null, attendees: row.cls === 'present' ? row.attendees : null },
        created_at: row.date,
        created_by: 'Import réponses',
      }]);
      if (error) throw error;
      res.imported++;
    } catch (e: any) {
      res.errors.push(`${row.name || row.email} : interaction non enregistrée (${e?.message || e}).`);
      continue; // sans trace dans l'historique, on ne touche ni au statut ni aux étiquettes
    }

    try {
      if (it.applyStatus || it.applyTag) {
        const { data: fresh } = await supabase.from('contacts').select('status, tags').eq('id', contactId).maybeSingle();
        const patch: Record<string, any> = {};
        if (it.applyStatus) {
          const next = proposeStatus(fresh?.status, row.cls);
          if (next) { patch.status = next; res.statusUpdated++; }
        }
        if (it.applyTag) {
          const tag = proposeTag(row.cls, row.event);
          const tags: string[] = Array.isArray(fresh?.tags) ? fresh!.tags : [];
          if (tag && !tags.some(t => String(t).toLowerCase() === tag.toLowerCase())) { patch.tags = [...tags, tag]; res.tagged++; }
        }
        if (Object.keys(patch).length) {
          const { error } = await supabase.from('contacts').update(patch).eq('id', contactId);
          if (error) throw error;
        }
      }
    } catch (e: any) {
      res.errors.push(`${row.name || row.email} : fiche non mise à jour (${e?.message || e}).`);
    }

    if (campaign && it.applyOutcome && campaign.targets.includes(contactId)) {
      const status = proposeOutcome(row.cls, campaign.goal);
      if (status) {
        const current = newOutcomes[contactId]?.status;
        const downgrade = current === 'Registered' && (status === 'Positive' || status === 'Bounced');
        if (!downgrade) {
          newOutcomes[contactId] = {
            status,
            attendees: status === 'Registered' ? row.attendees : (status === 'Negative' ? 0 : (newOutcomes[contactId]?.attendees || 0)),
            updatedAt: new Date().toISOString(),
          };
          outcomesChanged = true;
          res.outcomesUpdated++;
        }
      }
    }
  }

  if (campaign && outcomesChanged) {
    try {
      // relecture juste avant l'écriture : on ne perd pas une qualification faite entre-temps
      const { data: fresh } = await supabase.from('campaigns').select('outcomes').eq('id', campaign.id).maybeSingle();
      const merged = { ...(fresh?.outcomes || {}) };
      for (const [cid, val] of Object.entries(newOutcomes)) {
        if (JSON.stringify(val) !== JSON.stringify((campaign.outcomes || {})[cid])) merged[cid] = val;
      }
      const { error } = await supabase.from('campaigns').update({ outcomes: merged }).eq('id', campaign.id);
      if (error) throw error;
    } catch (e: any) {
      res.errors.push(`Campagne non mise à jour (${e?.message || e}).`);
      res.outcomesUpdated = 0;
    }
  }
  return res;
}

// ---------------------------------------------------------------- consigne pour l'assistant qui lit la messagerie

export const REPLY_IMPORT_PROMPT = `Tu m'aides à exploiter les réponses reçues à mes campagnes d'emailing. Je gère un CRM qui envoie des emails de relance et d'invitation depuis ma boîte. Les réponses arrivent dans ma messagerie et je veux les classer pour les importer dans le CRM.

PÉRIODE À ANALYSER : depuis hier  (je peux écrire à la place « depuis le 14/11 », « les 3 derniers jours », etc.)

RÈGLE ABSOLUE — LECTURE SEULE : tu ne réponds à personne, tu ne crées aucun brouillon, tu n'envoies rien, tu ne supprimes, n'archives et ne déplaces aucun message, tu ne poses aucun libellé et tu ne marques rien comme lu ou comme spam. Tu lis uniquement.

CE QUE TU DOIS FAIRE
1. Cherche dans ma boîte de réception les messages REÇUS sur la période qui sont des réponses à mes campagnes : conversations où j'ai moi-même écrit en premier (invitation, relance, présentation).
2. Ignore : les newsletters, notifications, factures, publicités, les messages de mes collègues sans lien avec une campagne, et mes propres messages.
3. S'il y a plusieurs messages d'une même personne dans une conversation, ne garde que le plus récent qui contient sa réponse. Si quelqu'un répond à la place d'une autre personne ou transfère le message, l'email est celui de la personne qui a ÉCRIT le message, et tu le précises dans le résumé.
4. Pour chaque réponse retenue, remplis UN objet JSON avec exactement ces champs :
   - "email" : l'adresse de l'expéditeur, en minuscules (seulement l'adresse, sans nom).
   - "nom" : prénom et nom de l'expéditeur si tu les connais, sinon "".
   - "date" : date de réception au format AAAA-MM-JJ.
   - "classification" : UNE valeur parmi la liste ci-dessous.
   - "resume" : une phrase en français, 200 caractères maximum, qui dit ce que la personne a répondu et ce qu'il faut faire ensuite. Pas de copie de texte long, pas de signature, pas d'informations personnelles sensibles (santé, vie privée, finances).
   - "evenement" : le nom de l'événement si la réponse en parle explicitement, sinon "".
   - "personnes" : nombre de personnes annoncées (1 par défaut, seulement pour « present »).
   - "ref" : l'identifiant du message Gmail ou le lien de la conversation, pour que le CRM n'importe jamais deux fois la même réponse.

VALEURS POSSIBLES POUR "classification"
   - "present" : confirme sa venue ou sa participation.
   - "absent" : ne pourra pas venir, sans refuser la relation.
   - "interesse" : veut en savoir plus, demande un rendez-vous ou un document.
   - "a_rappeler" : demande à être recontacté plus tard ou par téléphone.
   - "refus" : n'est pas intéressé.
   - "desinscription" : demande à ne plus recevoir de messages.
   - "reponse_automatique" : absence du bureau ou accusé de réception automatique.
   - "rebond" : message non délivré, adresse inexistante. Dans ce cas, "email" est l'adresse à laquelle j'ai écrit, si tu peux l'identifier.
   - "autre" : tout le reste, y compris ce qui est ambigu. Dans le doute, choisis "autre" plutôt que d'inventer.

FORMAT DE TA RÉPONSE
Réponds avec UN SEUL bloc de code JSON contenant un tableau, sans rien écrire dans le bloc en dehors du JSON. S'il n'y a aucune réponse, écris []. Après le bloc, ajoute une seule ligne de synthèse (exemple : « 12 réponses : 5 présents, 2 absents, 1 désinscription, 4 autres »).

Exemple de format (ne le recopie pas, il sert uniquement à montrer la structure) :
\`\`\`json
[
  {"email": "prenom.nom@exemple.fr", "nom": "Prénom Nom", "date": "2026-11-14", "classification": "present", "resume": "Confirme sa venue à la soirée du 20/11 avec un collègue.", "evenement": "Soirée du 20/11", "personnes": 2, "ref": "18c3f0a1b2d4e5f6"}
]
\`\`\`
`;
