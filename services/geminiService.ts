
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// Initialize the API client
export const getGeminiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "AIzaSyAk2qBmeaW8TWsJU9nUWeDGlSpTkPfGUV8";
  if (!apiKey) {
    console.error("VITE_GEMINI_API_KEY is missing!");
    throw new Error("API key not found. Please set VITE_GEMINI_API_KEY.");
  }
  return new GoogleGenerativeAI(apiKey);
};

// --- Extraction visuelle de carte de visite ---
export const extractContactFromImage = async (base64Image: string) => {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    // Set generation config to force JSON
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

  try {
    // Remove header if present to get pure base64
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const parts = [
      {
        inlineData: {
          data: cleanBase64,
          mimeType: "image/jpeg"
        }
      },
      {
        text: `Analyse cette carte de visite avec une grande attention aux détails. Extrais les informations de contact.
          POINTS CRITIQUES :
          1. Cherche activement l'adresse EMAIL (contient '@'). Elle est souvent précédée de 'Mail:', 'E-mail:', ou située près du téléphone.
          2. Ne confonds pas le site web et l'email.
          3. Extrais : Prénom, Nom, Poste, Société, Email, Téléphone, Site Web, LinkedIn.
          Retourne un JSON uniquement.`
      }
    ];

    const result = await model.generateContent(parts);
    const response = await result.response;
    return JSON.parse(response.text());
  } catch (e) {
    console.error("Image extraction error:", e);
    throw e;
  }
};

// --- Smart Data Enrichment ---
export const enrichContactFromText = async (text: string) => {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: `Tu es un Expert en Renseignement Commercial (OSINT). Ta mission est de trouver les coordonnées de contact DIRECTES (Email et Téléphone) d'une personne au sein d'une entreprise donnée. Ne propose que des informations vérifiables ou des patterns d'email probables. Retourne exclusivement l'objet JSON structuré.`,
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

  try {
    const result = await model.generateContent(`IDENTIFIER COORDONNÉES DIRECTES : "${text}"`);
    const response = await result.response;
    const data = JSON.parse(response.text());
    return { data, sources: [] };
  } catch (e) {
    console.error("Enrichment error:", e);
    throw e;
  }
};

export const generateCampaignContent = async (prospectName: string, company: string, topic: string) => {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent(`Write a professional personalized outreach email to ${prospectName} at ${company} about ${topic}. Keep it concise and persuasive.`);
  const response = await result.response;
  return response.text();
};

export const editProspectProfileImage = async (base64Image: string, prompt: string) => {
  // NOTE: Image editing is not supported in the standard text/multimodal API in the same way.
  // This function in the previous code seemed to try to use inlineData to output an image?
  // Gemini 1.5 Flash generates TEXT/JSON. It does not generate Images.
  // We will return null or log a warning as this feature might have been hallucinatory in the previous SDK usage or relied on a specific unavailable beta feature.
  console.warn("Image editing not supported in this version.");
  return null;
};

// --- AI Lead Scoring ---
export const scoreLead = async (contact: any) => {
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
    model: "gemini-1.5-flash",
    systemInstruction: `Tu es un Expert Sales B2B & Lead Scoring Senior.
            Ton rôle est d'évaluer le potentiel de conversion de ce prospect (Score 0-100).
            
            RÈGLES DE SCORING STRICTES :
            1. C-LEVEL (CEO, CTO, DG, VP, Founder) : Score entre 80 et 100. C'est la cible prioritaire.
            2. MANAGER / HEAD OF : Score entre 60 et 80.
            3. EMPLOYÉ / ASSISTANT : Score entre 20 et 50.
            4. STAGIAIRE / ÉTUDIANT : Score < 20.
            
            BONUS :
            - Email Pro ou Tel Mobile : +10 points
            - Secteur Tech/Digital/Industrie : +10 points
    
            FORMAT DE RÉPONSE JSON ATTENDU :
            {
              "score": number (0-100, entier uniquement),
              "reason": "Une phrase courte (10 mots max) résumant le statut (ex: CEO, profil premium avec LinkedIn)",
              "summary": "Un paragraphe détaillé (30-50 mots) expliquant les points forts et faibles du profil pour le CRM."
            }`,
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

  try {
    const result = await model.generateContent(`Analyse ce prospect B2B :
          ${JSON.stringify(contactProfile, null, 2)}
          
          Attentions particulières :
          - Si le poste contient "CEO", "PDG", "Directeur", "Founder", "Gérant" => SCORE MINIMUM 75/100.
          - Si Email ou Téléphone présent => BONUS +10 points.
          - Si LinkedIn ou Site Web présent => BONUS +10 points.`);

    const response = await result.response;
    const data = JSON.parse(response.text() || "{}");

    // Fallback logic
    let finalScore = typeof data.score === 'number' ? Math.round(data.score) : 0;
    const title = (contact.title || '').toLowerCase();
    if (finalScore < 50 && (title.includes('ceo') || title.includes('pdg') || title.includes('founder') || title.includes('gérant') || title.includes('directeur'))) {
      finalScore = 85;
      data.reason = "Review Force: Décideur Clé détecté";
    }

    return {
      score: finalScore,
      reason: data.reason || "Analyse complétée",
      summary: data.summary || "Le profil a été analysé par l'IA."
    };
  } catch (e) {
    console.error("Scoring error:", e);
    return {
      score: 50,
      reason: "Erreur Analyse",
      summary: "Impossible de joindre le service d'intelligence artificielle. Veuillez réessayer."
    };
  }
};

const LANGUAGE_MAP: Record<string, string> = {
  'fr': 'Français',
  'en': 'English',
  'es': 'Español',
  'he': 'Hebrew (Ivrit)'
};

// --- AI LinkedIn Carousel Generator ---
export const getCarouselIdeas = async (userActivity: string, language: string = 'fr') => {
  const genAI = getGeminiClient();
  const langName = LANGUAGE_MAP[language] || 'Français';

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING }
      }
    }
  });

  try {
    const prompt = `Donne-moi 5 idées de sujets de carrousels LinkedIn viraux pour une entreprise qui fait : "${userActivity}". 
          Réponds en JSON liste de chaînes de caractères.
          Langue de réponse impérative : ${langName}.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text() || "[]");
  } catch (e) {
    console.error("Carousel ideas error:", e);
    throw e;
  }
};

export const generateCarouselScript = async (topic: string, language: string = 'fr') => {
  const genAI = getGeminiClient();
  const langName = LANGUAGE_MAP[language] || 'Français';
  const isRTL = language === 'he';

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: `Tu es un expert LinkedIn. Tu dois répondre EXCLUSIVEMENT en JSON. Langue : ${langName}.`,
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

  try {
    const prompt = `Rédige le script complet pour un carrousel de 6 slides sur le sujet : "${topic}".
          Langue de réponse : ${langName}.
          
          Format attendu pour les slides :
          Slide 1 (La Hook) : Une phrase choc de moins de 10 mots.
          Slide 2 (Le Problème) : Le contexte.
          Slide 3 (La Solution) : L'outil ou la méthode.
          Slide 4 (Le "Comment faire") : Exemple concret.
          Slide 5 (Le Résultat) : Gain concret.
          Slide 6 (CTA) : Appel à l'action.
    
          ${isRTL ? "IMPORTANT: Le texte doit être en Hébreu." : ""}
          
          Ton : Direct, impactant, sans jargon inutile. Ajoute une suggestion visuelle pour chaque slide.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text() || "[]");
  } catch (e) {
    console.error("Carousel script error:", e);
    throw e;
  }
};

export const generateLinkedInPostOptions = async (topic: string, slides: any[], customInstruction?: string, language: string = 'fr') => {
  const genAI = getGeminiClient();
  const langName = LANGUAGE_MAP[language] || 'Français';

  const slidesContent = slides.map((s, i) => `Slide ${i + 1}: ${s.title} - ${s.content}`).join('\n');
  let promptInstruction = "";
  if (customInstruction) {
    promptInstruction = `\n🚨 CONSIGNE CLIENT : "${customInstruction}" (Appliquer impérativement).`;
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
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

  try {
    const systemPrompt = `Tu es un Expert LinkedIn et Copywriter d'élite.
          Sujet du carrousel : "${topic}"
          Contenu des slides :
          ${slidesContent}
    
          TA MISSION : Rédiger 3 variantes de posts LinkedIn pour accompagner ce carrousel.
          LANGUE DE RÉPONSE IMPÉRATIVE : ${langName}.
    
          ${promptInstruction}
          
          OPTION 1 : PROVOCANTE & URGENTE (Pour la viralité)
          - Accroche : Choc, clivante ou alarmiste.
          - Ton : Direct, urgent.
          - Objectif : Stopper le scroll.
    
          OPTION 2 : ÉDUCATIVE & ANALYTIQUE (Pour l'autorité)
          - Accroche : Question rhétorique ou statistique.
          - Ton : Pédagogue, expert, structuré.
          - Objectif : Bâtir la confiance.
    
          OPTION 3 : SHORT & PUNCHY (Minimaliste)
          - Accroche : 3-5 mots max.
          - Corps : Très court, aéré.
          - Objectif : Efficacité maximale.
    
          STRUCTURE REQUISE POUR CHAQUE POST :
          1. Accroche (Hook)
          2. Corps du texte (avec sauts de ligne)
          3. Liste à puces (3-5 points clés résumant le carrousel)
          4. Call to Action (CTA) clair`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    return JSON.parse(response.text() || "[]");
  } catch (e) {
    console.error("Post generation error:", e);
    throw e;
  }
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
