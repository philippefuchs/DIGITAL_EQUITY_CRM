import { supabase } from './supabase';
import { EmailTemplate } from '../types';

const LOCAL_KEY = 'leadgen_email_templates';

type DbTemplate = {
  id: string;
  name: string | null;
  subject: string | null;
  body: string | null;
  category: string | null;
  created_at: string | null;
};

const fromDb = (r: DbTemplate): EmailTemplate => ({
  id: r.id,
  name: r.name || 'Sans titre',
  subject: r.subject || '',
  body: r.body || '',
  category: r.category || undefined,
  createdAt: r.created_at || new Date().toISOString(),
});

const toDb = (t: EmailTemplate) => ({
  id: String(t.id),
  name: t.name || 'Sans titre',
  subject: t.subject ?? '',
  body: t.body ?? '',
  category: t.category ?? null,
  created_at: t.createdAt || new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const readLocalTemplates = (): EmailTemplate[] => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeLocalTemplates = (templates: EmailTemplate[]) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(templates));
  } catch (e) {
    console.error('Impossible de mettre à jour le cache local des modèles', e);
  }
};

const norm = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const contentKey = (t: { name?: string | null; subject?: string | null; body?: string | null }) =>
  `${norm(t.name)}|${norm(t.subject)}|${norm(t.body)}`;

/**
 * Envoie vers Supabase les modèles présents uniquement dans ce navigateur.
 * N'écrase jamais un modèle déjà présent en base et n'ajoute pas un modèle
 * dont le contenu (nom, objet, corps) existe déjà sous un autre identifiant :
 * on ne fait qu'ajouter ce qui manque vraiment. Renvoie true si tout est en base.
 */
export const syncLocalTemplatesToDb = async (): Promise<boolean> => {
  if (!supabase) return false;
  const local = readLocalTemplates().filter(t => t && t.id);
  if (local.length === 0) return true;
  try {
    const { data: existing, error: readError } = await supabase
      .from('email_templates')
      .select('id,name,subject,body');
    if (readError || !existing) {
      console.error('Lecture des modèles en base impossible:', readError?.message);
      return false;
    }
    const ids = new Set((existing as DbTemplate[]).map(r => r.id));
    const keys = new Set((existing as DbTemplate[]).map(contentKey));
    const toAdd: EmailTemplate[] = [];
    for (const t of local) {
      if (ids.has(String(t.id))) continue;
      const k = contentKey(t);
      if (keys.has(k)) continue; // même contenu déjà en base sous un autre identifiant
      keys.add(k); // évite aussi les doublons à l'intérieur du cache local
      toAdd.push(t);
    }
    if (toAdd.length === 0) return true;
    const { error } = await supabase
      .from('email_templates')
      .upsert(toAdd.map(toDb), { onConflict: 'id', ignoreDuplicates: true });
    if (error) {
      console.error('Sauvegarde des modèles en base impossible:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Sauvegarde des modèles en base impossible:', e);
    return false;
  }
};

/**
 * Charge les modèles : d'abord on sauvegarde en base ceux du navigateur,
 * puis la base fait foi. En cas d'erreur réseau, on garde le cache local.
 */
export const loadTemplates = async (): Promise<EmailTemplate[]> => {
  const local = readLocalTemplates();
  if (!supabase) return local;
  try {
    const synced = await syncLocalTemplatesToDb();
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: true });
    if (error || !data) return local;
    // Si la synchro a échoué, ne pas écraser le cache local par une base incomplète.
    if (!synced && data.length < local.length) return local;
    const fromBase = (data as DbTemplate[]).map(fromDb);
    writeLocalTemplates(fromBase);
    return fromBase;
  } catch (e) {
    console.error('Chargement des modèles impossible, cache local utilisé', e);
    return local;
  }
};

export const saveTemplate = async (template: EmailTemplate): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('email_templates').upsert(toDb(template), { onConflict: 'id' });
    if (error) console.error('Sauvegarde du modèle impossible:', error.message);
    return !error;
  } catch (e) {
    console.error('Sauvegarde du modèle impossible:', e);
    return false;
  }
};

export const deleteTemplate = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('email_templates').delete().eq('id', id);
    if (error) console.error('Suppression du modèle impossible:', error.message);
    return !error;
  } catch (e) {
    console.error('Suppression du modèle impossible:', e);
    return false;
  }
};
