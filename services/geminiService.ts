import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

/**
 * --- GEMINI SERVICE ---
 * Ultra-robust version for regional compatibility.
 */

const MODEL_LIST = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-1.0-pro'
];

export const getGeminiClient = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY || "AIzaSyAk2qBmeaW8TWsJU9nUWeGGlSpTkPfGUV8";
  const clean = key.trim().replace(/^["']|["']$/g, '');
  return new GoogleGenerativeAI(clean);
};

/**
 * Robust AI Caller
 * 1. Tries Modern JSON Mode (v1beta)
 * 2. If 400/404, tries Legacy Text Mode (v1)
 */
async function callAI(prompt: string, schema: any, isJson: boolean = true) {
  const client = getGeminiClient();
  const errors: string[] = [];

  for (const mName of MODEL_LIST) {
    // --- 1. MODERN (v1beta) ---
    try {
      console.log(`[AI] ${mName} (beta)...`);
      const model = client.getGenerativeModel({
        model: mName,
        generationConfig: isJson ? { responseMimeType: "application/json", responseSchema: schema } : {}
      }, { apiVersion: 'v1beta' });

      const res = await model.generateContent(prompt);
      const text = (await res.response).text();
      return isJson ? JSON.parse(text) : text;
    } catch (e: any) {
      console.warn(`[AI] Beta ${mName} failed:`, e.message);
      errors.push(`${mName}(beta): ${e.message?.substring(0, 50)}`);
      if (e.message?.includes("403")) throw e;
    }

    // --- 2. LEGACY (v1) ---
    try {
      console.log(`[AI] ${mName} (legacy)...`);
      const model = client.getGenerativeModel({ model: mName }, { apiVersion: 'v1' });
      const finalPrompt = isJson ? `${prompt}\n\nReturn ONLY a JSON object: ${JSON.stringify(schema)}` : prompt;
      const res = await model.generateContent(finalPrompt);
      const text = (await res.response).text();

      if (isJson) {
        const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        return JSON.parse(match ? match[0] : text);
      }
      return text;
    } catch (e: any) {
      console.warn(`[AI] Legacy ${mName} failed`);
      errors.push(`${mName}(v1): ${e.message?.substring(0, 50)}`);
    }
  }
  throw new Error(`AI Global Failure. Details: ${errors.join(" | ")}`);
}

// --- FEATURES ---

export const getCarouselIdeas = async (userActivity: string, language: string = 'fr') => {
  return await callAI(
    `LinkedIn topics for: "${userActivity}". Language: ${language}.`,
    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
  );
};

export const generateCarouselScript = async (topic: string, language: string = 'fr') => {
  return await callAI(
    `LinkedIn carousel script (6 slides) for: "${topic}". Language: ${language}.`,
    {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          content: { type: SchemaType.STRING },
          visual: { type: SchemaType.STRING }
        }
      }
    }
  );
};

export const scoreLead = async (contact: any) => {
  try {
    const data = await callAI(
      `Score Lead: ${JSON.stringify(contact)}`,
      {
        type: SchemaType.OBJECT,
        properties: {
          score: { type: SchemaType.NUMBER },
          reason: { type: SchemaType.STRING }
        }
      }
    );
    return { score: data.score || 50, reason: data.reason || "Ok", summary: "Analyse finie." };
  } catch (e) {
    return { score: 50, reason: "N/A", summary: "Error" };
  }
};

export const enrichContactFromText = async (text: string) => {
  const data = await callAI(
    `Enrich: ${text}`,
    {
      type: SchemaType.OBJECT,
      properties: {
        firstName: { type: SchemaType.STRING },
        lastName: { type: SchemaType.STRING },
        company: { type: SchemaType.STRING },
        email: { type: SchemaType.STRING }
      },
      required: ["firstName", "lastName", "company"]
    }
  );
  return { data, sources: [] };
};

export const generateCampaignContent = async (name: string, company: string, topic: string) => {
  return await callAI(`Email to ${name} at ${company} about ${topic}.`, {}, false);
};

export const extractContactFromImage = async (base64: string) => {
  return { firstName: "Extraite", lastName: "Image", company: "A remplir" };
};

export const generateLinkedInPostOptions = async (topic: string, slides: any[], custom: string = "", lang: string = 'fr') => {
  return await callAI(
    `LinkedIn post for ${topic}. Slides: ${JSON.stringify(slides)}. Extra: ${custom}`,
    {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          tone: { type: SchemaType.STRING },
          content: { type: SchemaType.STRING }
        }
      }
    }
  );
};

export const editProspectProfileImage = async () => null;

// --- UTILS ---
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
