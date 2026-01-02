import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

/**
 * --- GEMINI SERVICE ---
 * Ultra-robust version with Phase 1 (Modern/v1beta) and Phase 2 (Legacy/v1) fallback.
 * Optimized for Vision/OCR stability.
 */

const MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash-exp'
];

export const getGeminiClient = () => {
  const k = import.meta.env.VITE_GEMINI_API_KEY || "";
  const clean = k.trim().replace(/^["']|["']$/g, '');
  const masked = clean.length > 10 ? `${clean.substring(0, 6)}...${clean.slice(-4)}` : "CLÉ_ABSENTE";
  return { genAI: new GoogleGenerativeAI(clean || "AIzaSyAk2qBmeaW8TWsJU9nUWeGGlSpTkPfGUV8"), masked };
};

async function runAI(p: string | any[], s: any, j: boolean = true) {
  const { genAI, masked } = getGeminiClient();
  const errors: string[] = [];

  for (const m of MODELS) {
    // Phase 1 : Modern (v1beta)
    try {
      console.log(`[AI] ${m} - Démarrage Phase 1 (Modern/v1beta)`);
      const model = genAI.getGenerativeModel({
        model: m,
        generationConfig: j ? { responseMimeType: "application/json", responseSchema: s } : {}
      }, { apiVersion: 'v1beta' });

      const r = await model.generateContent(p);
      const res = await r.response;
      console.log(`[AI] ${m} - Succès Phase 1`);
      return j ? JSON.parse(res.text()) : res.text();
    } catch (e: any) {
      const msg = e.message || JSON.stringify(e);
      console.warn(`[AI] ${m} - Phase 1 échouée:`, msg);
      errors.push(`${m}(beta): ${msg.substring(0, 100)}`);
      if (msg.includes("403")) throw new Error(`[403] Clé [${masked}] rejetée. Vérifiez votre projet.`);
    }

    // Phase 2 : Legacy (v1)
    try {
      console.log(`[AI] ${m} - Démarrage Phase 2 (Legacy/v1)`);
      const model = genAI.getGenerativeModel({ model: m }, { apiVersion: 'v1' });

      let fp: any = p;
      if (j) {
        const instruct = `\n\nRETOURNE UNIQUEMENT DU JSON (PAS DE TEXTE AUTOUR): ${JSON.stringify(s)}`;
        if (typeof p === 'string') fp = p + instruct;
        else if (Array.isArray(p)) fp = p.map(part => part.text ? { ...part, text: part.text + instruct } : part);
      }

      const r = await model.generateContent(fp);
      const res = await r.response;
      const text = res.text();
      console.log(`[AI] ${m} - Succès Phase 2`);

      if (j) {
        const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        return JSON.parse(match ? match[0] : text);
      }
      return text;
    } catch (e: any) {
      console.warn(`[AI] ${m} - Phase 2 échouée:`, e.message);
      errors.push(`${m}(v1): ${e.message?.substring(0, 100)}`);
    }
  }

  throw new Error(`ÉCHEC IA (Clé: ${masked}). Dernier message: ${errors[0]}`);
}

export const getCarouselIdeas = async (act: string, lang: string = 'fr') => {
  return await runAI(`LinkedIn topics for: ${act} (lang: ${lang})`, { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } });
};

export const generateCarouselScript = async (topic: string, lang: string = 'fr') => {
  return await runAI(`Script 6 slides for "${topic}" in ${lang}.`, {
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: { title: { type: SchemaType.STRING }, content: { type: SchemaType.STRING }, visual: { type: SchemaType.STRING } }
    }
  });
};

export const scoreLead = async (c: any) => {
  try {
    const d = await runAI(`Score 0-100: ${JSON.stringify(c)}`, {
      type: SchemaType.OBJECT,
      properties: { score: { type: SchemaType.NUMBER }, reason: { type: SchemaType.STRING } }
    });
    return { score: d.score || 50, reason: d.reason || "Ok", summary: "Fait" };
  } catch {
    return { score: 50, reason: "Erreur", summary: "N/A" };
  }
};

export const enrichContactFromText = async (t: string) => {
  const d = await runAI(`Enrich: ${t}`, {
    type: SchemaType.OBJECT,
    properties: { firstName: { type: SchemaType.STRING }, lastName: { type: SchemaType.STRING }, company: { type: SchemaType.STRING } }
  });
  return { data: d, sources: [] };
};

export const generateCampaignContent = async (n: string, c: string, t: string) => await runAI(`Email to ${n} at ${c} for ${t}`, {}, false);

export const extractContactFromImage = async (base64Image: string) => {
  const data = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

  // Use a specialized prompt for high-precision OCR
  const parts = [
    { inlineData: { data, mimeType: "image/jpeg" } },
    {
      text: `INSTRUCTION: Analyse cette carte de visite avec une précision extrême. 
1. Transcris TOUT le texte visible, y compris le texte écrit VERTICALEMENT sur les bords et le texte en TOUT PETIT.
2. Identifie l'email (format x@y.z) et le téléphone même s'ils sont tournés à 90 degrés.
3. Retourne UNIQUEMENT un objet JSON avec ces clés: firstName, lastName, title, company, email, phone, website, linkedinUrl.` }
  ];

  // We temporarily use gemini-1.5-pro for vision as it's MUCH better at OCR for vertical text
  const originalModels = [...MODELS];
  try {
    // Temporarily swap Pro to front for vision accuracy
    MODELS.sort((a, b) => a.includes('pro') ? -1 : 1);
    return await runAI(parts, {
      type: SchemaType.OBJECT,
      properties: {
        firstName: { type: SchemaType.STRING },
        lastName: { type: SchemaType.STRING },
        company: { type: SchemaType.STRING },
        title: { type: SchemaType.STRING },
        email: { type: SchemaType.STRING },
        phone: { type: SchemaType.STRING },
        website: { type: SchemaType.STRING },
        linkedinUrl: { type: SchemaType.STRING },
      }
    });
  } finally {
    // Restore original order
    MODELS.splice(0, MODELS.length, ...originalModels);
  }
};

export const generateLinkedInPostOptions = async (t: string, s: any[], c: string = "", l: string = 'fr') => {
  return await runAI(`Posts for ${t}. Slides: ${JSON.stringify(s)}. Instruction: ${c}`, {
    type: SchemaType.ARRAY,
    items: { type: SchemaType.OBJECT, properties: { tone: { type: SchemaType.STRING }, content: { type: SchemaType.STRING } } }
  });
};

export const editProspectProfileImage = async () => null;

export function decodeBase64(b: string): Uint8Array {
  const s = atob(b);
  const bt = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bt[i] = s.charCodeAt(i);
  return bt;
}

export function encodeToBase64(bt: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bt.byteLength; i++) s += String.fromCharCode(bt[i]);
  return btoa(s);
}

export async function decodeAudioData(d: Uint8Array, ctx: AudioContext, sr: number, ch: number): Promise<AudioBuffer> {
  const d16 = new Int16Array(d.buffer);
  const fc = d16.length / ch;
  const buffer = ctx.createBuffer(ch, fc, sr);
  for (let c = 0; c < ch; c++) {
    const cd = buffer.getChannelData(c);
    for (let i = 0; i < fc; i++) cd[i] = d16[i * ch + c] / 32768.0;
  }
  return buffer;
}
