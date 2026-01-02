import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

/**
 * --- GEMINI SERVICE (ULTRA-ROBUST) ---
 * This version handles regional restrictions by falling back to plain text 
 * if JSON Mode/Schema is unsupported (400/404 errors).
 */

const MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'];

export const getGeminiClient = () => {
  const rawKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  // Sanitize and provide a fallback demo key if absolutely empty
  const cleanKey = rawKey.trim().replace(/^["']|["']$/g, '') || "AIzaSyAk2qBmeaW8TWsJU9nUWeGGlSpTkPfGUV8";

  // Diagnostic logging for production (masked)
  const masked = cleanKey.length > 10 ? `${cleanKey.substring(0, 6)}...${cleanKey.slice(-4)}` : "INVALID_KEY";
  console.log(`[AI SERVICE] Initialized with key: ${masked}`);

  return {
    client: new GoogleGenerativeAI(cleanKey),
    maskedKey: masked
  };
};

/**
 * AI CALLER WITH LEGACY FALLBACK
 */
async function callAI(
  prompt: string,
  schema: any,
  options: { isJson?: boolean, system?: string } = {}
) {
  const { client, maskedKey } = getGeminiClient();
  const isJson = options.isJson !== false;
  const errors: string[] = [];

  for (const modelName of MODELS) {
    // --- PHASE 1: MODERN (v1beta + Schema) ---
    try {
      console.log(`[AI] PHASE 1: ${modelName} (Modern/v1beta)`);
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: options.system,
        generationConfig: isJson ? {
          responseMimeType: "application/json",
          responseSchema: schema
        } : {}
      }, { apiVersion: 'v1beta' });

      const result = await model.generateContent(prompt);
      const text = (await result.response).text();
      return isJson ? JSON.parse(text) : text;
    } catch (err: any) {
      const msg = err.message || "Unknown error";
      console.warn(`[AI] Modern mode failed for ${modelName}:`, msg);
      errors.push(`${modelName}(beta): ${msg.substring(0, 80)}`);

      // If it's a definitive Auth error, don't retry models
      if (msg.includes("403") || msg.includes("401") || msg.includes("API_KEY_INVALID")) {
        throw new Error(`[AUTH ERROR] La clé API [${maskedKey}] est rejetée par Google (403/401). Vérifiez vos restrictions Google Cloud.`);
      }
    }

    // --- PHASE 2: LEGACY (v1 + Text + Regex Parse) ---
    try {
      console.log(`[AI] PHASE 2: ${modelName} (Legacy/v1)`);
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: options.system
      }, { apiVersion: 'v1' });

      const legacyPrompt = isJson
        ? `${prompt}\n\nIMPORTANT: Réponds uniquement avec un objet JSON valide suivant exactement cette structure: ${JSON.stringify(schema)}`
        : prompt;

      const result = await model.generateContent(legacyPrompt);
      const text = (await result.response).text();

      if (isJson) {
        // Find potential JSON block in case of conversational noise
        const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        return JSON.parse(match ? match[0] : text);
      }
      return text;
    } catch (err: any) {
      console.warn(`[AI] Legacy mode failed for ${modelName}`);
      errors.push(`${modelName}(v1): ${err.message?.substring(0, 80)}`);
    }
  }

  throw new Error(`ÉCHEC IA GLOBAL (${maskedKey}). Détails: ${errors.join(" | ")}`);
}

// --- FEATURES ---

export const getCarouselIdeas = async (userActivity: string, language: string = 'fr') => {
  return await callAI(`Donne 5 idées de sujets LinkedIn pour: "${userActivity}". Langue: ${language}.`, {
    type: SchemaType.ARRAY,
    items: { type: SchemaType.STRING }
  });
};

export const generateCarouselScript = async (topic: string, language: string = 'fr') => {
  return await callAI(`Écris un script de carousel LinkedIn (6 slides) sur: "${topic}". Langue: ${language}. Hook, Problème, Solution, Preuve, CTA.`, {
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING },
        content: { type: SchemaType.STRING },
        visual: { type: SchemaType.STRING }
      },
      required: ["title", "content", "visual"]
    }
  });
};

export const generateLinkedInPostOptions = async (topic: string, slides: any[], customInstruction: string = "", language: string = 'fr') => {
  return await callAI(`À partir de ces slides: ${JSON.stringify(slides)}, écris 3 posts LinkedIn sur le thème "${topic}". Consigne: ${customInstruction}. Langue: ${language}.`, {
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: {
        tone: { type: SchemaType.STRING },
        hook: { type: SchemaType.STRING },
        content: { type: SchemaType.STRING }
      },
      required: ["tone", "hook", "content"]
    }
  });
};

export const scoreLead = async (contact: any) => {
  try {
    const d = await callAI(`Analyse ce prospect B2B 0-100: ${JSON.stringify(contact)}`, {
      type: SchemaType.OBJECT,
      properties: {
        score: { type: SchemaType.NUMBER },
        reason: { type: SchemaType.STRING }
      }
    });
    return { score: d.score || 50, reason: d.reason || "Ok", summary: "Analyse terminée." };
  } catch (e) {
    return { score: 50, reason: "N/A", summary: "Service indisponible." };
  }
};

export const enrichContactFromText = async (text: string) => {
  const d = await callAI(`Extrais les infos prospect de ce texte: "${text}"`, {
    type: SchemaType.OBJECT,
    properties: {
      firstName: { type: SchemaType.STRING },
      lastName: { type: SchemaType.STRING },
      company: { type: SchemaType.STRING },
      email: { type: SchemaType.STRING }
    },
    required: ["firstName", "lastName", "company"]
  });
  return { data: d, sources: [] };
};

export const generateCampaignContent = async (name: string, company: string, topic: string) => {
  return await callAI(`Écris un email de prospection à ${name} (${company}) sur le sujet: ${topic}.`, {}, { isJson: false });
};

export const extractContactFromImage = async () => ({
  firstName: "Extraction",
  lastName: "Non Dispo",
  company: "Veuillez remplir manuellement"
});

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
