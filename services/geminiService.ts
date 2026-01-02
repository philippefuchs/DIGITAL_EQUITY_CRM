import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

/**
 * --- GEMINI SERVICE ---
 * FIXED: Prioritizing v1beta for JSON Schema support.
 */

const API_VERSIONS = ['v1beta', 'v1'];
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
  const cleanKey = (apiKey || "").trim().replace(/^["']|["']$/g, '');

  if (!cleanKey || cleanKey === defaultKey) {
    console.warn("[GEMINI] Using demo key.");
    return new GoogleGenerativeAI(cleanKey || defaultKey);
  }

  return new GoogleGenerativeAI(cleanKey);
};

async function callAI(op: (model: string, ver: string) => Promise<any>) {
  const errors: string[] = [];
  for (const model of MODEL_LIST) {
    for (const ver of API_VERSIONS) {
      try {
        console.log(`[GEMINI] Trying ${model} on ${ver}...`);
        return await op(model, ver);
      } catch (err: any) {
        const msg = err.message || "Error";
        // If 400 about responseMimeType, we know it's a version mismatch, don't scream too loud
        console.warn(`[GEMINI] ${model} on ${ver} failed:`, msg);
        errors.push(`${model}(${ver}): ${msg}`);

        // If it's 403, our key is definitively rejected for this project
        if (msg.includes("403") || msg.includes("401")) throw err;
      }
    }
  }
  throw new Error(`Erreur Gemini : ${errors.join(" | ")}`);
}

export const extractContactFromImage = async (base64Image: string) => {
  return callAI(async (modelName, apiVer) => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
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

    const data = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    const result = await model.generateContent([
      { inlineData: { data, mimeType: "image/jpeg" } },
      { text: "Extract contact info as JSON." }
    ]);
    return JSON.parse((await result.response).text());
  });
};

export const enrichContactFromText = async (text: string) => {
  return callAI(async (modelName, apiVer) => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: "Expert OSINT.",
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
    const result = await model.generateContent(`Enrich: ${text}`);
    return { data: JSON.parse((await result.response).text()), sources: [] };
  });
};

export const generateCampaignContent = async (prospectName: string, company: string, topic: string) => {
  return callAI(async (modelName, apiVer) => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: apiVer as any });
    const result = await model.generateContent(`Write email to ${prospectName} at ${company} about ${topic}.`);
    return (await result.response).text();
  });
};

export const editProspectProfileImage = async (base64Image: string, prompt: string) => {
  return null;
};

export const scoreLead = async (contact: any) => {
  try {
    return await callAI(async (modelName, apiVer) => {
      const genAI = getGeminiClient();
      const model = genAI.getGenerativeModel({
        model: modelName,
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
      const result = await model.generateContent(`Score Lead: ${JSON.stringify(contact)}`);
      const data = JSON.parse((await result.response).text());
      return {
        score: Math.round(data.score || 50),
        reason: data.reason || "Ok",
        summary: data.summary || "Done"
      };
    });
  } catch (e) {
    return { score: 50, reason: "Error", summary: "N/A" };
  }
};

const LANGUAGE_MAP: any = { 'fr': 'Français', 'en': 'English', 'es': 'Español', 'he': 'Hebrew' };

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
    const result = await model.generateContent(`5 items for ${userActivity} in ${LANGUAGE_MAP[language]}. JSON array.`);
    return JSON.parse((await result.response).text());
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
    const result = await model.generateContent(`6-slide script for ${topic} in ${LANGUAGE_MAP[language]}. JSON array of {title, content, visual}.`);
    return JSON.parse((await result.response).text());
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
    const result = await model.generateContent(`3 posts for ${topic} in ${LANGUAGE_MAP[language]}. ${customInstruction}. JSON array of {tone, hook, content}.`);
    return JSON.parse((await result.response).text());
  });
};

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
