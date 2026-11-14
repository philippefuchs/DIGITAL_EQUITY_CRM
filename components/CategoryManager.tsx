import React, { useCallback, useEffect, useState } from 'react';
import { Tags, Plus, Trash2, ArrowUp, ArrowDown, Lock, Check } from 'lucide-react';
import { useCategories } from './CategoryProvider';
import { useToast } from './ToastProvider';
import {
  Category, STATUS_OPTIONS, countContactsByCategory, createCategory, deleteCategory,
  gradientFor, updateCategory
} from '../services/categoryService';

const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b', '#0ea5e9'];

const CategoryManager: React.FC = () => {
  const { categories, refresh } = useCategories();
  const { toast } = useToast();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[2]);
  const [newStatus, setNewStatus] = useState('New');
  const [busy, setBusy] = useState(false);
  // Brouillons de renommage : la sauvegarde se fait à la sortie du champ ou avec Entrée.
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});

  const loadCounts = useCallback(async () => setCounts(await countContactsByCategory()), []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const run = async (action: () => Promise<void>, okMessage?: string) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      await loadCounts();
      if (okMessage) toast.success(okMessage);
    } catch (e: any) {
      toast.error(e?.message || 'Opération impossible.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await createCategory({ label: newLabel, color: newColor, defaultStatus: newStatus }, categories);
      setNewLabel('');
    }, 'Catégorie créée. Elle apparaît dans le menu.');
  };

  const commitLabel = (c: Category) => {
    const draft = labelDrafts[c.slug];
    if (draft === undefined || draft.trim() === c.label) return;
    void run(async () => {
      await updateCategory(c.slug, { label: draft });
      setLabelDrafts(d => { const n = { ...d }; delete n[c.slug]; return n; });
    }, 'Nom mis à jour.');
  };

  const move = (index: number, dir: -1 | 1) => {
    const a = categories[index];
    const b = categories[index + dir];
    if (!a || !b) return;
    // Échange des positions ; si elles sont égales, on les sépare.
    const aOrder = a.sortOrder === b.sortOrder ? b.sortOrder + dir : b.sortOrder;
    void run(async () => {
      await updateCategory(a.slug, { sortOrder: aOrder });
      await updateCategory(b.slug, { sortOrder: a.sortOrder });
    });
  };

  const handleDelete = (c: Category) => {
    if (!confirm(`Supprimer la catégorie « ${c.label} » ?`)) return;
    void run(() => deleteCategory(c), 'Catégorie supprimée.');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="bg-white p-8 lg:p-10 rounded-[40px] border border-slate-200 shadow-sm flex items-center gap-6">
        <div
          className="w-16 h-16 rounded-3xl flex items-center justify-center text-white shadow-xl rotate-3"
          style={{ background: gradientFor('#6366f1') }}
        >
          <Tags size={28} strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-2xl lg:text-3xl font-black uppercase italic tracking-tighter text-slate-900 leading-tight">
            Catégories
          </h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2 italic">
            Chaque catégorie a sa couleur et son entrée dans le menu
          </p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="bg-white p-6 lg:p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-5">
        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-900 italic">Nouvelle catégorie</h3>
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_auto_1fr_auto] gap-4 items-end">
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Nom</label>
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="ex. ESN"
              maxLength={40}
              className="w-full px-5 py-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Couleur</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  aria-label={`Couleur ${c}`}
                  className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
                  style={{ backgroundColor: c, borderColor: newColor === c ? '#0f172a' : 'transparent' }}
                >
                  {newColor === c && <Check size={14} className="text-white" strokeWidth={4} />}
                </button>
              ))}
              <input
                type="color"
                value={newColor}
                onChange={e => setNewColor(e.target.value)}
                aria-label="Couleur personnalisée"
                className="w-8 h-8 rounded-full cursor-pointer bg-transparent border-0 p-0"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Statut par défaut</label>
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
              className="w-full px-5 py-4 bg-slate-50 rounded-2xl outline-none font-black italic text-xs uppercase cursor-pointer"
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button
            type="submit"
            disabled={busy || !newLabel.trim()}
            className="px-8 py-4 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 disabled:opacity-40 italic"
            style={{ background: gradientFor(newColor) }}
          >
            <Plus size={16} strokeWidth={4} /> Créer
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {categories.map((c, i) => (
          <div key={c.slug} className="bg-white p-5 lg:p-6 rounded-[28px] border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
            <input
              type="color"
              value={c.color}
              disabled={busy}
              onChange={e => void run(() => updateCategory(c.slug, { color: e.target.value }))}
              aria-label={`Couleur de ${c.label}`}
              className="w-11 h-11 rounded-2xl cursor-pointer bg-transparent border-0 p-0"
            />
            <input
              value={labelDrafts[c.slug] ?? c.label}
              onChange={e => setLabelDrafts(d => ({ ...d, [c.slug]: e.target.value }))}
              onBlur={() => commitLabel(c)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              maxLength={40}
              aria-label={`Nom de ${c.slug}`}
              className="flex-1 min-w-[160px] px-4 py-3 bg-slate-50 rounded-xl outline-none font-black text-sm uppercase italic"
            />
            <select
              value={c.defaultStatus}
              disabled={busy}
              onChange={e => void run(() => updateCategory(c.slug, { defaultStatus: e.target.value }))}
              aria-label={`Statut par défaut de ${c.label}`}
              className="px-4 py-3 bg-slate-50 rounded-xl outline-none font-black italic text-[10px] uppercase cursor-pointer"
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 min-w-[90px] text-right">
              {counts[c.slug] ?? 0} contact{(counts[c.slug] ?? 0) > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button" disabled={busy || i === 0} onClick={() => move(i, -1)}
                aria-label="Monter" className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-100 disabled:opacity-30"
              ><ArrowUp size={16} /></button>
              <button
                type="button" disabled={busy || i === categories.length - 1} onClick={() => move(i, 1)}
                aria-label="Descendre" className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-100 disabled:opacity-30"
              ><ArrowDown size={16} /></button>
              {c.isSystem ? (
                <span title="Catégorie de base : ne peut pas être supprimée" className="p-2.5 text-slate-300"><Lock size={16} /></span>
              ) : (
                <button
                  type="button" disabled={busy} onClick={() => handleDelete(c)}
                  aria-label={`Supprimer ${c.label}`} className="p-2.5 rounded-xl text-rose-400 hover:bg-rose-50 disabled:opacity-30"
                ><Trash2 size={16} /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-slate-400 font-bold italic px-2">
        Une catégorie utilisée par des contacts ne peut pas être supprimée : changez d'abord leur catégorie.
        Le renommage ne modifie pas les contacts.
      </p>
    </div>
  );
};

export default CategoryManager;
