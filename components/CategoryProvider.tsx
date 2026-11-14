import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Category, DEFAULT_CATEGORIES, FALLBACK_COLOR, fetchCategories, normalizeSlug
} from '../services/categoryService';

interface CategoryContextValue {
  categories: Category[];
  loading: boolean;
  refresh: () => Promise<void>;
  /** Renvoie toujours une catégorie : une valeur inconnue en base s'affiche en gris avec son nom brut. */
  getCategory: (slug?: string | null) => Category;
}

const CategoryContext = createContext<CategoryContextValue>({
  categories: DEFAULT_CATEGORIES,
  loading: false,
  refresh: async () => { },
  getCategory: (slug) => DEFAULT_CATEGORIES.find(c => c.slug === normalizeSlug(slug)) || DEFAULT_CATEGORIES[0],
});

export const CategoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setCategories(await fetchCategories());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getCategory = useCallback((slug?: string | null): Category => {
    const key = normalizeSlug(slug);
    return categories.find(c => c.slug === key) || {
      slug: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      color: FALLBACK_COLOR,
      defaultStatus: 'New',
      sortOrder: 9999,
      isSystem: false,
    };
  }, [categories]);

  const value = useMemo(() => ({ categories, loading, refresh, getCategory }), [categories, loading, refresh, getCategory]);
  return <CategoryContext.Provider value={value}>{children}</CategoryContext.Provider>;
};

export const useCategories = () => useContext(CategoryContext);
