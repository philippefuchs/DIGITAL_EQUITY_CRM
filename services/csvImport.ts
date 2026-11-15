import { supabase } from './supabase';
import { fetchAllRows } from './pagination';

/**
 * Import CSV de contacts, avec détection des doublons AVANT toute écriture.
 * Les fonctions d'analyse sont pures (testables sans base) ; seules loadExisting et applyCsvImport touchent Supabase.
 */

export type CsvField =
  | 'first_name' | 'last_name' | 'email' | 'company' | 'title' | 'phone'
  | 'linkedin_url' | 'website' | 'sector' | 'address' | 'notes' | 'status';

export const FIELD_LABELS: Record<CsvField, string> = {
  first_name: 'Prénom', last_name: 'Nom', email: 'Email', company: 'Société', title: 'Titre', phone: 'Téléphone',
  linkedin_url: 'LinkedIn', website: 'Site web', sector: 'Secteur', address: 'Adresse', notes: 'Notes', status: 'Statut',
};

// En-têtes acceptés (comparés sans accents, sans majuscules, sans espaces ni tirets)
const HEADER_ALIASES: Record<string, CsvField> = {
  prenom: 'first_name', firstname: 'first_name', first_name: 'first_name', givenname: 'first_name',
  nom: 'last_name', lastname: 'last_name', last_name: 'last_name', familyname: 'last_name', surname: 'last_name',
  email: 'email', mail: 'email', courriel: 'email', emailaddress: 'email', adresseemail: 'email',
  societe: 'company', company: 'company', entreprise: 'company', organisation: 'company', organization: 'company',
  titre: 'title', title: 'title', poste: 'title', fonction: 'title', jobtitle: 'title',
  telephone: 'phone', phone: 'phone', tel: 'phone', mobile: 'phone',
  linkedin: 'linkedin_url', linkedinurl: 'linkedin_url', linkedin_url: 'linkedin_url', urllinkedin: 'linkedin_url',
  siteweb: 'website', website: 'website', web: 'website', site: 'website',
  secteur: 'sector', sector: 'sector', industrie: 'sector', industry: 'sector',
  adresse: 'address', address: 'address', ville: 'address',
  notes: 'notes', note: 'notes', commentaire: 'notes', commentaires: 'notes',
  statut: 'status', status: 'status',
};

const STATUS_ALIASES: Record<string, string> = {
  new: 'New', nouveau: 'New', nouvelle: 'New',
  contacted: 'Contacted', contacte: 'Contacted',
  interested: 'Interested', interesse: 'Interested',
  active: 'Active', actif: 'Active',
  closed: 'Closed', clos: 'Closed', gagne: 'Closed',
  lost: 'Lost', perdu: 'Lost',
};

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const key = (s: string) => strip(s).toLowerCase().replace(/[\s\-_.]+/g, '');

export function normalizeStatus(raw?: string): string | undefined {
  if (!raw) return undefined;
  return STATUS_ALIASES[key(raw)];
}

export function normalizeEmail(raw?: string | null): string {
  const m = (raw || '').toLowerCase().match(/[a-z0-9._%+'\-]+@[a-z0-9.\-]+\.[a-z]{2,}/);
  return m ? m[0] : '';
}

/** Clé comparable d'une adresse LinkedIn : sans protocole, www, sous-domaine pays, paramètres ni "/" final. */
export function normalizeLinkedin(raw?: string | null): string {
  let u = (raw || '').trim().toLowerCase();
  if (!u) return '';
  u = u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^[a-z]{2}\.linkedin\.com/, 'linkedin.com');
  u = u.split('?')[0].split('#')[0].replace(/\/+$/, '');
  try { u = decodeURIComponent(u); } catch { /* garde la valeur brute */ }
  return u.includes('linkedin.com') ? u : '';
}

export const nameKey = (first?: string | null, last?: string | null) =>
  key(`${first || ''}${last || ''}`);
const companyKey = (c?: string | null) => key(c || '');

/** Lit un CSV : BOM, séparateur , ; ou tabulation, guillemets, retours à la ligne dans un champ. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<string, number>;
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]++;
  }
  const delim = (Object.keys(counts) as string[]).sort((a, b) => counts[b] - counts[a])[0];
  const sep = counts[delim] > 0 ? delim : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      rows.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

export interface CsvRecord { line: number; data: Partial<Record<CsvField, string>>; }

export interface ParsedCsv { records: CsvRecord[]; unknownHeaders: string[]; mapped: CsvField[]; }

export function mapCsv(table: string[][]): ParsedCsv {
  if (table.length < 2) return { records: [], unknownHeaders: [], mapped: [] };
  const headers = table[0].map(h => h.trim());
  const fields: (CsvField | null)[] = headers.map(h => HEADER_ALIASES[key(h)] || null);
  const unknownHeaders = headers.filter((h, i) => h && !fields[i]);
  const records: CsvRecord[] = [];
  for (let r = 1; r < table.length; r++) {
    const data: Partial<Record<CsvField, string>> = {};
    fields.forEach((f, i) => {
      const v = (table[r][i] || '').trim();
      if (f && v && !data[f]) data[f] = v;
    });
    records.push({ line: r + 1, data });
  }
  return { records, unknownHeaders, mapped: Array.from(new Set(fields.filter(Boolean) as CsvField[])) };
}

export interface ExistingContact {
  id: string; first_name?: string | null; last_name?: string | null; company?: string | null; title?: string | null;
  email?: string | null; phone?: string | null; linkedin_url?: string | null; website?: string | null;
  sector?: string | null; address?: string | null; notes?: string | null; category?: string | null;
}

export interface ExistingIndex {
  all: ExistingContact[];
  byLinkedin: Map<string, ExistingContact>;
  byEmail: Map<string, ExistingContact>;
  byNameCompany: Map<string, ExistingContact>;
  byName: Map<string, ExistingContact[]>;
}

export function buildIndex(all: ExistingContact[]): ExistingIndex {
  const idx: ExistingIndex = { all, byLinkedin: new Map(), byEmail: new Map(), byNameCompany: new Map(), byName: new Map() };
  for (const c of all) {
    const l = normalizeLinkedin(c.linkedin_url);
    if (l && !idx.byLinkedin.has(l)) idx.byLinkedin.set(l, c);
    const emails = new Set<string>([normalizeEmail(c.email)]);
    for (const m of (c.notes || '').matchAll(/Autre email\s*:\s*(\S+)/gi)) emails.add(normalizeEmail(m[1]));
    emails.forEach(e => { if (e && !idx.byEmail.has(e)) idx.byEmail.set(e, c); });
    const nk = nameKey(c.first_name, c.last_name);
    if (nk) {
      const ck = companyKey(c.company);
      if (ck && !idx.byNameCompany.has(nk + '|' + ck)) idx.byNameCompany.set(nk + '|' + ck, c);
      idx.byName.set(nk, [...(idx.byName.get(nk) || []), c]);
    }
  }
  return idx;
}

export type RowKind = 'new' | 'duplicate' | 'possible' | 'invalid' | 'repeat';
export type DuplicateReason = 'linkedin' | 'email' | 'nom + société' | 'homonyme' | 'fichier';

export interface AnalyzedRow {
  line: number;
  kind: RowKind;
  data: Partial<Record<CsvField, string>>;
  reason?: DuplicateReason;
  match?: ExistingContact;           // fiche existante (doublon ou homonyme)
  repeatOfLine?: number;             // doublon à l'intérieur du fichier
  fill: CsvField[];                  // champs vides de la fiche existante que la ligne peut compléter
  problem?: string;                  // raison d'une ligne invalide
}

const FILLABLE: CsvField[] = ['email', 'company', 'title', 'phone', 'linkedin_url', 'website', 'sector', 'address'];

function fillableFields(row: Partial<Record<CsvField, string>>, c: ExistingContact): CsvField[] {
  return FILLABLE.filter(f => {
    if (!row[f]) return false;
    if (f === 'email' && !normalizeEmail(row.email)) return false;
    if (f === 'linkedin_url' && !normalizeLinkedin(row.linkedin_url)) return false;
    return !((c as any)[f] || '').toString().trim();
  });
}

export function analyzeRecords(records: CsvRecord[], idx: ExistingIndex): AnalyzedRow[] {
  const out: AnalyzedRow[] = [];
  const seenLinkedin = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  const seenNameCompany = new Map<string, number>();

  for (const rec of records) {
    const d = rec.data;
    const email = normalizeEmail(d.email);
    const li = normalizeLinkedin(d.linkedin_url);
    const nk = nameKey(d.first_name, d.last_name);
    const base = { line: rec.line, data: d, fill: [] as CsvField[] };

    if (d.email && !email) { out.push({ ...base, kind: 'invalid', problem: `Email invalide : ${d.email}` }); continue; }
    if (!email && !li && !(d.first_name && d.last_name)) {
      out.push({ ...base, kind: 'invalid', problem: 'Ni email, ni LinkedIn, ni prénom et nom' }); continue;
    }

    // 1. déjà présent dans la base : LinkedIn, puis email, puis prénom + nom + société
    const ck = companyKey(d.company);
    let match: ExistingContact | undefined;
    let reason: DuplicateReason | undefined;
    if (li && idx.byLinkedin.has(li)) { match = idx.byLinkedin.get(li); reason = 'linkedin'; }
    else if (email && idx.byEmail.has(email)) { match = idx.byEmail.get(email); reason = 'email'; }
    else if (nk && ck && idx.byNameCompany.has(nk + '|' + ck)) { match = idx.byNameCompany.get(nk + '|' + ck); reason = 'nom + société'; }
    if (match && reason) { out.push({ ...base, kind: 'duplicate', reason, match, fill: fillableFields(d, match) }); continue; }

    // 2. déjà présent plus haut dans le fichier
    const rep = (li && seenLinkedin.get(li)) || (email && seenEmail.get(email)) || (nk && ck && seenNameCompany.get(nk + '|' + ck)) || 0;
    if (rep) { out.push({ ...base, kind: 'repeat', reason: 'fichier', repeatOfLine: rep }); continue; }

    if (li) seenLinkedin.set(li, rec.line);
    if (email) seenEmail.set(email, rec.line);
    if (nk && ck) seenNameCompany.set(nk + '|' + ck, rec.line);

    // 3. même nom que quelqu'un d'autre sans autre point commun : homonyme possible, non importé par défaut
    const same = nk ? idx.byName.get(nk) : undefined;
    if (same && same.length) { out.push({ ...base, kind: 'possible', reason: 'homonyme', match: same[0], fill: fillableFields(d, same[0]) }); continue; }

    out.push({ ...base, kind: 'new' });
  }
  return out;
}

export interface ImportPlan {
  toInsert: AnalyzedRow[];                 // nouvelles fiches
  toUpdate: AnalyzedRow[];                 // fiches existantes à compléter
  skipped: AnalyzedRow[];
}

export type PlanOptions = { completeDuplicates: boolean; includePossible: Set<number> };

export function buildPlan(rows: AnalyzedRow[], opts: PlanOptions): ImportPlan {
  const plan: ImportPlan = { toInsert: [], toUpdate: [], skipped: [] };
  for (const r of rows) {
    if (r.kind === 'new') plan.toInsert.push(r);
    else if (r.kind === 'possible' && opts.includePossible.has(r.line)) plan.toInsert.push(r);
    else if (r.kind === 'duplicate' && opts.completeDuplicates && r.fill.length) plan.toUpdate.push(r);
    else plan.skipped.push(r);
  }
  return plan;
}

export interface ImportResult { inserted: number; updated: number; skipped: number; errors: string[]; }

export async function loadExisting(): Promise<ExistingContact[]> {
  const { data, error } = await fetchAllRows<ExistingContact>(
    'contacts',
    'id, first_name, last_name, company, title, email, phone, linkedin_url, website, sector, address, notes, category',
    { orderBy: 'created_at' }
  );
  if (error) throw new Error(error.message || 'Lecture des contacts impossible.');
  return (data || []).map(c => ({ ...c, id: String(c.id) }));
}

export async function applyCsvImport(plan: ImportPlan, category: string): Promise<ImportResult> {
  if (!supabase) throw new Error('Base de données non configurée.');
  const res: ImportResult = { inserted: 0, updated: 0, skipped: plan.skipped.length, errors: [] };

  const payloads = plan.toInsert.map(r => {
    const d = r.data;
    const p: any = { category, first_name: d.first_name || '', last_name: d.last_name || '' };
    (['company', 'title', 'phone', 'linkedin_url', 'website', 'sector', 'address', 'notes'] as CsvField[]).forEach(f => { if (d[f]) p[f] = d[f]; });
    if (d.email) p.email = normalizeEmail(d.email);
    p.status = normalizeStatus(d.status) || 'New';
    return p;
  });
  for (let i = 0; i < payloads.length; i += 100) {
    const chunk = payloads.slice(i, i + 100);
    const { error } = await supabase.from('contacts').insert(chunk);
    if (!error) { res.inserted += chunk.length; continue; }
    // un lot refusé : on réessaie ligne par ligne pour ne perdre que la ligne fautive
    for (let j = 0; j < chunk.length; j++) {
      const { error: e1 } = await supabase.from('contacts').insert(chunk[j]);
      if (e1) res.errors.push(`Ligne ${plan.toInsert[i + j].line} : ${e1.message}`);
      else res.inserted++;
    }
  }

  for (const r of plan.toUpdate) {
    const patch: any = {};
    r.fill.forEach(f => { patch[f] = f === 'email' ? normalizeEmail(r.data.email) : r.data[f]; });
    const { error } = await supabase.from('contacts').update(patch).eq('id', r.match!.id);
    if (error) res.errors.push(`Ligne ${r.line} : ${error.message}`);
    else res.updated++;
  }
  return res;
}
