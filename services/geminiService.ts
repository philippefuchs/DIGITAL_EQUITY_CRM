import { GoogleGenerativeAI, SchemaType, Part } from "@google/generative-ai";

/**
 * --- GEMINI SERVICE CONFIGURATION ---
 * This service handles all AI interactions (Carousel, Scorer, Extractions).
 * It implements a robust fallback mechanism to handle the persistent 404/403 errors.
 */

const API_VERSIONS = ['v1', 'v1beta'];
const MODEL_LIST = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro',
  'gemini-1.0-pro',
  'gemini-pro'
];

export const getGeminiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const defaultKey = "AIzaSyAk2qBmeaW8TWsJU9nUWeGGlSpTkPfGUV8";

  // Clean key from accidental spaces or quotes
  const cleanKey = apiKey ? apiKey.trim().replace(/^["']|["']$/g, '') : "";

  // Logging for debug (masked)
  console.log("[DEBUG] Using Key ending in: " + (cleanKey ? cleanKey.slice(-4) : "NONE"));

  if (!cleanKey) {
    throw new Error("VITE_GEMINI_API_KEY non trouvée. Veuillez la configurer dans Vercel.");
  }

  if (cleanKey === defaultKey) {
    console.warn("Utilisation de la clé de démonstration (risqué).");
  }

  return new GoogleGenerativeAI(cleanKey);
};

// --- MULTI-LEVEL FALLBACK SYSTEM ---
type Operation = (modelName: string, apiVersion: string) => Promise<any>;

/**
 * Tries every combination of Model + API Version until one works.
 * 403 (Auth) errors are thrown immediately as they indicate a Key issue.
 * 404 errors are collected and tried against the next combination.
 */
async function callAI(op: Operation) {
  let errors: string[] = [];

  // Priority: Try GA models on v1 first, then v1beta
  for (const model of MODEL_LIST) {
    for (const ver of API_VERSIONS) {
      try {
        console.log(`[AI] Attempting ${model} on ${ver}...`);
        return await op(model, ver);
      } catch (err: any) {
        const msg = err.message || JSON.stringify(err);
        console.warn(`[AI] ${model}(${ver}) failed:`, msg);
        errors.push(`${model}(${ver}): ${msg.substring(0, 100)}...`);

        // If it's a definitive Auth error, don't keep trying, the key is bad.
        if (msg.includes("403") || msg.includes("401") || msg.includes("API_KEY_INVALID")) {
          throw new Error(`Erreur d'autorisation Google (403/401). Votre clé est active mais rejetée. \n\nDétails: ${msg}`);
        }
      }
    }
  }

  // Aggregated failure message
  throw new Error(`Tous les modèles ont échoué (${MODEL_LIST.length * API_VERSIONS.length} tentatives). \n\nPremière erreur : ${errors[0]} \n\n 👉 CONSEIL : Si vous avez changé la clé, avez-vous REDÉPLOYÉ sur Vercel ?`);
}

// --- VISUAL EXTRACTION ---
export const extractContactFromImage = async (base64Image: string) => {
  return callAI(async (modelName, apiVer) => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: apiVer as any });

    // Configuration specific to extraction
    const modelWithExtra = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
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
        }
      }
    }, { apiVersion: apiVer as any });

    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    const parts: Part[] = [
      { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } },
      { text: "Extract contact info from this business card as JSON." }
    ];

    const result = await modelWithExtra.generateContent(parts);
    const response = await result.response;
    return JSON.parse(response.text());
  });
};

// --- DATA ENRICHMENT ---
export const enrichContactFromText = async (text: string) => {
  return callAI(async (modelName, apiVer) => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: "Tu es un Expert OSINT. Trouve les contacts (Email/Tel) d'une personne.",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
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
            notes: { type: SchemaType.STRING },
            matchConfidence: { type: SchemaType.STRING }
          },
          required: ["firstName", "lastName", "company"]
        }
      }
    }, { apiVersion: apiVer as any });

    const result = await model.generateContent(`IDENTIFIER COORDONNÉES DIRECTES : "${text}"`);
    const response = await result.response;
    return { data: JSON.parse(response.text()), sources: [] };
  });
};

// --- CAMPAIGN CONTENT ---
export const generateCampaignContent = async (prospectName: string, company: string, topic: string) => {
  return callAI(async (modelName, apiVer) => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: apiVer as any });
    const result = await model.generateContent(`Write a professional outreach email to ${prospectName} at ${company} about ${topic}.`);
    return (await result.response).text();
  });
};

// --- LEAD SCORING ---
export const scoreLead = async (contact: any) => {
  try {
    return await callAI(async (modelName, apiVer) => {
      const genAI = getGeminiClient();
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: "Lead Scoring Expert. 0-100.",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              score: { type: SchemaType.NUMBER },
              reason: { type: SchemaType.STRING },
              summary: { type: SchemaType.STRING }
            }
          }
        }
      }, { apiVersion: apiVer as any });

      const result = await model.generateContent(`Analyze Lead: ${JSON.stringify(contact)}`);
      const data = JSON.parse((await result.response).text() || "{}");
      return {
        score: Math.round(data.score || 50),
        reason: data.reason || "Analyse complétée",
        summary: data.summary || "Profil analysé."
      };
    });
  } catch (e) {
    return { score: 50, reason: "Erreur IA", summary: "Service indisponible." };
  }
};

// --- CAROUSEL GEN ---
const LANGUAGE_MAP: Record<string, string> = {
  'fr': 'Français', 'en': 'English', 'es': 'Español', 'he': 'Hebrew'
};

export const getCarouselIdeas = async (userActivity: string, language: string = 'fr') => {
  return callAI(async (modelName, apiVer) => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
      }
    }, { apiVersion: apiVer as any });

    const result = await model.generateContent(`Give 5 LinkedIn topics for: "${userActivity}" in ${LANGUAGE_MAP[language]}. JSON Array of strings only.`);
    return JSON.parse((await result.response).text() || "[]");
  });
};

export const generateCarouselScript = async (topic: string, language: string = 'fr') => {
  return callAI(async (modelName, apiVer) => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
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
      }
    }, { apiVersion: apiVer as any });

    const result = await model.generateContent(`Write 6-slide script for "${topic}" in ${LANGUAGE_MAP[language]}. JSON Array of {title, content, visual}.`);
    return JSON.parse((await result.response).text() || "[]");
  });
};

export const generateLinkedInPostOptions = async (topic: string, slides: any[], customInstruction: string = "", language: string = 'fr') => {
  return callAI(async (modelName, apiVer) => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
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
      }
    }, { apiVersion: apiVer as any });

    const result = await model.generateContent(`Write 3 LinkedIn posts for topic "${topic}". Language: ${LANGUAGE_MAP[language]}. Instructions: ${customInstruction}. JSON Array of {tone, hook, content}.`);
    return JSON.parse((await result.response).text() || "[]");
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
