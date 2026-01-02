import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

/**
 * --- GEMINI SERVICE ---
 * Ultimate diagnostic version. No truncation. Full error visibility.
 */

const DEFAULT_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];

export const getGeminiClient = () => {
  const k = import.meta.env.VITE_GEMINI_API_KEY || "";
  const clean = k.trim().replace(/^["']|["']$/g, '');
  const masked = clean.length > 10 ? `${clean.substring(0, 6)}...${clean.slice(-4)}` : "CLÉ_INCORMETTE";
  return { genAI: new GoogleGenerativeAI(clean || "AIzaSyAk2qBmeaW8TWsJU9nUWeGGlSpTkPfGUV8"), masked };
};

async function runAI(payload: string | any[], schema: any, isJson: boolean = true, customModels?: string[]) {
  const { genAI, masked } = getGeminiClient();
  const modelsToTry = customModels || DEFAULT_MODELS;
  const errors: string[] = [];

  for (const m of modelsToTry) {
    // MODERN
    try {
      console.log(`[AI] ${m} v1beta init`);
      const model = genAI.getGenerativeModel({
        model: m,
        generationConfig: isJson ? { responseMimeType: "application/json", responseSchema: schema } : {}
      }, { apiVersion: 'v1beta' });

      const result = await Promise.race([
        model.generateContent(payload),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout 25s")), 25000))
      ]) as any;

      const res = await result.response;
      return isJson ? JSON.parse(res.text()) : res.text();
    } catch (e: any) {
      const msg = e.message || "Unknown error";
      errors.push(`${m}(v1beta): ${msg}`);
      if (msg.includes("403") || msg.includes("401")) throw new Error(`[AUTH] La clé ${masked} est bloquée (403).`);
    }

    // LEGACY
    try {
      console.log(`[AI] ${m} v1 init`);
      const model = genAI.getGenerativeModel({ model: m }, { apiVersion: 'v1' });
      let finalPayload: any = payload;
      if (isJson) {
        const instruct = `\n\nJSON strictly: ${JSON.stringify(schema)}`;
        if (typeof payload === 'string') finalPayload = payload + instruct;
        else if (Array.isArray(payload)) finalPayload = payload.map(p => p.text ? { ...p, text: p.text + instruct } : p);
      }

      const result = await Promise.race([
        model.generateContent(finalPayload),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout 25s")), 25000))
      ]) as any;

      const res = await result.response;
      const text = res.text();
      if (isJson) {
        const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        return JSON.parse(match ? match[0] : text);
      }
      return text;
    } catch (e: any) {
      errors.push(`${m}(v1): ${e.message}`);
    }
  }

  // Concatenate all errors for full vision
  throw new Error(`ERREUR IA [${masked}]: ${errors.join(' | ')}`);
}

export const getCarouselIdeas = async (act: string, lang: string = 'fr') => {
  return runAI(`LinkedIn topics for: ${act} (lang: ${lang})`, { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } });
};

export const generateCarouselScript = async (topic: string, lang: string = 'fr') => {
  return runAI(`Script 6 slides for "${topic}" in ${lang}.`, {
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
    return { score: 50, reason: "N/A", summary: "Erreur" };
  }
};

// Google Search Tool Definition with simple casting to avoid strict type issues
const tools: any = [
  { googleSearch: {} }
];

export const enrichContactFromText = async (t: string) => {
  const isEmail = t.includes('@');

  // Pre-calculate likely search terms to guide the AI
  let searchHint = t;
  if (isEmail) {
    const parts = t.split('@');
    const domain = parts[1];
    const local = parts[0];
    const namePart = local.split(/[._-]/)[0]; // "eric"
    // Clean domain to get company name for better search results
    const rawCompany = domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    // Search for "Eric" + "Digital Equity" (Human Name) instead of domain string
    searchHint = `${namePart} "${rawCompany}" linkedin job title`;
  }

  const prompt = `
  AGENT MISSION: enrich this B2B contact: "${t}".
  
  SEARCH PROTOCOL:
  1. QUERY 1: "${searchHint}". Look for LinkedIn/CorporationWiki/RocketReach results.
  2. IF QUERY 1 FAILS: Search for "${searchHint.replace('linkedin job title', '')}".
  3. ANALYSIS:
     - Found "Eric Fuchs" at "Digital Equity"? -> SUCCESS. Output "Eric", "Fuchs", "CEO".
     - Found "Eric" but no last name? -> FAIL. Try to find the specific person.
  
  DATA QUALITY RULES:
  - Last Name is CRITICAL. Try your best to find it.
  - Job Title is CRITICAL.
  - Company: "${searchHint.split('"')[1]}" (Trust this entity).
  
  OUTPUT (Strict JSON):
  {
    "firstName": "String",
    "lastName": "String (If not found, leave empty string)",
    "company": "String",
    "title": "String",
    "email": "${isEmail ? t : 'String'}",
    "phone": "String",
    "website": "String"
  }
  `;

  // Use gemini-2.0-flash-exp for superior agentic capabilities (multi-step reasoning)
  const searchModelName = 'gemini-2.0-flash-exp';

  try {
    const { genAI, masked } = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: searchModelName,
      tools: tools,
      // No JSON enforcement to allow search tool usage
    }, { apiVersion: 'v1beta' });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const d = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);

    // Soft Fallback: Only fill IF EMPTY (User requested no hard overrides)
    if (isEmail) {
      if (!d.email) d.email = t.trim();

      // Only help if AI totally failed to find a company
      if ((!d.company || d.company === "Non détecté") && d.email) {
        const domain = d.email.split('@')[1];
        if (domain) {
          d.website = domain;
          const rawName = domain.split('.')[0];
          d.company = rawName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
      }

      // Fallback Name if Search failed
      if (!d.firstName && d.email) {
        const parts = d.email.split('@')[0].split(/[._-]/);
        if (parts.length > 0) d.firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        if (parts.length > 1) d.lastName = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      }
    }
    return { data: d, sources: [] }; // Sources could be extracted from groundingMetadata if needed
  } catch (e) {
    console.warn("Search Grounding failed, reverting to basic logic", e);
    // Revert to basic runAI if search fails
    return fallbackEnrich(t);
  }
};

// Internal copy of the basic logic for fallback
const fallbackEnrich = async (t: string) => {
  // ... logic from previous standard implementation ...
  // For simplicity calling the standard runAI without tools
  const d = await runAI(`Extract details (no search) from: ${t}`, {
    type: SchemaType.OBJECT,
    properties: { firstName: { type: SchemaType.STRING }, lastName: { type: SchemaType.STRING }, company: { type: SchemaType.STRING }, title: { type: SchemaType.STRING }, email: { type: SchemaType.STRING }, phone: { type: SchemaType.STRING }, website: { type: SchemaType.STRING } }
  });
  // ... apply same fallbacks ...
  const isEmail = t.includes('@');
  if (isEmail) {
    if (!d.email) d.email = t.trim();
    if ((!d.company || d.company === "Non détecté") && d.email) {
      const domain = d.email.split('@')[1];
      if (domain) {
        d.website = domain;
        const rawName = domain.split('.')[0];
        d.company = rawName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }
    }
    if (!d.firstName && d.email) {
      const parts = d.email.split('@')[0].split(/[._-]/);
      if (parts.length > 0) d.firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      if (parts.length > 1) d.lastName = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
  }
  return { data: d, sources: [] };
};

export const generateCampaignContent = async (n: string, c: string, t: string) => runAI(`Email to ${n} at ${c} about ${t}`, {}, false);

export const extractContactFromImage = async (base64Image: string) => {
  const data = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
  const parts = [
    { inlineData: { data, mimeType: "image/jpeg" } },
    {
      text: `ANALYSE CARTE VISITE:
        1. Lis TOUT (horizontal, vertical, bords).
        2. Extrais l'email et le téléphone.
        3. Retourne ce JSON: firstName, lastName, title, company, email, phone, website, linkedinUrl.` }
  ];

  return runAI(parts, {
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
  }, true, ['gemini-1.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro']);
};

export const generateLinkedInPostOptions = async (t: string, s: any[], c: string = "", l: string = 'fr') => {
  return runAI(`LinkedIn posts for: ${t}. Slides: ${JSON.stringify(s)}. ${c}`, {
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: { tone: { type: SchemaType.STRING }, content: { type: SchemaType.STRING } }
    }
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
  const b = ctx.createBuffer(ch, fc, sr);
  for (let c = 0; c < ch; c++) {
    const cd = b.getChannelData(c);
    for (let i = 0; i < fc; i++) cd[i] = d16[i * ch + c] / 32768.0;
  }
  return b;
}
