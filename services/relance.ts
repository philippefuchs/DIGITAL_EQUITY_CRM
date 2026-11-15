import { supabase } from './supabase';
import { fetchAllRows } from './pagination';
import { isUnsubscribed } from './replyImport';

/**
 * Relances : qui a reçu un email il y a un moment et n'a pas répondu.
 * Le calcul (computeFollowUps) est pur ; loadFollowUpData et sendFollowUps touchent Supabase / EmailJS.
 */

export interface FuContact {
  id: string; first_name?: string | null; last_name?: string | null; company?: string | null; email?: string | null;
  status?: string | null; category?: string | null; tags?: string[] | null; score?: number | null;
}
export interface FuEmail { lead_id: string | null; created_at: string | null; opened_at: string | null; subject?: string | null; }
export interface FuReply { contact_id: string; created_at: string; }

export interface FollowUpData { contacts: FuContact[]; emails: FuEmail[]; replies: FuReply[]; }

export type OpenFilter = 'all' | 'unopened' | 'opened';

export interface FollowUpOptions {
  minDays: number;            // délai minimum depuis le dernier email
  maxSent: number;            // 0 = pas de limite ; sinon nombre maximum d'emails déjà envoyés à la personne
  open: OpenFilter;
  category: string;           // 'all' ou slug
  includeActive: boolean;     // les membres « Active » sont proposés ou non
}

export const DEFAULT_OPTIONS: FollowUpOptions = { minDays: 7, maxSent: 0, open: 'all', category: 'all', includeActive: true };

export interface FollowUp {
  contact: FuContact;
  sent: number;               // emails déjà envoyés
  lastSentAt: string;         // date du dernier envoi
  daysSince: number;
  opened: boolean;            // au moins un email ouvert
  lastSubject: string;
}

const EXCLUDED_STATUS = new Set(['Lost', 'Closed']);
const INVALID_TAG = 'Email invalide';

const validEmail = (e?: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export function computeFollowUps(data: FollowUpData, opts: FollowUpOptions, now: Date = new Date()): FollowUp[] {
  const perLead = new Map<string, { sent: number; last: string; opened: boolean; subject: string }>();
  for (const e of data.emails) {
    if (!e.lead_id || !e.created_at) continue;
    const id = String(e.lead_id);
    const cur = perLead.get(id) || { sent: 0, last: '', opened: false, subject: '' };
    cur.sent++;
    if (e.opened_at) cur.opened = true;
    if (!cur.last || e.created_at > cur.last) { cur.last = e.created_at; cur.subject = e.subject || ''; }
    perLead.set(id, cur);
  }
  const lastReply = new Map<string, string>();
  for (const r of data.replies) {
    const id = String(r.contact_id);
    if (!lastReply.has(id) || r.created_at > lastReply.get(id)!) lastReply.set(id, r.created_at);
  }

  const out: FollowUp[] = [];
  for (const c of data.contacts) {
    const s = perLead.get(String(c.id));
    if (!s) continue;                                              // jamais écrit
    if (!validEmail(c.email)) continue;
    if (isUnsubscribed(c.tags || [])) continue;
    if ((c.tags || []).includes(INVALID_TAG)) continue;
    if (EXCLUDED_STATUS.has((c.status || '').trim())) continue;
    if (!opts.includeActive && (c.status || '').trim() === 'Active') continue;
    if (opts.category !== 'all' && c.category !== opts.category) continue;
    const rep = lastReply.get(String(c.id));
    if (rep && rep >= s.last) continue;                            // a répondu depuis le dernier email
    const days = Math.floor((now.getTime() - new Date(s.last).getTime()) / 86400000);
    if (days < opts.minDays) continue;
    if (opts.maxSent > 0 && s.sent > opts.maxSent) continue;
    if (opts.open === 'unopened' && s.opened) continue;
    if (opts.open === 'opened' && !s.opened) continue;
    out.push({ contact: c, sent: s.sent, lastSentAt: s.last, daysSince: days, opened: s.opened, lastSubject: s.subject });
  }
  // les plus anciens d'abord, puis les moins relancés
  return out.sort((a, b) => b.daysSince - a.daysSince || a.sent - b.sent);
}

export async function loadFollowUpData(): Promise<FollowUpData> {
  const [c, e, r] = await Promise.all([
    fetchAllRows<FuContact>('contacts', 'id, first_name, last_name, company, email, status, category, tags, score', { orderBy: 'created_at' }),
    fetchAllRows<FuEmail>('emails', 'lead_id, created_at, opened_at, subject', { orderBy: 'created_at' }),
    fetchAllRows<FuReply>('interactions', 'contact_id, created_at, type', { orderBy: 'created_at' }),
  ]);
  if (c.error) throw new Error(c.error.message || 'Lecture des contacts impossible.');
  if (e.error) throw new Error(e.error.message || 'Lecture des emails impossible.');
  if (r.error) throw new Error(r.error.message || 'Lecture des réponses impossible.');
  return {
    contacts: (c.data || []).map(x => ({ ...x, id: String(x.id) })),
    emails: e.data || [],
    replies: ((r.data || []) as any[]).filter(x => x.type === 'email_reply').map(x => ({ contact_id: String(x.contact_id), created_at: x.created_at })),
  };
}

export const fillPlaceholders = (text: string, c: FuContact) =>
  (text || '')
    .replace(/\{\{Prénom\}\}/gi, c.first_name || '')
    .replace(/\{\{Nom\}\}/gi, c.last_name || '')
    .replace(/\{\{company\}\}/gi, c.company || '');

export interface SendReport { sent: number; failed: { name: string; error: string }[]; }

/** Envoie la relance à chaque contact (même circuit qu'une campagne : EmailJS + pixel de suivi + trace en base). */
export async function sendFollowUps(
  contacts: FuContact[], subject: string, body: string, onProgress?: (done: number, total: number) => void
): Promise<SendReport> {
  const cfg = JSON.parse(localStorage.getItem('leadgen_emailjs_config') || 'null');
  if (!cfg?.emailjsPublicKey || !cfg?.emailjsServiceId || !cfg?.emailjsTemplateId) {
    throw new Error('Configuration EmailJS incomplète dans Maintenance.');
  }
  const logo = localStorage.getItem('leadgen_app_logo') || '';
  const report: SendReport = { sent: 0, failed: [] };

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const email = (c.email || '').trim();
    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || email;
    const trackingId = crypto.randomUUID();
    const subj = fillPlaceholders(subject, c);
    const msg = fillPlaceholders(body, c);
    const payload: any = {
      service_id: cfg.emailjsServiceId, template_id: cfg.emailjsTemplateId, user_id: cfg.emailjsPublicKey,
      template_params: {
        email, to_email: email, recipient_email: email, to_name: name, recipient_name: name,
        firstName: c.first_name || '', lastName: c.last_name || '', company: c.company || '',
        subject: subj, message: msg, from_name: cfg.senderName || 'LeadGen Pro', logo_url: logo, reply_to: cfg.senderEmail || '',
        tracking_pixel: `<img src="https://digital-equity-crm.vercel.app/api/track?id=${trackingId}" width="1" height="1" style="border:0;" alt="" />`,
      },
    };
    if (cfg.emailjsAccessToken) payload.accessToken = cfg.emailjsAccessToken;

    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) { report.failed.push({ name, error: `${res.status} ${await res.text()}` }); }
      else {
        report.sent++;
        if (supabase) {
          await supabase.from('emails').insert([{ lead_id: c.id, campaign_id: null, status: 'sent', tracking_id: trackingId, subject: subj, body: msg }]);
          await markContacted(c);
        }
      }
    } catch (e: any) {
      report.failed.push({ name, error: e?.message || 'Erreur réseau' });
    }
    onProgress?.(i + 1, contacts.length);
    await new Promise(r => setTimeout(r, 600));
  }
  return report;
}

/** Un email est parti : le contact « New » (ou sans statut) passe à « Contacted ». Les autres statuts ne bougent jamais. */
export async function markContacted(c: { id: string; status?: string | null }): Promise<void> {
  if (!supabase) return;
  const s = (c.status || '').trim();
  if (s && s !== 'New') return;
  await supabase.from('contacts').update({ status: 'Contacted' }).eq('id', c.id).or('status.is.null,status.eq.New');
}
