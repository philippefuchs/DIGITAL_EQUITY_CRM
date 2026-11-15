import React, { useState, useRef, useMemo } from 'react';
import { Download, Upload, X } from 'lucide-react';
import {
    parseCsv, mapCsv, loadExisting, buildIndex, analyzeRecords, buildPlan, applyCsvImport,
    FIELD_LABELS, AnalyzedRow, ParsedCsv
} from '../services/csvImport';
import { useToast } from './ToastProvider';
import { useCategories } from './CategoryProvider';

interface ImportCSVModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: string;
    onSuccess: () => void;
}

const ImportCSVModal: React.FC<ImportCSVModalProps> = ({ isOpen, onClose, category, onSuccess }) => {
    const { showToast } = useToast();
    const { getCategory } = useCategories();
    const [importFile, setImportFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [parsed, setParsed] = useState<ParsedCsv | null>(null);
    const [rows, setRows] = useState<AnalyzedRow[] | null>(null);
    const [complete, setComplete] = useState(true);
    const [possible, setPossible] = useState<Set<number>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    const plan = useMemo(
        () => (rows ? buildPlan(rows, { completeDuplicates: complete, includePossible: possible }) : null),
        [rows, complete, possible]
    );

    if (!isOpen) return null;

    const reset = () => { setImportFile(null); setParsed(null); setRows(null); setPossible(new Set()); setComplete(true); };

    const handleDownloadTemplate = () => {
        const tpl = [
            'Prénom,Nom,Email,Société,Titre,Téléphone,LinkedIn,Site_Web,Secteur,Adresse,Notes,Statut',
            'Jean,Dupont,jean.dupont@exemple.com,Acme Corp,Directeur,+33612345678,https://linkedin.com/in/jeandupont,https://acme.com,Technologie,Paris,Excellent contact,Nouveau',
            'Marie,Martin,marie.martin@exemple.com,Tech Solutions,CTO,+33698765432,,,SaaS,Lyon,Prospect intéressant,Contacté'
        ];
        const csvContent = '﻿' + tpl.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const fileName = `Modèle_Import_${getCategory(category).label.replace(/[^A-Za-z0-9À-ÿ_-]+/g, '_')}.csv`;
        link.download = fileName;
        link.click();
    };

    // Étape 2 : lecture du fichier et comparaison avec la base, sans rien écrire
    const handleAnalyze = async (file: File) => {
        setImportFile(file); setRows(null); setParsed(null); setPossible(new Set());
        setBusy(true);
        try {
            const table = parseCsv(await file.text());
            const p = mapCsv(table);
            if (!p.records.length) { showToast('Le fichier CSV est vide ou invalide', 'error'); return; }
            const idx = buildIndex(await loadExisting());
            setParsed(p);
            setRows(analyzeRecords(p.records, idx));
        } catch (err: any) {
            console.error('Error reading CSV:', err);
            showToast(`Erreur de lecture: ${err.message}`, 'error');
        } finally { setBusy(false); }
    };

    // Étape 3 : écriture, uniquement ce que l'aperçu a montré
    const handleImportCSV = async () => {
        if (!plan) return;
        setBusy(true);
        try {
            const res = await applyCsvImport(plan, category);
            const parts = [`${res.inserted} créé(s)`];
            if (res.updated) parts.push(`${res.updated} fiche(s) complétée(s)`);
            if (res.skipped) parts.push(`${res.skipped} ignoré(s)`);
            if (res.errors.length) {
                console.error('Import errors', res.errors);
                showToast(`${parts.join(', ')} — ${res.errors.length} erreur(s) : ${res.errors[0]}`, 'error');
            } else showToast(`Import terminé : ${parts.join(', ')}`, 'success');
            onSuccess(); onClose(); reset();
        } catch (err: any) {
            console.error('Error importing CSV:', err);
            showToast(`Erreur d'import: ${err.message}`, 'error');
        } finally { setBusy(false); }
    };

    const count = (k: AnalyzedRow['kind']) => (rows || []).filter(r => r.kind === k).length;
    const nm = (r: AnalyzedRow) => `${r.data.first_name || ''} ${r.data.last_name || ''}`.trim() || r.data.email || r.data.linkedin_url || '(sans nom)';
    const dups = (rows || []).filter(r => r.kind === 'duplicate');
    const poss = (rows || []).filter(r => r.kind === 'possible');
    const bad = (rows || []).filter(r => r.kind === 'invalid' || r.kind === 'repeat');

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[32px] p-8 max-w-2xl w-full shadow-2xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-black uppercase italic text-slate-900">
                        Importer : {getCategory(category).label}
                    </h3>
                    <button
                        onClick={() => { onClose(); reset(); }}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-5">
                    <div className="bg-indigo-50 border border-indigo-200 rounded-[20px] p-4">
                        <p className="text-xs font-bold text-indigo-900 mb-2">📋 Étape 1 : Télécharger le modèle</p>
                        <button
                            onClick={handleDownloadTemplate}
                            className="w-full px-4 py-3 bg-indigo-600 text-white rounded-[16px] font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2"
                        >
                            <Download size={16} />
                            Télécharger le modèle CSV
                        </button>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-200 rounded-[20px] p-4">
                        <p className="text-xs font-bold text-emerald-900 mb-2">📤 Étape 2 : Choisir votre fichier (rien n'est écrit avant votre accord)</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.txt"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAnalyze(f); e.target.value = ''; }}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={busy}
                            className="w-full px-4 py-3 bg-white border-2 border-emerald-300 text-emerald-700 rounded-[16px] font-black text-xs uppercase tracking-widest hover:bg-emerald-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Upload size={16} />
                            {busy && !rows ? 'Analyse en cours…' : importFile ? importFile.name : 'Sélectionner un fichier CSV'}
                        </button>
                    </div>

                    {rows && plan && parsed && (
                        <div className="border border-slate-200 rounded-[20px] p-4 space-y-4">
                            <p className="text-xs font-bold text-slate-900">🔎 Étape 3 : Vérifier avant d'importer ({rows.length} ligne(s) lue(s))</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                {[
                                    ['Nouveaux', count('new'), 'bg-emerald-50 text-emerald-700'],
                                    ['Déjà en base', count('duplicate'), 'bg-amber-50 text-amber-700'],
                                    ['Homonymes', count('possible'), 'bg-sky-50 text-sky-700'],
                                    ['Écartés', bad.length, 'bg-rose-50 text-rose-700'],
                                ].map(([l, n, c]) => (
                                    <div key={l as string} className={`rounded-xl p-3 ${c}`}>
                                        <div className="text-xl font-black">{n as number}</div>
                                        <div className="text-[10px] font-bold uppercase tracking-wider">{l as string}</div>
                                    </div>
                                ))}
                            </div>
                            {parsed.unknownHeaders.length > 0 && (
                                <p className="text-[11px] text-amber-700">Colonnes ignorées (non reconnues) : {parsed.unknownHeaders.join(', ')}</p>
                            )}

                            {dups.length > 0 && (
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                                        <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />
                                        Compléter les fiches déjà en base avec les champs vides du fichier (rien n'est écrasé)
                                    </label>
                                    <ul className="mt-2 max-h-40 overflow-y-auto text-[11px] text-slate-600 space-y-1">
                                        {dups.slice(0, 100).map(r => (
                                            <li key={r.line}>
                                                Ligne {r.line} : {nm(r)} — déjà en base ({r.reason})
                                                {r.fill.length > 0 ? ` → complétera : ${r.fill.map(f => FIELD_LABELS[f]).join(', ')}` : ' → rien à compléter'}
                                            </li>
                                        ))}
                                        {dups.length > 100 && <li>… et {dups.length - 100} autre(s)</li>}
                                    </ul>
                                </div>
                            )}

                            {poss.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-slate-800">Même nom qu'un contact existant, mais ni email ni société identiques. Cochez ceux qui sont de vraies personnes différentes :</p>
                                    <ul className="mt-2 max-h-40 overflow-y-auto text-[11px] text-slate-600 space-y-1">
                                        {poss.slice(0, 100).map(r => (
                                            <li key={r.line}>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={possible.has(r.line)}
                                                        onChange={(e) => {
                                                            const n = new Set(possible);
                                                            if (e.target.checked) n.add(r.line); else n.delete(r.line);
                                                            setPossible(n);
                                                        }}
                                                    />
                                                    Ligne {r.line} : {nm(r)}{r.data.company ? ` (${r.data.company})` : ''} — en base : {r.match?.company || 'sans société'}
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {bad.length > 0 && (
                                <ul className="max-h-28 overflow-y-auto text-[11px] text-rose-700 space-y-1">
                                    {bad.slice(0, 100).map(r => (
                                        <li key={r.line}>Ligne {r.line} écartée : {r.kind === 'repeat' ? `déjà présente à la ligne ${r.repeatOfLine} du fichier` : r.problem}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {rows && plan && (
                        <button
                            onClick={handleImportCSV}
                            disabled={busy || (plan.toInsert.length === 0 && plan.toUpdate.length === 0)}
                            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-[20px] font-black uppercase text-sm tracking-widest hover:scale-[1.02] transition-all shadow-xl disabled:opacity-40 disabled:hover:scale-100"
                        >
                            {busy ? 'Import en cours…' : `Créer ${plan.toInsert.length} contact(s)${plan.toUpdate.length ? ` et compléter ${plan.toUpdate.length} fiche(s)` : ''}`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportCSVModal;
