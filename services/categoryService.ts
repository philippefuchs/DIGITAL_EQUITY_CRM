import { supabase } from './supabase';

export interface Category {
  slug: string;
  label: string;
  color: string; // #rrggbb
  defaultStatus: string;
  sortOrder: number;
  isSystem: boolean;
}

export const STATUS_OPTIONS = ['New', 'Contacted', 'Interested', 'Closed', 'Active', 'Lost'];

export const FALLBACK_COLOR = '#64748b';

/** Utilisées si la table n'est pas joignable : l'application continue de fonctionner comme avant. */
export const DEFAULT_CATEGORIES: Category[] = [
  { slug: 'prospect', label: 'Prospect', color: '#6366f1', defaultStatus: 'New', sortOrder: 10, isSystem: true },
  { slug: 'member', label: 'Membre', color: '#10b981', defaultStatus: 'Active', sortOrder: 20, isSystem: true },
];

type DbCategory = {
  slug: string;
  label: string;
  color: string;
  default_status: string;
  sort_order: number;
  is_system: boolean;
};

const fromDb = (r: DbCategory): Category => ({
  slug: r.slug,
  label: r.label,
  color: r.color || FALLBACK_COLOR,
  defaultStatus: r.default_status || 'New',
  sortOrder: r.sort_order ?? 100,
  isSystem: !!r.is_system,
});

/** Valeur stockée dans contacts.category : minuscules, sans espaces ; vide => prospect (comportement historique). */
export const normalizeSlug = (v?: string | null): string =>
  (v || 'prospect').toString().toLowerCase().trim();

export const slugify = (label: string): string =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

/** Assombrit une couleur #rrggbb (amount entre 0 et 1). */
export const darken = (hex: string, amount = 0.2): string => {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = clamp(((n >> 16) & 255) * (1 - amount));
  const g = clamp(((n >> 8) & 255) * (1 - amount));
  const b = clamp((n & 255) * (1 - amount));
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
};

export const gradientFor = (color: string): string =>
  `linear-gradient(to top right, ${color}, ${darken(color, 0.25)})`;

export const fetchCategories = async (): Promise<Category[]> => {
  if (!supabase) return DEFAULT_CATEGORIES;
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error || !data || data.length === 0) return DEFAULT_CATEGORIES;
    return (data as DbCategory[]).map(fromDb);
  } catch (e) {
    console.error('Chargement des catégories impossible, valeurs par défaut utilisées', e);
    return DEFAULT_CATEGORIES;
  }
};

export const countContactsByCategory = async (): Promise<Record<string, number>> => {
  const counts: Record<string, number> = {};
  if (!supabase) return counts;
  // Pagination : la limite par défaut de Supabase est de 1000 lignes par requête.
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('contacts')
      .select('category')
      .range(from, from + pageSize - 1);
    if (error || !data) break;
    data.forEach((r: { category: string | null }) => {
      const k = normalizeSlug(r.category);
      counts[k] = (counts[k] || 0) + 1;
    });
    if (data.length < pageSize) break;
  }
  return counts;
};

export interface NewCategoryInput {
  label: string;
  color: string;
  defaultStatus: string;
}

export const createCategory = async (input: NewCategoryInput, existing: Category[]): Promise<Category> => {
  if (!supabase) throw new Error('Base de données non configurée.');
  const label = input.label.trim();
  if (!label) throw new Error('Le nom est obligatoire.');
  const base = slugify(label);
  if (!base) throw new Error('Le nom doit contenir au moins une lettre ou un chiffre.');
  let slug = base;
  for (let i = 2; existing.some(c => c.slug === slug); i++) slug = `${base}-${i}`;
  if (existing.some(c => c.label.toLowerCase() === label.toLowerCase())) {
    throw new Error(`Une catégorie « ${label} » existe déjà.`);
  }
  const sortOrder = Math.max(0, ...existing.map(c => c.sortOrder)) + 10;
  const { data, error } = await supabase
    .from('categories')
    .insert({ slug, label, color: input.color, default_status: input.defaultStatus, sort_order: sortOrder, is_system: false })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return fromDb(data as DbCategory);
};

export const updateCategory = async (
  slug: string,
  patch: Partial<Pick<Category, 'label' | 'color' | 'defaultStatus' | 'sortOrder'>>
): Promise<void> => {
  if (!supabase) throw new Error('Base de données non configurée.');
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) {
    if (!patch.label.trim()) throw new Error('Le nom est obligatoire.');
    row.label = patch.label.trim();
  }
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.defaultStatus !== undefined) row.default_status = patch.defaultStatus;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  const { error } = await supabase.from('categories').update(row).eq('slug', slug);
  if (error) throw new Error(error.message);
};

export const deleteCategory = async (category: Category): Promise<void> => {
  if (!supabase) throw new Error('Base de données non configurée.');
  if (category.isSystem) throw new Error('Cette catégorie de base ne peut pas être supprimée.');
  const { count, error: cErr } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('category', category.slug);
  if (cErr) throw new Error(cErr.message);
  if (count && count > 0) {
    throw new Error(`${count} contact(s) utilisent encore « ${category.label} ». Changez leur catégorie avant de la supprimer.`);
  }
  const { error } = await supabase.from('categories').delete().eq('slug', category.slug);
  if (error) throw new Error(error.message);
};
