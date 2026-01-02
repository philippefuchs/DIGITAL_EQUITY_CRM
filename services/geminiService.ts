import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

/**
 * --- GEMINI SERVICE (DIAGNOSTIC) ---
 * Show full errors to identify the 404/403 cause.
 */

const MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash-exp'
];

export const getGeminiClient = () => {
  const k = import.meta.env.VITE_GEMINI_API_KEY || "";
  const clean = k.trim().replace(/^["']|["']$/g, '');
  // Show key preview in console for the user to verify
  const masked = clean.length > 10 ? `${clean.substring(0, 6)}...${clean.slice(-4)}` : "CLÉ_ABSENTE";
  return { genAI: new GoogleGenerativeAI(clean), masked };
};

async function runAI(p: string, s: any, j: boolean = true) {
  const { genAI, masked } = getGeminiClient();
  const errors: string[] = [];

  for (const m of MODELS) {
    // Attempt Modern
    try {
      const model = genAI.getGenerativeModel({
        model: m,
        generationConfig: j ? { responseMimeType: "application/json", responseSchema: s } : {}
      }, { apiVersion: 'v1beta' });
      const r = await model.generateContent(p);
      return j ? JSON.parse((await r.response).text()) : (await r.response).text();
    } catch (e: any) {
      const msg = e.message || JSON.stringify(e);
      errors.push(`${m}(beta): ${msg}`);
      if (msg.includes("403")) throw new Error(`[403] Clé [${masked}] rejetée. Vérifiez l'activation de l'API.`);
    }

    // Attempt Legacy
    try {
      const model = genAI.getGenerativeModel({ model: m }, { apiVersion: 'v1' });
      const prompt = j ? `${p}\n\nRETOURNE UNIQUEMENT DU JSON (PAS DE TEXTE AUTOUR): ${JSON.stringify(s)}` : p;
      const r = await model.generateContent(prompt);
      const text = (await r.response).text();
      if (j) {
        const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        return JSON.parse(match ? match[0] : text);
      }
      return text;
    } catch (e: any) {
      errors.push(`${m}(v1): ${e.message}`);
    }
  }

  // Return the FULL first error message for diagnostic
  throw new Error(`ÉCHEC IA (Clé: ${masked}). Erreur : ${errors[0]}`);
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

export const extractContactFromImage = async () => ({ firstName: "Non", lastName: "Dispo", company: "Remplir manuel" });

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
