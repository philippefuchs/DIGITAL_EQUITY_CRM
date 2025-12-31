
import React, { useState, useRef } from 'react';
import {
    Sparkles,
    Send,
    Download,
    ArrowRight,
    RefreshCw,
    Lightbulb,
    Layout,
    FileText,
    CheckCircle2,
    AlertCircle,
    Eye,
    Type as TypeIcon,
    Palette,
    Layers,
    Copy,
    Check
} from 'lucide-react';
import { getCarouselIdeas, generateCarouselScript, generateLinkedInPostOptions } from '../services/geminiService';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface Slide {
    title: string;
    content: string;
    visual: string;
}

const CarouselManager: React.FC = () => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [userActivity, setUserActivity] = useState('');
    const [useAIForTopic, setUseAIForTopic] = useState(false);
    const [topicIdeas, setTopicIdeas] = useState<string[]>([]);
    const [selectedTopic, setSelectedTopic] = useState('');
    const [slides, setSlides] = useState<Slide[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [postOptions, setPostOptions] = useState<any[]>([]);
    const [copiedPost, setCopiedPost] = useState<number | null>(null);
    const [customInstruction, setCustomInstruction] = useState('');
    const [language, setLanguage] = useState<'fr' | 'en'>('fr');

    const slidesRef = useRef<HTMLDivElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);

    const handleGeneratePosts = async () => {
        setIsLoading(true);
        try {
            const options = await generateLinkedInPostOptions(selectedTopic, slides, customInstruction, language);
            setPostOptions(options);
            // UX Improvement: Scroll to results and show visual confirmation
            setTimeout(() => {
                resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        } catch (err) {
            console.error(err);
            setError("Erreur lors de la génération des posts.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopyPost = (content: string, index: number) => {
        navigator.clipboard.writeText(content);
        setCopiedPost(index);
        setTimeout(() => setCopiedPost(null), 2000);
    };

    const handleGetIdeas = async () => {
        if (!userActivity) return;
        setIsLoading(true);
        setError(null);
        try {
            const ideas = await getCarouselIdeas(userActivity, language);
            setTopicIdeas(ideas);
        } catch (err: any) {
            console.error(err);
            setError("Impossible de générer des idées. Veuillez réessayer.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateScript = async (topicToUse: string) => {
        if (!topicToUse) return;
        setIsLoading(true);
        setError(null);
        try {
            const script = await generateCarouselScript(topicToUse, language);
            setSlides(script);
            setStep(2);
        } catch (err: any) {
            console.error(err);
            setError("Impossible de générer le script. Veuillez réessayer.");
        } finally {
            setIsLoading(false);
        }
    };

    // Helper function to escape HTML special characters
    const escapeHtml = (text: string): string => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    const downloadPDF = async () => {
        if (!slidesRef.current) return;

        // Show immediate feedback


        setIsLoading(true);

        try {
            const pdf = new jsPDF('l', 'mm', 'a4', true); // 'l' for landscape

            // Create an isolated iframe with landscape dimensions
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.left = '-9999px';
            iframe.style.top = '-9999px';
            iframe.style.width = '1200px';
            iframe.style.height = '800px';
            document.body.appendChild(iframe);

            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc) {
                alert('❌ Erreur: Impossible d\'accéder à l\'iframe');
                throw new Error('Cannot access iframe document');
            }

            // Write a clean HTML document with NO external stylesheets
            iframeDoc.open();
            iframeDoc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body></body></html>');
            iframeDoc.close();



            for (let i = 0; i < slides.length; i++) {
                const slideData = slides[i];

                // Create slide HTML with enhanced design
                const slideHTML = `
                    <div style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        border: none;
                        color: #ffffff;
                        padding: 60px;
                        width: 1200px;
                        height: 800px;
                        box-sizing: border-box;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        gap: 40px;
                        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                        position: relative;
                        overflow: hidden;
                    ">
                        <!-- Decorative elements -->
                        <div style="
                            position: absolute;
                            top: -100px;
                            right: -100px;
                            width: 300px;
                            height: 300px;
                            border-radius: 50%;
                            background: rgba(255, 255, 255, 0.1);
                        "></div>
                        
                        <!-- Badge -->
                        <div style="
                            position: absolute;
                            top: 40px;
                            right: 40px;
                            width: 60px;
                            height: 60px;
                            border-radius: 20px;
                            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                            border: 3px solid rgba(255, 255, 255, 0.3);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 24px;
                            font-weight: 900;
                            color: #ffffff;
                            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
                        ">${i + 1}</div>

                        <!-- Content container -->
                        <div style="display: flex; flex-direction: column; gap: 40px; flex: 1; z-index: 1; align-items: center; text-align: center;">
                            <!-- Header -->
                            <div style="display: flex; flex-direction: column; gap: 20px; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <span style="
                                        font-size: 12px;
                                        font-weight: 900;
                                        text-transform: uppercase;
                                        letter-spacing: 0.3em;
                                        color: rgba(255, 255, 255, 0.8);
                                        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                                    ">SLIDE ${i + 1}</span>
                                </div>
                                
                                <!-- Title with shadow -->
                                <h4 style="
                                    font-size: 48px;
                                    font-weight: 900;
                                    text-transform: uppercase;
                                    color: #ffffff;
                                    line-height: 1.2;
                                    margin: 0;
                                    text-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                                    letter-spacing: -0.02em;
                                    text-align: center;
                                ">${escapeHtml(slideData.title)}</h4>
                            </div>

                            <!-- Content with background -->
                            <div style="
                                background: rgba(255, 255, 255, 0.15);
                                backdrop-filter: blur(10px);
                                padding: 30px;
                                border-radius: 20px;
                                border: 1px solid rgba(255, 255, 255, 0.2);
                                width: 100%;
                            ">
                                <p style="
                                    color: #ffffff;
                                    font-weight: 600;
                                    font-size: 18px;
                                    line-height: 1.8;
                                    letter-spacing: 0.02em;
                                    margin: 0;
                                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                                    text-align: center;
                                ">${escapeHtml(slideData.content)}</p>
                            </div>
                        </div>

                        <!-- Visual suggestion footer -->
                        <div style="
                            background: rgba(0, 0, 0, 0.2);
                            padding: 24px 30px;
                            border-radius: 16px;
                            border-left: 4px solid #f093fb;
                            z-index: 1;
                            text-align: center;
                        ">
                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; justify-content: center;">
                                <span style="
                                    font-size: 11px;
                                    font-weight: 900;
                                    text-transform: uppercase;
                                    letter-spacing: 0.2em;
                                    color: rgba(255, 255, 255, 0.7);
                                ">💡 SUGGESTION VISUELLE</span>
                            </div>
                            <p style="
                                font-size: 14px;
                                font-weight: 600;
                                color: rgba(255, 255, 255, 0.9);
                                line-height: 1.6;
                                margin: 0;
                                text-align: center;
                            ">${escapeHtml(slideData.visual)}</p>
                        </div>
                    </div>
                `;

                iframeDoc.body.innerHTML = slideHTML;

                // Wait a bit for rendering
                await new Promise(resolve => setTimeout(resolve, 100));

                const slideElement = iframeDoc.body.firstElementChild as HTMLElement;
                if (!slideElement) throw new Error('Slide element not found');

                // Capture with html2canvas
                const canvas = await html2canvas(slideElement, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false,
                    allowTaint: true,
                });

                const imgData = canvas.toDataURL('image/png');

                if (i > 0) pdf.addPage();
                // A4 landscape: 297mm x 210mm, with 10mm margins = 277mm x 190mm usable
                pdf.addImage(imgData, 'PNG', 10, 10, 277, 185);
            }

            // Remove iframe
            document.body.removeChild(iframe);

            // Generate a clean filename with date
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const cleanTopic = selectedTopic
                .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .toLowerCase()
                .substring(0, 50); // Limit length
            const filename = `Carrousel-LinkedIn-${cleanTopic}-${dateStr}.pdf`;

            // Create blob and force download
            const pdfOutput = pdf.output('blob');
            const blobUrl = URL.createObjectURL(pdfOutput);

            // Create download link
            const downloadLink = document.createElement('a');
            downloadLink.href = blobUrl;
            downloadLink.download = filename;
            downloadLink.style.display = 'none';

            // Trigger download
            document.body.appendChild(downloadLink);
            downloadLink.click();

            // Also open in new tab as fallback
            window.open(blobUrl, '_blank');

            // Cleanup after a delay
            setTimeout(() => {
                document.body.removeChild(downloadLink);
                URL.revokeObjectURL(blobUrl);
            }, 100);

            setError(null);
            // alert(`✅ PDF généré avec succès !\n\nFichier : ${filename}\nTaille : ${Math.round(pdfOutput.size / 1024)} KB\n\n📄 Le PDF s'ouvre dans un nouvel onglet.\n💾 Pour le sauvegarder : Ctrl+S ou Clic droit → Enregistrer sous`);
        } catch (err: any) {
            console.error("PDF Export error details:", err);
            console.error("Error message:", err?.message);
            console.error("Error stack:", err?.stack);

            const errorMsg = err?.message || String(err);
            setError(`Erreur PDF: ${errorMsg.substring(0, 100)}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div className="bg-white/40 backdrop-blur-md p-8 rounded-[40px] border border-white/20 shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-gradient-to-tr from-indigo-500 to-violet-500 text-white rounded-2xl shadow-lg ring-4 ring-indigo-500/10 animate-pulse">
                        <Sparkles size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black uppercase italic tracking-tight text-slate-900">
                            Agent <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Carousel IA</span>
                        </h2>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1 italic opacity-60">Générateur de Carrousels Viraux v2.0</p>
                    </div>
                </div>

                {/* Language Selector */}
                <div className="flex bg-white/50 backdrop-blur-sm rounded-xl p-1 gap-1 border border-white/40 shadow-inner mx-auto lg:mx-0 lg:ml-auto lg:mr-8 items-center px-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">Langue :</span>
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="bg-transparent text-xs font-black uppercase tracking-wider text-slate-700 outline-none border-none cursor-pointer hover:text-indigo-600 transition-colors py-2"
                    >
                        <option value="fr">🇫🇷 Français</option>
                        <option value="en">🇬🇧 English</option>
                        <option value="es">🇪🇸 Español</option>
                        <option value="he">🇮🇱 Hebrew</option>
                    </select>
                </div>

                {/* Steps Progress */}
                <div className="hidden lg:flex items-center gap-4 bg-slate-900/5 p-2 rounded-2xl border border-slate-200/50">
                    {[1, 2, 3].map((s) => (
                        <div
                            key={s}
                            className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all ${step === s
                                ? 'bg-white shadow-md text-slate-900 ring-1 ring-slate-200'
                                : s < step ? 'text-emerald-500' : 'text-slate-400'
                                }`}
                        >
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${step === s ? 'bg-indigo-500 text-white' : s < step ? 'bg-emerald-100' : 'bg-slate-200'
                                }`}>
                                {s < step ? <CheckCircle2 size={14} /> : s}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest italic">
                                {s === 1 ? 'Idéation' : s === 2 ? 'Rédaction' : 'Rendu'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {error && (
                <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl flex items-center gap-4 text-rose-600 animate-in fade-in slide-in-from-top-4 duration-300">
                    <AlertCircle size={20} />
                    <p className="text-xs font-black uppercase italic tracking-wider">{error}</p>
                </div>
            )}

            {/* STEP 1: IDEATION */}
            {step === 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-xl space-y-8">
                            <div className="flex items-center gap-4 p-4 bg-indigo-50 rounded-3xl border border-indigo-100">
                                <Lightbulb className="text-indigo-500" size={24} />
                                <h3 className="font-black uppercase italic text-sm tracking-tight text-indigo-900">Le concept</h3>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-4 tracking-widest">Votre activité / Secteur</label>
                                <textarea
                                    value={userActivity}
                                    onChange={(e) => setUserActivity(e.target.value)}
                                    className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[32px] outline-none font-bold text-sm shadow-inner focus:border-indigo-500 transition-all min-h-[120px] resize-none"
                                    placeholder="Ex: Agence marketing spécialisée dans l'IA pour les e-commerçants..."
                                />
                            </div>

                            <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[28px] border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${useAIForTopic ? 'bg-indigo-500' : 'bg-slate-300'}`} onClick={() => setUseAIForTopic(!useAIForTopic)}>
                                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${useAIForTopic ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Je n'ai pas d'idée</span>
                                </div>
                            </div>

                            {!useAIForTopic ? (
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-4 tracking-widest">Sujet du carrousel</label>
                                    <input
                                        type="text"
                                        value={selectedTopic}
                                        onChange={(e) => setSelectedTopic(e.target.value)}
                                        className="w-full p-6 bg-white border border-slate-200 rounded-[24px] outline-none font-bold text-sm shadow-sm focus:border-indigo-500 transition-all"
                                        placeholder="Saisissez votre sujet..."
                                    />
                                    <button
                                        disabled={!selectedTopic || isLoading}
                                        onClick={() => handleGenerateScript(selectedTopic)}
                                        className="w-full py-6 bg-slate-900 text-white rounded-[24px] font-black uppercase text-[11px] tracking-widest shadow-xl hover:bg-indigo-600 disabled:opacity-50 transition-all active:scale-95 italic flex items-center justify-center gap-3"
                                    >
                                        {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                                        Générer la rédaction
                                    </button>
                                </div>
                            ) : (
                                <button
                                    disabled={!userActivity || isLoading}
                                    onClick={handleGetIdeas}
                                    className="w-full py-6 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-[24px] font-black uppercase text-[11px] tracking-widest shadow-xl hover:opacity-90 disabled:opacity-50 transition-all active:scale-95 italic flex items-center justify-center gap-3"
                                >
                                    {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />}
                                    Trouver des idées
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-8">
                        <div className="bg-white/40 backdrop-blur-md rounded-[48px] border border-white/20 shadow-2xl h-full p-12 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12 transition-transform group-hover:rotate-0">
                                <Layout size={200} />
                            </div>

                            {topicIdeas.length > 0 ? (
                                <div className="w-full space-y-8 relative z-10">
                                    <div className="space-y-2">
                                        <h4 className="text-2xl font-black uppercase italic text-slate-900">Sujets suggérés par l'IA</h4>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Cliquez sur une idée pour lancer la rédaction</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        {topicIdeas.map((idea, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    setSelectedTopic(idea);
                                                    handleGenerateScript(idea);
                                                }}
                                                className="p-8 bg-white border border-slate-100 rounded-[32px] text-left hover:border-indigo-500 hover:shadow-2xl hover:-translate-y-1 transition-all group flex items-center justify-between"
                                            >
                                                <span className="text-sm font-bold text-slate-700 italic group-hover:text-indigo-600">{idea}</span>
                                                <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                                    <ArrowRight size={18} />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8 max-w-md relative z-10">
                                    <div className="w-32 h-32 rounded-[40px] bg-white border border-slate-100 shadow-xl flex items-center justify-center mx-auto mb-8 animate-bounce">
                                        <Palette size={48} className="text-indigo-500" />
                                    </div>
                                    <h3 className="text-3xl font-black uppercase italic text-slate-900 leading-tight">Prêt à créer du contenu viral ?</h3>
                                    <p className="text-sm font-bold text-slate-400 leading-relaxed uppercase tracking-wider">L'agent IA va vous aider à structurer vos idées et à créer un carrousel prêt à être publié en quelques secondes.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 2: REDACTION */}
            {step === 2 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black uppercase italic text-slate-900">Édition du Script</h3>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Affinez le contenu généré par l'IA avant la mise en forme</p>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => setStep(1)} className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-500 font-bold text-xs uppercase hover:bg-slate-50 transition-colors">
                                Retour
                            </button>
                            <button onClick={() => setStep(3)} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-2">
                                Valider & Voir le Rendu <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-32">
                        {slides.map((slide, idx) => (
                            <div key={idx} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-xl group hover:border-indigo-500/30 transition-all">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-xs">
                                            {idx + 1}
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Slide {idx + 1}</span>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <FileText size={16} className="text-slate-300" />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 block ml-2">Titre / Accroche</label>
                                        <input
                                            type="text"
                                            value={slide.title}
                                            onChange={(e) => {
                                                const newSlides = [...slides];
                                                newSlides[idx].title = e.target.value;
                                                setSlides(newSlides);
                                            }}
                                            className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 outline-none focus:border-indigo-500 focus:bg-white transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 block ml-2">Contenu</label>
                                        <textarea
                                            value={slide.content}
                                            onChange={(e) => {
                                                const newSlides = [...slides];
                                                newSlides[idx].content = e.target.value;
                                                setSlides(newSlides);
                                            }}
                                            rows={4}
                                            className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-medium text-slate-600 outline-none focus:border-indigo-500 focus:bg-white transition-all text-sm resize-none leading-relaxed"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 block ml-2">Suggestion Visuelle (IA)</label>
                                        <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex gap-3 items-start">
                                            <Palette size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                                            <p className="text-xs text-indigo-900/70 italic font-medium leading-relaxed">{slide.visual}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* STEP 3: RENDERING */}
            {step === 3 && (
                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-500">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-8 bg-slate-900 p-10 rounded-[48px] border border-slate-800 shadow-2xl overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-12 opacity-10">
                            <Download size={120} className="text-white" />
                        </div>

                        <div className="flex items-center gap-8 relative z-10">
                            <div className="w-20 h-20 rounded-[32px] bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-xl shadow-indigo-500/20">
                                <Eye size={32} className="text-white" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black uppercase italic text-white leading-none">Aperçu du Carrousel</h3>
                                <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.4em] mt-3 italic">{selectedTopic}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 relative z-10 w-full md:w-auto">
                            <button
                                onClick={() => setStep(1)}
                                className="flex-1 md:flex-none px-10 py-5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-[24px] font-black uppercase text-[10px] tracking-widest transition-all italic flex items-center justify-center gap-3"
                            >
                                <RefreshCw size={16} /> Recommencer
                            </button>
                            <button
                                onClick={() => {
                                    console.log('🔘 Bouton PDF cliqué!', { isLoading, slidesCount: slides.length });

                                    downloadPDF();
                                }}
                                disabled={isLoading}
                                className="flex-1 md:flex-none px-10 py-5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-500/20 transition-all active:scale-95 italic flex items-center justify-center gap-3"
                            >
                                {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Download size={16} />}
                                Télécharger le PDF
                            </button>
                        </div>
                    </div>

                    <div ref={slidesRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                        {slides.map((slide, idx) => (
                            <div key={idx} className="carousel-slide group aspect-square bg-white rounded-[40px] border border-slate-100 shadow-2xl overflow-hidden flex flex-col p-12 transition-all hover:border-indigo-500 hover:-translate-y-2 relative">
                                <div className="absolute top-8 right-8 w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-[18px] font-black italic text-slate-300 group-hover:bg-indigo-500 group-hover:text-white group-hover:border-indigo-400 transition-all">
                                    {idx + 1}
                                </div>

                                <div className="flex-1 flex flex-col justify-center gap-8">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 text-indigo-500">
                                            <Layers size={18} />
                                            <span className="text-[10px] font-black uppercase tracking-[0.3em] italic">Slide {idx + 1}</span>
                                        </div>
                                        <h4 className="text-2xl font-black uppercase italic text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">
                                            {slide.title}
                                        </h4>
                                    </div>

                                    <p className="text-slate-500 font-bold text-sm leading-relaxed uppercase tracking-wider italic">
                                        {slide.content}
                                    </p>
                                </div>

                                <div className="mt-8 pt-8 border-t border-slate-50 space-y-3">
                                    <div className="flex items-center gap-3 text-slate-400">
                                        <Palette size={14} />
                                        <span className="text-[9px] font-black uppercase tracking-widest italic">Suggestion Visuelle</span>
                                    </div>
                                    <p className="text-[10px] font-black text-slate-500/60 leading-relaxed italic">
                                        {slide.visual}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* LINKEDIN POST GENERATOR */}
                    <div className="bg-slate-900 rounded-[48px] p-10 border border-slate-800 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-20 bg-indigo-500 rounded-full blur-[100px] opacity-20"></div>

                        <div className="relative z-10 flex flex-col gap-8">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-4 bg-indigo-500 rounded-2xl text-white shadow-lg shadow-indigo-500/30">
                                        <TypeIcon size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black uppercase italic text-white tracking-tight">Rédacteur LinkedIn AI</h3>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Générez 3 variantes de posts optimisées</p>
                                    </div>
                                </div>
                                {postOptions.length === 0 && (
                                    <button
                                        onClick={handleGeneratePosts}
                                        disabled={isLoading}
                                        className="px-8 py-4 bg-white text-slate-900 rounded-[20px] font-black uppercase tracking-widest text-[11px] hover:bg-indigo-500 hover:text-white transition-all shadow-xl active:scale-95 italic flex items-center gap-3 disabled:opacity-50"
                                    >
                                        {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />}
                                        Générer les Textes
                                    </button>
                                )}
                            </div>

                            {postOptions.length > 0 && (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
                                    {postOptions.map((option, idx) => (
                                        <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded-[32px] p-6 flex flex-col gap-4 group/card hover:bg-slate-800 transition-colors">
                                            <div className="flex items-center justify-between">
                                                <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${idx === 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                                    idx === 1 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                    }`}>
                                                    {option.tone}
                                                </span>
                                                <button
                                                    onClick={() => handleCopyPost(option.content, idx)}
                                                    className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors relative"
                                                    title="Copier le texte"
                                                >
                                                    {copiedPost === idx ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                                                </button>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Accroche</p>
                                                <p className="text-sm font-bold text-white italic leading-tight">"{option.hook}"</p>
                                            </div>

                                            <div className="flex-1 bg-slate-900/50 rounded-2xl p-4 border border-slate-700/50">
                                                <p className="text-[11px] text-slate-300 whitespace-pre-line leading-relaxed font-medium">
                                                    {option.content}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {postOptions.length > 0 && (
                                <div className="mt-8 pt-8 border-t border-slate-800 flex flex-col lg:flex-row gap-6 items-end">
                                    <div className="flex-1 w-full space-y-3">
                                        <div className="flex items-center gap-2 text-indigo-400">
                                            <Sparkles size={14} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Pas satisfait ? Régénérez sur mesure</span>
                                        </div>
                                        <input
                                            type="text"
                                            value={customInstruction}
                                            onChange={(e) => setCustomInstruction(e.target.value)}
                                            placeholder="Ex: Fais-le plus court, tutoie le lecteur, ajoute des emojis..."
                                            className="w-full p-4 bg-slate-950/50 border border-slate-700 rounded-2xl text-white placeholder:text-slate-600 outline-none focus:border-indigo-500 transition-all font-medium text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={handleGeneratePosts}
                                        disabled={!customInstruction || isLoading}
                                        className="h-[52px] px-8 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 shrink-0"
                                    >
                                        {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                                        Régénérer
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/10 p-10 rounded-[48px] flex flex-col items-center text-center gap-6">
                        <div className="w-16 h-16 rounded-[24px] bg-amber-500 flex items-center justify-center text-white shadow-xl shadow-amber-500/20 scale-110">
                            <Sparkles size={28} />
                        </div>
                        <div className="max-w-2xl">
                            <h4 className="text-xl font-black uppercase italic text-amber-900 leading-tight mb-3">CONSEILS D'OPTIMISATION</h4>
                            <p className="text-sm font-bold text-amber-800/60 leading-relaxed uppercase tracking-widest italic">
                                Postez ce carrousel le mardi ou le jeudi entre 8h et 10h pour un maximum d'engagement.
                                N'oubliez pas d'ajouter une question pertinente dans votre premier commentaire pour booster l'algorithme !
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CarouselManager;
