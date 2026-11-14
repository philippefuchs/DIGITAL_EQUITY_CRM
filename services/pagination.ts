import { supabase } from './supabase';

const PAGE_SIZE = 1000;

export interface FetchAllOptions {
  orderBy?: string;
  ascending?: boolean;
}

/**
 * Charge TOUTES les lignes d'une table.
 * Supabase plafonne chaque requête à 1000 lignes sans erreur : on lit donc par pages
 * jusqu'à recevoir une page vide (fonctionne aussi si le plafond du projet est plus bas).
 * Le tri est complété par "id" pour qu'aucune ligne ne soit perdue ou doublée entre deux pages.
 * Renvoie { data, error } comme une requête Supabase habituelle.
 */
export async function fetchAllRows<T = any>(
  table: string,
  columns = '*',
  opts: FetchAllOptions = {},
  client: any = supabase
): Promise<{ data: T[]; error: any }> {
  if (!client) return { data: [], error: new Error('Base de données non configurée.') };
  const all: T[] = [];
  let from = 0;
  for (; ;) {
    let q = client.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (opts.orderBy) q = q.order(opts.orderBy, { ascending: opts.ascending ?? true });
    q = q.order('id', { ascending: true });
    const { data, error } = await q;
    if (error) return { data: all, error };
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    from += data.length;
  }
  return { data: all, error: null };
}
