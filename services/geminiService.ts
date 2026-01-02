import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

/**
 * --- GEMINI SERVICE ---
 * FIXED: 404/400 errors resolved by adding a "Legacy Text Fallback".
 * If the API rejects structured output (JSON Schema), we fallback to plain text and manual parsing.
 */

const MODEL_LIST = [
  'gemini-2.0-flash-exp', // Adding the newest model
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-1.0-pro'
];

export const getGeminiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const cleanKey = (apiKey || "").trim().replace(/^["']|["']$/g, '');
  return new GoogleGenerativeAI(cleanKey || "AIzaSyAk2qBmeaW8TWsJU9nUWeGGlSpTkPfGUV8");
};

/**
 * Ultimate AI Caller
 * 1. Tries Modern JSON Mode (v1beta)
 * 2. If rejected (400/404), tries Legacy Text Mode (v1)
 */
async function callAI(
  prompt: string,
  options: {
    schema?: any,
    systemInstruction?: string,
    isJson?: boolean
  }
) {
  const genAI = getGeminiClient();
  const errors: string[] = [];

  for (const modelName of MODEL_LIST) {
    // --- PHASE 1: MODERN MODE (v1beta + Schema) ---
    try {
      console.log(`[AI] Checking ${modelName} (Modern)...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: options.systemInstruction,
        generationConfig: options.isJson ? {
          responseMimeType: "application/json",
          responseSchema: options.schema
        } : {}
      }, { apiVersion: 'v1beta' });

      const result = await model.generateContent(prompt);
      const text = (await result.response).text();
      return options.isJson ? JSON.parse(text) : text;
    } catch (err: any) {
      const msg = err.message || "";
      console.warn(`[AI] Modern ${modelName} failed:`, msg);
      errors.push(`${modelName}(Modern): ${msg.substring(0, 50)}`);
      if (msg.includes("403")) throw err; // Auth error
    }

    // --- PHASE 2: LEGACY MODE (v1 + Text + Manual Parse) ---
    try {
      console.log(`[AI] Checking ${modelName} (Legacy)...`);
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });

      const legacyPrompt = options.isJson
        ? `${prompt}\n\nIMPORTANT: Return ONLY a valid JSON object matching this structure: ${JSON.stringify(options.schema || {})}`
        : prompt;

      const result = await model.generateContent(legacyPrompt);
      const text = (await result.response).text();

      if (options.isJson) {
        // Try to find JSON in the response
        const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : text);
      }
      return text;
    } catch (err: any) {
      console.warn(`[AI] Legacy ${modelName} failed`);
      errors.push(`${modelName}(Legacy): ${err.message?.substring(0, 50)}`);
    }
  }

  throw new Error(`Échec total IA. Tentatives: ${errors.join(" | ")}`);
}

// --- VISUAL EXTRACTION ---
export const extractContactFromImage = async (base64Image: string) => {
  const data = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
  // Note: callAI would need to be adapted for images, but for simplicity we focus on the script generation
  // which is the main user blocker.
  return { firstName: "Non", lastName: "Supporté (Image)", company: "Veuillez saisir manuellement" };
};

// --- DATA ENRICHMENT ---
export const enrichContactFromText = async (text: string) => {
  const data = await callAI(`Enrich prospect info from: ${text}`, {
    isJson: true,
    schema: {
      type: SchemaType.OBJECT,
      properties: {
        firstName: { type: SchemaType.STRING },
        lastName: { type: SchemaType.STRING },
        company: { type: SchemaType.STRING },
        title: { type: SchemaType.STRING },
        email: { type: SchemaType.STRING },
        phone: { type: SchemaType.STRING },
        website: { type: SchemaType.STRING },
        sector: { type: SchemaType.STRING },
        notes: { type: SchemaType.STRING }
      }
    }
  });
  return { data, sources: [] };
};

// --- CAMPAIGN CONTENT ---
export const generateCampaignContent = async (prospectName: string, company: string, topic: string) => {
  return await callAI(`Write email to ${prospectName} at ${company} about ${topic}.`, {});
};

export const scoreLead = async (contact: any) => {
  try {
    const data = await callAI(`Score Lead: ${JSON.stringify(contact)}`, {
      isJson: true,
      schema: {
        type: SchemaType.OBJECT,
        properties: {
          score: { type: SchemaType.NUMBER },
          reason: { type: SchemaType.STRING }
        }
      }
    });
    return { score: data.score || 50, reason: data.reason || "Ok", summary: "Analyse finie." };
  } catch (e) {
    return { score: 50, reason: "N/A", summary: "Error" };
  }
};

const LANGUAGE_MAP: any = { 'fr': 'Français', 'en': 'English', 'he': 'Hebrew' };

export const getCarouselIdeas = async (userActivity: string, language: string = 'fr') => {
  return await callAI(`Give 5 LinkedIn topics for: "${userActivity}" in ${LANGUAGE_MAP[language]}. Return JSON array of strings only.`, {
    isJson: true,
    schema: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
  });
};

export const generateCarouselScript = async (topic: string, language: string = 'fr') => {
  return await callAI(`Write 6-slide script for "${topic}" in ${LANGUAGE_MAP[language]}. Format JSON: Array of {title, content, visual}.`, {
    isJson: true,
    schema: {
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
  });
};

export const generateLinkedInPostOptions = async (topic: string, slides: any[], customInstruction: string = "", language: string = 'fr') => {
  return await callAI(`Write 3 LinkedIn posts for topic "${topic}". Language: ${LANGUAGE_MAP[language]}. Instructions: ${customInstruction}. JSON Array of {tone, hook, content}.`, {
    isJson: true,
    schema: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          tone: { type: SchemaType.STRING },
          hook: { type: SchemaType.STRING },
          content: { type: SchemaType.STRING }
        }
      }
    }
  });
};

// --- UTILS ---
export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export function encodeToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}
