```
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// Initialize the API client
export const getGeminiClient = () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const defaultKey = "AIzaSyAk2qBmeaW8TWsJU9nUWeDGlSpTkPfGUV8";
    
    // Sanitize API Key (remove spaces/quotes if accidental)
    const cleanKey = apiKey ? apiKey.trim().replace(/^["']|["']$/g, '') : "";

    console.log(`[DEBUG] Using API Key: ${ cleanKey.substring(0, 10) }...${ cleanKey.slice(-4) } `);

    if (!cleanKey || cleanKey === defaultKey) {
        console.error("CRITICAL: No valid VITE_GEMINI_API_KEY found.");
        throw new Error("Configuration manquante : Clé API invalide ou non trouvée sur Vercel.");
    }
    return new GoogleGenerativeAI(cleanKey);
};

// --- ROBUST FALLBACK MECHANISM ---
// List of models to try in order of preference (Fastest/Cheapest -> Most Capable -> Legacy Stable)
const MODEL_FALLBACK_LIST = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];

type ModelOperation = (model: any) => Promise<any>;

/**
 * Tries to execute a generative AI operation across a list of models.
 * If 404 (Model Not Found) or 403 (Permission) occurs, it retries with the next model.
 */
async function executeWithFallback(operation: ModelOperation) {
  const genAI = getGeminiClient();
  let lastError: any = null;

  for (const modelName of MODEL_FALLBACK_LIST) {
    try {
      console.log(`🤖 Attempting generation with model: ${ modelName } `);
      // Instantiate model
      // Note: We don't pass specific configs here, the operation function configures the model.
      // Actually, we need to let the operation create the model instance with the specific config it needs.

      // Re-architecture: We pass the modelName to the operation function.
      return await operation(modelName);
    } catch (err: any) {
      console.warn(`⚠️ Model ${ modelName } failed: `, err.message || err);
      lastError = err;

      // Only retry on specific errors that indicate model unavailability
      const msg = (err.message || "").toLowerCase();
      const isModelError = msg.includes("not found") || msg.includes("404") || msg.includes("supported") || msg.includes("400"); // 400 sometimes for bad request due to model capabilities

      if (!isModelError) {
        // If it's a content safety blocking or network error, proceeding to next model might not help, but safer to retry if unsure.
        // However, usually we want to retry mainly for "Model Not Found".
        // Let's continue anyway to be maximally robust.
      }
    }
  }

  console.error("❌ All models failed.");
  throw lastError;
}

// --- Extraction visuelle de carte de visite ---
export const extractContactFromImage = async (base64Image: string) => {
  return executeWithFallback(async (modelName) => {
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
    });

    // Remove header if present to get pure base64
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const parts = [
      { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } },
      {
        text: `Analyse cette carte de visite.Extrais les infos en JSON: Prénom, Nom, Poste, Société, Email, Téléphone, Site Web, LinkedIn.`
      }
    ];

    const result = await model.generateContent(parts);
    const response = await result.response;
    return JSON.parse(response.text());
  });
};

// --- Smart Data Enrichment ---
export const enrichContactFromText = async (text: string) => {
  return executeWithFallback(async (modelName) => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: `Tu es un Expert OSINT.Trouve les contacts(Email / Tel) d'une personne.`,
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
    });

const result = await model.generateContent(`IDENTIFIER COORDONNÉES DIRECTES : "${text}"`);
const response = await result.response;
const data = JSON.parse(response.text());
return { data, sources: [] };
  });
};

export const generateCampaignContent = async (prospectName: string, company: string, topic: string) => {
  return executeWithFallback(async (modelName) => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(`Write a professional personalized outreach email to ${prospectName} at ${company} about ${topic}. Keep it concise.`);
    const response = await result.response;
    return response.text();
  });
};

export const editProspectProfileImage = async (base64Image: string, prompt: string) => {
  console.warn("Image editing not supported in this version.");
  return null;
};

// --- AI Lead Scoring ---
export const scoreLead = async (contact: any) => {
  return executeWithFallback(async (modelName) => {
    const genAI = getGeminiClient();
    const contactProfile = {
      Name: `${contact.firstName} ${contact.lastName}`,
      Title: contact.title || "Non spécifié",
      Company: contact.company || "Non spécifié",
      Sector: contact.sector || "Non spécifié",
      Email: contact.email || "Non spécifié",
      Phone: contact.phone || "Non spécifié",
      LinkedIn: contact.linkedinUrl || "Non spécifié",
      Website: contact.website || "Non spécifié",
      Notes: contact.notes || "Aucune note"
    };

    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: `Lead Scoring Expert. 0-100. JSON Output.`,
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
    });

    const result = await model.generateContent(`Analyse ce prospect B2B : ${JSON.stringify(contactProfile)}`);
    const response = await result.response;
    const data = JSON.parse(response.text() || "{}");

    // Fallback logic
    let finalScore = typeof data.score === 'number' ? Math.round(data.score) : 0;
    const title = (contact.title || '').toLowerCase();
    if (finalScore < 50 && (title.includes('ceo') || title.includes('pdg') || title.includes('founder'))) {
      finalScore = 85;
      data.reason = "Review Force: Décideur Clé détecté";
    }

    return {
      score: finalScore,
      reason: data.reason || "Analyse complétée",
      summary: data.summary || "Le profil a été analysé par l'IA."
    };
  }).catch(e => {
    console.error("Scoring error:", e);
    return {
      score: 50,
      reason: "Erreur Analyse",
      summary: "Service momentanément indisponible."
    };
  });
};

const LANGUAGE_MAP: Record<string, string> = {
  'fr': 'Français',
  'en': 'English',
  'es': 'Español',
  'he': 'Hebrew (Ivrit)'
};

// --- AI LinkedIn Carousel Generator ---
// SIMPLIFIED SCHEMA FOR GEMINI-PRO COMPATIBILITY
// Some older models struggle with complex nested schemas in JSON mode, so we simplify where possible or accept potentially string results and try parsing.
// But 1.5-flash is robust. If we fallback to gemini-pro (1.0), it supports JSON mode but maybe less strict.

export const getCarouselIdeas = async (userActivity: string, language: string = 'fr') => {
  return executeWithFallback(async (modelName) => {
    const genAI = getGeminiClient();
    const langName = LANGUAGE_MAP[language] || 'Français';

    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        // Remove Schema for gemini-pro if it fails? No, standard SDK supports it for gemini-content too usually.
        // Keep it for now.
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING }
        }
      }
    });

    const prompt = `Give 5 viral LinkedIn carousel topic ideas for: "${userActivity}". Language: ${langName}. Return ONLY a JSON Array of strings.`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text() || "[]");
  });
};

export const generateCarouselScript = async (topic: string, language: string = 'fr') => {
  return executeWithFallback(async (modelName) => {
    const genAI = getGeminiClient();
    const langName = LANGUAGE_MAP[language] || 'Français';
    const isRTL = language === 'he';

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
            },
            required: ["title", "content", "visual"]
          }
        }
      }
    });

    const prompt = `Write a 6-slide LinkedIn carousel script about: "${topic}".
              Language: ${langName}.
              Structure: Hook, Problem, Solution, How-to, Result, CTA.
              ${isRTL ? "IMPORTANT: Text must be Hebrew." : ""}
              Tone: Direct, punchy.
              Return JSON Array of objects {title, content, visual}.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text() || "[]");
  });
};

export const generateLinkedInPostOptions = async (topic: string, slides: any[], customInstruction?: string, language: string = 'fr') => {
  return executeWithFallback(async (modelName) => {
    const genAI = getGeminiClient();
    const langName = LANGUAGE_MAP[language] || 'Français';

    const slidesText = slides.map((s: any, i: number) => `S${i + 1}: ${s.title} - ${s.content}`).join('\n');

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
            },
            required: ["tone", "hook", "content"]
          }
        }
      }
    });

    const prompt = `Topic: ${topic}
        Slides: ${slidesText}
        Task: Write 3 LinkedIn posts (Provocative, Educational, Short).
        Language: ${langName}.
        Consigne Custom: ${customInstruction || "None"}
        Return JSON Array of {tone, hook, content}.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text() || "[]");
  });
};

export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export function encodeToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
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
