/**
 * ⚠️ IMPORTANT: Firestore Indexes
 *
 * After deploying this function for the first time, check the Firebase Console logs
 * for "Missing Index" error messages. These errors will include direct links to
 * create the required composite indexes in the Firebase Console.
 *
 * Common indexes you may need:
 * - Collection Group: contentCalendar (status ASC, scheduledDate ASC)
 * - Collection: sites (agencyId ASC, status ASC)
 * - Collection: agencies (subscriptionStatus ASC)
 *
 * Click the links in the error logs to automatically create the indexes.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as FormData from "form-data";
import fetch from "node-fetch";
import axios from "axios";
import * as xml2js from "xml2js";
import {SecretManagerServiceClient} from "@google-cloud/secret-manager";
import {checkIPRateLimit, getClientIP} from "./rateLimiting";
import {getPrompts, initializePrompts} from "./promptManager";
import {sendEmail} from "./mailer";
import {searchExternalLinks, formatExternalLinksForPrompt} from "./externalLinks";
import {buildAndDeploy} from "./deployBlog";
import {enqueueTask} from "./queue/dispatcher";
import {getNextMWFDate, getNextMWFDates} from "./scheduling";

admin.initializeApp();

/** Site ID for the Apex SEO marketing website (Cloudflare). "Post Now" publishes to the blog. */
const MARKETING_SITE_ID = "CrwYROIIGRhyGotnV4dh";

// Secret Manager client
const secretClient = new SecretManagerServiceClient();

/**
 * Check if a user is a super admin based on their email domain
 * Super admins are users with emails ending in:
 * - @spotonwebsites.com.au
 * - @myapex.io
 * @param {string|null|undefined} email - User email address
 * @return {boolean} True if user is a super admin
 */
function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;

  const normalizedEmail = email.toLowerCase().trim();
  return (
    normalizedEmail.endsWith("@spotonwebsites.com.au") ||
    normalizedEmail.endsWith("@myapex.io")
  );
}
const PROJECT_ID = process.env.GCLOUD_PROJECT || "apex-seo-ffbd0";
const GEMINI_SECRET_NAME = process.env.GEMINI_SECRET_NAME || "GEMINI_API_KEY";

// Cache for the API key to avoid fetching on every request
let cachedGeminiApiKey: string | null = null;
let cachedGeminiModel: string | null = null;
let cachedDataForSeoLogin: string | null = null;
let cachedDataForSeoPassword: string | null = null;
let cachedOpenAiApiKey: string | null = null;

/**
 * Get Gemini API key from Secret Manager
 * Caches the result to avoid repeated API calls
 */
async function getGeminiApiKey(): Promise<string> {
  // Return cached key if available
  if (cachedGeminiApiKey) {
    console.log("Using cached Gemini API key");
    return cachedGeminiApiKey;
  }

  const secretPath = `projects/${PROJECT_ID}/secrets/${GEMINI_SECRET_NAME}/versions/latest`;
  console.log(`Attempting to fetch Gemini secret from: ${secretPath}`);

  try {
    // Try Secret Manager first
    const [version] = await secretClient.accessSecretVersion({
      name: secretPath,
    });

    const apiKey = version.payload?.data?.toString();
    if (apiKey && apiKey.length > 0) {
      console.log(`Successfully retrieved Gemini API key from Secret Manager (length: ${apiKey.length})`);
      cachedGeminiApiKey = apiKey;
      return apiKey;
    } else {
      console.warn("Secret retrieved but value is empty");
    }
  } catch (error: any) {
    console.error("Failed to fetch secret from Secret Manager:", error.message);
    console.error("Error details:", JSON.stringify(error, null, 2));
    // Fall back to environment variable
  }

  // Fallback to environment variable
  if (process.env.GEMINI_API_KEY) {
    console.log("Using Gemini API key from environment variable");
    cachedGeminiApiKey = process.env.GEMINI_API_KEY;
    return cachedGeminiApiKey;
  }

  // Last resort: throw error
  console.error("CRITICAL: Gemini API key not found in Secret Manager or environment");
  console.error(`Secret path attempted: ${secretPath}`);
  console.error(`PROJECT_ID: ${PROJECT_ID}`);
  console.error(`GEMINI_SECRET_NAME: ${GEMINI_SECRET_NAME}`);
  throw new Error("Gemini API key not configured");
}

/**
 * Get DataForSEO login from Secret Manager
 * Caches the result to avoid repeated API calls
 */
async function getDataForSeoLogin(): Promise<string | null> {
  if (cachedDataForSeoLogin) {
    return cachedDataForSeoLogin;
  }

  const secretPath = `projects/${PROJECT_ID}/secrets/DATAFORSEO_LOGIN/versions/latest`;

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: secretPath,
    });

    const login = version.payload?.data?.toString();
    if (login && login.length > 0) {
      cachedDataForSeoLogin = login;
      return login;
    }
  } catch (error: any) {
    console.warn("Failed to fetch DATAFORSEO_LOGIN from Secret Manager:", error.message);
  }

  // Fallback to environment variable
  if (process.env.DATAFORSEO_LOGIN) {
    cachedDataForSeoLogin = process.env.DATAFORSEO_LOGIN;
    return cachedDataForSeoLogin;
  }

  return null;
}

/**
 * Get DataForSEO password from Secret Manager
 * Caches the result to avoid repeated API calls
 */
async function getDataForSeoPassword(): Promise<string | null> {
  if (cachedDataForSeoPassword) {
    return cachedDataForSeoPassword;
  }

  const secretPath = `projects/${PROJECT_ID}/secrets/DATAFORSEO_PASSWORD/versions/latest`;

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: secretPath,
    });

    const password = version.payload?.data?.toString();
    if (password && password.length > 0) {
      cachedDataForSeoPassword = password;
      return password;
    }
  } catch (error: any) {
    console.warn("Failed to fetch DATAFORSEO_PASSWORD from Secret Manager:", error.message);
  }

  // Fallback to environment variable
  if (process.env.DATAFORSEO_PASSWORD) {
    cachedDataForSeoPassword = process.env.DATAFORSEO_PASSWORD;
    return cachedDataForSeoPassword;
  }

  return null;
}

/**
 * Get OpenAI API key from Secret Manager
 * Caches the result to avoid repeated API calls
 */
async function getOpenAiApiKey(): Promise<string | null> {
  if (cachedOpenAiApiKey) {
    return cachedOpenAiApiKey;
  }

  const secretPath = `projects/${PROJECT_ID}/secrets/OPENAI_API_KEY/versions/latest`;

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: secretPath,
    });

    const apiKey = version.payload?.data?.toString();
    if (apiKey && apiKey.length > 0) {
      cachedOpenAiApiKey = apiKey;
      return apiKey;
    }
  } catch (error: any) {
    console.warn("Failed to fetch OPENAI_API_KEY from Secret Manager:", error.message);
  }

  // Fallback to environment variable
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your_openai_api_key") {
    cachedOpenAiApiKey = process.env.OPENAI_API_KEY;
    return cachedOpenAiApiKey;
  }

  return null;
}

// Stripe helper functions have been moved to stripe.ts

/**
 * Get available Gemini model that supports generateContent
 */
async function getAvailableGeminiModel(): Promise<string> {
  if (cachedGeminiModel) {
    return cachedGeminiModel;
  }

  const apiKey = await getGeminiApiKey();

  try {
    // Try to list available models
    const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (listResponse.ok) {
      const data = await listResponse.json() as any;
      const models = data.models || [];

      // Find a model that supports generateContent
      const supportedModel = models.find((m: any) =>
        m.supportedGenerationMethods?.includes("generateContent") &&
        (m.name.includes("flash") || m.name.includes("pro"))
      );

      if (supportedModel) {
        // Extract model name (remove 'models/' prefix if present)
        const modelName = supportedModel.name.replace("models/", "");
        cachedGeminiModel = modelName;
        console.log("Found available Gemini model:", modelName);
        return modelName;
      }
    }
  } catch (error) {
    console.warn("Failed to list Gemini models:", error);
  }

  // Fallback: try common model names in order
  const fallbackModels = [
    "gemini-2.0-flash-exp",
    "gemini-2.0-flash-thinking-exp",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-pro",
  ];

  // Try each model to find one that works
  for (const model of fallbackModels) {
    try {
      const testResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "test" }] }],
          }),
        }
      );

      if (testResponse.ok || testResponse.status === 400) {
        // 400 might mean the model exists but the request was invalid, which is fine
        cachedGeminiModel = model;
        console.log("Using Gemini model:", model);
        return model;
      }
    } catch (error) {
      continue;
    }
  }

  // Default to a common model
  cachedGeminiModel = "gemini-1.5-pro";
  return cachedGeminiModel;
}

/**
 * Call Gemini API with automatic model discovery
 * @param {string} prompt - The prompt to send to Gemini
 * @param {number} maxTokens - Maximum tokens to generate (default: 8000)
 * @return {Promise<string>} The generated text content
 */
export async function callGeminiAPI(prompt: string, maxTokens = 8000, jsonMode = false): Promise<string> {
  console.log(`[callGeminiAPI] Starting API call with maxTokens: ${maxTokens}, jsonMode: ${jsonMode}`);
  const apiKey = await getGeminiApiKey();
  const model = await getAvailableGeminiModel();
  console.log(`[callGeminiAPI] Using model: ${model}, API key length: ${apiKey.length}`);

  // Try v1beta first, then v1
  const endpoints = [
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt,
            }],
          }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            ...(jsonMode ? {responseMimeType: "application/json"} : {}),
          },
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          console.log(`[callGeminiAPI] ✅ Successfully received response from ${endpoint}. Response length: ${text.length} chars`);
          return text;
        } else {
          console.error("[callGeminiAPI] Response OK but no text found. Data:", JSON.stringify(data).substring(0, 500));
          throw new Error("No text content in Gemini API response");
        }
      } else if (response.status === 404) {
        console.log(`[callGeminiAPI] Endpoint ${endpoint} returned 404, trying next endpoint`);
        // Try next endpoint
        continue;
      } else {
        const errorData = await response.text();
        console.error(`[callGeminiAPI] ❌ Gemini API error from ${endpoint}:`, response.status, response.statusText, errorData);
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorData.substring(0, 200)}`);
      }
    } catch (fetchError: any) {
      if (fetchError.message?.includes("Gemini API error")) {
        throw fetchError;
      }
      console.warn("Fetch error for endpoint:", endpoint, fetchError);
      continue;
    }
  }

  throw new Error("All Gemini API endpoints failed");
}

// Configure region to match Firestore
const region = functions.region("australia-southeast1");

export const generateKeywords = region.https.onCall(async (data, context) => {
  // 1. Authentication Check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const {seedKeyword, industry, count = 20} = data;

  if (!seedKeyword || !industry) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with \"seedKeyword\" and \"industry\" arguments."
    );
  }

  try {
    const prompt = `Generate ${count} related keyword ideas for "${seedKeyword}" in the ${industry} industry. 
            
Generate a MIX of keyword types:
- Short keywords (2-4 words): High search volume, competitive
- Medium-tail keywords (4-6 words): Balanced volume and competition
- Long-tail keywords (6+ words): Lower competition, specific intent
- Question-based keywords: "how to", "what is", "why", "when", "where"
- Problem-solution keywords: Address specific pain points

Return ONLY a valid JSON array of strings. Do not include any explanation or other text.`;

    const content = await callGeminiAPI(prompt, 1000);
    const jsonMatch = content.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      throw new Error("Invalid response format from AI");
    }

    return {keywords: JSON.parse(jsonMatch[0])};
  } catch (error: any) {
    console.error("Error generating keywords:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate keywords",
      error.message
    );
  }
});

/**
 * Simple Gemini keyword suggestions tool
 * Returns 20 related keywords based on seed keyword
 * Frontend controls all filtering and looping logic
 */
export const getGeminiSuggestions = region.runWith({
  timeoutSeconds: 60,
  memory: "512MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { seed, avoidKeywords = [] } = data;

  if (!seed) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with 'seed' argument."
    );
  }

  try {
    const avoidList = Array.isArray(avoidKeywords) ? avoidKeywords.join(", ") : avoidKeywords;
    const avoidText = avoidList ? ` Do not include these words: ${avoidList}.` : "";

    const prompt = `Give me 20 SEO keywords related to '${seed}'. Output ONLY a comma-separated list.${avoidText}`;

    const content = await callGeminiAPI(prompt, 1000);

    // Parse comma-separated list
    // Remove any markdown code blocks if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```")) {
      const firstNewline = cleanContent.indexOf("\n");
      if (firstNewline !== -1) {
        const afterMarker = cleanContent.substring(firstNewline + 1);
        const lastCodeBlock = afterMarker.lastIndexOf("```");
        if (lastCodeBlock > 0) {
          cleanContent = afterMarker.substring(0, lastCodeBlock).trim();
        } else {
          cleanContent = afterMarker.trim();
        }
      }
    }

    // Split by comma and clean up
    const keywords = cleanContent
      .split(",")
      .map((kw) => kw.trim().replace(/^["']|["']$/g, "")) // Remove quotes if present
      .filter((kw) => kw.length > 0);

    return { keywords };
  } catch (error: any) {
    console.error("[getGeminiSuggestions] Error:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to get Gemini suggestions",
      error.message
    );
  }
});

/**
 * Generate Topic Cluster Plan
 * Creates 1 pillar topic and 4 cluster topics for structured content planning
 */
export const generateTopicClusterCallable = region.runWith({
  timeoutSeconds: 120,
  memory: "512MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { seedKeyword, siteId } = data;

  if (!seedKeyword) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with 'seedKeyword' argument."
    );
  }

  try {
    console.log(`[generateTopicClusterCallable] Generating topic cluster for seed keyword: ${seedKeyword}`);

    // Fetch site data to get location context
    let targetCity: string | undefined;
    let targetCountry: string | undefined;
    if (siteId) {
      try {
        const siteDoc = await admin.firestore().collection("sites").doc(siteId).get();
        if (siteDoc.exists) {
          const siteData = siteDoc.data();
          if (siteData) {
            targetCity = siteData.targetCity as string | undefined;
            targetCountry = siteData.targetCountry as string | undefined;
            if (targetCity || targetCountry) {
              console.log(`[generateTopicClusterCallable] ✅ Found location context: ${targetCity || ""}, ${targetCountry || ""}`);
            }
          }
        }
      } catch (error: any) {
        console.warn(`[generateTopicClusterCallable] ⚠️ Failed to fetch site document: ${error.message}`);
        // Continue without location context - not critical
      }
    }

    // Build location context string
    let locationContext = "";
    if (targetCity && targetCountry) {
      locationContext = `\n\nLOCATION CONTEXT: This business operates in ${targetCity}, ${targetCountry}.
- When creating the Pillar and Cluster titles, you SHOULD include the city name in at least 1 of the cluster titles if it fits naturally (e.g., 'Web Design in ${targetCity}').
- Ensure the topics are relevant to this region.`;
    } else if (targetCountry) {
      locationContext = `\n\nLOCATION CONTEXT: This business operates in ${targetCountry}.
- Ensure the topics are relevant to this region.`;
    }

    const prompt = `Act as an SEO Strategist. I have a main keyword: "${seedKeyword}".
Create a Topic Cluster Plan.
1. Generate 1 "Pillar Page" Title: Comprehensive, broad, "Ultimate Guide" style.
2. Generate 4 "Cluster Content" Titles: Specific long-tail keywords or questions that support the pillar.

Rules:
- The Cluster titles must differ significantly from each other (e.g., Cost, Strategy, Mistakes, Tools).${locationContext}
- Return valid JSON:
{
  "pillar": { "title": "String", "keyword": "String" },
  "clusters": [
    { "title": "String", "keyword": "String" },
    { "title": "String", "keyword": "String" },
    { "title": "String", "keyword": "String" },
    { "title": "String", "keyword": "String" }
  ]
}

Do NOT wrap the output in markdown blocks (like \`\`\`json). Just return the raw JSON string.`;

    const rawResponse = await callGeminiAPI(prompt, 2000, true);

    // Validate that we got a response
    if (!rawResponse || rawResponse.trim().length < 50) {
      throw new Error("Generated response is too short or empty");
    }

    // Parse JSON response - safely remove markdown code blocks if present
    let jsonText = rawResponse.trim();
    jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();

    // Parse the JSON
    let parsedData: {
      pillar: { title: string; keyword: string };
      clusters: Array<{ title: string; keyword: string }>;
    };
    try {
      parsedData = JSON.parse(jsonText);
    } catch (parseError: any) {
      console.error("[generateTopicClusterCallable] ❌ Failed to parse JSON response:", parseError);
      console.error("[generateTopicClusterCallable] Raw response (first 500 chars):", rawResponse.substring(0, 500));
      throw new Error(`Failed to parse JSON response: ${parseError.message}`);
    }

    // Validate required fields
    if (!parsedData.pillar || !parsedData.pillar.title || !parsedData.pillar.keyword) {
      throw new Error("JSON response missing required pillar fields: title or keyword");
    }

    if (!parsedData.clusters || !Array.isArray(parsedData.clusters) || parsedData.clusters.length !== 4) {
      throw new Error("JSON response must contain exactly 4 cluster items");
    }

    // Validate each cluster has title and keyword
    for (let i = 0; i < parsedData.clusters.length; i++) {
      const cluster = parsedData.clusters[i];
      if (!cluster.title || !cluster.keyword) {
        throw new Error(`Cluster item ${i + 1} is missing title or keyword`);
      }
    }

    console.log(`[generateTopicClusterCallable] ✅ Successfully generated topic cluster: 1 pillar + ${parsedData.clusters.length} clusters`);

    return parsedData;
  } catch (error: any) {
    console.error("[generateTopicClusterCallable] ❌ Error:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate topic cluster",
      error.message
    );
  }
});

/**
 * Simple DataForSEO keyword metrics tool
 * Returns raw metrics for provided keywords without any filtering
 * Frontend controls all filtering and looping logic
 */
/**
 * Map country name to DataForSEO location code
 * @param {string} countryName - Full country name (e.g., "United States", "Australia")
 * @return {number} DataForSEO location code (default: 2036 for Australia)
 */
function getDataForSeoLocationCode(countryName: string | undefined): number {
  if (!countryName) {
    return 2036; // Default to Australia
  }

  const locationCodeMap: Record<string, number> = {
    "United States": 2840,
    "Australia": 2036,
    "United Kingdom": 2826,
    "Canada": 2124,
    // Also support country codes for backward compatibility
    "US": 2840,
    "AU": 2036,
    "GB": 2826,
    "UK": 2826,
    "CA": 2124,
  };

  return locationCodeMap[countryName] || 2036; // Default to Australia if not found
}

export const checkKeywordMetrics = region.runWith({
  timeoutSeconds: 300,
  memory: "512MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { keywords, siteId } = data;

  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with 'keywords' array argument."
    );
  }

  try {
    // Fetch site document to get targetCountry if siteId is provided
    let locationCode = 2036; // Default to Australia
    if (siteId) {
      try {
        const siteDoc = await admin.firestore().collection("sites").doc(siteId).get();
        if (siteDoc.exists) {
          const siteData = siteDoc.data();
          const targetCountry = siteData?.targetCountry as string | undefined;
          if (targetCountry) {
            locationCode = getDataForSeoLocationCode(targetCountry);
            console.log(`[checkKeywordMetrics] Using location code ${locationCode} for country: ${targetCountry}`);
          } else {
            console.log(`[checkKeywordMetrics] No targetCountry found in site document, using default: ${locationCode}`);
          }
        }
      } catch (error: any) {
        console.warn(`[checkKeywordMetrics] Failed to fetch site document: ${error.message}, using default location code`);
      }
    }

    const dataForSeoLogin = await getDataForSeoLogin();
    const dataForSeoPassword = await getDataForSeoPassword();

    if (!dataForSeoLogin || !dataForSeoPassword) {
      console.warn("[checkKeywordMetrics] DataForSEO credentials not configured, returning empty results");
      // Return empty results instead of throwing error
      // Frontend can handle this gracefully
      return { results: [] };
    }

    const auth = Buffer.from(`${dataForSeoLogin}:${dataForSeoPassword}`).toString("base64");

    const response = await fetch("https://api.dataforseo.com/v3/keywords_data/google/search_volume/live", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{
        keywords: keywords,
        location_code: locationCode,
        language_code: "en",
      }]),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[checkKeywordMetrics] DataForSEO API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
      throw new functions.https.HttpsError(
        "internal",
        `DataForSEO API error: ${response.status}`,
        errorText.substring(0, 200)
      );
    }

    const apiData = await response.json();
    const results: Array<{ keyword: string; volume: number; difficulty: number }> = [];

    if (apiData.tasks && apiData.tasks[0]?.result && apiData.tasks[0].result.length > 0) {
      const rawResults = apiData.tasks[0].result;

      for (const result of rawResults) {
        const keyword = result.keyword;
        const searchVolume = result.search_volume || 0;
        const competition = result.competition;

        // Convert competition to difficulty (0-100)
        let difficulty = 50;
        if (typeof competition === "number") {
          difficulty = Math.round((competition <= 1 ? competition * 100 : competition));
        } else {
          const competitionMap: Record<string, number> = {
            "LOW": 25,
            "MEDIUM": 50,
            "HIGH": 75,
            "low": 25,
            "medium": 50,
            "high": 75,
          };
          difficulty = competitionMap[competition] || 50;
        }

        results.push({
          keyword,
          volume: searchVolume,
          difficulty,
        });
      }
    }

    return { results };
  } catch (error: any) {
    console.error("[checkKeywordMetrics] Error:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to check keyword metrics",
      error.message
    );
  }
});

// Section 1: Generate keywords with volume and difficulty filtering
export const generateKeywordsWithVolumeCheck = region.runWith({
  timeoutSeconds: 300, // 5 minutes for multiple cycles
  memory: "512MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const {siteId, seedKeyword, industry, country, postcode, minVolume = 200, maxDifficulty = 50, targetCount = 10} = data;

  if (!siteId || !seedKeyword || !industry) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with siteId, seedKeyword, and industry arguments."
    );
  }

  // Helper function to get spelling preferences based on country
  const getSpellingContext = (countryCode?: string): string => {
    if (!countryCode) return "";

    const spellingMap: Record<string, string> = {
      "US": "Use American English spelling (e.g., color, organize, center, analyze)",
      "AU": "Use Australian English spelling (e.g., colour, organise, centre, analyse)",
      "GB": "Use British English spelling (e.g., colour, organise, centre, analyse)",
      "CA": "Use Canadian English spelling (e.g., colour, organize, centre, analyze)",
      "NZ": "Use New Zealand English spelling (e.g., colour, organise, centre, analyse)",
      "IE": "Use Irish English spelling (e.g., colour, organise, centre, analyse)",
      "ZA": "Use South African English spelling (e.g., colour, organise, centre, analyse)",
      "IN": "Use Indian English spelling (e.g., colour, organise, centre, analyse)",
      "SG": "Use Singapore English spelling (e.g., colour, organise, centre, analyse)",
      "MY": "Use Malaysian English spelling (e.g., colour, organise, centre, analyse)",
    };

    return spellingMap[countryCode] || "";
  };

  const locationContext = country ?
    `${country === "US" ? "United States" : country === "AU" ? "Australia" : country === "GB" ? "United Kingdom" : country === "CA" ? "Canada" : country === "NZ" ? "New Zealand" : country === "IE" ? "Ireland" : country === "ZA" ? "South Africa" : country === "IN" ? "India" : country === "SG" ? "Singapore" : country === "MY" ? "Malaysia" : country}` :
    "";

  const locationKeywords = country && postcode ?
    ` Include location-specific keywords like "${locationContext} ${postcode}", "near ${postcode}", "${locationContext} based", "local ${locationContext}"` :
    country ?
      ` Include location-specific keywords like "${locationContext} based", "in ${locationContext}", "local ${locationContext}"` :
      "";

  try {
    const siteRef = admin.firestore().collection("sites").doc(siteId);
    const siteDoc = await siteRef.get();
    if (!siteDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Site not found");
    }

    // Update workflow state
    await siteRef.update({
      workflowState: "keywords_generating",
      updatedAt: admin.firestore.Timestamp.now(),
    });

    const goodKeywords: Array<{
      keyword: string;
      searchVolume: number;
      difficulty: number;
      opportunityScore: number;
    }> = [];
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loops

    while (goodKeywords.length < targetCount && attempts < maxAttempts) {
      attempts++;
      console.log(`Attempt ${attempts}: Generating keywords, have ${goodKeywords.length}/${targetCount}`);

      // Generate 20 keywords using Gemini
      const currentSeed = attempts === 1 ? seedKeyword : goodKeywords[0]?.keyword || seedKeyword;
      const prompt = `Generate 20 related keyword ideas for "${currentSeed}" in the ${industry} industry${locationContext ? ` targeting ${locationContext}` : ""}${postcode ? ` (postcode: ${postcode})` : ""}. 
            
Generate a MIX of keyword types:
- Short keywords (2-4 words): High search volume, competitive
- Medium-tail keywords (4-6 words): Balanced volume and competition
- Long-tail keywords (6+ words): Lower competition, specific intent
- Question-based keywords: "how to", "what is", "why", "when", "where"
- Problem-solution keywords: Address specific pain points${locationKeywords}

${getSpellingContext(country) ? `${getSpellingContext(country)}.` : ""}

Prioritize keywords that are likely to have search volume ≥200 and difficulty <50.

Return ONLY a valid JSON array of strings. Do not include any explanation or other text.`;

      const content = await callGeminiAPI(prompt, 1000);
      const jsonMatch = content.match(/\[[\s\S]*\]/);

      if (!jsonMatch) {
        throw new Error("Invalid response format from AI");
      }

      const keywords = JSON.parse(jsonMatch[0]) as string[];
      if (!keywords || keywords.length === 0) {
        throw new Error("Failed to generate keywords");
      }

      // Get search volumes and difficulty for all keywords
      const dataForSeoLogin = await getDataForSeoLogin();
      const dataForSeoPassword = await getDataForSeoPassword();

      console.log(`DataForSEO credentials check: login=${!!dataForSeoLogin}, password=${!!dataForSeoPassword}`);

      for (const keyword of keywords) {
        // Skip if we already have enough
        if (goodKeywords.length >= targetCount) break;

        // Skip if already in goodKeywords
        if (goodKeywords.some((k) => k.keyword === keyword)) continue;

        try {
          let searchVolume = 0;
          let difficulty = 50;
          let dataSource = "fallback";

          if (dataForSeoLogin && dataForSeoPassword) {
            // Use DataForSEO API
            // Map country codes to DataForSEO location codes
            const locationCodeMap: Record<string, number> = {
              "US": 2840, // United States
              "AU": 2036, // Australia
              "GB": 2826, // United Kingdom
              "CA": 2124, // Canada
              "NZ": 5544, // New Zealand
              "IE": 2724, // Ireland
              "ZA": 4724, // South Africa
              "IN": 3564, // India
              "SG": 7024, // Singapore
              "MY": 4584, // Malaysia
            };

            const locationCode = country && locationCodeMap[country] ? locationCodeMap[country] : 2840; // Default to USA

            console.log(`Querying DataForSEO for keyword: "${keyword}" (location: ${locationCode}, country: ${country || "default"})`);

            const auth = Buffer.from(`${dataForSeoLogin}:${dataForSeoPassword}`).toString("base64");
            const response = await fetch("https://api.dataforseo.com/v3/keywords_data/google/search_volume/live", {
              method: "POST",
              headers: {
                "Authorization": `Basic ${auth}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify([{
                keywords: [keyword],
                location_code: locationCode,
                language_code: "en",
              }]),
            });

            console.log(`DataForSEO response status: ${response.status} ${response.statusText}`);

            if (response.ok) {
              const apiData = await response.json();
              console.log("DataForSEO response data structure:", JSON.stringify(apiData).substring(0, 500));

              if (apiData.tasks && apiData.tasks[0]?.result && apiData.tasks[0].result.length > 0) {
                const result = apiData.tasks[0].result[0];
                searchVolume = result.search_volume || 0;
                const competition = result.competition;

                console.log(`DataForSEO result for "${keyword}": volume=${searchVolume}, competition=${competition}`);

                // Convert competition (0-1 float) to difficulty (0-100)
                if (typeof competition === "number") {
                  difficulty = Math.round((competition <= 1 ? competition * 100 : competition));
                } else {
                  const competitionMap: Record<string, number> = {
                    "LOW": 25,
                    "MEDIUM": 50,
                    "HIGH": 75,
                    "low": 25,
                    "medium": 50,
                    "high": 75,
                  };
                  difficulty = competitionMap[competition] || 50;
                }
                dataSource = "DataForSEO";
              } else {
                console.warn(`DataForSEO returned no results for "${keyword}". Response structure:`, JSON.stringify(apiData).substring(0, 500));
              }
            } else {
              const errorText = await response.text();
              console.error(`DataForSEO API error for "${keyword}": ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
            }
          } else {
            console.warn(`DataForSEO credentials not configured, using fallback data for "${keyword}"`);
            // Fallback: Generate pseudo-random metrics
            const hash = keyword.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const volumeBase = (hash * 13) % 100;
            if (volumeBase > 90) searchVolume = 50000 + (hash % 50000);
            else if (volumeBase > 70) searchVolume = 10000 + (hash % 40000);
            else searchVolume = 100 + (hash % 5000);
            difficulty = 20 + (hash % 60);
          }

          // Filter: volume >= minVolume AND difficulty < maxDifficulty
          if (searchVolume >= minVolume && difficulty < maxDifficulty) {
            const opportunityScore = Math.round(((searchVolume / 1000) + (100 - difficulty)) / 2);
            goodKeywords.push({
              keyword,
              searchVolume,
              difficulty,
              opportunityScore,
            });
            console.log(`✓ Added keyword: ${keyword} (volume: ${searchVolume}, difficulty: ${difficulty}, source: ${dataSource})`);
          } else {
            console.log(`✗ Rejected keyword: ${keyword} (volume: ${searchVolume}, difficulty: ${difficulty}, source: ${dataSource}) - doesn't meet criteria`);
          }
        } catch (error: any) {
          console.warn(`Error analyzing keyword ${keyword}:`, error.message);
          // Continue with next keyword
        }
      }

      // Small delay to avoid rate limiting
      if (goodKeywords.length < targetCount && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Sort by opportunity score (highest first)
    goodKeywords.sort((a, b) => b.opportunityScore - a.opportunityScore);

    // Take top targetCount
    const finalKeywords = goodKeywords.slice(0, targetCount);

    // Update site with final keywords (both formats for compatibility)
    const keywordStrings = finalKeywords.map((k) => k.keyword);
    await siteRef.update({
      primaryKeywords: keywordStrings,
      primaryKeywordsWithData: finalKeywords, // Store full data with volumes
      workflowState: "keywords_complete",
      updatedAt: admin.firestore.Timestamp.now(),
    });

    console.log(`✓ Generated ${finalKeywords.length} keywords for site ${siteId}`);

    return {
      keywords: finalKeywords,
      totalAttempts: attempts,
    };
  } catch (error: any) {
    console.error("Error in generateKeywordsWithVolumeCheck:", error);

    // Update workflow state to error
    try {
      const siteRef = admin.firestore().collection("sites").doc(siteId);
      await siteRef.update({
        workflowState: "idle",
        errorState: {
          message: error.message || "Unknown error",
          lastErrorAt: admin.firestore.Timestamp.now(),
        },
        updatedAt: admin.firestore.Timestamp.now(),
      });
    } catch (updateError) {
      console.error("Failed to update workflow state:", updateError);
    }

    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate keywords with volume check",
      error.message
    );
  }
});

// Section 2: Generate content plan for a month
export const generateContentPlan = region.runWith({
  timeoutSeconds: 540, // 9 minutes for generating month of content
  memory: "1GB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const {siteId, monthCount = 1} = data;

  if (!siteId) {
    throw new functions.https.HttpsError("invalid-argument", "The function must be called with siteId argument.");
  }

  try {
    const siteRef = admin.firestore().collection("sites").doc(siteId);
    const siteDoc = await siteRef.get();
    if (!siteDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Site not found");
    }

    const siteData = siteDoc.data();
    if (!siteData) {
      throw new functions.https.HttpsError("not-found", "Site data not found");
    }

    const primaryKeywords = siteData.primaryKeywords || [];
    if (primaryKeywords.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Site must have primary keywords. Run Section 1 first."
      );
    }

    // Update workflow state
    await siteRef.update({
      workflowState: "content_planning",
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // Calculate number of posts needed
    const blogsPerWeek = siteData.blogsPerWeek || 2;
    const postsNeeded = Math.ceil(blogsPerWeek * 4 * monthCount); // 4 weeks per month

    // Basic clustering: Group keywords by similarity (simplified for MVP)
    // For MVP, we'll just assign cluster IDs based on keyword index
    const clusters: Record<string, string[]> = {};
    primaryKeywords.forEach((keyword: string, index: number) => {
      const clusterId = `cluster_${Math.floor(index / 5)}`; // 5 keywords per cluster
      if (!clusters[clusterId]) {
        clusters[clusterId] = [];
      }
      clusters[clusterId].push(keyword);
    });

    // Identify pillar keywords (first keyword in each cluster)
    const pillarKeywords = Object.values(clusters).map((cluster) => cluster[0]);

    // Generate content plans
    const contentPlans: Array<{
      keyword: string;
      title: string;
      metaDescription: string;
      imagePrompt: string;
      blogDescription: string;
      semanticKeywords: string[];
      contentClusterId: string;
      isPillarPost: boolean;
    }> = [];

    // Generate plans in batches to avoid timeout
    const batchSize = 5;
    for (let i = 0; i < postsNeeded; i += batchSize) {
      const batch = primaryKeywords.slice(i, i + batchSize);
      const batchPlans = await Promise.all(
        batch.map(async (keyword: string) => {
          const clusterId = Object.keys(clusters).find((id) => clusters[id].includes(keyword)) || "cluster_0";
          const isPillarPost = pillarKeywords.includes(keyword);

          // Generate semantic keywords via Gemini
          let semanticKeywords: string[] = [];
          try {
            const semanticPrompt = `Generate 5-7 semantic/related keywords for "${keyword}" in the ${siteData.industry} industry. Return as JSON array of strings only.`;
            const semanticContent = await callGeminiAPI(semanticPrompt, 500);
            const semanticJsonMatch = semanticContent.match(/\[[\s\S]*\]/);
            if (semanticJsonMatch) {
              semanticKeywords = JSON.parse(semanticJsonMatch[0]);
            }
          } catch (error) {
            console.warn(`Failed to generate semantic keywords for ${keyword}:`, error);
          }

          // Generate content plan for this keyword via Gemini
          const planPrompt = `Generate a content plan for a blog post about "${keyword}" for a ${siteData.industry} website.

Brand Context:
- Industry: ${siteData.industry}
- Target Audience: ${siteData.targetAudience}
- Brand Voice: ${siteData.brandVoice}
- Tone: ${siteData.tonePreferences?.join(", ") || "Professional"}

Return ONLY valid JSON:
{
  "title": "Engaging blog title (under 60 chars, includes keyword)",
  "metaDescription": "SEO meta description (exactly 155 characters)",
  "imagePrompt": "Detailed prompt for DALL-E image generation",
  "blogDescription": "Brief description of what the blog will cover (max 50 words)"
}`;

          const planContent = await callGeminiAPI(planPrompt, 1000);
          let jsonString = planContent.trim();

          // Remove markdown code blocks if present
          if (jsonString.startsWith("```")) {
            const firstNewline = jsonString.indexOf("\n");
            if (firstNewline !== -1) {
              const jsonStart = firstNewline + 1;
              const lastCodeBlock = jsonString.lastIndexOf("```");
              if (lastCodeBlock > jsonStart) {
                jsonString = jsonString.substring(jsonStart, lastCodeBlock).trim();
              } else {
                jsonString = jsonString.substring(jsonStart).trim();
              }
            }
          }

          // Extract JSON
          if (!jsonString.startsWith("{")) {
            const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              jsonString = jsonMatch[0];
            }
          }

          const planData = JSON.parse(jsonString);

          return {
            keyword,
            title: planData.title,
            metaDescription: planData.metaDescription,
            imagePrompt: planData.imagePrompt,
            blogDescription: planData.blogDescription,
            semanticKeywords,
            contentClusterId: clusterId,
            isPillarPost,
          };
        })
      );

      contentPlans.push(...batchPlans);
    }

    // Schedule on Mon/Wed/Fri at 02:00 UTC
    const mwfDatesCluster = getNextMWFDates(contentPlans.length);

    // Create blog documents with status "planned"
    const blogsRef = admin.firestore().collection("blogs");
    const createdBlogs: string[] = [];

    for (let i = 0; i < contentPlans.length; i++) {
      const plan = contentPlans[i];
      const scheduledDate = mwfDatesCluster[i];

      const blogRef = await blogsRef.add({
        siteId,
        userId: context.auth.uid,
        title: plan.title,
        metaDescription: plan.metaDescription,
        content: "", // Empty - will be filled in Section 3
        excerpt: plan.blogDescription,
        keyword: plan.keyword,
        relatedKeywords: [],
        featuredImageUrl: "",
        internalLinks: [],
        externalLinks: [],
        wordCount: 0,
        status: "planned",
        scheduledDate: admin.firestore.Timestamp.fromDate(scheduledDate),
        publishedDate: null,
        wordpressPostId: null,
        wordpressPostUrl: null,
        trackingScriptId: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        trackingScript: "",
        totalViews: 0,
        uniqueVisitors: 0,
        avgTimeOnPage: 0,
        avgScrollDepth: 0,
        bounceRate: 0,
        lastViewedAt: null,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        // New fields
        imagePrompt: plan.imagePrompt,
        blogDescription: plan.blogDescription,
        semanticKeywords: plan.semanticKeywords,
        contentClusterId: plan.contentClusterId,
        isPillarPost: plan.isPillarPost,
      });

      createdBlogs.push(blogRef.id);
    }

    // Update workflow state
    await siteRef.update({
      workflowState: "content_plan_complete",
      updatedAt: admin.firestore.Timestamp.now(),
    });

    console.log(`✓ Generated ${createdBlogs.length} content plans for site ${siteId}`);

    return {
      success: true,
      blogsCreated: createdBlogs.length,
      blogIds: createdBlogs,
    };
  } catch (error: any) {
    console.error("Error in generateContentPlan:", error);

    // Update workflow state to error
    try {
      const siteRef = admin.firestore().collection("sites").doc(siteId);
      await siteRef.update({
        workflowState: "idle",
        updatedAt: admin.firestore.Timestamp.now(),
      });
    } catch (updateError) {
      console.error("Failed to update workflow state:", updateError);
    }

    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate content plan",
      error.message
    );
  }
});

export const generateBlogIdeas = region.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const {siteContext, count = 10} = data;

  try {
    const prompt = `Generate ${count} blog post ideas for a ${siteContext.industry} blog targeting ${siteContext.targetAudience}. 
            
Primary keywords: ${siteContext.primaryKeywords.join(", ")}
Content goals: ${siteContext.contentGoals}

Return as a JSON array of strings. Each idea should be a compelling blog title.`;

    const content = await callGeminiAPI(prompt, 1000);
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Invalid response format");

    return {ideas: JSON.parse(jsonMatch[0])};
  } catch (error: any) {
    console.error("Error generating ideas:", error);
    throw new functions.https.HttpsError("internal", "Failed to generate ideas", error.message);
  }
});

// Content Wizard: Research Keywords with Volume Check
export const researchKeywordsCallable = region.runWith({
  timeoutSeconds: 300, // 5 minutes for batch processing
  memory: "512MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const { seedKeyword, siteId } = data;

  if (!seedKeyword || !siteId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with seedKeyword and siteId arguments."
    );
  }

  try {
    // Step 1: Get site data for context
    const siteRef = admin.firestore().collection("sites").doc(siteId);
    const siteDoc = await siteRef.get();

    if (!siteDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Site not found");
    }

    const siteData = siteDoc.data();
    if (!siteData) {
      throw new functions.https.HttpsError("not-found", "Site data not found");
    }

    const industry = siteData.industry || "general";
    // Use targetCountry from site settings, fallback to country for backward compatibility
    const targetCountry = (siteData.targetCountry || siteData.country) as string | undefined;

    // Step 2: Generate 20 keyword variations using Gemini
    console.log(`[researchKeywordsCallable] Generating keywords for seed: "${seedKeyword}"`);
    const keywordPrompt = `Generate 20 SEO keyword variations for "${seedKeyword}" in the ${industry} industry.

Generate a MIX of keyword types:
- Short keywords (2-4 words): High search volume, competitive
- Medium-tail keywords (4-6 words): Balanced volume and competition
- Long-tail keywords (6+ words): Lower competition, specific intent
- Question-based keywords: "how to", "what is", "why", "when", "where"
- Problem-solution keywords: Address specific pain points

Return ONLY a valid JSON array of strings. Do not include any explanation or other text.`;

    const keywordContent = await callGeminiAPI(keywordPrompt, 1000);
    const keywordJsonMatch = keywordContent.match(/\[[\s\S]*\]/);

    if (!keywordJsonMatch) {
      throw new Error("Invalid response format from AI");
    }

    const generatedKeywords = JSON.parse(keywordJsonMatch[0]) as string[];
    if (!generatedKeywords || generatedKeywords.length === 0) {
      throw new Error("Failed to generate keywords");
    }

    console.log(`[researchKeywordsCallable] Generated ${generatedKeywords.length} keywords from Gemini`);

    // Step 3: Get DataForSEO credentials from Secret Manager
    const dataForSeoLogin = await getDataForSeoLogin();
    const dataForSeoPassword = await getDataForSeoPassword();

    // Step 4: Batch query DataForSEO for all keywords
    const keywordResults: Array<{ keyword: string; volume: number; difficulty: number }> = [];
    // Map targetCountry to DataForSEO location code
    const locationCode = getDataForSeoLocationCode(targetCountry);
    console.log(`[researchKeywordsCallable] Using location code ${locationCode} for country: ${targetCountry || "default (Australia)"}`);

    if (dataForSeoLogin && dataForSeoPassword) {
      try {
        console.log(`[researchKeywordsCallable] Querying DataForSEO batch endpoint for ${generatedKeywords.length} keywords`);
        const auth = Buffer.from(`${dataForSeoLogin}:${dataForSeoPassword}`).toString("base64");

        const response = await fetch("https://api.dataforseo.com/v3/keywords_data/google/search_volume/live", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([{
            keywords: generatedKeywords,
            location_code: locationCode,
            language_code: "en",
          }]),
        });

        if (response.ok) {
          const apiData = await response.json();
          console.log("[researchKeywordsCallable] DataForSEO batch response received");

          if (apiData.tasks && apiData.tasks[0]?.result && apiData.tasks[0].result.length > 0) {
            const results = apiData.tasks[0].result;

            for (const result of results) {
              const keyword = result.keyword;
              const searchVolume = result.search_volume || 0;
              const competition = result.competition;

              // Convert competition to difficulty (0-100)
              let difficulty = 50;
              if (typeof competition === "number") {
                difficulty = Math.round((competition <= 1 ? competition * 100 : competition));
              } else {
                const competitionMap: Record<string, number> = {
                  "LOW": 25, "MEDIUM": 50, "HIGH": 75,
                  "low": 25, "medium": 50, "high": 75,
                };
                difficulty = competitionMap[competition] || 50;
              }

              keywordResults.push({
                keyword,
                volume: searchVolume,
                difficulty,
              });
            }
          }
        } else {
          const errorText = await response.text();
          console.error(`[researchKeywordsCallable] DataForSEO API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
          throw new Error(`DataForSEO API error: ${response.status}`);
        }
      } catch (dataForSeoError: any) {
        console.warn(`[researchKeywordsCallable] DataForSEO failed: ${dataForSeoError.message}. Using fallback.`);
        // Fallback: Return keywords with N/A metrics
        return {
          keywords: generatedKeywords.map((kw) => ({
            keyword: kw,
            volume: null as any,
            difficulty: null as any,
          })),
        };
      }
    } else {
      console.warn("[researchKeywordsCallable] DataForSEO credentials not configured. Using fallback.");
      // Fallback: Return keywords with N/A metrics
      return {
        keywords: generatedKeywords.map((kw) => ({
          keyword: kw,
          volume: null as any,
          difficulty: null as any,
        })),
      };
    }

    // Step 5: Filter keywords (volume > 200 AND difficulty < 50)
    const filteredKeywords = keywordResults.filter(
      (kw) => kw.volume > 200 && kw.difficulty < 50
    );

    console.log(`[researchKeywordsCallable] Filtered to ${filteredKeywords.length} keywords meeting criteria`);

    // Step 6: Sort by volume (descending) and return top 10
    filteredKeywords.sort((a, b) => b.volume - a.volume);
    const top10 = filteredKeywords.slice(0, 10);

    // If we have fewer than 10, pad with remaining keywords that don't meet criteria (with N/A)
    if (top10.length < 10) {
      const remaining = generatedKeywords
        .filter((kw) => !top10.some((t) => t.keyword === kw))
        .slice(0, 10 - top10.length)
        .map((kw) => ({
          keyword: kw,
          volume: null as any,
          difficulty: null as any,
        }));
      top10.push(...remaining);
    }

    return {
      keywords: top10.map((kw) => ({
        keyword: kw.keyword,
        volume: kw.volume,
        difficulty: kw.difficulty,
      })),
    };
  } catch (error: any) {
    console.error("[researchKeywordsCallable] Error:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to research keywords",
      error.message
    );
  }
});

// Content Wizard: Generate Content Plans for Selected Keywords
export const generateContentPlanCallable = region.runWith({
  timeoutSeconds: 300, // 5 minutes for multiple keywords
  memory: "512MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const { selectedKeywords, tone } = data;

  if (!selectedKeywords || !Array.isArray(selectedKeywords) || selectedKeywords.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with selectedKeywords (array) argument."
    );
  }

  const selectedTone = tone || "Professional";

  try {
    console.log(`[generateContentPlanCallable] Generating content plans for ${selectedKeywords.length} keywords with tone: ${selectedTone}`);

    const contentPlans: Array<{
      keyword: string;
      blogTopic: string;
      blogDescription: string;
      imagePrompt: string;
    }> = [];

    // Process keywords in parallel (batch of 5 to avoid overwhelming API)
    const batchSize = 5;
    for (let i = 0; i < selectedKeywords.length; i += batchSize) {
      const batch = selectedKeywords.slice(i, i + batchSize);

      const batchPromises = batch.map(async (keyword: string) => {
        try {
          const planPrompt = `Generate a content plan for a blog post about "${keyword}".

Tone: ${selectedTone}

Return ONLY valid JSON:
{
  "blogTopic": "Catchy, engaging blog title (under 60 chars, includes keyword)",
  "blogDescription": "Brief meta description of what the blog will cover (max 50 words)",
  "imagePrompt": "Detailed prompt for DALL-E image generation (describe the visual style and content)"
}`;

          const planContent = await callGeminiAPI(planPrompt, 1000);
          let jsonString = planContent.trim();

          // Remove markdown code blocks if present
          if (jsonString.startsWith("```")) {
            const firstNewline = jsonString.indexOf("\n");
            if (firstNewline !== -1) {
              const jsonStart = firstNewline + 1;
              const lastCodeBlock = jsonString.lastIndexOf("```");
              if (lastCodeBlock > jsonStart) {
                jsonString = jsonString.substring(jsonStart, lastCodeBlock).trim();
              } else {
                jsonString = jsonString.substring(jsonStart).trim();
              }
            }
          }

          // Extract JSON
          if (!jsonString.startsWith("{")) {
            const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              jsonString = jsonMatch[0];
            }
          }

          const planData = JSON.parse(jsonString);

          return {
            keyword,
            blogTopic: planData.blogTopic || `Complete Guide to ${keyword}`,
            blogDescription: planData.blogDescription || `A comprehensive guide about ${keyword}.`,
            imagePrompt: planData.imagePrompt || `Professional image representing ${keyword}, modern and clean design`,
          };
        } catch (error: any) {
          console.error(`[generateContentPlanCallable] Error generating plan for "${keyword}":`, error);
          // Return fallback data if generation fails
          return {
            keyword,
            blogTopic: `Complete Guide to ${keyword}`,
            blogDescription: `A comprehensive guide covering all aspects of ${keyword}, including best practices and expert recommendations.`,
            imagePrompt: `Professional image representing ${keyword}, modern and clean design`,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      contentPlans.push(...batchResults);

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < selectedKeywords.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`[generateContentPlanCallable] ✅ Generated ${contentPlans.length} content plans`);

    return {
      contentPlans,
    };
  } catch (error: any) {
    console.error("[generateContentPlanCallable] Error:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate content plans",
      error.message
    );
  }
});

export const generateBlogPost = region.runWith({
  timeoutSeconds: 60,
  memory: "512MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const {keyword, siteContext, internalLinks, externalLinks = [], wordCount} = data;

  const systemPrompt = `You are an expert content writer creating blog posts for "${siteContext.name}".

BRAND CONTEXT:
- Industry: ${siteContext.industry}
- Target Audience: ${siteContext.targetAudience}
- Brand Voice: ${siteContext.brandVoice}
- Tone: ${siteContext.tonePreferences.join(", ")}
- Content Goals: ${siteContext.contentGoals}
- Restrictions: ${siteContext.contentRestrictions || "None"}

HUMANIZATION RULES (CRITICAL):
1. Write naturally and conversationally - as a human expert would
2. Vary sentence length (mix short punchy sentences with longer detailed ones)
3. Use contractions (don't, can't, you'll) to sound natural
4. Include rhetorical questions to engage readers
5. Use transitional phrases organically
6. Add personal touches and examples
7. Avoid AI-sounding phrases like "delve into", "in conclusion", "it's important to note", "in today's digital landscape"
8. Use active voice primarily (at least 80% of sentences)
9. Include specific, concrete examples rather than generic statements
10. Show personality - be enthusiastic, curious, or thoughtful where appropriate

SEO BEST PRACTICES:
- Include keyword naturally in title, first paragraph, and 2-3 subheadings
- Use H2 and H3 tags for structure
- Write compelling meta description (155 characters)
- Include related keywords naturally
- Optimize for featured snippets with clear answers

STRUCTURE:
1. Engaging title (under 60 characters, includes keyword)
2. Meta description (exactly 155 characters)
3. Hook introduction (problem + empathy + solution preview)
4. Body with H2/H3 subheadings
5. Practical examples and actionable insights
6. Conclusion with clear call-to-action

OUTPUT FORMAT: JSON
{
  "title": "...",
  "metaDescription": "...",
  "content": "... (HTML formatted)",
  "excerpt": "..."
}`;

  const userPrompt = `Create a ${wordCount}-word blog post about "${keyword}".

INTERNAL LINKING OPPORTUNITIES:
${internalLinks.slice(0, 5).map((link: string, i: number) => `${i + 1}. ${link}`).join("\n")}

EXTERNAL LINKS TO REFERENCE:
${externalLinks.length > 0 ? formatExternalLinksForPrompt(externalLinks) : "No external links provided"}

Requirements:
- Naturally include 2-4 internal links to the URLs provided
- Link to 2-3 of the external sources where they support key claims or add credibility (use <a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>)
- Target word count: ${wordCount} words
- Make it engaging, informative, and SEO-optimized
- Sound completely human-written, not AI-generated
- Include specific examples and actionable advice

Return ONLY valid JSON with no additional text.`;

  try {
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const content = await callGeminiAPI(fullPrompt, 2000);

    // Extract JSON - handle markdown code blocks
    let jsonString = content.trim();

    // Remove markdown code blocks if present
    if (jsonString.startsWith("```")) {
      const firstNewline = jsonString.indexOf("\n");
      if (firstNewline !== -1) {
        const afterMarker = jsonString.substring(firstNewline + 1);
        const lastCodeBlock = afterMarker.lastIndexOf("```");
        if (lastCodeBlock > 0) {
          jsonString = afterMarker.substring(0, lastCodeBlock).trim();
        } else {
          jsonString = afterMarker.trim();
        }
      } else {
        const jsonStart = jsonString.indexOf("{");
        if (jsonStart > 0) {
          jsonString = jsonString.substring(jsonStart).trim();
        } else {
          jsonString = jsonString.substring(3).trim();
        }
      }
    }

    // Try regex first, then fallback to brace matching
    let jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const firstBrace = jsonString.indexOf("{");
      const lastBrace = jsonString.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonString = jsonString.substring(firstBrace, lastBrace + 1);
        jsonMatch = [jsonString];
      }
    }

    if (!jsonMatch) throw new Error("Invalid AI response format: No JSON found");

    return {blogData: JSON.parse(jsonMatch[0])};
  } catch (error: any) {
    console.error("Error generating blog post:", error);
    throw new functions.https.HttpsError("internal", "Failed to generate blog post", error.message);
  }
});

// Queue blog generation job (returns immediately)
export const queueBlogGeneration = region.runWith({
  timeoutSeconds: 60,
  memory: "256MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const {keyword, siteId, siteContext, internalLinks, externalLinks = [], wordCount, scheduledDate, userId} = data;

  if (!keyword || !siteId || !siteContext) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
  }

  try {
    // Create a job document in Firestore
    console.log(`[queueBlogGeneration] Creating job for keyword: ${keyword}, siteId: ${siteId}`);
    const jobRef = await admin.firestore().collection("blogGenerationJobs").add({
      userId: userId || context.auth.uid,
      siteId,
      keyword,
      siteContext,
      internalLinks: internalLinks || [],
      externalLinks: externalLinks || [],
      wordCount: wordCount || 2000,
      scheduledDate: scheduledDate ? admin.firestore.Timestamp.fromDate(new Date(scheduledDate)) : null,
      status: "pending",
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    const jobId = jobRef.id;
    console.log(`[queueBlogGeneration] ✅ Job created successfully. Job ID: ${jobId}`);
    console.log(`[queueBlogGeneration] Job ${jobId} - Document path: blogGenerationJobs/${jobId}`);

    // Verify the document was created
    const verifyDoc = await jobRef.get();
    if (verifyDoc.exists) {
      console.log(`[queueBlogGeneration] Job ${jobId} - Document verified in Firestore`);
    } else {
      console.error(`[queueBlogGeneration] Job ${jobId} - ⚠️ WARNING: Document not found after creation!`);
    }

    return {jobId, status: "queued"};
  } catch (error: any) {
    console.error("[queueBlogGeneration] ❌ Error queueing blog generation:", error);
    console.error("[queueBlogGeneration] Error stack:", error.stack);
    throw new functions.https.HttpsError("internal", "Failed to queue blog generation", error.message);
  }
});

// Background function to process blog generation jobs
export const processBlogGeneration = region.runWith({
  timeoutSeconds: 540, // 9 minutes for long blog generation
  memory: "1GB",
}).firestore
  .document("blogGenerationJobs/{jobId}")
  .onCreate(async (snap, context) => {
    const jobId = context.params.jobId;
    console.log(`[processBlogGeneration] ===== FUNCTION TRIGGERED ===== Job ID: ${jobId}`);
    console.log(`[processBlogGeneration] Job ${jobId} - Event context:`, JSON.stringify({
      eventId: context.eventId,
      timestamp: context.timestamp,
      params: context.params,
    }));

    const jobData = snap.data();
    console.log(`[processBlogGeneration] Job ${jobId} - Job data received. Status: ${jobData?.status || "MISSING"}`);
    console.log(`[processBlogGeneration] Job ${jobId} - Job data keys:`, jobData ? Object.keys(jobData) : "NO DATA");

    // Only process if status is pending
    if (jobData.status !== "pending") {
      console.log(`[processBlogGeneration] Job ${jobId} skipped - status is ${jobData.status}, not pending`);
      return;
    }

    try {
      // Mark as processing
      await snap.ref.update({
        status: "processing",
        updatedAt: admin.firestore.Timestamp.now(),
      });

      console.log(`[processBlogGeneration] Job ${jobId} marked as processing`);

      const {keyword, siteContext, internalLinks, externalLinks = [], wordCount, siteId, userId, scheduledDate} = jobData;

      console.log(`[processBlogGeneration] Job ${jobId} - Keyword: ${keyword}, SiteId: ${siteId}, WordCount: ${wordCount}`);

      // Get existing blog to extract semantic keywords and competitor insights
      // Try to find blog by generationJobId first, then by keyword and siteId if not found
      let existingBlogQuery = await admin.firestore().collection("blogs")
        .where("generationJobId", "==", jobId)
        .limit(1)
        .get();

      if (existingBlogQuery.empty) {
        // If not found by jobId, try to find by keyword and siteId (for manually triggered generation)
        existingBlogQuery = await admin.firestore().collection("blogs")
          .where("siteId", "==", siteId)
          .where("keyword", "==", keyword)
          .where("status", "in", ["planned", "pending"])
          .orderBy("createdAt", "desc")
          .limit(1)
          .get();
      }

      const existingBlog = existingBlogQuery.empty ? null : existingBlogQuery.docs[0].data();
      const semanticKeywords = existingBlog?.semanticKeywords || [];
      const competitorInsights = existingBlog?.competitorInsights;
      const contentClusterId = existingBlog?.contentClusterId;
      const isPillarPost = existingBlog?.isPillarPost;

      // Calculate max_tokens based on word count (roughly 1.3 tokens per word)
      const maxTokens = Math.min(Math.ceil((wordCount || 3000) * 1.3), 8000);

      // Build semantic keywords instruction
      const semanticKeywordsText = semanticKeywords.length > 0 ?
        `\nSEMANTIC KEYWORDS TO INCLUDE NATURALLY:\n${semanticKeywords.map((k: string, i: number) => `${i + 1}. ${k}`).join("\n")}\n` :
        "";

      // Build competitor insights instruction
      const competitorInsightsText = competitorInsights ?
        `\nCOMPETITOR ANALYSIS INSIGHTS:\n- Average word count of top results: ${competitorInsights.avgWordCount || 2000} words\n- Common headings used: ${(competitorInsights.commonHeadings || []).slice(0, 5).join(", ")}\n- Content structure: ${competitorInsights.contentStructure || "Standard blog post"}\n\nMatch or exceed competitor quality and structure.\n` :
        "";

      // Initialize prompts if they don't exist yet (do this first)
      try {
        await initializePrompts(siteId, siteContext);
        console.log(`[processBlogGeneration] Job ${jobId} - Prompts initialized/verified for site ${siteId}`);
      } catch (initError: any) {
        console.error(`[processBlogGeneration] Job ${jobId} - Error initializing prompts:`, initError);
        // Continue anyway - getPrompts will use defaults
      }

      // Load prompts from Firestore (or use defaults)
      let prompts;
      try {
        prompts = await getPrompts(siteId);
        console.log(`[processBlogGeneration] Job ${jobId} - Loaded prompts version ${prompts.version} for site ${siteId}`);
      } catch (promptError: any) {
        console.error(`[processBlogGeneration] Job ${jobId} - Error loading prompts:`, promptError);
        throw new Error(`Failed to load prompts: ${promptError.message}`);
      }

      // Build system prompt with site context (replace placeholders)
      if (!prompts.blogSystemPrompt) {
        console.error(`[processBlogGeneration] Job ${jobId} - blogSystemPrompt is missing!`);
        throw new Error("blogSystemPrompt is missing from prompts");
      }

      let systemPrompt = prompts.blogSystemPrompt
        .replace(/{industry}/g, siteContext.industry || "General")
        .replace(/{targetAudience}/g, siteContext.targetAudience || "General audience")
        .replace(/{brandVoice}/g, siteContext.brandVoice || "Professional")
        .replace(/{tonePreferences}/g, (siteContext.tonePreferences || ["Professional"]).join(", "))
        .replace(/{contentGoals}/g, siteContext.contentGoals || "Inform and engage")
        .replace(/{contentRestrictions}/g, siteContext.contentRestrictions || "None");

      console.log(`[processBlogGeneration] Job ${jobId} - System prompt length: ${systemPrompt.length} chars`);

      // Add dynamic SEO and structure adjustments
      if (semanticKeywords.length > 0) {
        systemPrompt += "\n- Naturally integrate semantic keywords throughout the content";
      }
      if (competitorInsights?.commonHeadings) {
        systemPrompt += "\n- Consider using similar heading structure to competitors";
      }
      if (contentClusterId && !isPillarPost) {
        systemPrompt += "\n- Include link to related pillar post if relevant";
      }

      // Format internal links with metadata if available
      let internalLinksText = "";
      if (siteContext.sitemapMetadata && siteContext.sitemapMetadata.length > 0) {
        const linksToUse = siteContext.sitemapMetadata.slice(0, 10);
        internalLinksText = linksToUse.map((item: any, i: number) =>
          `${i + 1}. ${item.url} - Title: "${item.title}" | Description: "${item.metaDescription}"`
        ).join("\n");
      } else if (internalLinks && internalLinks.length > 0) {
        internalLinksText = internalLinks.slice(0, 5).map((link: string, i: number) => `${i + 1}. ${link}`).join("\n");
      }

      // Format external links (if provided, otherwise will be searched in generateBlogContent)
      const externalLinksText = (jobData.externalLinks || []).map((link: any, i: number) =>
        `${i + 1}. ${link.title} - ${link.url}${link.snippet ? `\n   ${link.snippet.substring(0, 100)}...` : ""}`
      ).join("\n");

      // Build user prompt from template (replace placeholders)
      if (!prompts.blogUserPromptTemplate) {
        console.error(`[processBlogGeneration] Job ${jobId} - blogUserPromptTemplate is missing!`);
        throw new Error("blogUserPromptTemplate is missing from prompts");
      }

      let userPrompt = prompts.blogUserPromptTemplate
        .replace(/{wordCount}/g, String(wordCount || 3000))
        .replace(/{keyword}/g, keyword)
        .replace(/{semanticKeywordsText}/g, semanticKeywordsText)
        .replace(/{competitorInsightsText}/g, competitorInsightsText)
        .replace(/{internalLinksText}/g, internalLinksText || "No internal links available")
        .replace(/{externalLinksText}/g, externalLinksText || "No external links available");

      console.log(`[processBlogGeneration] Job ${jobId} - User prompt length: ${userPrompt.length} chars`);

      // Add dynamic requirements
      const dynamicRequirements: string[] = [];
      if (competitorInsights?.avgWordCount) {
        dynamicRequirements.push(`- Target word count: ${Math.max(wordCount || 3000, competitorInsights.avgWordCount)} words (match/exceed competitors)`);
      }
      if (semanticKeywords.length > 0) {
        dynamicRequirements.push(`- Naturally include semantic keywords: ${semanticKeywords.join(", ")}`);
      }

      if (dynamicRequirements.length > 0) {
        // Insert dynamic requirements before the final "Return ONLY valid JSON" line
        const requirementsIndex = userPrompt.indexOf("Return ONLY valid JSON");
        if (requirementsIndex > -1) {
          userPrompt = userPrompt.substring(0, requirementsIndex) +
            dynamicRequirements.join("\n") + "\n\n" +
            userPrompt.substring(requirementsIndex);
        }
      }

      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      console.log(`[processBlogGeneration] Job ${jobId} - Calling Gemini API with maxTokens: ${maxTokens}`);
      console.log(`[processBlogGeneration] Job ${jobId} - Prompt length: ${fullPrompt.length} chars`);

      let content: string;
      try {
        content = await callGeminiAPI(fullPrompt, maxTokens);
        console.log(`[processBlogGeneration] Job ${jobId} - Gemini API call successful. Response length: ${content.length} chars`);
      } catch (geminiError: any) {
        console.error(`[processBlogGeneration] Job ${jobId} - Gemini API call failed:`, geminiError);
        throw new Error(`Gemini API call failed: ${geminiError.message || geminiError}`);
      }

      // Log the raw response for debugging
      console.log(`[processBlogGeneration] Job ${jobId} - Raw AI response length: ${content.length} chars`);
      console.log(`[processBlogGeneration] Job ${jobId} - Raw AI response (first 500 chars):`, content.substring(0, 500));

      // Extract JSON - handle markdown code blocks, plain JSON, and any other format
      let jsonString = content.trim();

      // Remove markdown code blocks if present (handle ```json, ```, etc.)
      if (jsonString.startsWith("```")) {
        // Find the first newline after the opening ```
        const firstNewline = jsonString.indexOf("\n");
        if (firstNewline !== -1) {
          // Get everything after the first newline
          const afterMarker = jsonString.substring(firstNewline + 1);
          // Find the closing ``` (could be at the end or somewhere in the middle)
          const lastCodeBlock = afterMarker.lastIndexOf("```");
          if (lastCodeBlock > 0) {
            // Extract content between the markers
            jsonString = afterMarker.substring(0, lastCodeBlock).trim();
          } else {
            // No closing marker, just take everything after the first newline
            jsonString = afterMarker.trim();
          }
        } else {
          // No newline after ```, skip past the marker (handle cases like ```json{...})
          // Try to find where the actual JSON starts
          const jsonStart = jsonString.indexOf("{");
          if (jsonStart > 0) {
            jsonString = jsonString.substring(jsonStart).trim();
          } else {
            // Fallback: just skip past ```
            jsonString = jsonString.substring(3).trim();
          }
        }
      }

      // Try to find JSON object using regex (greedy match)
      let jsonMatch = jsonString.match(/\{[\s\S]*\}/);

      // If no match, try a more lenient approach - find first { and last }
      if (!jsonMatch) {
        const firstBrace = jsonString.indexOf("{");
        const lastBrace = jsonString.lastIndexOf("}");
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          jsonString = jsonString.substring(firstBrace, lastBrace + 1);
          jsonMatch = [jsonString];
        }
      }

      if (!jsonMatch || !jsonMatch[0]) {
        console.error(`[processBlogGeneration] Job ${jobId} - No JSON object found in response`);
        console.error(`[processBlogGeneration] Job ${jobId} - After markdown stripping (first 500 chars):`, jsonString.substring(0, 500));
        console.error(`[processBlogGeneration] Job ${jobId} - Full response preview:`, content.substring(0, 2000));
        throw new Error("Invalid AI response format: No JSON found");
      }

      jsonString = jsonMatch[0];
      console.log(`[processBlogGeneration] Job ${jobId} - Extracted JSON, length: ${jsonString.length} chars`);
      console.log(`[processBlogGeneration] Job ${jobId} - Extracted JSON (first 200 chars):`, jsonString.substring(0, 200));

      let blogData;
      try {
        console.log(`[processBlogGeneration] Job ${jobId} - Parsing JSON (length: ${jsonString.length} chars)`);
        blogData = JSON.parse(jsonString);
        console.log(`[processBlogGeneration] Job ${jobId} - ✅ JSON parsed successfully`);
        console.log(`[processBlogGeneration] Job ${jobId} - Title: ${blogData.title || "MISSING"}`);
        console.log(`[processBlogGeneration] Job ${jobId} - Content length: ${blogData.content ? blogData.content.length : 0} chars`);
        console.log(`[processBlogGeneration] Job ${jobId} - Blog data keys:`, Object.keys(blogData));

        // Validate required fields
        if (!blogData.title) {
          console.error(`[processBlogGeneration] Job ${jobId} - ❌ Missing title`);
          throw new Error("Missing title in AI response");
        }

        // Check for content in various possible field names
        if (!blogData.content || blogData.content.trim().length === 0) {
          console.warn(`[processBlogGeneration] Job ${jobId} - Content field is empty, checking alternatives...`);
          blogData.content = blogData.body || blogData.article || blogData.text || blogData.html || "";
        }

        if (!blogData.content || blogData.content.trim().length === 0) {
          console.error(`[processBlogGeneration] Job ${jobId} - ❌ Content is empty or missing`);
          console.error(`[processBlogGeneration] Job ${jobId} - Available fields:`, Object.keys(blogData));
          console.error(`[processBlogGeneration] Job ${jobId} - Full blogData:`, JSON.stringify(blogData, null, 2).substring(0, 1000));
          console.error(`[processBlogGeneration] Job ${jobId} - Full blogData:`, JSON.stringify(blogData, null, 2));
          console.error(`[processBlogGeneration] Job ${jobId} - Raw AI response (first 2000 chars):`, content.substring(0, 2000));
          console.error(`[processBlogGeneration] Job ${jobId} - Full raw AI response:`, content);

          // Try to extract content from alternative field names
          const alternativeContent = blogData.body || blogData.article || blogData.text || blogData.html || "";
          if (alternativeContent && alternativeContent.trim().length > 0) {
            console.log(`[processBlogGeneration] Job ${jobId} - Found content in alternative field, using it`);
            blogData.content = alternativeContent;
          } else {
            throw new Error("Missing or empty content in AI response - no content found in any field");
          }
        }

        // Additional validation - ensure content is substantial
        if (blogData.content.trim().length < 500) {
          console.warn(`[processBlogGeneration] Job ${jobId} - Content is very short (${blogData.content.length} chars), but proceeding`);
        }
        console.log(`[processBlogGeneration] Job ${jobId} - Validation passed. Title: "${blogData.title}", Content length: ${blogData.content.length}`);
      } catch (parseError: any) {
        console.error(`[processBlogGeneration] Job ${jobId} - Failed to parse JSON. Attempted to parse:`, jsonString.substring(0, 500));
        console.error(`[processBlogGeneration] Job ${jobId} - Parse error:`, parseError.message);
        console.error(`[processBlogGeneration] Job ${jobId} - Parse error stack:`, parseError.stack);
        console.error(`[processBlogGeneration] Job ${jobId} - Full raw response:`, content);
        throw new Error(`Invalid AI response format: ${parseError.message}`);
      }

      // Find the placeholder blog document by generationJobId (before image generation to get imagePrompt)
      // Find existing blog by generationJobId or by keyword+siteId (for manually triggered generation)
      let blogsQuery = await admin.firestore().collection("blogs")
        .where("generationJobId", "==", jobId)
        .limit(1)
        .get();

      if (blogsQuery.empty) {
        // If not found by jobId, try to find by keyword and siteId (for manually triggered generation)
        blogsQuery = await admin.firestore().collection("blogs")
          .where("siteId", "==", siteId)
          .where("keyword", "==", keyword)
          .where("status", "in", ["planned", "pending"])
          .limit(1)
          .get();
      }

      // Get imagePrompt from existing blog if available
      let existingImagePrompt: string | undefined;
      if (!blogsQuery.empty) {
        existingImagePrompt = blogsQuery.docs[0].data()?.imagePrompt;
      }

      // Generate featured image (optional - gracefully handle if API key is missing)
      // Use imagePrompt from content plan if available, otherwise generate one
      let featuredImageUrl = "";
      try {
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (openaiApiKey && openaiApiKey !== "your_openai_api_key") {
          let imagePrompt = existingImagePrompt;
          if (!imagePrompt) {
            // Load image prompt template from Firestore
            const prompts = await getPrompts(siteId);
            imagePrompt = prompts.imagePromptTemplate
              .replace(/{blogTitle}/g, blogData.title || keyword)
              .replace(/{blogSummary}/g, blogData.excerpt || `A blog post about ${keyword}`)
              .replace(/{industry}/g, siteContext.industry || "General")
              .replace(/{style}/g, "modern professional");
          }

          const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${openaiApiKey}`,
            },
            body: JSON.stringify({
              model: "dall-e-3",
              prompt: imagePrompt,
              n: 1,
              size: "1792x1024",
              quality: "standard",
            }),
          });

          if (imageResponse.ok) {
            const imageData = await imageResponse.json();
            featuredImageUrl = imageData.data[0].url;
            console.log(`Generated featured image for blog: ${featuredImageUrl}`);
          }
        }
      } catch (imageError: any) {
        console.warn("Failed to generate featured image (continuing without it):", imageError.message);
        // Continue without image - not critical
      }

      let blogRef: admin.firestore.DocumentReference;

      if (!blogsQuery.empty) {
        console.log(`[processBlogGeneration] Job ${jobId} - Found existing blog to update: ${blogsQuery.docs[0].id}`);
        // Update existing placeholder or planned blog
        blogRef = blogsQuery.docs[0].ref;
        const existingBlog = blogsQuery.docs[0].data();
        // Get site to check auto-approval setting
        const siteDoc = await admin.firestore().collection("sites").doc(siteId).get();
        const siteData = siteDoc.data();
        const autoApprove = siteData?.autoApproveBlogs === true;
        console.log(`[processBlogGeneration] Job ${jobId} - Auto-approve setting: ${autoApprove}`);

        // Determine final status
        let finalStatus = "pending";
        if (existingBlog.status === "planned") {
          // If it was planned and not manually edited, use auto-approval setting
          if (autoApprove && !existingBlog.manuallyEdited) {
            finalStatus = "approved";
          } else {
            finalStatus = "pending";
          }
        }

        // If blog was manually edited, always set to pending (requires manual approval)
        if (existingBlog.manuallyEdited) {
          finalStatus = "pending";
        }

        // Get semantic keywords and cluster info from existing blog
        const semanticKeywords = existingBlog.semanticKeywords || [];
        const contentClusterId = existingBlog.contentClusterId;
        const isPillarPost = existingBlog.isPillarPost;

        // Enhance content with semantic keywords and cluster links if needed
        let enhancedContent = blogData.content || "";

        // Validate content exists before proceeding
        if (!enhancedContent || enhancedContent.trim().length === 0) {
          console.error(`[processBlogGeneration] Job ${jobId} - ERROR: Content is empty when trying to save!`);
          console.error(`[processBlogGeneration] Job ${jobId} - blogData:`, JSON.stringify(blogData, null, 2));
          throw new Error("Content is empty - cannot save blog without content");
        }

        // Add semantic keywords naturally (AI should already do this, but we can reinforce)
        if (semanticKeywords.length > 0) {
          // Content already includes semantic keywords from AI generation
          // Just ensure they're present
        }

        // Add cluster-based internal links if this is a supporting post
        if (contentClusterId && !isPillarPost) {
          // Find pillar post in same cluster
          const clusterQuery = await admin.firestore().collection("blogs")
            .where("siteId", "==", siteId)
            .where("contentClusterId", "==", contentClusterId)
            .where("isPillarPost", "==", true)
            .where("status", "in", ["published", "approved", "scheduled"])
            .limit(1)
            .get();

          if (!clusterQuery.empty) {
            const pillarPost = clusterQuery.docs[0].data();
            // Add link to pillar post in conclusion (AI should handle this, but we ensure it)
            const pillarLink = `<p><a href="${pillarPost.wordpressPostUrl || "#"}" class="internal-link">Learn more about ${pillarPost.keyword}</a></p>`;
            if (!enhancedContent.includes(pillarLink) && !enhancedContent.includes(pillarPost.keyword)) {
              enhancedContent = enhancedContent.replace(/<\/body>/i, `${pillarLink}</body>`);
            }
          }
        }

        // Final validation before saving
        if (!enhancedContent || enhancedContent.trim().length === 0) {
          console.error(`[processBlogGeneration] Job ${jobId} - CRITICAL: Content is empty before saving to Firestore!`);
          throw new Error("Cannot save blog: content is empty");
        }

        console.log(`[processBlogGeneration] Job ${jobId} - Saving blog with content length: ${enhancedContent.length} chars`);

        await blogRef.update({
          title: blogData.title,
          metaDescription: blogData.metaDescription,
          content: enhancedContent,
          excerpt: blogData.excerpt || blogData.metaDescription || "",
          featuredImageUrl: featuredImageUrl || "",
          wordCount: wordCount || 3000,
          status: finalStatus,
          updatedAt: admin.firestore.Timestamp.now(),
        });

        console.log(`[processBlogGeneration] Job ${jobId} - Blog updated successfully with content`);
      } else {
        console.log(`[processBlogGeneration] Job ${jobId} - No existing blog found, creating new blog`);

        // Validate content before creating
        if (!blogData.content || blogData.content.trim().length === 0) {
          console.error(`[processBlogGeneration] Job ${jobId} - CRITICAL: Content is empty when creating new blog!`);
          console.error(`[processBlogGeneration] Job ${jobId} - blogData:`, JSON.stringify(blogData, null, 2));
          throw new Error("Cannot create blog: content is empty");
        }

        console.log(`[processBlogGeneration] Job ${jobId} - Creating new blog with content length: ${blogData.content.length} chars`);

        // Create new blog if placeholder not found
        blogRef = await admin.firestore().collection("blogs").add({
          siteId,
          userId: userId || context.auth?.uid,
          title: blogData.title,
          metaDescription: blogData.metaDescription,
          content: blogData.content,
          excerpt: blogData.excerpt || blogData.metaDescription || "",
          keyword,
          relatedKeywords: [],
          featuredImageUrl: featuredImageUrl || "",
          internalLinks: (internalLinks || []).map((url: string) => ({url, anchorText: ""})),
          externalLinks: (externalLinks || []).map((link: any) => ({
            url: link.url,
            anchorText: link.title,
            type: "external" as const,
          })),
          wordCount: wordCount || 2000,
          status: "pending",
          scheduledDate: scheduledDate || admin.firestore.Timestamp.fromDate(new Date()),
          publishedDate: null,
          wordpressPostId: null,
          wordpressPostUrl: null,
          trackingScriptId: "",
          trackingScript: "",
          totalViews: 0,
          uniqueVisitors: 0,
          avgTimeOnPage: 0,
          avgScrollDepth: 0,
          bounceRate: 0,
          lastViewedAt: null,
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      // Mark job as completed
      await snap.ref.update({
        status: "completed",
        blogId: blogRef.id,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Verify the blog was saved correctly
      const savedBlog = await blogRef.get();
      const savedData = savedBlog.data();
      console.log(`[processBlogGeneration] Job ${jobId} - ✅ Successfully generated blog ${blogRef.id}`);
      console.log(`[processBlogGeneration] Job ${jobId} - Blog title: "${blogData.title}"`);
      console.log(`[processBlogGeneration] Job ${jobId} - Blog content length: ${blogData.content.length} chars`);
      console.log(`[processBlogGeneration] Job ${jobId} - Saved blog content length: ${savedData?.content?.length || 0} chars`);

      if (!savedData?.content || savedData.content.trim().length === 0) {
        console.error(`[processBlogGeneration] Job ${jobId} - ⚠️ WARNING: Blog was saved but content is empty in Firestore!`);
        console.error(`[processBlogGeneration] Job ${jobId} - Saved blog data:`, JSON.stringify(savedData, null, 2));
      }
    } catch (error: any) {
      console.error(`[processBlogGeneration] Job ${jobId} - ❌ Error processing blog generation:`, error);
      console.error(`[processBlogGeneration] Job ${jobId} - Error message:`, error.message);
      console.error(`[processBlogGeneration] Job ${jobId} - Error stack:`, error.stack);
      await snap.ref.update({
        status: "failed",
        error: error.message || "Unknown error",
        errorStack: error.stack,
        updatedAt: admin.firestore.Timestamp.now(),
      });
    }
  });

/**
 * Generate blog content from a calendar entry
 * This is a modular function that can be used internally or called via HTTP
 * @param {Object} calendarEntry - Object containing keyword, blogTopic, blogDescription, imagePrompt, and targetUrl
 * @return {Promise<string>} The generated HTML content for the blog post
 */
export async function generateBlogContent(calendarEntry: {
  keyword: string;
  blogTopic: string;
  blogDescription: string;
  imagePrompt?: string;
  targetUrl?: string;
  internalLinks?: string[];
  externalLinks?: Array<{ title: string; url: string; snippet?: string }>;
  siteId?: string; // Optional: if provided, will fetch availableLinks from site doc
  calendarId?: string; // Optional: if provided, will fetch pillar/cluster relationships
}): Promise<{ htmlContent: string; blogTitle: string; blogDescription: string }> {
  const { keyword, blogTopic, blogDescription, targetUrl, internalLinks = [], externalLinks: passedExternalLinks = [], siteId, calendarId } = calendarEntry;

  if (!keyword || !blogTopic || !blogDescription) {
    throw new Error("Missing required fields: keyword, blogTopic, and blogDescription are required");
  }

  // TRIAL LIMIT CHECK: Enforce 3 blog limit for trial users
  if (siteId) {
    try {
      const siteDoc = await admin.firestore().collection("sites").doc(siteId).get();
      if (siteDoc.exists) {
        const siteData = siteDoc.data();
        const agencyId = siteData?.agencyId;

        if (agencyId) {
          const agencyDoc = await admin.firestore().collection("agencies").doc(agencyId).get();
          if (agencyDoc.exists) {
            const agencyData = agencyDoc.data();
            const subscriptionStatus = agencyData?.subscriptionStatus;

            // Only enforce limit for trial users
            if (subscriptionStatus === "trial") {
              console.log(`[generateBlogContent] 🔒 Trial user detected, checking blog count for agency ${agencyId}`);

              // Count all generated/published blogs across all sites for this agency
              // Query all sites for this agency
              const sitesSnapshot = await admin.firestore()
                .collection("sites")
                .where("agencyId", "==", agencyId)
                .get();

              let totalBlogCount = 0;

              // For each site, count contentCalendar entries with generatedContent or published status
              for (const siteDocSnapshot of sitesSnapshot.docs) {
                const siteIdForQuery = siteDocSnapshot.id;
                const calendarRef = admin.firestore()
                  .collection("sites")
                  .doc(siteIdForQuery)
                  .collection("contentCalendar");

                // Count entries that have been generated or published
                // Query for statuses that indicate content was generated:
                // - 'pending_approval': Content generated, awaiting approval
                // - 'approved': Content generated and approved
                // - 'published': Content published to WordPress
                // Also check for entries with generatedContent field (for 'error' status that might have content)
                const statusesToCheck = ["pending_approval", "approved", "published"];
                const queries = statusesToCheck.map((status) =>
                  calendarRef.where("status", "==", status)
                );

                // Also get all entries and check for generatedContent field (for edge cases)
                const allEntriesQuery = calendarRef.limit(1000); // Reasonable limit

                const [pendingSnapshot, approvedSnapshot, publishedSnapshot, allEntriesSnapshot] = await Promise.all([
                  queries[0].get(),
                  queries[1].get(),
                  queries[2].get(),
                  allEntriesQuery.get(),
                ]);

                // Use a Set to avoid double-counting
                const uniqueIds = new Set<string>();
                pendingSnapshot.docs.forEach((doc) => uniqueIds.add(doc.id));
                approvedSnapshot.docs.forEach((doc) => uniqueIds.add(doc.id));
                publishedSnapshot.docs.forEach((doc) => uniqueIds.add(doc.id));

                // Also count entries with generatedContent field (even if status is 'error' or 'scheduled')
                allEntriesSnapshot.docs.forEach((doc) => {
                  const data = doc.data();
                  if (data.generatedContent && !uniqueIds.has(doc.id)) {
                    uniqueIds.add(doc.id);
                  }
                });

                totalBlogCount += uniqueIds.size;
              }

              console.log(`[generateBlogContent] 📊 Trial user has generated ${totalBlogCount} blogs (limit: 3)`);

              if (totalBlogCount >= 3) {
                throw new Error(
                  "TRIAL_LIMIT_REACHED: You have used your 3 free blogs. Please wait for your full subscription to activate in 7 days, or upgrade now."
                );
              }
            } else if (subscriptionStatus === "active" || subscriptionStatus === "agency_comp" || subscriptionStatus === "appowner") {
              // Bypass check for active, agency_comp, or appowner users
              console.log(`[generateBlogContent] ✅ Subscription status: ${subscriptionStatus}, skipping trial limit check`);
            }
          }
        }
      }
    } catch (error: any) {
      // If it's our trial limit error, re-throw it
      if (error.message && error.message.includes("TRIAL_LIMIT_REACHED")) {
        throw error;
      }
      // Otherwise, log warning but continue (don't block generation if check fails)
      console.warn(`[generateBlogContent] ⚠️ Failed to check trial limit: ${error.message}`);
    }
  }

  // Use targetUrl as siteUrl for the prompt
  const siteUrl = targetUrl || "";

  // Step 1: Pre-computation - Fetch availableLinks and offerDetails from site document if siteId is provided
  let availableLinks: string[] = [];
  let offerDetails: string | undefined;
  let wordpressSiteUrl: string | undefined;
  let targetCountry: string | undefined;
  let targetCity: string | undefined;
  if (siteId) {
    try {
      const siteDoc = await admin.firestore().collection("sites").doc(siteId).get();
      if (siteDoc.exists) {
        const siteData = siteDoc.data();
        if (siteData) {
          if (siteData.availableLinks && Array.isArray(siteData.availableLinks)) {
            availableLinks = siteData.availableLinks;
            console.log(`[generateBlogContent] ✅ Fetched ${availableLinks.length} available links from site document`);
          }
          if (siteData.offerDetails && typeof siteData.offerDetails === "string" && siteData.offerDetails.trim().length > 0) {
            offerDetails = siteData.offerDetails.trim();
            console.log("[generateBlogContent] ✅ Fetched offer details from site document");
          }
          // Get WordPress URL for constructing internal links
          wordpressSiteUrl = (siteData.wordpressUrl || siteData.wordpressApiUrl || siteData.url) as string | undefined;
          if (wordpressSiteUrl) {
            // Normalize: remove /wp-json if present, remove trailing slash
            wordpressSiteUrl = wordpressSiteUrl.replace(/\/wp-json\/?$/, "").replace(/\/$/, "");
          }
          // Extract location data for dialect and local context
          targetCountry = siteData.targetCountry as string | undefined;
          targetCity = siteData.targetCity as string | undefined;
          if (targetCountry || targetCity) {
            console.log(`[generateBlogContent] ✅ Found location context: ${targetCity || ""}, ${targetCountry || ""}`);
          }
        }
      }
    } catch (error: any) {
      console.warn(`[generateBlogContent] ⚠️ Failed to fetch site document data: ${error.message}`);
      // Continue without site data - not critical
    }
  }

  // Step 2: Pre-computation - Fetch pillar/cluster relationships if calendarId is provided
  let pillarLinkContext = "";
  let clusterLinksContext = "";
  if (siteId && calendarId) {
    try {
      const calendarRef = admin.firestore()
        .collection("sites")
        .doc(siteId)
        .collection("contentCalendar")
        .doc(calendarId);
      const calendarDoc = await calendarRef.get();

      if (calendarDoc.exists) {
        const calendarData = calendarDoc.data();
        if (calendarData) {
          // Check if this is a cluster post (has parentPillarId)
          if (calendarData.parentPillarId) {
            const pillarId = calendarData.parentPillarId;
            const pillarRef = admin.firestore()
              .collection("sites")
              .doc(siteId)
              .collection("contentCalendar")
              .doc(pillarId);
            const pillarDoc = await pillarRef.get();

            if (pillarDoc.exists) {
              const pillarData = pillarDoc.data();
              const pillarTitle = pillarData?.blogTopic || pillarData?.blogTitle || "main guide";
              // Construct pillar URL - we'll use the WordPress post URL if available, otherwise construct from title
              let pillarUrl = pillarData?.wordpressPostUrl;
              if (!pillarUrl && pillarData?.blogTopic) {
                // Fallback: construct a URL from the title (slug format)
                const slug = pillarData.blogTopic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                const baseUrl = wordpressSiteUrl || siteUrl || "";
                pillarUrl = baseUrl ? `${baseUrl}/${slug}` : `/${slug}`;
              }

              if (pillarUrl) {
                pillarLinkContext = `\n\nMANDATORY LINK: You are writing a supporting article. You MUST include a contextually relevant link back to the main pillar page using the anchor text '${pillarTitle}'. The URL is '${pillarUrl}'. Place this link naturally within the content, ideally in the introduction or conclusion section.`;
                console.log(`[generateBlogContent] ✅ Found parent pillar: ${pillarTitle}`);
              }
            }
          }

          // Check if this is a pillar post (has childClusterIds)
          if (calendarData.childClusterIds && Array.isArray(calendarData.childClusterIds) && calendarData.childClusterIds.length > 0) {
            const clusterRefs = calendarData.childClusterIds.map((clusterId: string) =>
              admin.firestore()
                .collection("sites")
                .doc(siteId)
                .collection("contentCalendar")
                .doc(clusterId)
            );

            const clusterDocs = await Promise.all(clusterRefs.map((ref) => ref.get()));
            const clusterLinks: string[] = [];

            clusterDocs.forEach((doc, index) => {
              if (doc.exists) {
                const clusterData = doc.data();
                const clusterTitle = clusterData?.blogTopic || clusterData?.blogTitle || `sub-topic ${index + 1}`;
                let clusterUrl = clusterData?.wordpressPostUrl;
                if (!clusterUrl && clusterData?.blogTopic) {
                  // Fallback: construct a URL from the title
                  const slug = clusterData.blogTopic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                  const baseUrl = wordpressSiteUrl || siteUrl || "";
                  clusterUrl = baseUrl ? `${baseUrl}/${slug}` : `/${slug}`;
                }

                if (clusterUrl) {
                  clusterLinks.push(`- '${clusterTitle}' (URL: ${clusterUrl})`);
                }
              }
            });

            if (clusterLinks.length > 0) {
              clusterLinksContext = `\n\nMANDATORY LINKS: You are writing the main pillar page. You MUST mention and link to these sub-topics to guide the reader deeper:\n${clusterLinks.join("\n")}\n\nWeave these links naturally into the content. Use descriptive anchor text that matches each sub-topic's title. Place them contextually where they add value to the reader's journey.`;
              console.log(`[generateBlogContent] ✅ Found ${clusterLinks.length} child clusters to link to`);
            }
          }
        }
      }
    } catch (error: any) {
      console.warn(`[generateBlogContent] ⚠️ Failed to fetch pillar/cluster relationships: ${error.message}`);
      // Continue without pillar/cluster links - not critical
    }
  }

  // Step 3: Pre-computation - Search for external links for authoritative sources
  let externalLinks: Array<{ title: string; url: string; snippet?: string }> = passedExternalLinks;
  try {
    // If no external links provided, search for them
    if (externalLinks.length === 0) {
      // Try to get industry from site data if available
      let siteContextStr: string | undefined = undefined;
      if (siteId) {
        try {
          const siteDoc = await admin.firestore().collection("sites").doc(siteId).get();
          if (siteDoc.exists) {
            const siteData = siteDoc.data();
            const industry = siteData?.industry || siteData?.niche;
            if (industry) {
              siteContextStr = `${industry} industry`;
            }
          }
        } catch (error) {
          // Ignore - continue without context
        }
      }
      externalLinks = await searchExternalLinks(keyword, siteContextStr);
      if (externalLinks.length > 0) {
        console.log(
          `[generateBlogContent] ✅ Found ${externalLinks.length} external links for keyword: ${keyword}`
        );
      }
    } else {
      console.log(
        `[generateBlogContent] Using ${externalLinks.length} provided external links`
      );
    }
  } catch (error: any) {
    console.warn(`[generateBlogContent] ⚠️ Failed to search external links: ${error.message}`);
    // Continue without external links - not critical
  }

  // Determine dialect based on targetCountry
  let dialect = "American English";
  if (targetCountry) {
    const countryLower = targetCountry.toLowerCase();
    if (countryLower === "australia" || countryLower === "united kingdom" || countryLower === "new zealand") {
      dialect = "British English (e.g., 'Colour', 'Optimisation')";
    } else if (countryLower === "united states" || countryLower === "usa" || countryLower === "us") {
      dialect = "American English";
    }
  }

  // Build local context string
  let localContext = "";
  if (targetCity && targetCountry) {
    localContext = `\n\nLOCAL CONTEXT: The business is in ${targetCity}, ${targetCountry}. When mentioning prices, imply the local currency. When giving examples, try to use locally relevant references if possible.`;
  } else if (targetCountry) {
    localContext = `\n\nLOCAL CONTEXT: The business is in ${targetCountry}. When mentioning prices, imply the local currency. When giving examples, try to use locally relevant references if possible.`;
  }

  // Build the prompt for Gemini using the new two-part structure
  const personalityRules = `ALWAYS replace em dashes with commas
DON'T write in a short form list. Give me proper answers to questions.
SHOULD write in active voice.
SHOULD give practical, specific advice.
SHOULD include data, numbers or concrete examples when possible.
SHOULD speak to the reader using "you" and "your".
AVOID em dashes. Use only commas, periods or semicolons.
AVOID filler phrases.
AVOID metaphors, analogies and cliches.
AVOID Vague or sweeping claims.
AVOID phrases like "in conclusion," "to sum it up" or "closing".
AVOID extra adjectives or adverbs.
AVOID bolding text (Do NOT use ** or __).
OUTPUT should read clean, concise, and how a human naturally writes.
AVOID these words: Accordingly, additionally, arguably, certainly, consequently, hence, however, indeed, moreover, nevertheless, nonetheless, notwithstanding, thus, undoubtedly, adept, commendable.

LANGUAGE RULE: You MUST write in ${dialect}.${localContext}`;

  // Build offer context if offerDetails exists
  const offerContext = offerDetails && offerDetails.trim().length > 0 ?
    `\n\nSPECIAL OFFER: The client has a specific offer you MUST mention in the CTA or Conclusion: "${offerDetails}". Frame this as a high-value opportunity for the reader.` :
    "";

  const contentStructure = `Write a long-form SEO blog post targeting the keyword: "${keyword}".
You are writing for this website: "${siteUrl}" to help build topical authority.

Include real numbers, pricing ranges, and at least one practical example that shows before-and-after impact.
Write like a knowledgeable agency owner speaking directly to a business owner.

STRUCTURE REQUIREMENTS:
1. One clear H1 with the main keyword.
2. An opening section (150-200 words) explaining the problem, your position, and why it matters.
3. Three to five H2 sections that each target a subtopic.
4. One short section explaining how this post supports the keyword cluster.
5. A soft CTA at the end linking back to service pages.${offerContext}
6. Use the primary keyword naturally in the H1, first 100 words, and at least two H2s.
7. Length: 900 to 1,200 words.
8. Include internal linking suggestions in brackets like: [link to Website Design page here].
9. NO keyword stuffing.
10. NO corporate waffle.`;

  // HTML formatting requirements
  const htmlFormatting = `
HTML FORMATTING (CRITICAL):
- Use semantic HTML tags ONLY
- Use <h1> for the main title (the blogTopic)
- Use <h2> for main section headings
- Use <h3> for subsection headings
- Use <p> for paragraphs
- Use <ul> and <li> for unordered lists
- Use <ol> and <li> for ordered lists when appropriate
- DO NOT include <html>, <head>, <body>, or any other document structure tags
- Only return the content that would go inside a WordPress editor
- Do NOT repeat the Blog Title, Keyword, or Meta Description inside the htmlContent. Start directly with the H1 tag.`;

  // Internal linking instructions - prioritize availableLinks from site doc, fallback to passed internalLinks
  const internalLinksToUse = availableLinks.length > 0 ? availableLinks : internalLinks;
  // Pick 5-10 relevant URLs (or first 20 if we have many)
  const selectedLinks = internalLinksToUse.length > 20 ? internalLinksToUse.slice(0, 20) : internalLinksToUse;
  const internalLinksContext = selectedLinks.length > 0 ?
    selectedLinks.map((url) => `- ${url}`).join("\n") :
    "";

  const internalLinkingSection = selectedLinks.length > 0 ? `
INTERNAL LINKING:
Here is a list of valid pages on the website. You MUST choose 2-3 of these to link to internally where relevant:
${internalLinksContext}
- Use descriptive, keyword-rich anchor text that matches the linked page's topic
- Place links naturally within paragraphs or sections - don't force them
- Do NOT use brackets or placeholders - use actual HTML <a> tags with the URLs above` : `
INTERNAL LINKING:
- No internal links provided - skip this requirement`;

  // External links section - use searched links or fallback to passed external links
  const externalLinksToUse = externalLinks.length > 0 ? externalLinks : [];
  const externalLinksText = formatExternalLinksForPrompt(externalLinksToUse);

  const externalLinksSection = externalLinksToUse.length > 0 ? `
EXTERNAL LINKING:
You MUST naturally link to 2-3 of these authoritative external sources in your content:
${externalLinksText}
- Use these links to support key claims, statistics, or research findings
- Place links naturally within relevant paragraphs using descriptive anchor text
- Use standard HTML format: <a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>
- Do NOT force links - only include them where they add value and credibility
- Prefer linking to .edu, .gov, or .org domains when available` : `
EXTERNAL LINKING:
- No external links provided - skip this requirement`;

  // CTA section
  const ctaSection = targetUrl ? `
CALL TO ACTION (CTA) - REQUIRED:
- You MUST include a Call to Action (CTA) section at the very end of the article
- The CTA must contain an HTML hyperlink using the <a> tag
- The link must point to: ${targetUrl}
- Use proper HTML: <a href="${targetUrl}">Your anchor text here</a>
- The anchor text should be natural, inviting, and relevant to the content
- The CTA should be compelling and encourage readers to click through
- Format the CTA as a paragraph or section with the link naturally integrated` : `
CALL TO ACTION (CTA) - REQUIRED:
- You MUST include a Call to Action (CTA) section at the very end of the article
- The CTA should encourage readers to learn more or take action
- Format the CTA as a paragraph or section`;

  // Combine all parts into the final prompt
  const prompt = `You are a technical content engine. You MUST return a valid JSON object.
Do NOT wrap the output in markdown blocks (like \`\`\`json). Just return the raw JSON string.

You are a professional SEO copywriter with expertise in creating long-form, engaging blog content.

PERSONALITY & STYLE RULES:
${personalityRules}

${contentStructure}

${htmlFormatting}

${internalLinkingSection}

${externalLinksSection}

${ctaSection}
${pillarLinkContext}
${clusterLinksContext}

OUTPUT FORMAT:
You MUST return a valid JSON object. Do not include markdown formatting (like \`\`\`json). Just return the raw JSON string.
Structure:
{
  "metaTitle": "A click-worthy SEO title (max 60 chars)",
  "metaDescription": "A compelling summary for Google (max 160 chars)",
  "htmlContent": "The full blog post HTML (<h2>, <p>, <ul>, <iframe>, etc.)"
}

The htmlContent should be ready to paste directly into a WordPress editor. Start with <h1> and end with closing tags as needed.`;

  try {
    console.log(`[generateBlogContent] Generating content for keyword: ${keyword}, topic: ${blogTopic}`);

    // Use a higher maxTokens for long-form content (8000 tokens ≈ 6000 words)
    // jsonMode=true forces Gemini to output valid JSON (avoids markdown wrapping issues)
    const rawResponse = await callGeminiAPI(prompt, 8000, true);

    // Validate that we got a response
    if (!rawResponse || rawResponse.trim().length < 100) {
      throw new Error("Generated content is too short or empty");
    }

    // Parse JSON response - robust extraction with multiple fallback strategies
    let jsonText = rawResponse.trim();

    // Remove markdown code blocks if present
    jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();

    // Strategy 1: Find JSON object using brace matching
    const firstBrace = jsonText.indexOf("{");
    if (firstBrace === -1) {
      throw new Error("No JSON object found in response (missing opening brace)");
    }

    jsonText = jsonText.substring(firstBrace);

    // Find the matching closing brace (accounting for nested objects and strings)
    let braceCount = 0;
    let lastBrace = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonText.length; i++) {
      const char = jsonText[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === "\"" && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;
          if (braceCount === 0) {
            lastBrace = i;
            break;
          }
        }
      }
    }

    if (lastBrace === -1) {
      console.warn("[generateBlogContent] ⚠️ Could not find matching closing brace, trying alternative extraction");
      // Try regex fallback
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
    } else {
      jsonText = jsonText.substring(0, lastBrace + 1);
    }

    // Strategy 2: Try to repair common JSON issues
    // Fix unterminated strings by closing them at the end of the value
    // This is a simple heuristic - if we find an unterminated string, try to close it
    let parsedData: { metaTitle: string; metaDescription: string; htmlContent: string } | null = null;
    let parseAttempts = 0;
    const maxAttempts = 3;

    while (parseAttempts < maxAttempts) {
      try {
        parsedData = JSON.parse(jsonText);
        break; // Success!
      } catch (parseError: any) {
        parseAttempts++;

        if (parseError.message.includes("Unterminated string")) {
          // Try to fix unterminated strings by finding the last quote and closing it
          console.warn(`[generateBlogContent] ⚠️ Attempt ${parseAttempts}: Unterminated string detected, attempting repair...`);

          // Find the position mentioned in the error
          const positionMatch = parseError.message.match(/position (\d+)/);
          if (positionMatch) {
            const errorPosition = parseInt(positionMatch[1], 10);
            // Try to find where the string should end (look for the next quote or end of likely value)
            // This is a heuristic - we'll look for patterns like ": "value" or ", "value"
            const afterError = jsonText.substring(errorPosition);

            // Try to find a reasonable place to close the string
            // Look for common patterns that indicate end of a string value
            const endPatterns = [/"\s*[,}]/, /"\s*$/, /\n\s*"/, /\s*"/];
            let fixed = false;

            for (const pattern of endPatterns) {
              const match = afterError.match(pattern);
              if (match && match.index !== undefined) {
                const insertPos = errorPosition + match.index + 1;
                jsonText = jsonText.substring(0, insertPos) + "\"" + jsonText.substring(insertPos);
                fixed = true;
                console.log(`[generateBlogContent] Attempted to fix unterminated string at position ${errorPosition}`);
                break;
              }
            }

            if (!fixed) {
              // Last resort: try to close the string at a reasonable position
              // Look for the next comma, closing brace, or newline
              const nextComma = afterError.indexOf(",");
              const nextBrace = afterError.indexOf("}");
              const nextNewline = afterError.indexOf("\n");

              let closePos = errorPosition;
              if (nextComma > 0 && (nextBrace < 0 || nextComma < nextBrace)) {
                closePos = errorPosition + nextComma;
              } else if (nextBrace > 0) {
                closePos = errorPosition + nextBrace;
              } else if (nextNewline > 0) {
                closePos = errorPosition + nextNewline;
              } else {
                // Just close it at the end
                closePos = jsonText.length;
              }

              jsonText = jsonText.substring(0, closePos) + "\"" + jsonText.substring(closePos);
              console.log(`[generateBlogContent] Applied last-resort fix: closed string at position ${closePos}`);
            }
          } else {
            // No position info - try to extract JSON using regex as fallback
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              jsonText = jsonMatch[0];
            }
          }
        } else if (parseAttempts < maxAttempts) {
          // For other errors, try regex extraction as fallback
          console.warn(`[generateBlogContent] ⚠️ Attempt ${parseAttempts}: ${parseError.message}, trying regex extraction...`);
          const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
          } else {
            break; // Can't fix it
          }
        } else {
          // Final attempt failed
          console.error("[generateBlogContent] ❌ Failed to parse JSON after all attempts:", parseError);
          console.error("[generateBlogContent] Extracted JSON (first 2000 chars):", jsonText.substring(0, 2000));
          console.error("[generateBlogContent] Error position:", parseError.message);
          throw new Error(`Failed to parse JSON response after ${maxAttempts} attempts: ${parseError.message}`);
        }
      }
    }

    // Ensure parsedData was successfully assigned
    if (!parsedData) {
      throw new Error("Failed to parse JSON response: All parsing attempts failed");
    }

    // Validate required fields
    if (!parsedData.htmlContent || !parsedData.metaTitle || !parsedData.metaDescription) {
      throw new Error("JSON response missing required fields: htmlContent, metaTitle, or metaDescription");
    }

    // Sanitize htmlContent: Remove any double asterisks (bold markdown) that AI might slip in
    parsedData.htmlContent = parsedData.htmlContent.replace(/\*\*/g, "");

    // Basic validation - ensure htmlContent contains HTML tags
    if (!parsedData.htmlContent.includes("<h1>") && !parsedData.htmlContent.includes("<h1 ")) {
      console.warn("[generateBlogContent] Warning: Generated content may not include H1 tag");
    }

    // Trim all fields and map to return structure (metaTitle -> blogTitle, metaDescription -> blogDescription)
    const result = {
      htmlContent: parsedData.htmlContent.trim(),
      blogTitle: parsedData.metaTitle.trim(),
      blogDescription: parsedData.metaDescription.trim(),
    };

    console.log(`[generateBlogContent] ✅ Successfully generated content: ${result.htmlContent.length} chars, blogTitle: ${result.blogTitle.length} chars, blogDescription: ${result.blogDescription.length} chars`);
    return result;
  } catch (error: any) {
    console.error("[generateBlogContent] ❌ Error generating content:", error);
    throw new Error(`Failed to generate blog content: ${error.message}`);
  }
}

/**
 * HTTP callable function for testing generateBlogContent
 * Usage: Call from client with { calendarEntry: { keyword, blogTopic, blogDescription, imagePrompt?, targetUrl?, internalLinks?, externalLinks? } }
 */
/**
 * Normalize WordPress URL to ensure it's clean and ready for API calls
 * @param {string} url - WordPress URL (can be base URL or API URL)
 * @return {string} Clean base URL without trailing slash, with https
 */
function normalizeWordPressUrl(url: string): string {
  if (!url) {
    throw new Error("WordPress URL is required");
  }

  // Remove /wp-json if present (we'll add it back later)
  let cleanUrl = url.replace(/\/wp-json\/?$/, "");

  // Remove trailing slash
  cleanUrl = cleanUrl.replace(/\/$/, "");

  // Ensure https
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    cleanUrl = `https://${cleanUrl}`;
  } else if (cleanUrl.startsWith("http://")) {
    cleanUrl = cleanUrl.replace("http://", "https://");
  }

  return cleanUrl;
}

/**
 * Upload image to WordPress Media Library
 * @param {string} imageUrl - The image URL to download and upload
 * @param {string} wordpressUrl - The WordPress site URL
 * @param {string} username - WordPress username
 * @param {string} appPassword - WordPress application password
 * @return {Promise<number>} WordPress media ID
 */
async function uploadImageToWordPress(
  imageUrl: string,
  wordpressUrl: string,
  username: string,
  appPassword: string
): Promise<number> {
  try {
    console.log(`[uploadImageToWordPress] Downloading image from: ${imageUrl}`);

    // Fetch the image from the URL
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
    }

    // Get image buffer
    const imageBuffer = await imageResponse.buffer();

    // Determine content type from response headers or default to jpeg
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    const fileExtension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

    // Clean WordPress URL
    const baseUrl = wordpressUrl.replace(/\/$/, "").replace(/\/wp-json\/?$/, "");
    const cleanUrl = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;

    // Create FormData for WordPress media upload
    const formData = new FormData();
    formData.append("file", imageBuffer, {
      filename: `featured-image-${Date.now()}.${fileExtension}`,
      contentType: contentType,
    });

    // Upload to WordPress Media Library
    const mediaApiUrl = `${cleanUrl}/wp-json/wp/v2/media`;
    const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
    const uploadResponse = await fetch(mediaApiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`WordPress media upload failed: ${uploadResponse.status} - ${errorText.substring(0, 200)}`);
    }

    const uploadData = await uploadResponse.json();
    const mediaId = uploadData.id;

    console.log(`[uploadImageToWordPress] ✅ Image uploaded to WordPress. Media ID: ${mediaId}`);
    return mediaId;
  } catch (error: any) {
    console.error("[uploadImageToWordPress] ❌ Error:", error);
    throw new Error(`Failed to upload image to WordPress: ${error.message}`);
  }
}

/**
 * Publish blog content to WordPress
 * This is a modular function that can be used internally or called via HTTP
 * @param {string} siteId - The site ID to fetch credentials from
 * @param {Object} postData - Object containing title, content, slug, and optionally excerpt
 * @return {Promise<{postId: number, postUrl: string}>} Promise with WordPress post ID and URL
 */
export async function publishToWordPress(
  siteId: string,
  postData: {
    title: string;
    content: string;
    slug: string;
    excerpt?: string;
    featuredImageUrl?: string;
    wordpressMediaId?: number;
  }
): Promise<{ postId: number; postUrl: string }> {
  if (!siteId) {
    throw new Error("siteId is required");
  }

  if (!postData || !postData.title || !postData.content || !postData.slug) {
    throw new Error("postData must contain title, content, and slug");
  }

  try {
    console.log(`[publishToWordPress] Fetching site credentials for siteId: ${siteId}`);

    // Fetch site credentials from Firestore
    const siteDoc = await admin.firestore().collection("sites").doc(siteId).get();

    if (!siteDoc.exists) {
      throw new Error(`Site not found: ${siteId}`);
    }

    const site = siteDoc.data();
    if (!site) {
      throw new Error(`Site data is empty for siteId: ${siteId}`);
    }

    // Get WordPress URL - check both wordpressUrl and wordpressApiUrl for compatibility
    const wordpressUrl = (site.wordpressUrl || site.wordpressApiUrl) as string;
    const wordpressUsername = site.wordpressUsername as string;
    const wordpressAppPassword = site.wordpressAppPassword as string;

    if (!wordpressUrl) {
      throw new Error("wordpressUrl or wordpressApiUrl is missing in site configuration");
    }

    if (!wordpressUsername) {
      throw new Error("wordpressUsername is missing in site configuration");
    }

    if (!wordpressAppPassword) {
      throw new Error("wordpressAppPassword is missing in site configuration");
    }

    console.log(`[publishToWordPress] Site found: ${site.name}, WordPress URL: ${wordpressUrl}`);

    // Normalize the WordPress URL
    const baseUrl = normalizeWordPressUrl(wordpressUrl);
    const apiUrl = `${baseUrl}/wp-json/wp/v2/posts`;

    console.log(`[publishToWordPress] Publishing to: ${apiUrl}`);

    // Create Basic Auth header
    const auth = Buffer.from(`${wordpressUsername}:${wordpressAppPassword}`).toString("base64");

    // Step 1: Use featured media ID if provided, otherwise upload image
    let featuredMediaId: number | undefined = postData.wordpressMediaId;

    if (!featuredMediaId && postData.featuredImageUrl) {
      try {
        console.log(`[publishToWordPress] Uploading featured image from: ${postData.featuredImageUrl}`);
        featuredMediaId = await uploadImageToWordPress(
          postData.featuredImageUrl,
          baseUrl,
          site.wordpressUsername,
          site.wordpressAppPassword
        );
        console.log(`[publishToWordPress] ✅ Featured image uploaded. Media ID: ${featuredMediaId}`);
      } catch (error: any) {
        console.error("[publishToWordPress] ⚠️ Failed to upload featured image:", error);
        // Continue without featured image - not critical
        // Log warning but don't throw - we can still publish the post
      }
    } else if (featuredMediaId) {
      console.log(`[publishToWordPress] Using existing WordPress media ID: ${featuredMediaId}`);
    }

    // Step 2: Prepare post data for WordPress REST API
    const wpPostData: any = {
      title: postData.title,
      content: postData.content,
      slug: postData.slug,
      status: "publish", // Always publish immediately
    };

    // Add excerpt if provided
    if (postData.excerpt) {
      wpPostData.excerpt = postData.excerpt;
    }

    // Add featured media ID if image was uploaded successfully
    if (featuredMediaId) {
      wpPostData.featured_media = featuredMediaId;
    }

    // Make POST request to WordPress REST API
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(wpPostData),
    });

    // Handle response
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `WordPress API error: ${response.status} ${response.statusText}`;

      // Try to parse error message from response
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = errorJson.message;
        } else if (errorJson.code) {
          errorMessage = `${errorJson.code}: ${errorJson.message || errorText}`;
        }
      } catch {
        // If parsing fails, use the text as is (truncated)
        if (errorText) {
          errorMessage = `${errorMessage} - ${errorText.substring(0, 200)}`;
        }
      }

      // Provide more specific error messages for common issues
      if (response.status === 401) {
        throw new Error("WordPress authentication failed. Please check your username and application password.");
      } else if (response.status === 404) {
        throw new Error(`WordPress API endpoint not found. Please verify the URL is correct: ${baseUrl}`);
      } else if (response.status === 403) {
        throw new Error("WordPress API access forbidden. Please check your application password permissions.");
      } else if (response.status >= 500) {
        throw new Error(`WordPress server error: ${errorMessage}`);
      }

      throw new Error(errorMessage);
    }

    const wpResponse = await response.json();

    // Extract post ID and URL from response
    const postId = wpResponse.id;
    const postUrl = wpResponse.link;

    if (!postId || !postUrl) {
      throw new Error("WordPress API returned invalid response: missing post ID or URL");
    }

    console.log(`[publishToWordPress] ✅ Successfully published post. ID: ${postId}, URL: ${postUrl}`);

    return {
      postId,
      postUrl,
    };
  } catch (error: any) {
    // Re-throw with more context if it's not already a detailed error
    if (error.message && !error.message.includes("WordPress")) {
      console.error("[publishToWordPress] ❌ Error:", error);
      throw new Error(`Failed to publish to WordPress: ${error.message}`);
    }
    throw error;
  }
}

/**
 * HTTP callable function for testing publishToWordPress
 * Usage: Call from client with { siteId, postData: { title, content, slug, excerpt?, featuredImageUrl? } }
 */
/**
 * Fetch and parse sitemap URLs for internal linking
 * @param {string} sitemapUrl - The sitemap URL to fetch
 * @return {Promise<string[]>} Array of up to 30 shuffled URLs
 */
export async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  if (!sitemapUrl) {
    return [];
  }

  try {
    console.log(`[fetchSitemapUrls] Fetching sitemap from: ${sitemapUrl}`);

    const response = await axios.get(sitemapUrl, {
      headers: {
        "User-Agent": "ApexSEO/1.0",
      },
      timeout: 10000, // 10 second timeout
    });

    const xmlText = response.data;

    // Parse XML using xml2js
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlText);

    const urls: string[] = [];

    // Handle sitemap index (contains multiple sitemaps)
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      console.log(`[fetchSitemapUrls] Detected sitemap index with ${result.sitemapindex.sitemap.length} sub-sitemaps`);
      // For sitemap index, we'd need to fetch each sub-sitemap
      // For now, return empty - could be enhanced to fetch recursively
      return [];
    }

    // Handle regular sitemap (contains URLs)
    if (result.urlset && result.urlset.url) {
      for (const urlEntry of result.urlset.url) {
        if (urlEntry.loc && urlEntry.loc[0]) {
          const url = urlEntry.loc[0];
          urls.push(url);
        }
      }
    }

    // Filter out system URLs
    const filteredUrls = urls.filter((url) => {
      const lowerUrl = url.toLowerCase();
      return (
        !lowerUrl.includes("wp-json") &&
        !lowerUrl.includes(".xml") &&
        !lowerUrl.includes("/feed") &&
        !lowerUrl.includes("/author") &&
        !lowerUrl.includes("/tag/") &&
        !lowerUrl.includes("/category/") &&
        !lowerUrl.endsWith("/feed/") &&
        !lowerUrl.includes("?")
      );
    });

    // Shuffle and limit to 30 URLs
    const shuffled = filteredUrls.sort(() => Math.random() - 0.5);
    const limited = shuffled.slice(0, 30);

    console.log(`[fetchSitemapUrls] ✅ Extracted ${limited.length} URLs from sitemap (filtered from ${urls.length} total)`);
    return limited;
  } catch (error: any) {
    console.error("[fetchSitemapUrls] ❌ Error fetching sitemap:", error.message);
    // Return empty array on error - don't block blog generation
    return [];
  }
}

/**
 * Search for a single YouTube video using API key from environment
 * @param {string} query - The search query (keyword)
 * @return {Promise<{videoId: string, title: string} | null>} Video ID and title, or null if not found
 * Note: Currently unused but kept for future use
 */
export async function searchYoutubeVideo(query: string): Promise<{ videoId: string; title: string } | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    console.warn("[searchYoutubeVideo] YOUTUBE_API_KEY not found in environment variables");
    return null;
  }

  if (!query || query.trim().length === 0) {
    console.warn("[searchYoutubeVideo] Query is empty");
    return null;
  }

  try {
    console.log(`[searchYoutubeVideo] Searching YouTube for: ${query}`);

    const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        part: "snippet",
        q: query,
        type: "video",
        key: apiKey,
        maxResults: 1,
      },
      timeout: 10000, // 10 second timeout
    });

    if (response.data.items && response.data.items.length > 0) {
      const item = response.data.items[0];
      const videoId = item.id.videoId;
      const title = item.snippet.title;

      console.log(`[searchYoutubeVideo] ✅ Found video: ${title} (${videoId})`);
      return {
        videoId,
        title,
      };
    }

    console.log(`[searchYoutubeVideo] No results found for query: ${query}`);
    return null;
  } catch (error: any) {
    console.error("[searchYoutubeVideo] ❌ Error searching YouTube:", error.message);
    return null;
  }
}

/**
 * Search for public YouTube videos related to a keyword
 * @param {string} keyword - The search keyword
 * @param {string} apiKey - YouTube Data API v3 key
 * @return {Promise<Array<{title: string, videoUrl: string, embedId: string}>>} Array of video objects
 */
export async function searchPublicYoutubeVideos(
  keyword: string,
  apiKey: string
): Promise<Array<{ title: string; videoUrl: string; embedId: string }>> {
  if (!keyword || !apiKey) {
    return [];
  }

  try {
    console.log(`[searchPublicYoutubeVideos] Searching for videos with keyword: ${keyword}`);

    const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        part: "snippet",
        q: keyword,
        type: "video",
        videoEmbeddable: "true", // Crucial: ensure we can embed it
        order: "relevance", // Or 'viewCount' for popular ones
        key: apiKey,
        maxResults: 2,
      },
      timeout: 10000, // 10 second timeout
    });

    const videos: Array<{ title: string; videoUrl: string; embedId: string }> = [];

    if (response.data.items && response.data.items.length > 0) {
      for (const item of response.data.items) {
        const videoId = item.id.videoId;
        const title = item.snippet.title;
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        videos.push({
          title,
          videoUrl,
          embedId: videoId,
        });
      }
    }

    console.log(`[searchPublicYoutubeVideos] ✅ Found ${videos.length} embeddable videos`);
    return videos;
  } catch (error: any) {
    console.error("[searchPublicYoutubeVideos] ❌ Error searching YouTube:", error.message);
    // Return empty array on error - don't block blog generation
    return [];
  }
}

/**
 * Save image to Firebase Storage and return public URL
 * @param {string} imageUrl - The source image URL (e.g., DALL-E URL)
 * @param {string} destinationPath - Storage path (e.g., "sites/{siteId}/{calendarId}.png")
 * @return {Promise<string>} Public URL of the stored image
 */
async function saveToFirebaseStorage(imageUrl: string, destinationPath: string): Promise<string> {
  try {
    console.log(`[saveToFirebaseStorage] Downloading image from: ${imageUrl}`);

    // Download the image using axios with arraybuffer response type
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 30000, // 30 second timeout
    });

    if (!imageResponse.data) {
      throw new Error("Failed to download image: empty response");
    }

    console.log(`[saveToFirebaseStorage] Image downloaded (${imageResponse.data.length} bytes)`);

    // Get the default Firebase Storage bucket
    const bucket = admin.storage().bucket();
    const file = bucket.file(destinationPath);

    // Upload the image buffer to Firebase Storage
    console.log(`[saveToFirebaseStorage] Uploading to: ${destinationPath}`);
    await file.save(Buffer.from(imageResponse.data), {
      metadata: {
        contentType: "image/png", // DALL-E returns PNG
        cacheControl: "public, max-age=31536000", // Cache for 1 year
      },
      public: true, // Make the file publicly accessible
    });

    // Get the public URL
    // For public files, the URL format is: https://storage.googleapis.com/{bucket}/{path}
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;

    console.log(`[saveToFirebaseStorage] ✅ Image saved to Firebase Storage: ${publicUrl}`);
    return publicUrl;
  } catch (error: any) {
    console.error("[saveToFirebaseStorage] ❌ Error saving image to Firebase Storage:", error);
    throw new Error(`Failed to save image to Firebase Storage: ${error.message}`);
  }
}

/**
 * Generate blog image using OpenAI DALL-E 3
 * @param {string} imagePrompt - The prompt for image generation
 * @return {Promise<string>} Public URL of the generated image
 */
export async function generateBlogImage(imagePrompt: string): Promise<string> {
  if (!imagePrompt || imagePrompt.trim().length === 0) {
    throw new Error("imagePrompt is required");
  }

  const openaiApiKey = await getOpenAiApiKey();

  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured in Secret Manager or environment variables");
  }

  try {
    console.log(`[generateBlogImage] Generating image with prompt: ${imagePrompt.substring(0, 100)}...`);

    const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: imagePrompt,
        n: 1,
        size: "1792x1024", // Standard blog header size
        quality: "standard",
      }),
    });

    if (!imageResponse.ok) {
      const errorData = await imageResponse.json().catch(() => ({ message: "Unknown error" }));
      throw new Error(`OpenAI API error: ${imageResponse.status} - ${errorData.message || imageResponse.statusText}`);
    }

    const imageData = await imageResponse.json();

    if (!imageData.data || !imageData.data[0] || !imageData.data[0].url) {
      throw new Error("OpenAI API returned invalid response: missing image URL");
    }

    const imageUrl = imageData.data[0].url;
    console.log(`[generateBlogImage] ✅ Successfully generated image: ${imageUrl}`);

    return imageUrl;
  } catch (error: any) {
    console.error("[generateBlogImage] ❌ Error generating image:", error);
    throw new Error(`Failed to generate blog image: ${error.message}`);
  }
}

/**
 * Generate a URL-friendly slug from a title
 * @param {string} title - The title to convert to a slug
 * @return {string} URL-friendly slug
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Process a calendar entry: generate content and optionally publish to WordPress
 * This is the orchestrator function that ties generateBlogContent and publishToWordPress together
 * @param {string} siteId - The site ID
 * @param {string} calendarId - The calendar entry ID
 * @param {string} mode - Processing mode: 'draft' (generate only) or 'publish' (generate and publish)
 * @return {Promise<Object>} Promise with processing results
 */
export async function processCalendarEntry(
  siteId: string,
  calendarId: string,
  mode: "draft" | "publish" = "publish"
): Promise<{ success: boolean; postId?: number | string; postUrl?: string; error?: string }> {
  const calendarRef = admin.firestore()
    .collection("sites")
    .doc(siteId)
    .collection("contentCalendar")
    .doc(calendarId);

  try {
    console.log(`[processCalendarEntry] Starting processing for siteId: ${siteId}, calendarId: ${calendarId}, mode: ${mode}`);

    // Step 1: Fetch the calendar entry document
    const calendarDoc = await calendarRef.get();

    if (!calendarDoc.exists) {
      throw new Error(`Calendar entry not found: ${calendarId}`);
    }

    const calendarData = calendarDoc.data();
    if (!calendarData) {
      throw new Error(`Calendar entry data is empty for: ${calendarId}`);
    }

    console.log(`[processCalendarEntry] Calendar entry found: ${calendarData.blogTopic || "Unknown topic"}`);

    // Step 2: Safety checks based on mode
    if (mode === "publish") {
      // Prevent duplicate publishing
      if (calendarData.status === "published") {
        console.log("[processCalendarEntry] ⚠️ Calendar entry already published. Skipping.");
        return {
          success: false,
          error: "Calendar entry is already published",
        };
      }
      // For publish mode, require 'approved' or 'pending_approval' status
      // Also allow 'error' status if content exists (retry scenario)
      const allowedStatuses = ["approved", "pending_approval"];
      const canRetryError = calendarData.status === "error" && calendarData.generatedContent;

      if (!allowedStatuses.includes(calendarData.status) && !canRetryError) {
        console.log(`[processCalendarEntry] ⚠️ Calendar entry status is "${calendarData.status}", not approved. Skipping publish.`);
        return {
          success: false,
          error: `Calendar entry must be approved before publishing. Current status: ${calendarData.status}`,
        };
      }

      if (canRetryError) {
        console.log("[processCalendarEntry] ⚠️ Retrying publish for entry with \"error\" status (content exists)");
      }
    } else if (mode === "draft") {
      // For draft mode, process 'scheduled' entries OR 'error' entries without content (retry)
      const isScheduled = calendarData.status === "scheduled";
      const isErrorWithoutContent = calendarData.status === "error" && !calendarData.generatedContent;

      if (!isScheduled && !isErrorWithoutContent) {
        console.log(`[processCalendarEntry] ⚠️ Calendar entry status is "${calendarData.status}". Skipping draft generation.`);
        return {
          success: false,
          error: `Calendar entry must be scheduled (or error without content) to generate draft. Current status: ${calendarData.status}`,
        };
      }

      if (isErrorWithoutContent) {
        console.log("[processCalendarEntry] ⚠️ Retrying draft generation for entry with \"error\" status (no content exists)");
      }
    }

    // Step 3: Validate required fields
    if (!calendarData.keyword || !calendarData.blogTopic || !calendarData.blogDescription) {
      throw new Error(
        "Calendar entry is missing required fields: keyword, blogTopic, or blogDescription"
      );
    }

    // Step 4: Update status to 'processing' to prevent concurrent processing
    await calendarRef.update({
      status: "processing",
      updatedAt: admin.firestore.Timestamp.now(),
    });

    console.log("[processCalendarEntry] Status updated to \"processing\"");

    // Step 4.5: Fetch site config to get target URL for CTA
    const siteDoc = await admin.firestore().collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      throw new Error(`Site not found: ${siteId}`);
    }
    const siteData = siteDoc.data();
    if (!siteData) {
      throw new Error(`Site data is empty for siteId: ${siteId}`);
    }

    // Get target URL - prefer offerUrl if available, otherwise use url (main site URL)
    // Remove wordpressUrl/wordpressApiUrl as those are API endpoints, not landing pages
    const targetUrl = (siteData.offerUrl || siteData.url) as string | undefined;
    if (targetUrl) {
      console.log(`[processCalendarEntry] Using target URL for CTA: ${targetUrl}`);
    } else {
      console.warn("[processCalendarEntry] No target URL found in site config (offerUrl or url). CTA will be generic.");
    }

    // Step 4.6: Fetch internal links from sitemap
    let internalLinks: string[] = [];
    const sitemapUrl = siteData.sitemapUrl as string | undefined;
    if (sitemapUrl) {
      try {
        console.log("[processCalendarEntry] Fetching internal links from sitemap...");
        internalLinks = await fetchSitemapUrls(sitemapUrl);
        console.log(`[processCalendarEntry] ✅ Found ${internalLinks.length} internal links`);
      } catch (error: any) {
        console.error("[processCalendarEntry] ⚠️ Failed to fetch sitemap URLs:", error);
        // Continue without internal links - not critical
      }
    } else {
      console.log("[processCalendarEntry] No sitemapUrl configured, skipping internal links");
    }

    // Step 4.7: Search for external links for authoritative sources
    const externalLinks: Array<{ title: string; url: string; snippet?: string }> = [];
    if (calendarData.keyword) {
      try {
        console.log("[processCalendarEntry] Searching for external links...");
        const siteContextStr = siteData?.industry ?
          `${siteData.industry} industry` :
          undefined;
        const links = await searchExternalLinks(calendarData.keyword, siteContextStr);
        if (links.length > 0) {
          externalLinks.push(...links);
          console.log(`[processCalendarEntry] ✅ Found ${links.length} external links`);
        } else {
          console.log("[processCalendarEntry] No external links found for keyword");
        }
      } catch (error: any) {
        console.error("[processCalendarEntry] ⚠️ Failed to search external links:", error);
        // Continue without external links - not critical
      }
    }

    // Step 5: Generate blog content (if not already generated)
    let htmlContent: string;
    let blogTitle: string | undefined;
    let blogDescription: string | undefined;
    if (calendarData.generatedContent && mode === "publish") {
      // Use existing content if available
      console.log("[processCalendarEntry] Using existing generated content");
      htmlContent = calendarData.generatedContent;
      // Use blogTitle/blogDescription if available, otherwise fallback to blogTopic/blogDescription from calendar
      blogTitle = (calendarData.blogTitle || calendarData.blogTopic) as string | undefined;
      blogDescription = calendarData.blogDescription as string | undefined;
    } else {
      // Generate new content
      console.log("[processCalendarEntry] Generating blog content...");
      const contentResult = await generateBlogContent({
        keyword: calendarData.keyword,
        blogTopic: calendarData.blogTopic,
        blogDescription: calendarData.blogDescription,
        imagePrompt: calendarData.imagePrompt,
        targetUrl: targetUrl,
        internalLinks: internalLinks,
        externalLinks: externalLinks,
        siteId: siteId, // Pass siteId so function can fetch availableLinks
        calendarId: calendarId, // Pass calendarId so function can fetch pillar/cluster relationships
      });
      htmlContent = contentResult.htmlContent;
      blogTitle = contentResult.blogTitle;
      blogDescription = contentResult.blogDescription;
      console.log(`[processCalendarEntry] ✅ Content generated (${htmlContent.length} characters, blogTitle: ${blogTitle.length} chars, blogDescription: ${blogDescription.length} chars)`);
    }

    // Step 6: Generate Featured Image if imagePrompt exists (if not already generated)
    let featuredImageUrl: string | undefined;
    if (calendarData.featuredImageUrl && mode === "publish") {
      // Use existing image if available
      console.log("[processCalendarEntry] Using existing featured image");
      featuredImageUrl = calendarData.featuredImageUrl;
    } else if (calendarData.imagePrompt) {
      try {
        console.log("[processCalendarEntry] Generating featured image...");
        const dallEImageUrl = await generateBlogImage(calendarData.imagePrompt);
        console.log(`[processCalendarEntry] ✅ Featured image generated from DALL-E: ${dallEImageUrl}`);

        // In draft mode, save to Firebase Storage
        if (mode === "draft") {
          const storagePath = `sites/${siteId}/${calendarId}.png`;
          featuredImageUrl = await saveToFirebaseStorage(dallEImageUrl, storagePath);
          console.log(`[processCalendarEntry] ✅ Image saved to Firebase Storage: ${featuredImageUrl}`);
        } else {
          // In publish mode, use DALL-E URL directly (will be uploaded to WordPress)
          featuredImageUrl = dallEImageUrl;
        }
      } catch (error: any) {
        console.error("[processCalendarEntry] ⚠️ Failed to generate featured image:", error);
        // Continue without image - not critical
      }
    } else {
      console.log("[processCalendarEntry] No imagePrompt provided, skipping image generation");
    }

    // Step 7: Handle based on mode
    if (mode === "draft") {
      // Draft mode: Save content and image, set status to pending_approval
      console.log("[processCalendarEntry] Saving draft (not publishing)...");
      const draftUpdate: any = {
        status: "pending_approval",
        generatedContent: htmlContent,
        featuredImageUrl: featuredImageUrl || admin.firestore.FieldValue.delete(),
        generatedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        // Clear any previous error state
        errorMessage: admin.firestore.FieldValue.delete(),
      };
      // Add blog title and description if available (updates the dashboard display)
      if (blogTitle) {
        draftUpdate.blogTitle = blogTitle;
      }
      if (blogDescription) {
        draftUpdate.blogDescription = blogDescription;
      }
      await calendarRef.update(draftUpdate);

      console.log("[processCalendarEntry] ✅ Draft saved, status set to 'pending_approval'");

      return {
        success: true,
      };
    } else {
      // Publish mode: Publish to WordPress or to marketing website (Cloudflare)
      // Step 7.1: Generate slug from blogTopic
      const slug = generateSlug(calendarData.blogTopic);

      if (siteId === MARKETING_SITE_ID) {
        // Publish to marketing website (Cloudflare blog) instead of WordPress
        console.log("[processCalendarEntry] Publishing to marketing website (Cloudflare)...");
        const publishUpdate: any = {
          status: "published",
          publishedAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
          errorMessage: admin.firestore.FieldValue.delete(),
        };
        if (blogTitle) publishUpdate.blogTitle = blogTitle;
        if (blogDescription) publishUpdate.blogDescription = blogDescription;
        await calendarRef.update(publishUpdate);
        await buildAndDeploy(admin.firestore(), siteId);
        console.log("[processCalendarEntry] ✅ Published to marketing website; deploy triggered.");
        return {
          success: true,
          postUrl: "https://apex-seo-marketing.pages.dev/blog",
        };
      }

      // Step 8: Publish to WordPress or Shopline depending on site platform
      // Use optimized blogTitle if available, otherwise fallback to blogTopic
      const postTitle = blogTitle || calendarData.blogTopic || "New Blog Post";
      // Use optimized blogDescription if available, otherwise fallback to original blogDescription
      const postExcerpt = blogDescription || calendarData.blogDescription;

      const sitePlatform = (siteData.platform || "wordpress") as string;
      let publishResult: {postId: string | number; postUrl: string};

      if (sitePlatform === "shopline") {
        console.log("[processCalendarEntry] Publishing to Shopline, title:", postTitle);
        const {publishToShopline: doPublishToShopline} = await import("./shopline");
        const shoplineHandle = siteData.shoplineHandle as string;
        const shoplineAccessToken = siteData.shoplineAccessToken as string;

        if (!shoplineHandle || !shoplineAccessToken) {
          throw new Error("Shopline handle or access token missing in site configuration");
        }

        const result = await doPublishToShopline(shoplineHandle, shoplineAccessToken, {
          title: postTitle,
          content: htmlContent,
          excerpt: postExcerpt,
          featuredImageUrl: featuredImageUrl,
          slug,
        });

        publishResult = {postId: result.postId, postUrl: result.postUrl};
        console.log(`[processCalendarEntry] ✅ Published to Shopline. Article ID: ${result.postId}, URL: ${result.postUrl}`);
      } else {
        console.log("[processCalendarEntry] Publishing to WordPress...");
        const wpResult = await publishToWordPress(siteId, {
          title: postTitle,
          content: htmlContent,
          slug: slug,
          excerpt: postExcerpt,
          featuredImageUrl: featuredImageUrl,
          wordpressMediaId: calendarData.wordpressMediaId as number | undefined,
        });
        publishResult = {postId: wpResult.postId, postUrl: wpResult.postUrl};
        console.log(`[processCalendarEntry] ✅ Published to WordPress. Post ID: ${wpResult.postId}, URL: ${wpResult.postUrl}`);
      }

      // Step 9: Update Firestore document with success
      const publishUpdate: any = {
        status: "published",
        wordpressPostId: publishResult.postId,
        wordpressPostUrl: publishResult.postUrl,
        publishedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        // Clear any previous error state
        errorMessage: admin.firestore.FieldValue.delete(),
      };
      // Add blog title and description if available (updates the dashboard display)
      if (blogTitle) {
        publishUpdate.blogTitle = blogTitle;
      }
      if (blogDescription) {
        publishUpdate.blogDescription = blogDescription;
      }
      await calendarRef.update(publishUpdate);

      // Ensure blogs doc exists for analytics (dashboard reads from blogs collection)
      await admin.firestore().collection("blogs").doc(calendarId).set({
        siteId,
        title: postTitle,
        totalViews: 0,
        wordpressPostUrl: publishResult.postUrl,
        publishedAt: publishUpdate.publishedAt,
      }, {merge: true});

      console.log("[processCalendarEntry] ✅ Calendar entry updated with publish results");

      return {
        success: true,
        postId: publishResult.postId,
        postUrl: publishResult.postUrl,
      };
    }
  } catch (error: any) {
    console.error("[processCalendarEntry] ❌ Error processing calendar entry:", error);

    // Step 10: Update Firestore document with error state
    try {
      await calendarRef.update({
        status: "error",
        errorMessage: error.message || "Unknown error occurred",
        updatedAt: admin.firestore.Timestamp.now(),
      });
      console.log("[processCalendarEntry] Calendar entry status updated to \"error\"");
    } catch (updateError: any) {
      console.error("[processCalendarEntry] Failed to update error state:", updateError);
      // Don't throw - we want to return the original error
    }

    return {
      success: false,
      error: error.message || "Unknown error occurred",
    };
  }
}

/**
 * HTTP callable function for processing calendar entries
 * Usage: Call from client with { siteId, calendarId }
 */
export const processCalendarEntryCallable = region.runWith({
  timeoutSeconds: 540, // 9 minutes (max allowed, content generation can take time)
  memory: "1GB",
  secrets: ["YOUTUBE_API_KEY"], // Access YouTube API key from Google Secret Manager
}).https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { siteId, calendarId, mode } = data;

  if (!siteId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: siteId"
    );
  }

  if (!calendarId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: calendarId"
    );
  }

  const processMode = (mode === "draft" || mode === "publish") ? mode : "publish";

  try {
    const result = await processCalendarEntry(siteId, calendarId, processMode);

    if (!result.success) {
      // Return error but don't throw - let the client handle it
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      postId: result.postId,
      postUrl: result.postUrl,
    };
  } catch (error: any) {
    console.error("[processCalendarEntryCallable] Error:", error);

    // Provide user-friendly error messages
    let errorCode = "internal";
    const errorMessage = error.message || "Failed to process calendar entry";

    if (error.message?.includes("not found")) {
      errorCode = "not-found";
    } else if (error.message?.includes("missing required")) {
      errorCode = "invalid-argument";
    }

    throw new functions.https.HttpsError(
      errorCode as any,
      errorMessage,
      error.message
    );
  }
});

/**
 * HTTP callable function to approve a drafted post
 * If the scheduled date has passed, publishes immediately
 * Otherwise, sets status to 'approved' for later publishing
 */
export const approvePostCallable = region.runWith({
  timeoutSeconds: 540, // 9 minutes (in case immediate publishing is needed)
  memory: "1GB",
}).https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { siteId, calendarId } = data;

  if (!siteId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: siteId"
    );
  }

  if (!calendarId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: calendarId"
    );
  }

  try {
    const calendarRef = admin.firestore()
      .collection("sites")
      .doc(siteId)
      .collection("contentCalendar")
      .doc(calendarId);

    const calendarDoc = await calendarRef.get();

    if (!calendarDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Calendar entry not found"
      );
    }

    const calendarData = calendarDoc.data();
    if (!calendarData) {
      throw new functions.https.HttpsError(
        "not-found",
        "Calendar entry data is empty"
      );
    }

    // Check if status is 'pending_approval'
    if (calendarData.status !== "pending_approval") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Calendar entry must be in 'pending_approval' status. Current status: ${calendarData.status}`
      );
    }

    // Step 1: Transfer image from Firebase Storage to WordPress if needed
    let wordpressMediaId: number | undefined = calendarData.wordpressMediaId;
    const featuredImageUrl = calendarData.featuredImageUrl as string | undefined;

    // Check if we need to transfer image (has Firebase URL but no WordPress media ID)
    if (featuredImageUrl && !wordpressMediaId && featuredImageUrl.includes("storage.googleapis.com")) {
      try {
        console.log("[approvePostCallable] Transferring image from Firebase Storage to WordPress...");

        // Get site credentials
        const siteDoc = await admin.firestore().collection("sites").doc(siteId).get();
        if (!siteDoc.exists) {
          throw new Error(`Site not found: ${siteId}`);
        }
        const siteData = siteDoc.data();
        if (!siteData) {
          throw new Error(`Site data is empty for siteId: ${siteId}`);
        }

        if (!siteData.wordpressUrl || !siteData.wordpressUsername || !siteData.wordpressAppPassword) {
          console.warn("[approvePostCallable] WordPress credentials not configured, skipping image transfer");
        } else {
          // Clean WordPress URL
          const cleanWordPressUrl = siteData.wordpressUrl.replace(/\/$/, "").replace(/\/wp-json\/?$/, "");
          const baseUrl = cleanWordPressUrl.startsWith("http") ? cleanWordPressUrl : `https://${cleanWordPressUrl}`;

          // Upload image to WordPress
          wordpressMediaId = await uploadImageToWordPress(
            featuredImageUrl,
            baseUrl,
            siteData.wordpressUsername,
            siteData.wordpressAppPassword
          );

          // Save WordPress media ID to Firestore
          await calendarRef.update({
            wordpressMediaId: wordpressMediaId,
            updatedAt: admin.firestore.Timestamp.now(),
          });

          console.log(`[approvePostCallable] ✅ Image transferred to WordPress. Media ID: ${wordpressMediaId}`);
        }
      } catch (error: any) {
        console.error("[approvePostCallable] ⚠️ Failed to transfer image to WordPress:", error);
        // Continue with approval even if image transfer fails - not critical
        // The image can be uploaded later during publish
      }
    }

    const now = admin.firestore.Timestamp.now();
    const scheduledDate = calendarData.scheduledDate as admin.firestore.Timestamp;

    // Check if scheduled date has passed
    if (scheduledDate && scheduledDate <= now) {
      // Overdue: Publish immediately
      console.log("[approvePostCallable] Post is overdue, publishing immediately...");
      const result = await processCalendarEntry(siteId, calendarId, "publish");

      if (result.success) {
        return {
          success: true,
          action: "published_immediately",
          postId: result.postId,
          postUrl: result.postUrl,
        };
      } else {
        throw new functions.https.HttpsError(
          "internal",
          result.error || "Failed to publish post immediately"
        );
      }
    } else {
      // Future date: Just approve for later
      console.log("[approvePostCallable] Post is scheduled for future, setting status to 'approved'...");
      await calendarRef.update({
        status: "approved",
        approvedAt: admin.firestore.Timestamp.now(),
        approvedBy: context.auth.uid,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      return {
        success: true,
        action: "approved_for_later",
      };
    }
  } catch (error: any) {
    console.error("[approvePostCallable] Error:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      "Failed to approve post",
      error.message
    );
  }
});

/**
 * HTTP callable function to regenerate blog image
 * Generates a new DALL-E image and saves it to Firebase Storage
 */
export const regenerateBlogImageCallable = region.runWith({
  timeoutSeconds: 120, // 2 minutes for image generation and upload
  memory: "1GB",
}).https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { siteId, calendarId } = data;

  if (!siteId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: siteId"
    );
  }

  if (!calendarId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: calendarId"
    );
  }

  try {
    const calendarRef = admin.firestore()
      .collection("sites")
      .doc(siteId)
      .collection("contentCalendar")
      .doc(calendarId);

    const calendarDoc = await calendarRef.get();

    if (!calendarDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Calendar entry not found"
      );
    }

    const calendarData = calendarDoc.data();
    if (!calendarData) {
      throw new functions.https.HttpsError(
        "not-found",
        "Calendar entry data is empty"
      );
    }

    if (!calendarData.imagePrompt) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Calendar entry does not have an imagePrompt"
      );
    }

    console.log(`[regenerateBlogImageCallable] Regenerating image for calendar entry: ${calendarId}`);

    // Step 1: Generate new DALL-E image
    const dallEImageUrl = await generateBlogImage(calendarData.imagePrompt);
    console.log(`[regenerateBlogImageCallable] ✅ New DALL-E image generated: ${dallEImageUrl}`);

    // Step 2: Save to Firebase Storage (overwriting existing file at same path)
    const storagePath = `sites/${siteId}/${calendarId}.png`;
    const firebaseStorageUrl = await saveToFirebaseStorage(dallEImageUrl, storagePath);
    console.log(`[regenerateBlogImageCallable] ✅ Image saved to Firebase Storage: ${firebaseStorageUrl}`);

    // Step 3: Update Firestore with new image URL and remove wordpressMediaId
    // (since the old image is gone, we need to upload the new one upon approval)
    await calendarRef.update({
      featuredImageUrl: firebaseStorageUrl,
      wordpressMediaId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    console.log("[regenerateBlogImageCallable] ✅ Calendar entry updated with new image URL and wordpressMediaId removed");

    return {
      success: true,
      imageUrl: firebaseStorageUrl,
    };
  } catch (error: any) {
    console.error("[regenerateBlogImageCallable] Error:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      `Failed to regenerate blog image: ${error.message}`
    );
  }
});

/**
 * Recursively fetch and parse sitemap URLs
 * Handles both sitemap indices and regular sitemaps
 * @param {string} sitemapUrl - The sitemap URL to fetch
 * @param {Set<string>} visitedUrls - Set of already visited sitemap URLs to prevent infinite loops
 * @param {number} maxDepth - Maximum recursion depth (default: 5)
 * @return {Promise<string[]>} Array of all URLs found
 */
async function fetchSitemapRecursive(
  sitemapUrl: string,
  visitedUrls: Set<string> = new Set(),
  maxDepth = 5
): Promise<string[]> {
  if (maxDepth <= 0) {
    console.warn(`[fetchSitemapRecursive] Max depth reached for ${sitemapUrl}`);
    return [];
  }

  if (visitedUrls.has(sitemapUrl)) {
    console.warn(`[fetchSitemapRecursive] Already visited ${sitemapUrl}, skipping to prevent loop`);
    return [];
  }

  visitedUrls.add(sitemapUrl);

  try {
    console.log(`[fetchSitemapRecursive] Fetching sitemap: ${sitemapUrl} (depth: ${maxDepth})`);

    const response = await axios.get(sitemapUrl, {
      headers: {
        "User-Agent": "ApexSEO/1.0",
      },
      timeout: 30000, // 30 second timeout for large sitemaps
    });

    const xmlText = response.data;

    // Parse XML using xml2js
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlText);

    const allUrls: string[] = [];

    // Handle sitemap index (contains multiple sitemaps)
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      const sitemaps = result.sitemapindex.sitemap;
      console.log(`[fetchSitemapRecursive] Detected sitemap index with ${sitemaps.length} sub-sitemaps`);

      // Recursively fetch each sub-sitemap
      for (const sitemapEntry of sitemaps) {
        if (sitemapEntry.loc && sitemapEntry.loc[0]) {
          const subSitemapUrl = sitemapEntry.loc[0];
          const subUrls = await fetchSitemapRecursive(subSitemapUrl, visitedUrls, maxDepth - 1);
          allUrls.push(...subUrls);
        }
      }
    }

    // Handle regular sitemap (contains URLs)
    if (result.urlset && result.urlset.url) {
      for (const urlEntry of result.urlset.url) {
        if (urlEntry.loc && urlEntry.loc[0]) {
          const url = urlEntry.loc[0];
          allUrls.push(url);
        }
      }
    }

    console.log(`[fetchSitemapRecursive] ✅ Extracted ${allUrls.length} URLs from ${sitemapUrl}`);
    return allUrls;
  } catch (error: any) {
    console.error(`[fetchSitemapRecursive] ❌ Error fetching sitemap ${sitemapUrl}:`, error.message);
    return [];
  }
}

/**
 * Filter URLs to keep only valid blog/page URLs
 * @param {string[]} urls - Array of URLs to filter
 * @return {string[]} Filtered array of valid URLs
 */
function filterValidUrls(urls: string[]): string[] {
  return urls.filter((url) => {
    const lowerUrl = url.toLowerCase();

    // Exclude system/admin URLs
    if (
      lowerUrl.includes("wp-json") ||
      lowerUrl.includes(".xml") ||
      lowerUrl.includes("/feed") ||
      lowerUrl.includes("/author") ||
      lowerUrl.includes("/tag/") ||
      lowerUrl.includes("/category/") ||
      lowerUrl.endsWith("/feed/") ||
      lowerUrl.includes("?") ||
      lowerUrl.includes("/wp-admin") ||
      lowerUrl.includes("/wp-content/uploads") ||
      lowerUrl.includes(".jpg") ||
      lowerUrl.includes(".png") ||
      lowerUrl.includes(".gif") ||
      lowerUrl.includes(".svg") ||
      lowerUrl.includes(".pdf") ||
      lowerUrl.includes(".zip") ||
      lowerUrl.includes(".css") ||
      lowerUrl.includes(".js")
    ) {
      return false;
    }

    // Must be a valid HTTP/HTTPS URL
    if (!lowerUrl.startsWith("http://") && !lowerUrl.startsWith("https://")) {
      return false;
    }

    return true;
  });
}

/**
 * HTTP callable function to fetch and parse sitemap
 * Recursively handles sitemap indices and saves URLs to Firestore
 */
export const fetchSitemapCallable = region.runWith({
  timeoutSeconds: 300, // 5 minutes for large sitemaps
  memory: "1GB",
}).https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { siteId, sitemapUrl } = data;

  if (!siteId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: siteId"
    );
  }

  if (!sitemapUrl) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: sitemapUrl"
    );
  }

  try {
    console.log(`[fetchSitemapCallable] Fetching sitemap for siteId: ${siteId}, URL: ${sitemapUrl}`);

    // Verify site exists and user has access
    const siteRef = admin.firestore().collection("sites").doc(siteId);
    const siteDoc = await siteRef.get();

    if (!siteDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Site not found"
      );
    }

    const siteData = siteDoc.data();
    if (!siteData) {
      throw new functions.https.HttpsError(
        "not-found",
        "Site data is empty"
      );
    }

    // Check if user owns the site
    if (siteData.userId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You do not have permission to access this site"
      );
    }

    // Recursively fetch all URLs from sitemap
    const allUrls = await fetchSitemapRecursive(sitemapUrl);

    // Filter to keep only valid blog/page URLs
    const validUrls = filterValidUrls(allUrls);

    // Remove duplicates
    const uniqueUrls = Array.from(new Set(validUrls));

    // Limit to 500 URLs
    const limitedUrls = uniqueUrls.slice(0, 500);

    console.log(`[fetchSitemapCallable] ✅ Found ${limitedUrls.length} valid URLs (from ${allUrls.length} total)`);

    // Save to Firestore
    await siteRef.update({
      sitemapUrl: sitemapUrl,
      availableLinks: limitedUrls,
      sitemapLastSyncedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    console.log(`[fetchSitemapCallable] ✅ Saved ${limitedUrls.length} URLs to site document`);

    return {
      success: true,
      count: limitedUrls.length,
      totalFound: allUrls.length,
      filtered: validUrls.length,
    };
  } catch (error: any) {
    console.error("[fetchSitemapCallable] Error:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      "Failed to fetch sitemap",
      error.message
    );
  }
});

/**
 * Scheduled function to draft upcoming posts (3 days in advance)
 * Runs daily at 2 AM UTC
 */
/**
 * Core logic for generating drafts for upcoming posts
 * Extracted into a reusable function for both scheduled and manual execution
 */
async function runDraftUpcomingPostsProcessor(): Promise<{
  totalFound: number;
  successful: number;
  failed: number;
  results: Array<{ success: boolean; calendarId: string; siteId: string; error?: string }>;
}> {
  console.log("[runDraftUpcomingPostsProcessor] Starting draft generation for upcoming posts...");

  const now = admin.firestore.Timestamp.now();
  const threeDaysFromNow = new Date(now.toDate());
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  const threeDaysFromNowTimestamp = admin.firestore.Timestamp.fromDate(threeDaysFromNow);

  console.log(`[runDraftUpcomingPostsProcessor] Current time: ${now.toDate().toISOString()}`);
  console.log(`[runDraftUpcomingPostsProcessor] Looking for posts scheduled within next 3 days (up to ${threeDaysFromNowTimestamp.toDate().toISOString()})`);

  // Step 1: Query for scheduled posts within the next 3 days
  // Also include "error" status posts that don't have content yet (for retry)
  const scheduledQuery = admin.firestore()
    .collectionGroup("contentCalendar")
    .where("status", "==", "scheduled")
    .where("scheduledDate", ">=", now)
    .where("scheduledDate", "<=", threeDaysFromNowTimestamp);

  const errorQuery = admin.firestore()
    .collectionGroup("contentCalendar")
    .where("status", "==", "error")
    .where("scheduledDate", ">=", now)
    .where("scheduledDate", "<=", threeDaysFromNowTimestamp);

  let scheduledSnapshot;
  let errorSnapshot;
  try {
    [scheduledSnapshot, errorSnapshot] = await Promise.all([
      scheduledQuery.get(),
      errorQuery.get(),
    ]);
  } catch (queryError: any) {
    // Check if error is due to missing index
    if (queryError.message && queryError.message.includes("index")) {
      console.error("[runDraftUpcomingPostsProcessor] ❌ QUERY FAILED: Missing Firestore index!");
      console.error("[runDraftUpcomingPostsProcessor] Required index:");
      console.error("[runDraftUpcomingPostsProcessor]   Collection Group: contentCalendar");
      console.error("[runDraftUpcomingPostsProcessor]   Fields: status (ASCENDING), scheduledDate (ASCENDING)");
      throw new Error(`Missing Firestore index for draft upcoming posts query: ${queryError.message}`);
    }
    throw queryError;
  }

  // Filter error posts to only include those without generatedContent (retry failed drafts)
  const errorDocsWithoutContent = errorSnapshot.docs.filter((doc) => {
    const data = doc.data();
    return !data.generatedContent; // Only retry if content doesn't exist
  });

  // Combine both query results
  const allDocs = [...scheduledSnapshot.docs, ...errorDocsWithoutContent];

  console.log(`[runDraftUpcomingPostsProcessor] Found ${scheduledSnapshot.size} scheduled posts and ${errorDocsWithoutContent.length} error posts (without content) to draft`);

  if (allDocs.length === 0) {
    console.log("[runDraftUpcomingPostsProcessor] No posts to draft. Exiting.");
    return {
      totalFound: 0,
      successful: 0,
      failed: 0,
      results: [],
    };
  }

  // Step 2: Process entries in batches with concurrency control
  const entries = allDocs;
  const concurrencyLimit = 5;
  const results: Array<{ success: boolean; calendarId: string; siteId: string; error?: string }> = [];

  console.log(`[runDraftUpcomingPostsProcessor] Processing ${entries.length} entries in batches of ${concurrencyLimit}`);

  for (let i = 0; i < entries.length; i += concurrencyLimit) {
    const batch = entries.slice(i, i + concurrencyLimit);
    const batchNumber = Math.floor(i / concurrencyLimit) + 1;
    const totalBatches = Math.ceil(entries.length / concurrencyLimit);

    console.log(
      `[runDraftUpcomingPostsProcessor] Processing batch ${batchNumber}/${totalBatches} (${batch.length} entries)`
    );

    const batchPromises = batch.map(async (doc) => {
      try {
        const siteId = doc.ref.parent.parent?.id;
        const calendarId = doc.id;

        if (!siteId) {
          console.error(
            `[runDraftUpcomingPostsProcessor] ❌ Could not extract siteId from path: ${doc.ref.path}`
          );
          return {
            success: false,
            calendarId,
            siteId: "unknown",
            error: "Could not extract siteId from document path",
          };
        }

        const calendarData = doc.data();
        const scheduledDate = calendarData.scheduledDate as admin.firestore.Timestamp;
        console.log(
          `[runDraftUpcomingPostsProcessor] Drafting: siteId=${siteId}, calendarId=${calendarId}, topic="${calendarData.blogTopic || "Unknown"}", scheduledDate=${scheduledDate.toDate().toISOString()}`
        );

        // Call processCalendarEntry with mode='draft'
        const result = await processCalendarEntry(siteId, calendarId, "draft");

        if (result.success) {
          console.log(
            `[runDraftUpcomingPostsProcessor] ✅ Successfully drafted: siteId=${siteId}, calendarId=${calendarId}`
          );
        } else {
          console.error(
            `[runDraftUpcomingPostsProcessor] ❌ Failed to draft: siteId=${siteId}, calendarId=${calendarId}, error=${result.error}`
          );
        }

        return {
          success: result.success,
          calendarId,
          siteId,
          error: result.error,
        };
      } catch (error: any) {
        console.error(
          `[runDraftUpcomingPostsProcessor] ❌ Error drafting entry ${doc.id}:`,
          error
        );
        return {
          success: false,
          calendarId: doc.id,
          siteId: doc.ref.parent.parent?.id || "unknown",
          error: error.message || "Unknown error",
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (i + concurrencyLimit < entries.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Step 3: Log summary
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log("[runDraftUpcomingPostsProcessor] ✅ Draft generation complete:");
  console.log(`  - Total entries found: ${entries.length}`);
  console.log(`  - Successfully drafted: ${successful}`);
  console.log(`  - Failed: ${failed}`);

  if (failed > 0) {
    console.log("[runDraftUpcomingPostsProcessor] Failed entries:");
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.siteId}/${r.calendarId}: ${r.error}`);
      });
  }

  return {
    totalFound: entries.length,
    successful,
    failed,
    results,
  };
}

/**
 * Scheduled function to generate drafts for upcoming posts
 * Runs every day at 2 AM UTC
 * Generates drafts for posts scheduled within the next 3 days
 */
export const draftUpcomingPosts = region.runWith({
  timeoutSeconds: 540, // 9 minutes
  memory: "1GB",
}).pubsub
  .schedule("0 2 * * *") // Every day at 2 AM UTC
  .timeZone("UTC")
  .onRun(async (_context) => {
    try {
      return await runDraftUpcomingPostsProcessor();
    } catch (error: any) {
      console.error("[draftUpcomingPosts] ❌ Fatal error:", error);
      throw error;
    }
  });

/**
 * Callable Function: Force Run Draft Generator (Manual Trigger)
 * Allows manual execution of the draft generation for upcoming posts
 * Only accessible by App Owners
 */
export const forceRunDraftGeneratorCallable = region.runWith({
  timeoutSeconds: 540, // 9 minutes
  memory: "1GB",
}).https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  // Security: Only allow Super Admins to trigger this
  const userId = context.auth.uid;
  const userEmail = context.auth.token.email;

  if (!isSuperAdmin(userEmail)) {
    console.log(`[forceRunDraftGeneratorCallable] ❌ Access denied for user ${userId} - not a super admin email`);
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only Super Admins can trigger the draft generator manually"
    );
  }

  console.log(`[forceRunDraftGeneratorCallable] Manual trigger by user: ${userId}`);

  try {
    const result = await runDraftUpcomingPostsProcessor();

    return {
      success: true,
      ...result,
      message: `Processed ${result.totalFound} posts. ${result.successful} drafts generated successfully, ${result.failed} failed.`,
    };
  } catch (error: any) {
    console.error("[forceRunDraftGeneratorCallable] ❌ Error:", error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to run draft generator: ${error.message}`,
      error.message
    );
  }
});

/**
 * Core logic for processing scheduled posts
 * Extracted into a reusable function for both scheduled and manual execution
 */
async function runScheduledPostProcessor(): Promise<{
  totalFound: number;
  successful: number;
  failed: number;
  results: Array<{ success: boolean; calendarId: string; siteId: string; error?: string; postId?: number | string }>;
}> {
  console.log("[runScheduledPostProcessor] ========================================");
  console.log("[runScheduledPostProcessor] Starting scheduled post publishing check...");

  const now = admin.firestore.Timestamp.now();
  console.log(`[runScheduledPostProcessor] Current time: ${now.toDate().toISOString()}`);

  // Step 0: Orphan recovery — reset posts stuck in "processing" for > 30 minutes
  const thirtyMinsAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 30 * 60 * 1000);
  try {
    const orphanSnapshot = await admin.firestore()
      .collectionGroup("contentCalendar")
      .where("status", "==", "processing")
      .where("updatedAt", "<=", thirtyMinsAgo)
      .get();

    if (!orphanSnapshot.empty) {
      console.warn(`[runScheduledPostProcessor] ⚠️ Found ${orphanSnapshot.size} orphaned "processing" posts — resetting to "approved"`);
      const batch = admin.firestore().batch();
      orphanSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          status: "approved",
          errorMessage: "Reset from stuck processing state",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }
  } catch (orphanErr: any) {
    console.warn("[runScheduledPostProcessor] Orphan recovery skipped:", orphanErr.message);
  }

  // Step 1: Perform Collection Group Query on contentCalendar
  // Query for approved posts due now, PLUS error posts with content that are overdue (auto-retry)
  const query = admin.firestore()
    .collectionGroup("contentCalendar")
    .where("status", "==", "approved") // Only approved posts
    .where("scheduledDate", "<=", now); // Only posts that are due (past or current time)

  let snapshot;
  try {
    snapshot = await query.get();
  } catch (queryError: any) {
    // Check if error is due to missing index
    if (queryError.message && queryError.message.includes("index")) {
      console.error("[runScheduledPostProcessor] ❌ QUERY FAILED: Missing Firestore index!");
      console.error("[runScheduledPostProcessor] Required index:");
      console.error("[runScheduledPostProcessor]   Collection Group: contentCalendar");
      console.error("[runScheduledPostProcessor]   Fields: status (ASCENDING), scheduledDate (ASCENDING)");
      console.error("[runScheduledPostProcessor] Please create this index in Firestore or check firestore.indexes.json");
      throw new Error(`Missing Firestore index for scheduled post query: ${queryError.message}`);
    }
    throw queryError;
  }

  // Also pick up "error" posts that have content and are overdue — auto-retry
  let errorRetryDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  try {
    const errorSnapshot = await admin.firestore()
      .collectionGroup("contentCalendar")
      .where("status", "==", "error")
      .where("scheduledDate", "<=", now)
      .get();
    // Only retry if content was already generated
    errorRetryDocs = errorSnapshot.docs.filter((doc) => !!doc.data().generatedContent);
    if (errorRetryDocs.length > 0) {
      console.log(`[runScheduledPostProcessor] Found ${errorRetryDocs.length} error posts with content to retry`);
      // Reset them to approved so they get processed
      const batch = admin.firestore().batch();
      errorRetryDocs.forEach((doc) => {
        batch.update(doc.ref, {
          status: "approved",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }
  } catch (retryErr: any) {
    console.warn("[runScheduledPostProcessor] Error retry query skipped:", retryErr.message);
  }

  console.log(`[runScheduledPostProcessor] Found ${snapshot.size} due calendar entries to process`);

  if (snapshot.empty) {
    console.log("[runScheduledPostProcessor] No due entries found. Exiting.");
    return {
      totalFound: 0,
      successful: 0,
      failed: 0,
      results: [],
    };
  }

  // Step 2: Process entries in batches with concurrency control
  const entries = snapshot.docs;
  const concurrencyLimit = 5; // Process 5 entries at a time to avoid rate limits
  const results: Array<{ success: boolean; calendarId: string; siteId: string; error?: string; postId?: number | string }> = [];

  console.log(`[runScheduledPostProcessor] Processing ${entries.length} entries in batches of ${concurrencyLimit}`);

  // Process in batches
  for (let i = 0; i < entries.length; i += concurrencyLimit) {
    const batch = entries.slice(i, i + concurrencyLimit);
    const batchNumber = Math.floor(i / concurrencyLimit) + 1;
    const totalBatches = Math.ceil(entries.length / concurrencyLimit);

    console.log(
      `[runScheduledPostProcessor] Processing batch ${batchNumber}/${totalBatches} (${batch.length} entries)`
    );

    // Process batch in parallel (up to concurrencyLimit)
    const batchPromises = batch.map(async (doc) => {
      try {
        // Extract siteId from document path: sites/{siteId}/contentCalendar/{calendarId}
        const siteId = doc.ref.parent.parent?.id;
        const calendarId = doc.id;

        if (!siteId) {
          console.error(
            `[runScheduledPostProcessor] ❌ Could not extract siteId from path: ${doc.ref.path}`
          );
          return {
            success: false,
            calendarId,
            siteId: "unknown",
            error: "Could not extract siteId from document path",
          };
        }

        const calendarData = doc.data();
        const scheduledDate = calendarData.scheduledDate as admin.firestore.Timestamp;
        const currentStatus = calendarData.status as string;

        // Double-check status and scheduledDate before processing
        if (currentStatus !== "approved") {
          console.warn(
            `[runScheduledPostProcessor] ⚠️ Skipping ${calendarId}: status is "${currentStatus}", expected "approved"`
          );
          return {
            success: false,
            calendarId,
            siteId,
            error: `Status is "${currentStatus}", not "approved"`,
          };
        }

        if (!scheduledDate || scheduledDate > now) {
          console.warn(
            `[runScheduledPostProcessor] ⚠️ Skipping ${calendarId}: scheduledDate is in the future`
          );
          return {
            success: false,
            calendarId,
            siteId,
            error: "Scheduled date is in the future",
          };
        }

        console.log(
          `[runScheduledPostProcessor] Processing: siteId=${siteId}, calendarId=${calendarId}, topic="${calendarData.blogTopic || "Unknown"}", scheduledDate=${scheduledDate.toDate().toISOString()}`
        );

        // Step 3: Call processCalendarEntry with mode='publish'
        // CRITICAL: This function will update status to 'published' after successful publishing
        const result = await processCalendarEntry(siteId, calendarId, "publish");

        if (result.success) {
          console.log(
            `[runScheduledPostProcessor] ✅ Successfully published: siteId=${siteId}, calendarId=${calendarId}, postId=${result.postId}, postUrl=${result.postUrl || "N/A"}`
          );
          // Status is automatically updated to 'published' in processCalendarEntry (line 3494)
        } else {
          console.error(
            `[runScheduledPostProcessor] ❌ Failed to publish: siteId=${siteId}, calendarId=${calendarId}, error=${result.error}`
          );
        }

        return {
          success: result.success,
          calendarId,
          siteId,
          error: result.error,
          postId: result.postId,
        };
      } catch (error: any) {
        console.error(
          `[runScheduledPostProcessor] ❌ Error processing entry ${doc.id}:`,
          error
        );
        return {
          success: false,
          calendarId: doc.id,
          siteId: doc.ref.parent.parent?.id || "unknown",
          error: error.message || "Unknown error",
        };
      }
    });

    // Wait for batch to complete before processing next batch
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches to avoid overwhelming APIs
    if (i + concurrencyLimit < entries.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
    }
  }

  // Step 4: Log detailed summary
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log("[runScheduledPostProcessor] ========================================");
  console.log("[runScheduledPostProcessor] ✅ Processing complete:");
  console.log(`[runScheduledPostProcessor]   - Total entries found: ${entries.length}`);
  console.log(`[runScheduledPostProcessor]   - Successfully published: ${successful}`);
  console.log(`[runScheduledPostProcessor]   - Failed: ${failed}`);

  if (successful > 0) {
    console.log("[runScheduledPostProcessor] Successfully published entries:");
    results
      .filter((r) => r.success)
      .forEach((r) => {
        console.log(`[runScheduledPostProcessor]   ✅ ${r.siteId}/${r.calendarId} (Post ID: ${r.postId || "N/A"})`);
      });
  }

  if (failed > 0) {
    console.log("[runScheduledPostProcessor] Failed entries:");
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`[runScheduledPostProcessor]   ❌ ${r.siteId}/${r.calendarId}: ${r.error}`);
      });
  }

  console.log("[runScheduledPostProcessor] ========================================");

  return {
    totalFound: entries.length,
    successful,
    failed,
    results,
  };
}

/**
 * Scheduled function to check for approved posts and publish them
 * Runs every hour
 *
 * Query Logic:
 * - Finds posts where status == 'approved' AND scheduledDate <= now
 * - Processes all found posts and publishes them to WordPress
 * - Updates status to 'published' after successful publishing (handled in processCalendarEntry)
 *
 * Index Required:
 * - Collection Group: contentCalendar
 * - Fields: status (ASCENDING), scheduledDate (ASCENDING)
 */
export const checkScheduledPosts = region.runWith({
  timeoutSeconds: 540, // 9 minutes (allows time for processing multiple posts)
  memory: "1GB",
}).pubsub
  .schedule("0 * * * *") // Every hour at minute 0
  .timeZone("UTC")
  .onRun(async (_context) => {
    try {
      return await runScheduledPostProcessor();
    } catch (error: any) {
      console.error("[checkScheduledPosts] ❌ Fatal error:", error);
      console.error("[checkScheduledPosts] Error stack:", error.stack);
      throw error;
    }
  });

/**
 * Callable Function: Force Run Scheduler (Manual Trigger)
 * Allows manual execution of the scheduled post processor for testing
 * Only accessible by App Owners
 */
export const forceRunSchedulerCallable = region.runWith({
  timeoutSeconds: 540, // 9 minutes (allows time for processing multiple posts)
  memory: "1GB",
}).https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  // Security: Only allow Super Admins to trigger this
  const userId = context.auth.uid;
  const userEmail = context.auth.token.email;

  if (!isSuperAdmin(userEmail)) {
    console.log(`[forceRunSchedulerCallable] ❌ Access denied for user ${userId} - not a super admin email`);
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only Super Admins can trigger the scheduler manually"
    );
  }

  console.log(`[forceRunSchedulerCallable] Manual trigger by user: ${userId}`);

  try {
    const result = await runScheduledPostProcessor();

    return {
      success: true,
      ...result,
      message: `Processed ${result.totalFound} posts. ${result.successful} successful, ${result.failed} failed.`,
    };
  } catch (error: any) {
    console.error("[forceRunSchedulerCallable] ❌ Error:", error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to run scheduler: ${error.message}`,
      error.message
    );
  }
});

export const fetchSitemap = region.https.onCall(async (data, context) => {
  // 1. Authentication Check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const {siteUrl, customSitemapUrl} = data;

  if (!siteUrl) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with \"siteUrl\" argument."
    );
  }

  try {
    // Use custom sitemap URL if provided, otherwise use default WordPress sitemap
    const sitemapUrl = customSitemapUrl || `${siteUrl.replace(/\/$/, "")}/wp-sitemap.xml`;
    console.log(`Fetching sitemap from: ${sitemapUrl}`);

    const response = await fetch(sitemapUrl, {
      headers: {
        "User-Agent": "ApexSEO/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.statusText}`);
    }

    const text = await response.text();

    // Check if this is a sitemap index (contains <sitemapindex>)
    const isSitemapIndex = text.includes("<sitemapindex") || text.includes("</sitemapindex>");

    const urls: string[] = [];

    if (isSitemapIndex) {
      console.log("Detected sitemap index, fetching sub-sitemaps...");
      // Extract all sitemap URLs from the index
      const sitemapLocRegex = /<loc>(.*?)<\/loc>/g;
      const sitemapUrls: string[] = [];
      let sitemapMatch;

      while ((sitemapMatch = sitemapLocRegex.exec(text)) !== null) {
        sitemapUrls.push(sitemapMatch[1]);
      }

      console.log(`Found ${sitemapUrls.length} sub-sitemaps in index`);

      // Fetch each sub-sitemap and extract URLs
      for (const subSitemapUrl of sitemapUrls) {
        try {
          console.log(`Fetching sub-sitemap: ${subSitemapUrl}`);
          const subSitemapResponse = await fetch(subSitemapUrl, {
            headers: {
              "User-Agent": "ApexSEO/1.0",
            },
          });

          if (subSitemapResponse.ok) {
            const subSitemapText = await subSitemapResponse.text();
            // Extract URLs from this sub-sitemap
            const urlLocRegex = /<loc>(.*?)<\/loc>/g;
            const urlsBefore = urls.length;
            let urlMatch;
            while ((urlMatch = urlLocRegex.exec(subSitemapText)) !== null) {
              urls.push(urlMatch[1]);
            }
            const urlsExtracted = urls.length - urlsBefore;
            console.log(`Extracted ${urlsExtracted} URLs from ${subSitemapUrl}, total so far: ${urls.length}`);
          } else {
            console.warn(`Failed to fetch sub-sitemap ${subSitemapUrl}: ${subSitemapResponse.statusText}`);
          }
        } catch (error: any) {
          console.warn(`Error fetching sub-sitemap ${subSitemapUrl}:`, error.message);
        }
      }
    } else {
      // Regular sitemap - extract URLs directly
      const locRegex = /<loc>(.*?)<\/loc>/g;
      let match;
      while ((match = locRegex.exec(text)) !== null) {
        urls.push(match[1]);
      }
    }

    console.log(`Found ${urls.length} total URLs in sitemap(s)`);
    return {urls};
  } catch (error: any) {
    console.error("Error fetching sitemap:", error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to fetch sitemap: ${error.message}`
    );
  }
});

export const fetchPageMetadata = region.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const {url} = data;

  if (!url) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with \"url\" argument."
    );
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ApexSEO/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract meta title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Extract meta description
    const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                          html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
    const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : "";

    // Extract og:title as fallback
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : "";

    return {
      url,
      title: title || ogTitle || "No title found",
      metaDescription: metaDescription || "No description found",
    };
  } catch (error: any) {
    console.error(`Error fetching metadata for ${url}:`, error);
    return {
      url,
      title: "Error fetching",
      metaDescription: error.message || "Failed to fetch",
    };
  }
});

export const fetchSitemapWithMetadata = region.runWith({
  timeoutSeconds: 540, // 9 minutes (max for v1 functions) for large sitemaps with metadata
  memory: "2GB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const {siteUrl, customSitemapUrl} = data;

  if (!siteUrl) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with \"siteUrl\" argument."
    );
  }

  try {
    // First, fetch the sitemap
    const sitemapUrl = customSitemapUrl || `${siteUrl.replace(/\/$/, "")}/wp-sitemap.xml`;
    console.log(`Fetching sitemap from: ${sitemapUrl}`);

    const sitemapResponse = await fetch(sitemapUrl, {
      headers: {
        "User-Agent": "ApexSEO/1.0",
      },
    });

    if (!sitemapResponse.ok) {
      throw new Error(`Failed to fetch sitemap: ${sitemapResponse.statusText}`);
    }

    const sitemapText = await sitemapResponse.text();

    // Check if this is a sitemap index (contains <sitemapindex>)
    const isSitemapIndex = sitemapText.includes("<sitemapindex") || sitemapText.includes("</sitemapindex>");

    const urls: string[] = [];

    if (isSitemapIndex) {
      console.log("Detected sitemap index, fetching sub-sitemaps...");
      // Extract all sitemap URLs from the index
      const sitemapLocRegex = /<loc>(.*?)<\/loc>/g;
      const sitemapUrls: string[] = [];
      let sitemapMatch;

      while ((sitemapMatch = sitemapLocRegex.exec(sitemapText)) !== null) {
        sitemapUrls.push(sitemapMatch[1]);
      }

      console.log(`Found ${sitemapUrls.length} sub-sitemaps in index`);

      // Fetch each sub-sitemap and extract URLs
      for (const subSitemapUrl of sitemapUrls) {
        try {
          console.log(`Fetching sub-sitemap: ${subSitemapUrl}`);
          const subSitemapResponse = await fetch(subSitemapUrl, {
            headers: {
              "User-Agent": "ApexSEO/1.0",
            },
          });

          if (subSitemapResponse.ok) {
            const subSitemapText = await subSitemapResponse.text();
            // Extract URLs from this sub-sitemap
            const urlLocRegex = /<loc>(.*?)<\/loc>/g;
            let urlMatch;
            const urlsBefore = urls.length;
            while ((urlMatch = urlLocRegex.exec(subSitemapText)) !== null) {
              urls.push(urlMatch[1]);
            }
            const urlsExtracted = urls.length - urlsBefore;
            console.log(`Extracted ${urlsExtracted} URLs from ${subSitemapUrl}, total so far: ${urls.length}`);
          } else {
            console.warn(`Failed to fetch sub-sitemap ${subSitemapUrl}: ${subSitemapResponse.statusText}`);
          }
        } catch (error: any) {
          console.warn(`Error fetching sub-sitemap ${subSitemapUrl}:`, error.message);
        }
      }
    } else {
      // Regular sitemap - extract URLs directly
      const locRegex = /<loc>(.*?)<\/loc>/g;
      let match;
      while ((match = locRegex.exec(sitemapText)) !== null) {
        urls.push(match[1]);
      }
    }

    console.log(`Found ${urls.length} total URLs in sitemap(s)`);

    // Limit to first 100 URLs to avoid timeout (9 min max for v1 functions)
    // For very large sites, consider processing in multiple batches or upgrading to v2 functions
    const maxUrls = Math.min(urls.length, 100);
    const urlsToProcess = urls.slice(0, maxUrls);

    if (urls.length > maxUrls) {
      console.log(`Limiting to first ${maxUrls} URLs out of ${urls.length} total (to avoid timeout)`);
    }

    // Fetch metadata for each URL (in batches to avoid overwhelming)
    const metadataResults: Array<{url: string; title: string; metaDescription: string}> = [];
    const batchSize = 15; // Process 15 URLs in parallel for faster processing

    const totalBatches = Math.ceil(urlsToProcess.length / batchSize);
    console.log(`Processing ${urlsToProcess.length} URLs in ${totalBatches} batches of ${batchSize}`);

    for (let i = 0; i < urlsToProcess.length; i += batchSize) {
      const batch = urlsToProcess.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} URLs, ${metadataResults.length} total processed so far)`);

      const batchPromises = batch.map(async (url) => {
        try {
          // Add timeout to individual fetch requests (3 seconds per URL for faster processing)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);

          const response = await fetch(url, {
            headers: {
              "User-Agent": "ApexSEO/1.0",
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            return {
              url,
              title: `Error: ${response.statusText}`,
              metaDescription: "",
            };
          }

          const html = await response.text();

          // Extract meta title
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : "";

          // Extract meta description
          const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                                html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
          const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : "";

          // Extract og:title as fallback
          const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
          const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : "";

          return {
            url,
            title: title || ogTitle || "No title found",
            metaDescription: metaDescription || "No description found",
          };
        } catch (error: any) {
          if (error.name === "AbortError") {
            console.warn(`Timeout fetching metadata for ${url} (3s limit)`);
            return {
              url,
              title: "Timeout: URL took too long to respond",
              metaDescription: "",
            };
          }
          console.error(`Error fetching metadata for ${url}:`, error);
          return {
            url,
            title: "Error fetching",
            metaDescription: error.message || "Failed to fetch",
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      metadataResults.push(...batchResults);

      console.log(`Batch ${batchNumber} complete. Total processed: ${metadataResults.length}/${urlsToProcess.length}`);

      // Small delay between batches to avoid rate limiting (only if not last batch)
      if (i + batchSize < urlsToProcess.length) {
        await new Promise((resolve) => setTimeout(resolve, 200)); // Minimal delay for faster processing
      }
    }

    console.log(`Successfully fetched metadata for ${metadataResults.length} pages`);

    return {
      urls: urlsToProcess,
      metadata: metadataResults,
      totalUrls: urls.length,
      processedUrls: urlsToProcess.length,
    };
  } catch (error: any) {
    console.error("Error fetching sitemap with metadata:", error);
    const errorMessage = error.message || "Unknown error occurred";
    console.error("Error details:", {
      message: errorMessage,
      stack: error.stack,
      name: error.name,
    });
    throw new functions.https.HttpsError(
      "internal",
      `Failed to fetch sitemap with metadata: ${errorMessage}`,
      { originalError: errorMessage, stack: error.stack }
    );
  }
});

export const trackPageView = region.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  // Rate limiting
  const clientIP = getClientIP(req);
  const allowed = await checkIPRateLimit(clientIP);
  if (!allowed) {
    res.status(429).send({error: "Rate limit exceeded"});
    return;
  }

  try {
    const {blogId, siteId, timestamp, referrer, userAgent, screenResolution, language, url} = req.body;

    if (!blogId || !siteId) {
      res.status(400).send({error: "Missing required fields"});
      return;
    }

    // Store page view
    await admin.firestore().collection("pageViews").add({
      blogId,
      siteId,
      timestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
      referrer,
      userAgent,
      screenResolution,
      language,
      url,
      date: new Date(timestamp).toISOString().split("T")[0],
    });

    // Update or create blog stats (merge so doc is created on first view if not created at publish)
    const blogRef = admin.firestore().collection("blogs").doc(blogId);
    const blogSnap = await blogRef.get();
    const lastViewedAt = admin.firestore.Timestamp.fromDate(new Date(timestamp));
    if (blogSnap.exists) {
      await blogRef.update({
        totalViews: admin.firestore.FieldValue.increment(1),
        lastViewedAt,
      });
    } else {
      await blogRef.set({
        siteId,
        title: "",
        totalViews: 1,
        lastViewedAt,
      }, {merge: true});
    }

    res.status(200).send({success: true});
    return;
  } catch (error) {
    console.error("Tracking error:", error);
    res.status(500).send({error: "Internal server error"});
    return;
  }
});

export const trackTimeOnPage = region.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  // Rate limiting
  const clientIP = getClientIP(req);
  const allowed = await checkIPRateLimit(clientIP);
  if (!allowed) {
    res.status(429).send({error: "Rate limit exceeded"});
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {blogId, siteId, timeOnPage} = body;

    if (!blogId || !siteId || typeof timeOnPage !== "number") {
      res.status(400).send({error: "Invalid data"});
      return;
    }

    // Store time on page event
    await admin.firestore().collection("timeOnPage").add({
      blogId,
      siteId,
      timeOnPage,
      timestamp: admin.firestore.Timestamp.now(),
    });

    // Update or create blog doc for average time on page
    const blogRef = admin.firestore().collection("blogs").doc(blogId);
    const blog = await blogRef.get();

    if (blog.exists) {
      const blogData = blog.data();
      const currentAvg = blogData?.avgTimeOnPage || 0;
      const currentCount = blogData?.timeOnPageCount || 0;
      const newAvg = ((currentAvg * currentCount) + timeOnPage) / (currentCount + 1);

      await blogRef.update({
        avgTimeOnPage: Math.round(newAvg),
        timeOnPageCount: admin.firestore.FieldValue.increment(1),
      });
    } else {
      await blogRef.set({
        siteId,
        title: "",
        avgTimeOnPage: timeOnPage,
        timeOnPageCount: 1,
      }, {merge: true});
    }

    res.status(200).send({success: true});
    return;
  } catch (error) {
    console.error("Time tracking error:", error);
    res.status(500).send({error: "Internal server error"});
    return;
  }
});

export const trackScrollDepth = region.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  // Rate limiting
  const clientIP = getClientIP(req);
  const allowed = await checkIPRateLimit(clientIP);
  if (!allowed) {
    res.status(429).send({error: "Rate limit exceeded"});
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {blogId, siteId, maxScroll} = body;

    if (!blogId || !siteId || typeof maxScroll !== "number") {
      res.status(400).send({error: "Invalid data"});
      return;
    }

    // Store scroll depth event
    await admin.firestore().collection("scrollDepth").add({
      blogId,
      siteId,
      maxScroll,
      timestamp: admin.firestore.Timestamp.now(),
    });

    // Update or create blog doc for average scroll depth
    const blogRef = admin.firestore().collection("blogs").doc(blogId);
    const blog = await blogRef.get();

    if (blog.exists) {
      const blogData = blog.data();
      const currentAvg = blogData?.avgScrollDepth || 0;
      const currentCount = blogData?.scrollDepthCount || 0;
      const newAvg = ((currentAvg * currentCount) + maxScroll) / (currentCount + 1);

      await blogRef.update({
        avgScrollDepth: Math.round(newAvg),
        scrollDepthCount: admin.firestore.FieldValue.increment(1),
      });
    } else {
      await blogRef.set({
        siteId,
        title: "",
        avgScrollDepth: maxScroll,
        scrollDepthCount: 1,
      }, {merge: true});
    }

    res.status(200).send({success: true});
    return;
  } catch (error) {
    console.error("Scroll tracking error:", error);
    res.status(500).send({error: "Internal server error"});
    return;
  }
});


// Helper function to render weekly report email
function renderWeeklyReport(stats: {
  weekStart: string;
  weekEnd: string;
  blogsPublished: number;
  totalViews: number;
  avgTimeOnPage: number;
  topPosts: Array<{ title: string; views: number }>;
}): string {
  const topPostsHtml = stats.topPosts
    .map((post) => `<li><strong>${post.title}</strong> - ${post.views} views</li>`)
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #6366f1; color: white; padding: 30px 20px; text-align: center; }
        .content { background: white; padding: 30px 20px; }
        .stat-box { background: #f3f4f6; padding: 20px; margin: 15px 0; border-radius: 8px; text-align: center; }
        .stat-number { font-size: 36px; font-weight: bold; color: #3b82f6; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Weekly Report</h1>
          <p>${stats.weekStart} - ${stats.weekEnd}</p>
        </div>
        <div class="content">
          <h2>Performance Summary</h2>
          <div class="stat-box">
            <div class="stat-number">${stats.blogsPublished}</div>
            <p>Blogs Published</p>
          </div>
          <div class="stat-box">
            <div class="stat-number">${stats.totalViews}</div>
            <p>Total Page Views</p>
          </div>
          <div class="stat-box">
            <div class="stat-number">${stats.avgTimeOnPage}s</div>
            <p>Avg Time on Page</p>
          </div>
          <h3>Top Performing Posts</h3>
          <ol>${topPostsHtml}</ol>
        </div>
      </div>
    </body>
    </html>
  `;
}

export const sendWeeklyReports = region.pubsub
  .schedule("0 9 * * 1") // 9 AM every Monday
  .timeZone("America/New_York")
  .onRun(async (_context) => {
    console.log("Starting weekly report generation...");

    const usersRef = admin.firestore().collection("users");
    const prefsRef = admin.firestore().collection("userPreferences");

    const usersSnapshot = await usersRef.get();

    for (const userDoc of usersSnapshot.docs) {
      const user = userDoc.data();

      if (!user.email) continue;

      // Check if user has weekly reports enabled
      const prefsDoc = await prefsRef.doc(userDoc.id).get();
      const prefs = prefsDoc.data();

      if (!prefs?.emailNotifications?.weeklyReport) {
        console.log(`Skipping user ${userDoc.id} - weekly reports disabled`);
        continue;
      }

      // Calculate week range
      const weekEnd = new Date();
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      // Find published blogs from last week
      const blogsRef = admin.firestore().collection("blogs");
      const blogsQuery = blogsRef
        .where("userId", "==", userDoc.id)
        .where("status", "==", "published")
        .where("publishedDate", ">=", admin.firestore.Timestamp.fromDate(weekStart))
        .where("publishedDate", "<=", admin.firestore.Timestamp.fromDate(weekEnd));

      const blogsSnapshot = await blogsQuery.get();

      // Calculate stats
      let totalViews = 0;
      let totalTimeOnPage = 0;
      let timeOnPageCount = 0;
      const topPosts: Array<{ title: string; views: number }> = [];

      blogsSnapshot.docs.forEach((doc) => {
        const blog = doc.data();
        totalViews += blog.totalViews || 0;
        if (blog.avgTimeOnPage) {
          totalTimeOnPage += blog.avgTimeOnPage;
          timeOnPageCount++;
        }
        topPosts.push({
          title: blog.title,
          views: blog.totalViews || 0,
        });
      });

      const stats = {
        weekStart: weekStart.toLocaleDateString(),
        weekEnd: weekEnd.toLocaleDateString(),
        blogsPublished: blogsSnapshot.size,
        totalViews,
        avgTimeOnPage: timeOnPageCount > 0 ? Math.round(totalTimeOnPage / timeOnPageCount) : 0,
        topPosts: topPosts
          .sort((a, b) => b.views - a.views)
          .slice(0, 5),
      };

      // Queue email
      await admin.firestore().collection("mail").add({
        to: user.email,
        message: {
          subject: "📊 Your Weekly Blog Performance Report",
          html: renderWeeklyReport(stats),
        },
        replyTo: process.env.VITE_EMAIL_REPLY_TO || "noreply@apex-seo.com",
      });

      console.log(`Queued weekly report for ${user.email}`);
    }

    console.log("Weekly report generation complete");
    return null;
  });

// Feedback analysis and prompt improvement
export const analyzeFeedbackAndUpdatePrompts = region.runWith({
  timeoutSeconds: 540,
  memory: "1GB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const { siteId } = data;
  if (!siteId) {
    throw new functions.https.HttpsError("invalid-argument", "siteId is required");
  }

  try {
    // Get all unanalyzed feedback for this site
    const feedbackQuery = await admin.firestore()
      .collection("feedback")
      .where("siteId", "==", siteId)
      .where("analyzed", "==", false)
      .get();

    if (feedbackQuery.empty || feedbackQuery.size < 50) {
      return { message: `Not enough feedback to analyze. Found ${feedbackQuery.size}, need 50.` };
    }

    console.log(`[analyzeFeedbackAndUpdatePrompts] Analyzing ${feedbackQuery.size} feedback items for site ${siteId}`);

    // Group feedback by prompt type
    const feedbackByType: { [key: string]: any[] } = {
      "blog": [],
      "image": [],
      "headline": [],
      "keyword": [],
      "content-plan": [],
    };

    feedbackQuery.docs.forEach((doc) => {
      const feedback = doc.data();
      const promptType = feedback.promptType || "blog";
      if (feedbackByType[promptType]) {
        feedbackByType[promptType].push({
          id: doc.id,
          rating: feedback.rating,
          text: feedback.text || "",
        });
      }
    });

    // Get current prompts
    const { getPrompts } = await import("./promptManager");
    const currentPrompts = await getPrompts(siteId);

    // Analyze each prompt type that has >= 50 feedback
    const updates: { [key: string]: string } = {};
    const changeLog: string[] = [];

    for (const [promptType, feedbacks] of Object.entries(feedbackByType)) {
      if (feedbacks.length < 50) {
        console.log(`[analyzeFeedbackAndUpdatePrompts] Skipping ${promptType} - only ${feedbacks.length} feedback items`);
        continue;
      }

      console.log(`[analyzeFeedbackAndUpdatePrompts] Analyzing ${feedbacks.length} feedback items for ${promptType}`);

      // Build analysis prompt
      const feedbackSummary = feedbacks.map((f, i) =>
        `${i + 1}. Rating: ${f.rating}/5${f.text ? ` - "${f.text}"` : ""}`
      ).join("\n");

      let currentPrompt = "";

      if (promptType === "blog") {
        currentPrompt = currentPrompts.blogSystemPrompt + "\n\n" + currentPrompts.blogUserPromptTemplate;
      } else if (promptType === "image") {
        currentPrompt = currentPrompts.imagePromptTemplate;
      } else if (promptType === "headline") {
        currentPrompt = currentPrompts.headlinePromptTemplate;
      } else if (promptType === "keyword" || promptType === "content-plan") {
        // Keyword and content-plan feedback are collected but don't have prompt templates yet
        // Skip analysis for these types for now
        console.log(`[analyzeFeedbackAndUpdatePrompts] Skipping ${promptType} - no prompt template available`);
        continue;
      } else {
        console.log(`[analyzeFeedbackAndUpdatePrompts] Unknown prompt type: ${promptType}`);
        continue;
      }

      const analysisPrompt = `Analyze the following user feedback for ${promptType} generation and suggest improvements to the prompt.

FEEDBACK (${feedbacks.length} items):
${feedbackSummary}

CURRENT PROMPT:
${currentPrompt}

Based on the feedback, identify:
1. Common issues or complaints (especially from low ratings 1-2)
2. What users like (especially from high ratings 4-5)
3. Specific improvements needed
4. Suggested prompt modifications

Generate an improved prompt that:
- Addresses the feedback while maintaining the core structure
- Keeps all placeholder variables (e.g., {keyword}, {industry}) intact
- Improves areas that received low ratings
- Enhances areas that received high ratings
- Maintains the same format and style

Return ONLY the improved prompt text. Do not include explanations or markdown formatting.`;

      try {
        const improvedPrompt = await callGeminiAPI(analysisPrompt, 4000);

        // Clean up the response (remove markdown if present)
        let cleanedPrompt = improvedPrompt.trim();
        if (cleanedPrompt.startsWith("```")) {
          const firstNewline = cleanedPrompt.indexOf("\n");
          if (firstNewline !== -1) {
            const lastCodeBlock = cleanedPrompt.lastIndexOf("```");
            if (lastCodeBlock > firstNewline) {
              cleanedPrompt = cleanedPrompt.substring(firstNewline + 1, lastCodeBlock).trim();
            } else {
              cleanedPrompt = cleanedPrompt.substring(firstNewline + 1).trim();
            }
          }
        }

        if (promptType === "blog") {
          // For blog, we need to split system and user prompts
          // Try to detect the split (usually after OUTPUT FORMAT section)
          const outputFormatIndex = cleanedPrompt.indexOf("OUTPUT FORMAT");
          if (outputFormatIndex > 0) {
            const systemEnd = cleanedPrompt.indexOf("}", outputFormatIndex) + 1;
            if (systemEnd > 0) {
              updates.blogSystemPrompt = cleanedPrompt.substring(0, systemEnd).trim();
              updates.blogUserPromptTemplate = cleanedPrompt.substring(systemEnd).trim();
            } else {
              // Fallback: use improved prompt as system prompt
              updates.blogSystemPrompt = cleanedPrompt;
            }
          } else {
            updates.blogSystemPrompt = cleanedPrompt;
          }
        } else if (promptType === "image") {
          updates.imagePromptTemplate = cleanedPrompt;
        } else if (promptType === "headline") {
          updates.headlinePromptTemplate = cleanedPrompt;
        }

        changeLog.push(`${promptType}: Updated based on ${feedbacks.length} feedback items (avg rating: ${(feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)}/5)`);
        console.log(`[analyzeFeedbackAndUpdatePrompts] Generated improved ${promptType} prompt`);
      } catch (error: any) {
        console.error(`[analyzeFeedbackAndUpdatePrompts] Failed to analyze ${promptType} feedback:`, error);
        // Continue with other prompt types
      }
    }

    if (Object.keys(updates).length === 0) {
      return { message: "No prompts were updated" };
    }

    // Update prompts in Firestore
    const promptsRef = admin.firestore().doc(`prompts/${siteId}`);
    const currentData = await promptsRef.get();
    const currentVersion = currentData.exists ? (currentData.data()?.version || 1) : 1;

    await promptsRef.set({
      siteId,
      blogSystemPrompt: updates.blogSystemPrompt || currentPrompts.blogSystemPrompt,
      blogUserPromptTemplate: updates.blogUserPromptTemplate || currentPrompts.blogUserPromptTemplate,
      imagePromptTemplate: updates.imagePromptTemplate || currentPrompts.imagePromptTemplate,
      headlinePromptTemplate: updates.headlinePromptTemplate || currentPrompts.headlinePromptTemplate,
      version: currentVersion + 1,
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: "system",
      changeLog: [...(currentPrompts.changeLog || []), ...changeLog],
    }, { merge: true });

    // Mark feedback as analyzed
    const batch = admin.firestore().batch();
    let batchCount = 0;

    feedbackQuery.docs.forEach((doc) => {
      if (batchCount < 500) { // Firestore batch limit
        batch.update(doc.ref, { analyzed: true });
        batchCount++;
      }
    });

    if (batchCount > 0) {
      await batch.commit();
      console.log(`[analyzeFeedbackAndUpdatePrompts] Marked ${batchCount} feedback items as analyzed`);
    }

    // Clear prompt cache for this site
    const { clearPromptCache } = await import("./promptManager");
    clearPromptCache(siteId);

    return {
      message: `Successfully updated prompts based on ${feedbackQuery.size} feedback items`,
      version: currentVersion + 1,
      changes: changeLog,
    };
  } catch (error: any) {
    console.error("[analyzeFeedbackAndUpdatePrompts] Error:", error);
    throw new functions.https.HttpsError("internal", "Failed to analyze feedback", error.message);
  }
});

// Trigger feedback analysis when feedback is created
export const onFeedbackCreated = region.firestore
  .document("feedback/{feedbackId}")
  .onCreate(async (snap, _context) => {
    const feedback = snap.data();
    const siteId = feedback.siteId;

    if (!siteId) {
      console.log("[onFeedbackCreated] No siteId in feedback, skipping");
      return;
    }

    try {
      // Count unanalyzed feedback for this site
      const unanalyzedQuery = await admin.firestore()
        .collection("feedback")
        .where("siteId", "==", siteId)
        .where("analyzed", "==", false)
        .get();

      console.log(`[onFeedbackCreated] Site ${siteId} has ${unanalyzedQuery.size} unanalyzed feedback items`);

      if (unanalyzedQuery.size >= 50) {
        // Trigger analysis (call the function internally)
        console.log(`[onFeedbackCreated] Triggering feedback analysis for site ${siteId}`);

        // Use a callable function reference to trigger analysis
        // We'll use a scheduled function or direct call
        // For now, we'll create a document in a queue collection
        await admin.firestore().collection("feedbackAnalysisQueue").add({
          siteId,
          triggeredAt: admin.firestore.Timestamp.now(),
          feedbackCount: unanalyzedQuery.size,
          status: "pending",
        });
      }
    } catch (error: any) {
      console.error("[onFeedbackCreated] Error checking feedback count:", error);
      // Don't throw - this is a background trigger
    }
  });

// Process feedback analysis queue
export const processFeedbackAnalysisQueue = region.pubsub
  .schedule("every 5 minutes")
  .onRun(async (_context) => {
    console.log("[processFeedbackAnalysisQueue] Checking for pending analysis jobs");

    try {
      const queueQuery = await admin.firestore()
        .collection("feedbackAnalysisQueue")
        .where("status", "==", "pending")
        .limit(10)
        .get();

      if (queueQuery.empty) {
        console.log("[processFeedbackAnalysisQueue] No pending jobs");
        return;
      }

      for (const doc of queueQuery.docs) {
        const job = doc.data();
        const siteId = job.siteId;

        // Verify there are still >= 50 unanalyzed feedback
        const unanalyzedQuery = await admin.firestore()
          .collection("feedback")
          .where("siteId", "==", siteId)
          .where("analyzed", "==", false)
          .get();

        if (unanalyzedQuery.size < 50) {
          // Not enough feedback, mark as skipped
          await doc.ref.update({
            status: "skipped",
            reason: `Only ${unanalyzedQuery.size} unanalyzed feedback items`,
          });
          continue;
        }

        // Mark as processing
        await doc.ref.update({ status: "processing" });

        try {
          // Get all unanalyzed feedback for this site
          const feedbackQuery = await admin.firestore()
            .collection("feedback")
            .where("siteId", "==", siteId)
            .where("analyzed", "==", false)
            .get();

          if (feedbackQuery.empty || feedbackQuery.size < 50) {
            await doc.ref.update({
              status: "skipped",
              reason: `Only ${feedbackQuery.size} unanalyzed feedback items`,
            });
            continue;
          }

          // Group feedback by prompt type and analyze
          const feedbackByType: { [key: string]: any[] } = {
            "blog": [],
            "image": [],
            "headline": [],
            "keyword": [],
            "content-plan": [],
          };

          feedbackQuery.docs.forEach((doc) => {
            const feedback = doc.data();
            const promptType = feedback.promptType || "blog";
            if (feedbackByType[promptType]) {
              feedbackByType[promptType].push({
                id: doc.id,
                rating: feedback.rating,
                text: feedback.text || "",
              });
            }
          });

          const { getPrompts, clearPromptCache } = await import("./promptManager");
          const currentPrompts = await getPrompts(siteId);
          const updates: { [key: string]: string } = {};
          const changeLog: string[] = [];

          for (const [promptType, feedbacks] of Object.entries(feedbackByType)) {
            if (feedbacks.length < 50) continue;

            let currentPrompt = "";
            if (promptType === "blog") {
              currentPrompt = currentPrompts.blogSystemPrompt + "\n\n" + currentPrompts.blogUserPromptTemplate;
            } else if (promptType === "image") {
              currentPrompt = currentPrompts.imagePromptTemplate;
            } else if (promptType === "headline") {
              currentPrompt = currentPrompts.headlinePromptTemplate;
            } else if (promptType === "keyword" || promptType === "content-plan") {
              // Keyword and content-plan feedback are collected but don't have prompt templates yet
              // Skip analysis for these types for now
              console.log(`[processFeedbackAnalysisQueue] Skipping ${promptType} - no prompt template available`);
              continue;
            } else {
              console.log(`[processFeedbackAnalysisQueue] Unknown prompt type: ${promptType}`);
              continue;
            }

            const feedbackSummary = feedbacks.map((f, i) =>
              `${i + 1}. Rating: ${f.rating}/5${f.text ? ` - "${f.text}"` : ""}`
            ).join("\n");

            const analysisPrompt = `Analyze the following user feedback for ${promptType} generation and suggest improvements to the prompt.

FEEDBACK (${feedbacks.length} items):
${feedbackSummary}

CURRENT PROMPT:
${currentPrompt}

Based on the feedback, identify:
1. Common issues or complaints (especially from low ratings 1-2)
2. What users like (especially from high ratings 4-5)
3. Specific improvements needed
4. Suggested prompt modifications

Generate an improved prompt that:
- Addresses the feedback while maintaining the core structure
- Keeps all placeholder variables (e.g., {keyword}, {industry}) intact
- Improves areas that received low ratings
- Enhances areas that received high ratings
- Maintains the same format and style

Return ONLY the improved prompt text. Do not include explanations or markdown formatting.`;

            try {
              const improvedPrompt = await callGeminiAPI(analysisPrompt, 4000);
              let cleanedPrompt = improvedPrompt.trim();
              if (cleanedPrompt.startsWith("```")) {
                const firstNewline = cleanedPrompt.indexOf("\n");
                if (firstNewline !== -1) {
                  const lastCodeBlock = cleanedPrompt.lastIndexOf("```");
                  if (lastCodeBlock > firstNewline) {
                    cleanedPrompt = cleanedPrompt.substring(firstNewline + 1, lastCodeBlock).trim();
                  } else {
                    cleanedPrompt = cleanedPrompt.substring(firstNewline + 1).trim();
                  }
                }
              }

              if (promptType === "blog") {
                const outputFormatIndex = cleanedPrompt.indexOf("OUTPUT FORMAT");
                if (outputFormatIndex > 0) {
                  const systemEnd = cleanedPrompt.indexOf("}", outputFormatIndex) + 1;
                  if (systemEnd > 0) {
                    updates.blogSystemPrompt = cleanedPrompt.substring(0, systemEnd).trim();
                    updates.blogUserPromptTemplate = cleanedPrompt.substring(systemEnd).trim();
                  } else {
                    updates.blogSystemPrompt = cleanedPrompt;
                  }
                } else {
                  updates.blogSystemPrompt = cleanedPrompt;
                }
              } else if (promptType === "image") {
                updates.imagePromptTemplate = cleanedPrompt;
              } else if (promptType === "headline") {
                updates.headlinePromptTemplate = cleanedPrompt;
              }

              changeLog.push(`${promptType}: Updated based on ${feedbacks.length} feedback items`);
            } catch (error: any) {
              console.error(`[processFeedbackAnalysisQueue] Error analyzing ${promptType}:`, error);
            }
          }

          if (Object.keys(updates).length > 0) {
            const promptsRef = admin.firestore().doc(`prompts/${siteId}`);
            const currentData = await promptsRef.get();
            const currentVersion = currentData.exists ? (currentData.data()?.version || 1) : 1;

            await promptsRef.set({
              siteId,
              blogSystemPrompt: updates.blogSystemPrompt || currentPrompts.blogSystemPrompt,
              blogUserPromptTemplate: updates.blogUserPromptTemplate || currentPrompts.blogUserPromptTemplate,
              imagePromptTemplate: updates.imagePromptTemplate || currentPrompts.imagePromptTemplate,
              headlinePromptTemplate: updates.headlinePromptTemplate || currentPrompts.headlinePromptTemplate,
              version: currentVersion + 1,
              updatedAt: admin.firestore.Timestamp.now(),
              updatedBy: "system",
              changeLog: [...(currentPrompts.changeLog || []), ...changeLog],
            }, { merge: true });

            // Mark feedback as analyzed
            const batch = admin.firestore().batch();
            let batchCount = 0;
            feedbackQuery.docs.forEach((doc) => {
              if (batchCount < 500) {
                batch.update(doc.ref, { analyzed: true });
                batchCount++;
              }
            });
            if (batchCount > 0) {
              await batch.commit();
            }

            clearPromptCache(siteId);
          }

          await doc.ref.update({
            status: "completed",
            completedAt: admin.firestore.Timestamp.now(),
          });
        } catch (error: any) {
          console.error(`[processFeedbackAnalysisQueue] Error processing ${siteId}:`, error);
          await doc.ref.update({
            status: "error",
            error: error.message,
          });
        }
      }
    } catch (error: any) {
      console.error("[processFeedbackAnalysisQueue] Error:", error);
    }
  });

/**
 * Callable Function: Send Team Invitation
 * Allows agency admins to invite users to join their agency
 */
export const sendTeamInviteCallable = region.runWith({
  timeoutSeconds: 60,
  memory: "256MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { email } = data;
  const inviterId = context.auth.uid;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Valid email address is required"
    );
  }

  try {
    console.log(`[sendTeamInviteCallable] Inviter ${inviterId} inviting ${email}`);

    // Step 1: Get inviter's agency
    const inviterRef = admin.firestore().collection("users").doc(inviterId);
    const inviterDoc = await inviterRef.get();

    if (!inviterDoc.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Inviter user document not found"
      );
    }

    const inviterData = inviterDoc.data();
    if (!inviterData || !inviterData.agencyId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Inviter does not belong to an agency"
      );
    }

    const agencyId = inviterData.agencyId;

    // Step 2: Verify inviter is a member of the agency
    const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
    const agencyDoc = await agencyRef.get();

    if (!agencyDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Agency not found"
      );
    }

    const agencyData = agencyDoc.data();
    if (!agencyData || !agencyData.members || !agencyData.members.includes(inviterId)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You are not a member of this agency"
      );
    }

    console.log(`[sendTeamInviteCallable] ✅ Verified inviter is member of agency ${agencyId}`);

    // Step 3: Check if user already exists in Auth
    let existingUser: admin.auth.UserRecord | null = null;
    try {
      existingUser = await admin.auth().getUserByEmail(email.toLowerCase().trim());
    } catch (error: any) {
      // User doesn't exist - this is expected for new invitations
      if (error.code !== "auth/user-not-found") {
        throw error;
      }
    }

    if (existingUser) {
      // User exists - add them to agency immediately
      const existingUserId = existingUser.uid;

      // Check if user is already in this agency
      if (agencyData.members.includes(existingUserId)) {
        return {
          success: true,
          action: "already_member",
          message: "User is already a member of this agency",
        };
      }

      // Add user to agency members
      await agencyRef.update({
        members: admin.firestore.FieldValue.arrayUnion(existingUserId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update user document with agencyId
      const existingUserRef = admin.firestore().collection("users").doc(existingUserId);
      const existingUserDoc = await existingUserRef.get();

      if (existingUserDoc.exists) {
        await existingUserRef.update({
          agencyId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await existingUserRef.set({
          uid: existingUserId,
          email: existingUser.email || null,
          displayName: existingUser.displayName || null,
          photoURL: existingUser.photoURL || null,
          agencyId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      console.log(`[sendTeamInviteCallable] ✅ Added existing user ${existingUserId} to agency ${agencyId}`);

      return {
        success: true,
        action: "added_immediately",
        message: "User added immediately",
        userId: existingUserId,
      };
    } else {
      // User doesn't exist - create invitation
      // Check if invitation already exists
      const invitationsRef = admin.firestore().collection("invitations");
      const existingInviteQuery = await invitationsRef
        .where("email", "==", email.toLowerCase().trim())
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (!existingInviteQuery.empty) {
        const existingInvite = existingInviteQuery.docs[0];
        const existingInviteData = existingInvite.data();

        // If invitation is for the same agency, return success
        if (existingInviteData.agencyId === agencyId) {
          return {
            success: true,
            action: "invitation_exists",
            message: "Invitation already sent to this email",
            invitationId: existingInvite.id,
          };
        } else {
          // Invitation exists for different agency - update it
          await existingInvite.ref.update({
            agencyId,
            invitedBy: inviterId,
            status: "pending",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          return {
            success: true,
            action: "invitation_updated",
            message: "Invitation updated",
            invitationId: existingInvite.id,
          };
        }
      }

      // Create new invitation
      const invitationData = {
        email: email.toLowerCase().trim(),
        agencyId,
        invitedBy: inviterId,
        status: "pending" as const,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const invitationRef = await invitationsRef.add(invitationData);
      const invitationId = invitationRef.id;

      console.log(`[sendTeamInviteCallable] ✅ Created invitation ${invitationId} for ${email}`);

      return {
        success: true,
        action: "invitation_created",
        message: "Invitation saved. Ask them to sign up.",
        invitationId,
      };
    }
  } catch (error: any) {
    console.error("[sendTeamInviteCallable] ❌ Error:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      "Failed to send team invitation",
      error.message
    );
  }
});

/**
 * Auth Trigger: Create Agency on User Signup
 * Automatically creates an agency for new users when they sign up
 * OR joins them to an existing agency if they have a pending invitation
 */
export const createAgencyOnSignup = functions.auth.user().onCreate(async (user) => {
  try {
    console.log(`[createAgencyOnSignup] Processing signup for user: ${user.uid}, email: ${user.email}`);

    if (!user.email) {
      console.warn(`[createAgencyOnSignup] ⚠️ User ${user.uid} has no email, creating new agency`);
      // Proceed with creating new agency if no email
    } else {
      // Step 1: Check for pending invitation
      const invitationsRef = admin.firestore().collection("invitations");
      const inviteQuery = await invitationsRef
        .where("email", "==", user.email.toLowerCase().trim())
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (!inviteQuery.empty) {
        const inviteDoc = inviteQuery.docs[0];
        const inviteData = inviteDoc.data();
        const agencyId = inviteData.agencyId;

        console.log(`[createAgencyOnSignup] ✅ Found invitation for ${user.email}, joining agency ${agencyId}`);

        // Step 2: Verify agency exists
        const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
        const agencyDoc = await agencyRef.get();

        if (agencyDoc.exists) {
          // Step 3: Add user to agency members
          await agencyRef.update({
            members: admin.firestore.FieldValue.arrayUnion(user.uid),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`[createAgencyOnSignup] ✅ Added user ${user.uid} to agency ${agencyId}`);

          // Step 4: Create or update user document with agencyId
          const userRef = admin.firestore().collection("users").doc(user.uid);
          const userDoc = await userRef.get();

          if (userDoc.exists) {
            await userRef.update({
              agencyId,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log("[createAgencyOnSignup] ✅ Updated existing user document with agencyId");
          } else {
            await userRef.set({
              uid: user.uid,
              email: user.email || null,
              displayName: user.displayName || null,
              photoURL: user.photoURL || null,
              agencyId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log("[createAgencyOnSignup] ✅ Created new user document with agencyId");
          }

          // Step 5: Delete the invitation
          await inviteDoc.ref.update({
            status: "accepted",
            acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
            acceptedBy: user.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log("[createAgencyOnSignup] ✅ Marked invitation as accepted");

          return { agencyId, success: true, action: "joined_existing" };
        } else {
          console.warn(`[createAgencyOnSignup] ⚠️ Invitation references non-existent agency ${agencyId}, creating new agency`);
          // Agency doesn't exist - proceed with creating new agency
        }
      }
    }

    // Step 6: No invitation found - create new agency (existing logic)
    console.log(`[createAgencyOnSignup] Creating new agency for user: ${user.uid}`);

    const agencyData = {
      name: user.email ? `${user.email.split("@")[0]}'s Agency` : "My Agency",
      ownerId: user.uid,
      members: [user.uid],
      billingType: "stripe" as const,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const agencyRef = await admin.firestore().collection("agencies").add(agencyData);
    const agencyId = agencyRef.id;

    console.log(`[createAgencyOnSignup] ✅ Created agency ${agencyId} for user ${user.uid}`);

    // Create or update user document with agencyId
    const userRef = admin.firestore().collection("users").doc(user.uid);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      await userRef.update({
        agencyId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("[createAgencyOnSignup] ✅ Updated existing user document with agencyId");
    } else {
      await userRef.set({
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        agencyId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("[createAgencyOnSignup] ✅ Created new user document with agencyId");
    }

    return { agencyId, success: true, action: "created_new" };
  } catch (error: any) {
    console.error(`[createAgencyOnSignup] ❌ Error processing signup for user ${user.uid}:`, error);
    // Don't throw - we don't want to block user creation if agency creation fails
    // The ensureAgencyExistsCallable can be used as a fallback
    return { success: false, error: error.message };
  }
});

/**
 * Callable Function: Get User Agency ID (Read-Only)
 * Returns the user's agencyId if it exists, or null if not found.
 * This is a read-only function - it does NOT create agencies.
 */
export const ensureAgencyExistsCallable = region.runWith({
  timeoutSeconds: 60,
  memory: "256MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const userId = context.auth.uid;

  try {
    console.log(`[ensureAgencyExistsCallable] Checking agency for user: ${userId}`);

    // Check if user document exists and has agencyId
    const userRef = admin.firestore().collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`[ensureAgencyExistsCallable] User document does not exist for ${userId}`);
      return {
        success: true,
        agencyId: null,
        exists: false,
        action: "user_not_found",
      };
    }

    const userData = userDoc.data();
    if (!userData) {
      console.log(`[ensureAgencyExistsCallable] User document data is empty for ${userId}`);
      return {
        success: true,
        agencyId: null,
        exists: false,
        action: "no_data",
      };
    }

    // If user has an agencyId, verify the agency exists
    if (userData.agencyId) {
      const agencyRef = admin.firestore().collection("agencies").doc(userData.agencyId);
      const agencyDoc = await agencyRef.get();

      if (agencyDoc.exists) {
        const agencyData = agencyDoc.data();
        // Verify user is a member
        if (agencyData?.members && agencyData.members.includes(userId)) {
          console.log(`[ensureAgencyExistsCallable] ✅ User ${userId} has valid agency ${userData.agencyId}`);
          return {
            success: true,
            agencyId: userData.agencyId,
            exists: true,
            action: "existing",
            agency: agencyData,
          };
        } else {
          // Agency exists but user is not a member
          console.log(`[ensureAgencyExistsCallable] ⚠️ User ${userId} has agencyId but is not a member`);
          return {
            success: true,
            agencyId: userData.agencyId,
            exists: true,
            action: "not_member",
            agency: agencyData,
          };
        }
      } else {
        // Agency ID exists but agency document doesn't
        console.log(`[ensureAgencyExistsCallable] ⚠️ User ${userId} has invalid agencyId: ${userData.agencyId}`);
        return {
          success: true,
          agencyId: userData.agencyId,
          exists: false,
          action: "invalid_agency_id",
        };
      }
    }

    // User doesn't have an agencyId
    console.log(`[ensureAgencyExistsCallable] User ${userId} has no agencyId`);
    return {
      success: true,
      agencyId: null,
      exists: false,
      action: "no_agency_id",
    };
  } catch (error: any) {
    console.error(`[ensureAgencyExistsCallable] ❌ Error checking agency for user ${userId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to check agency",
      error.message
    );
  }
});

/**
 * Callable Function: Repair Agency Data
 * Migration helper to link existing sites to user's agency
 * Fixes sites that are missing agencyId or have incorrect agencyId
 */
export const repairAgencyDataCallable = region.runWith({
  timeoutSeconds: 120,
  memory: "512MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const userId = context.auth.uid;
  const userEmail = context.auth.token.email || null;

  try {
    console.log(`[repairAgencyDataCallable] Starting repair for user: ${userId}`);

    // Step 1: Fetch user document to get agencyId
    const userRef = admin.firestore().collection("users").doc(userId);
    const userDoc = await userRef.get();

    let agencyId: string;

    if (!userDoc.exists) {
      // User document doesn't exist - create it with a new agency
      console.log("[repairAgencyDataCallable] User document doesn't exist, creating new agency...");

      const agencyName = userEmail ?
        `${userEmail.split("@")[0]}'s Agency` :
        "My Agency";

      const agencyData = {
        name: agencyName,
        ownerId: userId,
        members: [userId],
        billingType: "stripe" as const,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const agencyRef = await admin.firestore().collection("agencies").add(agencyData);
      agencyId = agencyRef.id;

      // Create user document with agencyId
      await userRef.set({
        uid: userId,
        email: userEmail,
        agencyId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[repairAgencyDataCallable] ✅ Created new agency ${agencyId} and user document`);
    } else {
      const userData = userDoc.data();
      if (!userData) {
        throw new functions.https.HttpsError(
          "internal",
          "User data is empty"
        );
      }

      // Check if user has agencyId
      if (userData.agencyId) {
        agencyId = userData.agencyId;

        // Verify agency exists
        const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
        const agencyDoc = await agencyRef.get();

        if (!agencyDoc.exists) {
          // Agency doesn't exist - create new one
          console.log(`[repairAgencyDataCallable] Agency ${agencyId} doesn't exist, creating new one...`);

          const agencyName = userEmail ?
            `${userEmail.split("@")[0]}'s Agency` :
            "My Agency";

          const agencyData = {
            name: agencyName,
            ownerId: userId,
            members: [userId],
            billingType: "stripe" as const,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          const newAgencyRef = await admin.firestore().collection("agencies").add(agencyData);
          agencyId = newAgencyRef.id;

          // Update user document with new agencyId
          await userRef.update({
            agencyId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`[repairAgencyDataCallable] ✅ Created new agency ${agencyId} and updated user document`);
        } else {
          // Verify user is a member
          const agencyData = agencyDoc.data();
          if (!agencyData?.members || !agencyData.members.includes(userId)) {
            // Add user to members if not already there
            await agencyRef.update({
              members: admin.firestore.FieldValue.arrayUnion(userId),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log("[repairAgencyDataCallable] ✅ Added user to agency members");
          }
          console.log(`[repairAgencyDataCallable] ✅ Using existing agency ${agencyId}`);
        }
      } else {
        // User has no agencyId - create new agency
        console.log("[repairAgencyDataCallable] User has no agencyId, creating new agency...");

        const agencyName = userEmail ?
          `${userEmail.split("@")[0]}'s Agency` :
          "My Agency";

        const agencyData = {
          name: agencyName,
          ownerId: userId,
          members: [userId],
          billingType: "stripe" as const,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const agencyRef = await admin.firestore().collection("agencies").add(agencyData);
        agencyId = agencyRef.id;

        // Update user document with agencyId
        await userRef.update({
          agencyId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[repairAgencyDataCallable] ✅ Created new agency ${agencyId} and updated user document`);
      }
    }

    // Step 2: Query all sites where ownerId == userId
    console.log(`[repairAgencyDataCallable] Querying sites for ownerId: ${userId}`);
    const sitesQuery = await admin.firestore()
      .collection("sites")
      .where("ownerId", "==", userId)
      .get();

    console.log(`[repairAgencyDataCallable] Found ${sitesQuery.size} sites to update`);

    // Step 3: Update all sites with agencyId
    const batch = admin.firestore().batch();
    let updateCount = 0;

    sitesQuery.docs.forEach((siteDoc) => {
      const siteData = siteDoc.data();

      // Only update if agencyId is missing or different
      if (!siteData.agencyId || siteData.agencyId !== agencyId) {
        batch.update(siteDoc.ref, {
          agencyId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        updateCount++;
        console.log(`[repairAgencyDataCallable] Queued update for site: ${siteDoc.id}`);
      } else {
        console.log(`[repairAgencyDataCallable] Site ${siteDoc.id} already has correct agencyId`);
      }
    });

    // Commit batch update
    if (updateCount > 0) {
      await batch.commit();
      console.log(`[repairAgencyDataCallable] ✅ Updated ${updateCount} sites`);
    } else {
      console.log("[repairAgencyDataCallable] ✅ No sites needed updating");
    }

    return {
      success: true,
      updatedCount: updateCount,
      agencyId,
      totalSites: sitesQuery.size,
    };
  } catch (error: any) {
    console.error(`[repairAgencyDataCallable] ❌ Error repairing agency data for user ${userId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to repair agency data",
      error.message
    );
  }
});

/**
 * Callable Function: Promote to App Owner
 * Securely promotes a user to App Owner / Super Admin status
 * Only accessible by the hardcoded owner email
 */
export const promoteToAppOwnerCallable = region.runWith({
  timeoutSeconds: 60,
  memory: "256MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const userId = context.auth.uid;
  const userEmail = context.auth.token.email;

  // Hardcoded security check - only allow specific owner email
  const ALLOWED_OWNER_EMAIL = "ben@spotonwebsites.com.au";

  if (!userEmail || userEmail.toLowerCase().trim() !== ALLOWED_OWNER_EMAIL.toLowerCase().trim()) {
    console.log(`[promoteToAppOwnerCallable] ❌ Access denied for email: ${userEmail}`);
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only the app owner can access this function."
    );
  }

  try {
    console.log(`[promoteToAppOwnerCallable] Promoting user ${userId} (${userEmail}) to App Owner`);

    // Update user document with App Owner status
    const userRef = admin.firestore().collection("users").doc(userId);
    const userDoc = await userRef.get();

    const updateData: any = {
      userType: "appowner",
      role: "super_admin",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (userDoc.exists) {
      await userRef.update(updateData);
      console.log("[promoteToAppOwnerCallable] ✅ Updated existing user document");
    } else {
      // Create user document if it doesn't exist
      updateData.uid = userId;
      updateData.email = userEmail;
      updateData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      await userRef.set(updateData);
      console.log("[promoteToAppOwnerCallable] ✅ Created new user document with App Owner status");
    }

    return {
      success: true,
      message: "Successfully promoted to App Owner",
      userId,
      userType: "appowner",
      role: "super_admin",
    };
  } catch (error: any) {
    console.error(`[promoteToAppOwnerCallable] ❌ Error promoting user ${userId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to promote user to App Owner",
      error.message
    );
  }
});

/**
 * Callable Function: Create Site
 * Creates a new site document linked to the user's agency
 */
export const createSiteCallable = region.runWith({
  timeoutSeconds: 60,
  memory: "256MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const userId = context.auth.uid;
  const {
    name,
    url,
    platform,
    wordpressApiUrl,
    wordpressUsername,
    wordpressAppPassword,
    shoplineHandle,
    shoplineAccessToken,
    industry,
    targetAudience,
    brandVoice,
    tonePreferences,
    contentGoals,
    competitors,
    primaryKeywords,
    contentRestrictions,
    blogsPerWeek,
    country,
    postcode,
    sitemapUrl,
  } = data;

  // Validate required fields
  if (!name || !url) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required fields: name and url are required"
    );
  }

  try {
    console.log(`[createSiteCallable] Creating site "${name}" for user: ${userId}`);

    // Step 1: Fetch user document to get agencyId
    const userRef = admin.firestore().collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "User document not found. Please ensure your account is properly set up."
      );
    }

    const userData = userDoc.data();
    if (!userData) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "User data is empty"
      );
    }

    const agencyId = userData.agencyId;
    if (!agencyId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "User does not have an agency. Please call ensureAgencyExistsCallable first."
      );
    }

    console.log(`[createSiteCallable] ✅ Found agencyId: ${agencyId} for user ${userId}`);

    // Step 2: Fetch agency document to check billing type
    const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
    const agencyDoc = await agencyRef.get();

    if (!agencyDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Agency not found. Please contact support."
      );
    }

    const agencyData = agencyDoc.data();
    if (!agencyData) {
      throw new functions.https.HttpsError(
        "not-found",
        "Agency data is empty"
      );
    }

    // Verify user is a member of the agency
    if (!agencyData.members || !agencyData.members.includes(userId)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You are not a member of this agency"
      );
    }

    // Step 3: Check billing limits (placeholder for future Stripe integration)
    if (agencyData.billingType !== "internal") {
      // TODO: Add Stripe subscription check here
      // For now, we'll allow site creation
      console.log(`[createSiteCallable] ⚠️ Billing check placeholder - agency billingType: ${agencyData.billingType}`);
      // Example future check:
      // const subscription = await checkStripeSubscription(agencyId);
      // if (!subscription.active) {
      //   throw new functions.https.HttpsError("failed-precondition", "Active subscription required");
      // }
    }

    // Step 4: Create site document with agencyId and ownerId
    const siteData: any = {
      name: name.trim(),
      url: url.trim(),
      platform: platform === "shopline" ? "shopline" : "wordpress",
      agencyId, // PRIMARY ownership field
      ownerId: userId, // Keep for audit logs
      userId, // Legacy field for backward compatibility
      industry: industry || "general",
      targetAudience: targetAudience || "",
      brandVoice: brandVoice || "",
      tonePreferences: Array.isArray(tonePreferences) ? tonePreferences : [],
      contentGoals: contentGoals || "",
      competitors: Array.isArray(competitors) ? competitors : [],
      primaryKeywords: Array.isArray(primaryKeywords) ? primaryKeywords : [],
      contentRestrictions: contentRestrictions || "",
      blogsPerWeek: typeof blogsPerWeek === "number" ? blogsPerWeek : 3,
      blogsGenerated: 0,
      status: "pending",
      isActive: true,
      autoApprove: true,
      autoApproveBlogs: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Add optional WordPress credentials if provided
    if (wordpressApiUrl) {
      siteData.wordpressApiUrl = wordpressApiUrl.trim();
    }
    if (wordpressUsername) {
      siteData.wordpressUsername = wordpressUsername.trim();
    }
    if (wordpressAppPassword) {
      siteData.wordpressAppPassword = wordpressAppPassword.trim();
      // If credentials are provided, set status to 'connected'
      if (wordpressApiUrl && wordpressUsername) {
        siteData.status = "connected";
      }
    }

    // Add optional Shopline credentials
    if (shoplineHandle) {
      siteData.shoplineHandle = shoplineHandle.trim();
    }
    if (shoplineAccessToken) {
      siteData.shoplineAccessToken = shoplineAccessToken.trim();
      if (shoplineHandle) {
        siteData.status = "connected";
      }
    }

    // Add optional location fields
    if (country) {
      siteData.country = country.trim();
    }
    if (postcode) {
      siteData.postcode = postcode.trim();
    }

    // Add optional sitemap URL
    if (sitemapUrl) {
      siteData.sitemapUrl = sitemapUrl.trim();
    }

    const siteRef = await admin.firestore().collection("sites").add(siteData);
    const siteId = siteRef.id;

    console.log(`[createSiteCallable] ✅ Created site ${siteId} for agency ${agencyId}`);

    return {
      success: true,
      siteId,
      agencyId,
    };
  } catch (error: any) {
    console.error("[createSiteCallable] ❌ Error creating site:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      "Failed to create site",
      error.message
    );
  }
});

/**
 * Firestore Trigger: Auto-start campaign when a new site is created
 * Fires when a new document is created in the "sites" collection.
 * Waits briefly then calls the initial campaign generator automatically.
 */
export const onSiteCreated = functions
  .region("australia-southeast1")
  .runWith({timeoutSeconds: 540, memory: "1GB"})
  .firestore.document("sites/{siteId}")
  .onCreate(async (snap, context) => {
    const siteId = context.params.siteId;
    const siteData = snap.data();

    console.log(`[onSiteCreated] New site created: ${siteId}, status: ${siteData?.status}`);

    // Only auto-start if the site has platform credentials (WordPress or Shopline connected)
    const hasWordPress = !!(siteData?.wordpressApiUrl && siteData?.wordpressUsername && siteData?.wordpressAppPassword);
    const hasShopline = !!(siteData?.shoplineHandle && siteData?.shoplineAccessToken);

    if (!hasWordPress && !hasShopline) {
      console.log(`[onSiteCreated] Site ${siteId} has no publishing credentials yet — skipping auto-campaign.`);
      return;
    }

    // Small delay to let any follow-up writes settle (e.g. Shopline OAuth storing the token)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      console.log(`[onSiteCreated] Auto-starting initial campaign for site ${siteId}...`);
      const userId = siteData?.agencyId || siteData?.ownerId || siteData?.userId;
      if (!userId) {
        console.warn(`[onSiteCreated] No userId found for site ${siteId}, cannot auto-start campaign.`);
        return;
      }

      // Reuse the same logic as generateInitialCampaignCallable
      await runGenerateInitialCampaign(siteId, userId);

      console.log(`[onSiteCreated] ✅ Initial campaign auto-started for site ${siteId}`);
    } catch (error: any) {
      console.error(`[onSiteCreated] ❌ Failed to auto-start campaign for site ${siteId}:`, error.message);
      // Don't throw — we don't want to crash the trigger, the daily job will pick it up
    }
  });

/**
 * Callable Function: Auto-Fill Calendar
 * Automatically generates and schedules content when calendar has gaps
 * Only runs if lastAutoGenerateTime was more than 60 minutes ago
 */
export const autoFillCalendarCallable = region.runWith({
  timeoutSeconds: 300, // 5 minutes
  memory: "512MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { siteId } = data;

  if (!siteId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "siteId is required"
    );
  }

  try {
    console.log(`[autoFillCalendarCallable] Starting auto-fill for site: ${siteId}`);

    // Step 1: Update lastAutoGenerateTime immediately (safeguard)
    const siteRef = admin.firestore().collection("sites").doc(siteId);
    const siteDoc = await siteRef.get();

    if (!siteDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Site not found"
      );
    }

    const siteData = siteDoc.data();
    if (!siteData) {
      throw new functions.https.HttpsError(
        "not-found",
        "Site data is empty"
      );
    }

    // Update lastAutoGenerateTime
    await siteRef.update({
      lastAutoGenerateTime: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    console.log("[autoFillCalendarCallable] ✅ Updated lastAutoGenerateTime");

    // Step 2: Get latest scheduled post to determine next MWF date
    const calendarRef = siteRef.collection("contentCalendar");
    const autoApprove = siteData.autoApprove || false;

    // Query for the LATEST post (regardless of date - past or future)
    const latestPostQuery = calendarRef
      .orderBy("scheduledDate", "desc")
      .limit(1);

    const latestPostSnapshot = await latestPostQuery.get();

    let nextScheduledDate: admin.firestore.Timestamp;

    if (latestPostSnapshot.empty) {
      // No posts exist - use the next MWF after now
      nextScheduledDate = admin.firestore.Timestamp.fromDate(getNextMWFDate());
      console.log(`[autoFillCalendarCallable] No existing posts - next MWF: ${nextScheduledDate.toDate().toISOString()}`);
    } else {
      // Posts exist - schedule after the latest one on the next MWF
      const latestPost = latestPostSnapshot.docs[0];
      const latestDate = (latestPost.data().scheduledDate as admin.firestore.Timestamp).toDate();
      const nextDate = getNextMWFDate(latestDate);
      nextScheduledDate = admin.firestore.Timestamp.fromDate(nextDate);
      console.log(`[autoFillCalendarCallable] Latest post: ${latestDate.toISOString()}, Next MWF: ${nextDate.toISOString()}`);
    }

    // Step 3: Get unused targeted keyword
    const keywordsRef = siteRef.collection("targetedKeywords");
    const keywordsSnapshot = await keywordsRef.get();

    if (keywordsSnapshot.empty) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No targeted keywords found. Please generate keywords first."
      );
    }

    // Get all calendar entries to find used keywords
    const allCalendarSnapshot = await calendarRef.get();
    const usedKeywords = new Set<string>();
    allCalendarSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.keyword) {
        usedKeywords.add(data.keyword.toLowerCase());
      }
    });

    // Find an unused keyword
    let selectedKeyword: { id: string; keyword: string; volume?: number; difficulty?: number } | null = null;
    for (const keywordDoc of keywordsSnapshot.docs) {
      const keywordData = keywordDoc.data();
      const keyword = keywordData.keyword as string;
      if (!usedKeywords.has(keyword.toLowerCase())) {
        selectedKeyword = {
          id: keywordDoc.id,
          keyword,
          volume: keywordData.volume,
          difficulty: keywordData.difficulty,
        };
        break;
      }
    }

    // If all keywords are used, pick a random one
    if (!selectedKeyword) {
      const randomIndex = Math.floor(Math.random() * keywordsSnapshot.docs.length);
      const randomDoc = keywordsSnapshot.docs[randomIndex];
      const keywordData = randomDoc.data();
      selectedKeyword = {
        id: randomDoc.id,
        keyword: keywordData.keyword as string,
        volume: keywordData.volume,
        difficulty: keywordData.difficulty,
      };
      console.log(`[autoFillCalendarCallable] ⚠️ All keywords used, selecting random: ${selectedKeyword.keyword}`);
    } else {
      console.log(`[autoFillCalendarCallable] ✅ Selected unused keyword: ${selectedKeyword.keyword}`);
    }

    // Step 4: Generate content plan for the keyword
    const planPrompt = `Generate a content plan for a blog post about "${selectedKeyword.keyword}".

Tone: Professional

Return ONLY valid JSON:
{
  "blogTopic": "Catchy, engaging blog title (under 60 chars, includes keyword)",
  "blogDescription": "Brief meta description of what the blog will cover (max 50 words)",
  "imagePrompt": "Detailed prompt for DALL-E image generation (describe the visual style and content)"
}`;

    const planContent = await callGeminiAPI(planPrompt, 1000);
    let jsonString = planContent.trim();

    // Remove markdown code blocks if present
    jsonString = jsonString.replace(/```json/g, "").replace(/```/g, "").trim();

    // Find the first opening brace
    const firstBrace = jsonString.indexOf("{");
    if (firstBrace === -1) {
      throw new Error("No JSON object found in response (missing opening brace)");
    }

    // Extract from first brace onwards
    jsonString = jsonString.substring(firstBrace);

    // Find the matching closing brace (accounting for nested objects)
    let braceCount = 0;
    let lastBrace = -1;
    for (let i = 0; i < jsonString.length; i++) {
      if (jsonString[i] === "{") {
        braceCount++;
      } else if (jsonString[i] === "}") {
        braceCount--;
        if (braceCount === 0) {
          lastBrace = i;
          break;
        }
      }
    }

    if (lastBrace === -1) {
      // Fallback: try to parse anyway, might work if it's just missing closing brace
      console.warn("[autoFillCalendarCallable] ⚠️ Could not find matching closing brace, attempting to parse anyway");
    } else {
      // Extract only the JSON object (up to and including the closing brace)
      jsonString = jsonString.substring(0, lastBrace + 1);
    }

    let planData: { blogTopic?: string; blogDescription?: string; imagePrompt?: string };
    try {
      planData = JSON.parse(jsonString);
    } catch (parseError: any) {
      console.error("[autoFillCalendarCallable] ❌ Failed to parse JSON response:", parseError);
      console.error("[autoFillCalendarCallable] Extracted JSON:", jsonString);
      throw new Error(`Failed to parse content plan JSON: ${parseError.message}`);
    }
    const blogTopic = planData.blogTopic || `Complete Guide to ${selectedKeyword.keyword}`;
    const blogDescription = planData.blogDescription || `A comprehensive guide about ${selectedKeyword.keyword}.`;
    const imagePrompt = planData.imagePrompt || `Professional image representing ${selectedKeyword.keyword}, modern and clean design`;

    console.log(`[autoFillCalendarCallable] ✅ Generated content plan: ${blogTopic}`);

    // Step 5: Create calendar entry
    const status = autoApprove ? "approved" : "scheduled";
    const calendarEntryData: any = {
      blogTopic,
      keyword: selectedKeyword.keyword,
      blogDescription,
      imagePrompt,
      status,
      scheduledDate: nextScheduledDate,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    const calendarEntryRef = await calendarRef.add(calendarEntryData);
    const calendarId = calendarEntryRef.id;

    console.log(`[autoFillCalendarCallable] ✅ Created calendar entry ${calendarId} with status: ${status}`);

    return {
      success: true,
      message: `Auto-generated content scheduled for ${nextScheduledDate.toDate().toLocaleDateString()}`,
      calendarId,
      keyword: selectedKeyword.keyword,
      scheduledDate: nextScheduledDate.toDate().toISOString(),
      status,
    };
  } catch (error: any) {
    console.error("[autoFillCalendarCallable] ❌ Error:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      `Failed to auto-fill calendar: ${error.message}`,
      error.message
    );
  }
});

/**
 * Generate a topic idea (keyword and title) using AI
 * Lightweight function for generating just the topic, not full content
 * @param {Object} siteContext - Site context information
 * @param {string} siteContext.name - Site name
 * @param {string} [siteContext.industry] - Site industry
 * @param {string} [siteContext.targetAudience] - Target audience
 * @return {Promise<{keyword: string, title: string}>} Generated keyword and title
 */
async function generateTopicIdea(siteContext: {
  name: string;
  industry?: string;
  targetAudience?: string;
}): Promise<{ keyword: string; title: string }> {
  const prompt = `You are an SEO content strategist. Generate ONE blog topic idea for a website.

Website Context:
- Name: ${siteContext.name}
- Industry: ${siteContext.industry || "General"}
- Target Audience: ${siteContext.targetAudience || "General audience"}

Requirements:
1. Generate ONE SEO-friendly keyword (2-4 words, specific and searchable)
2. Generate ONE compelling blog post title (60 characters max, includes the keyword)

Return ONLY a valid JSON object in this format:
{
  "keyword": "example keyword phrase",
  "title": "Compelling Blog Post Title Here"
}

Do NOT include markdown formatting. Just return the raw JSON.`;

  try {
    const rawResponse = await callGeminiAPI(prompt, 500);
    const jsonText = rawResponse.trim().replace(/```json/g, "").replace(/```/g, "").trim();

    // Extract JSON object
    const firstBrace = jsonText.indexOf("{");
    if (firstBrace === -1) {
      throw new Error("No JSON object found in response");
    }

    let jsonString = jsonText.substring(firstBrace);
    const lastBrace = jsonString.lastIndexOf("}");
    if (lastBrace === -1) {
      throw new Error("No closing brace found");
    }
    jsonString = jsonString.substring(0, lastBrace + 1);

    const parsed = JSON.parse(jsonString);
    return {
      keyword: parsed.keyword || "SEO optimization",
      title: parsed.title || `Complete Guide to ${parsed.keyword || "SEO"}`,
    };
  } catch (error: any) {
    console.error("[generateTopicIdea] Error:", error);
    // Fallback
    return {
      keyword: "SEO optimization",
      title: "Complete Guide to SEO Optimization",
    };
  }
}

/**
 * Processor function for daily content automation
 * Maintains 12 planned topics and generates content for 3-day lookahead
 */
async function runDailyContentAutomationProcessor(): Promise<{
  sitesProcessed: number;
  topicsPlanned: number;
  blogsDrafted: number;
  errors: Array<{ siteId: string; error: string }>;
}> {
  const now = admin.firestore.Timestamp.now();
  const threeDaysFromNow = new Date(now.toDate());
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  threeDaysFromNow.setHours(23, 59, 59, 999); // End of day
  const threeDaysFromNowTimestamp = admin.firestore.Timestamp.fromDate(threeDaysFromNow);

  console.log("[runDailyContentAutomationProcessor] Starting daily content automation...");
  console.log(`[runDailyContentAutomationProcessor] Current time: ${now.toDate().toISOString()}`);
  console.log(`[runDailyContentAutomationProcessor] 3-day lookahead until: ${threeDaysFromNowTimestamp.toDate().toISOString()}`);

  const stats = {
    sitesProcessed: 0,
    topicsPlanned: 0,
    blogsDrafted: 0,
    errors: [] as Array<{ siteId: string; error: string }>,
  };

  try {
    // Step 1: Query agencies with active subscriptions
    const agenciesRef = admin.firestore().collection("agencies");
    const activeAgenciesQuery = agenciesRef.where("subscriptionStatus", "in", ["active", "agency_comp"]);
    const agenciesSnapshot = await activeAgenciesQuery.get();

    if (agenciesSnapshot.empty) {
      console.log("[runDailyContentAutomationProcessor] No active agencies found");
      return stats;
    }

    console.log(`[runDailyContentAutomationProcessor] Found ${agenciesSnapshot.size} active agencies`);

    // Step 2: For each agency, get their sites
    const allSites: Array<{ siteId: string; siteData: any }> = [];

    for (const agencyDoc of agenciesSnapshot.docs) {
      const agencyId = agencyDoc.id;
      const sitesQuery = admin
        .firestore()
        .collection("sites")
        .where("agencyId", "==", agencyId);
      const sitesSnapshot = await sitesQuery.get();

      sitesSnapshot.docs.forEach((siteDoc) => {
        allSites.push({
          siteId: siteDoc.id,
          siteData: siteDoc.data(),
        });
      });
    }

    console.log(`[runDailyContentAutomationProcessor] Found ${allSites.length} sites across all active agencies`);

    if (allSites.length === 0) {
      console.log("[runDailyContentAutomationProcessor] No sites found for active agencies");
      return stats;
    }

    // Step 3: Process each site
    for (const { siteId, siteData } of allSites) {
      try {
        console.log(`[runDailyContentAutomationProcessor] Processing site: ${siteId} (${siteData.name || "Unnamed"})`);

        const siteRef = admin.firestore().collection("sites").doc(siteId);
        const calendarRef = siteRef.collection("contentCalendar");

        const autoApprove = siteData.autoApprove || false;

        // STEP 1: Buffer Enforcer - Maintain 12 planned topics
        const futurePostsQuery = calendarRef
          .where("scheduledDate", ">", now)
          .orderBy("scheduledDate", "asc");

        const futurePostsSnapshot = await futurePostsQuery.get();
        const futureCount = futurePostsSnapshot.size;
        const needed = Math.max(0, 12 - futureCount);

        console.log(`[runDailyContentAutomationProcessor] Site ${siteId}: Found ${futureCount} future posts, need ${needed} more`);

        let topicsPlannedForSite = 0;

        if (needed > 0) {
          // Find the anchor date to generate MWF slots from
          const latestPostQuery = calendarRef.orderBy("scheduledDate", "desc").limit(1);
          const latestPostSnapshot = await latestPostQuery.get();

          let anchorDate: Date;
          if (latestPostSnapshot.empty) {
            anchorDate = new Date();
          } else {
            anchorDate = (latestPostSnapshot.docs[0].data().scheduledDate as admin.firestore.Timestamp).toDate();
          }

          const mwfSlots = getNextMWFDates(needed, anchorDate);

          // Create needed posts
          for (let i = 0; i < needed; i++) {
            let keyword: string;
            let title: string;

            // Fetch fresh targeted keywords from Firestore for each iteration
            const freshSiteDoc = await siteRef.get();
            const freshSiteData = freshSiteDoc.data();
            const targetedKeywords = (freshSiteData?.targetedKeywords || []) as string[];

            // Determine keyword
            if (targetedKeywords.length > 0) {
              // Use first keyword and remove it atomically
              keyword = targetedKeywords[0];
              title = `Complete Guide to ${keyword}`;

              // Remove from array (atomic update)
              await siteRef.update({
                targetedKeywords: admin.firestore.FieldValue.arrayRemove(keyword),
              });

              console.log(`[runDailyContentAutomationProcessor] Site ${siteId}: Using targeted keyword: ${keyword}`);
            } else {
              // Generate topic using AI
              const topicIdea = await generateTopicIdea({
                name: siteData.name || "Website",
                industry: siteData.industry || "",
                targetAudience: siteData.targetAudience || "",
              });
              keyword = topicIdea.keyword;
              title = topicIdea.title;

              console.log(`[runDailyContentAutomationProcessor] Site ${siteId}: Generated topic: ${keyword} - ${title}`);
            }

            // Create planned post on next MWF slot
            const scheduledDate = admin.firestore.Timestamp.fromDate(mwfSlots[i]);
            await calendarRef.add({
              status: "planned",
              scheduledDate: scheduledDate,
              keyword: keyword,
              blogTopic: title,
              blogDescription: `A comprehensive guide about ${keyword}.`,
              createdAt: admin.firestore.Timestamp.now(),
              updatedAt: admin.firestore.Timestamp.now(),
            });

            topicsPlannedForSite++;
            stats.topicsPlanned++;
          }

          console.log(`[runDailyContentAutomationProcessor] Site ${siteId}: Planned ${topicsPlannedForSite} topics`);
        }

        // STEP 2: Just-In-Time Writer - Generate content for planned posts within 3 days
        const plannedPostsQuery = calendarRef
          .where("status", "==", "planned")
          .where("scheduledDate", "<=", threeDaysFromNowTimestamp)
          .orderBy("scheduledDate", "asc");

        const plannedPostsSnapshot = await plannedPostsQuery.get();

        console.log(`[runDailyContentAutomationProcessor] Site ${siteId}: Found ${plannedPostsSnapshot.size} planned posts within 3 days`);

        let blogsDraftedForSite = 0;

        for (const postDoc of plannedPostsSnapshot.docs) {
          try {
            const postData = postDoc.data();
            const calendarId = postDoc.id;

            console.log(`[runDailyContentAutomationProcessor] Site ${siteId}: Drafting post ${calendarId} (${postData.keyword})`);

            // Generate blog content
            const contentResult = await generateBlogContent({
              keyword: postData.keyword,
              blogTopic: postData.blogTopic || postData.title || `Complete Guide to ${postData.keyword}`,
              blogDescription: postData.blogDescription || `A comprehensive guide about ${postData.keyword}.`,
              siteId: siteId,
              calendarId: calendarId,
            });

            // Update post with generated content
            const newStatus = autoApprove ? "approved" : "pending_approval";
            await postDoc.ref.update({
              generatedContent: contentResult.htmlContent,
              blogTitle: contentResult.blogTitle,
              blogDescription: contentResult.blogDescription,
              status: newStatus,
              updatedAt: admin.firestore.Timestamp.now(),
            });

            blogsDraftedForSite++;
            stats.blogsDrafted++;

            console.log(`[runDailyContentAutomationProcessor] Site ${siteId}: ✅ Drafted post ${calendarId}, status: ${newStatus}`);
          } catch (error: any) {
            console.error(`[runDailyContentAutomationProcessor] Site ${siteId}: ❌ Failed to draft post ${postDoc.id}:`, error);
            // Continue with next post
          }
        }

        console.log(`[runDailyContentAutomationProcessor] Site ${siteId}: ✅ Planned ${topicsPlannedForSite} topics. Drafted ${blogsDraftedForSite} blogs.`);
        stats.sitesProcessed++;
      } catch (error: any) {
        console.error(`[runDailyContentAutomationProcessor] ❌ Error processing site ${siteId}:`, error);
        stats.errors.push({
          siteId: siteId,
          error: error.message || "Unknown error",
        });
      }
    }

    console.log("[runDailyContentAutomationProcessor] ✅ Daily content automation complete:");
    console.log(`  - Sites processed: ${stats.sitesProcessed}`);
    console.log(`  - Topics planned: ${stats.topicsPlanned}`);
    console.log(`  - Blogs drafted: ${stats.blogsDrafted}`);
    if (stats.errors.length > 0) {
      console.log(`  - Errors: ${stats.errors.length}`);
    }

    return stats;
  } catch (error: any) {
    console.error("[runDailyContentAutomationProcessor] ❌ Fatal error:", error);
    throw error;
  }
}

/**
 * Scheduled Cloud Function: Daily Content Automation
 * Runs every day at 2 AM UTC
 * Maintains 12 planned topics and generates content for 3-day lookahead
 */
export const dailyContentAutomation = region.runWith({
  timeoutSeconds: 540, // 9 minutes
  memory: "1GB",
}).pubsub
  .schedule("0 2 * * *") // Every day at 2 AM UTC
  .timeZone("UTC")
  .onRun(async (_context) => {
    try {
      return await runDailyContentAutomationProcessor();
    } catch (error: any) {
      console.error("[dailyContentAutomation] ❌ Fatal error:", error);
      console.error("[dailyContentAutomation] Error stack:", error.stack);
      throw error;
    }
  });

/**
 * Callable Function: Force Run Daily Content Automation (Manual Trigger)
 * Allows manual execution for testing
 * Only accessible by App Owners
 */
export const forceRunDailyAutomationCallable = region.runWith({
  timeoutSeconds: 540,
  memory: "1GB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  // Check if user is super admin (by email domain)
  const userEmail = context.auth.token.email;

  if (!isSuperAdmin(userEmail)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only Super Admins can trigger this function"
    );
  }

  try {
    const result = await runDailyContentAutomationProcessor();
    return {
      success: true,
      ...result,
    };
  } catch (error: any) {
    console.error("[forceRunDailyAutomationCallable] ❌ Error:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      `Failed to run daily automation: ${error.message}`,
      error.message
    );
  }
});

/**
 * Callable Function: Force Generate Content for Planned Post
 * Generates content for a post with status 'planned'
 * Input: postId (calendar entry ID) - uses collection group query to find it
 */
export const forceGenerateContentCallable = region.runWith({
  timeoutSeconds: 300, // 5 minutes
  memory: "512MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { postId } = data;

  if (!postId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "postId is required"
    );
  }

  try {
    console.log(`[forceGenerateContentCallable] Generating content for planned post: ${postId}`);

    // Use collection group query to find the post by ID
    // Note: We need to search through all contentCalendar collections
    // Since we can't query by document ID directly in collection groups,
    // we'll search all agencies' sites (this is acceptable for manual triggers)
    const calendarGroupRef = admin.firestore().collectionGroup("contentCalendar");

    // Get all documents and find the one with matching ID
    // This is acceptable for manual triggers since it's not called frequently
    const allPostsSnapshot = await calendarGroupRef.get();
    const postDoc = allPostsSnapshot.docs.find((doc) => doc.id === postId);

    if (!postDoc) {
      throw new functions.https.HttpsError(
        "not-found",
        "Post not found"
      );
    }

    const calendarData = postDoc.data();

    if (!calendarData) {
      throw new functions.https.HttpsError(
        "not-found",
        "Post data is empty"
      );
    }

    // Extract siteId from the document path
    const pathParts = postDoc.ref.path.split("/");
    const siteIdIndex = pathParts.indexOf("sites");
    if (siteIdIndex === -1 || siteIdIndex + 1 >= pathParts.length) {
      throw new functions.https.HttpsError(
        "internal",
        "Could not extract siteId from document path"
      );
    }
    const siteId = pathParts[siteIdIndex + 1];

    // Check if status is 'planned'
    if (calendarData.status !== "planned") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Post must be in 'planned' status. Current status: ${calendarData.status}`
      );
    }

    // Get site data for autoApprove setting
    const siteDoc = await admin.firestore().collection("sites").doc(siteId).get();
    const siteData = siteDoc.data();
    const autoApprove = siteData?.autoApprove || false;

    // Generate blog content
    const contentResult = await generateBlogContent({
      keyword: calendarData.keyword as string,
      blogTopic: calendarData.blogTopic as string || `Complete Guide to ${calendarData.keyword}`,
      blogDescription: calendarData.blogDescription as string || `A comprehensive guide about ${calendarData.keyword}.`,
      siteId: siteId,
      calendarId: postId,
    });

    // Update post with generated content
    const newStatus = autoApprove ? "approved" : "pending_approval";
    await postDoc.ref.update({
      generatedContent: contentResult.htmlContent,
      blogTitle: contentResult.blogTitle,
      blogDescription: contentResult.blogDescription,
      status: newStatus,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    console.log(`[forceGenerateContentCallable] ✅ Generated content for post ${postId}, status: ${newStatus}`);

    return {
      success: true,
      status: newStatus,
      message: `Content generated successfully. Status: ${newStatus}`,
    };
  } catch (error: any) {
    console.error("[forceGenerateContentCallable] ❌ Error:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      `Failed to generate content: ${error.message}`,
      error.message
    );
  }
});

// Export Stripe callable functions and webhook handler
export {
  createCheckoutSessionCallable,
  createPortalSessionCallable,
  incrementSubscriptionCallable,
  createTrialSubscriptionCallable,
  handleStripeWebhook,
} from "./stripe";

// Export Analytics functions
export {
  logAnalyticsEvent,
  generateContentInsights,
  getTrackerScript,
} from "./analytics";

// Export Support functions
export {
  createTicketCallable,
  replyToTicketCallable,
  closeTicketCallable,
} from "./support";

// Export Queue Dispatcher and Worker
export {schedulerDispatcher} from "./queue/dispatcher";
export {contentWorker} from "./queue/worker";

// Export Site Management functions
export {verifyWordpressConnectionCallable} from "./sites";
export {generateShoplineAuthUrlCallable, exchangeShoplineCodeCallable} from "./shopline";

// Export Mailer functions
export {sendEmail, verifyEmailConfig} from "./mailer";

// Export Notification triggers
export {
  sendCampaignReadyEmail,
  sendWeeklyPerformanceEmail,
  sendMonthlyClientReports,
} from "./notifications";

/**
 * Core logic for generating an initial SEO campaign for a new site.
 * Used by both generateInitialCampaignCallable and the onSiteCreated trigger.
 * @param {string} siteId - The site ID
 * @param {string} userId - The owner's user ID (used to look up agencyId)
 * @return {Promise<object>} Result summary
 */
async function runGenerateInitialCampaign(siteId: string, userId: string): Promise<{
  success: boolean;
  keywordsCount?: number;
  blogPostsCount?: number;
  firstBlogPostId?: string;
  message?: string;
  skipped?: boolean;
}> {
  console.log(`[runGenerateInitialCampaign] Starting for site: ${siteId}, userId: ${userId}`);

  // Step 1: Get user's agency
  const userRef = admin.firestore().collection("users").doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) throw new Error(`User document not found: ${userId}`);

  const userData = userDoc.data();
  const agencyId = userData?.agencyId;
  if (!agencyId) throw new Error(`User ${userId} does not have an agency`);

  // Step 2: Get agency data
  const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
  const agencyDoc = await agencyRef.get();
  if (!agencyDoc.exists) throw new Error(`Agency not found: ${agencyId}`);

  const agencyData = agencyDoc.data();
  const niche = agencyData?.niche || "general";
  const location = agencyData?.location || agencyData?.country || "";
  const businessDescription = agencyData?.businessDescription || "";

  console.log(`[runGenerateInitialCampaign] Agency: niche=${niche}, location=${location}`);

  // Step 3: Get site data
  const siteRef = admin.firestore().collection("sites").doc(siteId);
  const siteDoc = await siteRef.get();
  if (!siteDoc.exists) throw new Error(`Site not found: ${siteId}`);

  const siteData = siteDoc.data();
  if (!siteData) throw new Error("Site data is empty");

  // Guard: skip if already generated
  if (siteData.hasCampaign) {
    console.log(`[runGenerateInitialCampaign] Campaign already generated for site ${siteId}`);
    return {success: true, message: "Campaign already generated"};
  }

  const calendarCollectionRef = siteRef.collection("contentCalendar");
  const existingEntries = await calendarCollectionRef.limit(1).get();
  if (!existingEntries.empty) {
    console.log(`[runGenerateInitialCampaign] Site ${siteId} already has calendar entries, skipping`);
    return {success: true, message: "Site already has content calendar entries", skipped: true};
  }

  // Step 4: Generate 12 targeted keywords
  const keywordPrompt = `Generate 12 targeted SEO keywords for a ${niche} business${location ? ` in ${location}` : ""}${businessDescription ? ` described as: ${businessDescription}` : ""}.

Focus on:
- High-value keywords relevant to this niche and location
- Mix of short (2-4 words) and long-tail (5+ words) keywords
- Question-based keywords ("how to", "what is", etc.)
- Problem-solution keywords

Return ONLY a valid JSON array of exactly 12 strings. Do not include any explanation or other text.`;

  const keywordContent = await callGeminiAPI(keywordPrompt, 2000, true);
  let keywords: string[] = [];
  try {
    keywords = JSON.parse(keywordContent);
  } catch {
    const jsonMatch = keywordContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) keywords = JSON.parse(jsonMatch[0]);
  }
  if (!keywords || keywords.length === 0) throw new Error("Failed to generate keywords");
  console.log(`[runGenerateInitialCampaign] ✅ Generated ${keywords.length} keywords`);

  // Step 5: Generate 12 blog post topics
  const blogPostsPrompt = `Generate 12 comprehensive blog post topic ideas for a ${niche} business${location ? ` in ${location}` : ""}${businessDescription ? ` described as: ${businessDescription}` : ""}.

Each blog post topic should be highly relevant, SEO-friendly, specific, and cover a variety of angles.

Return ONLY a valid JSON array of exactly 12 objects:
{"title": "Blog post title", "keyword": "Primary keyword", "description": "Brief description"}`;

  const blogPostsContent = await callGeminiAPI(blogPostsPrompt, 4000, true);
  let blogPostTopics: Array<{title: string; keyword: string; description: string}> = [];
  try {
    blogPostTopics = JSON.parse(blogPostsContent);
  } catch {
    const jsonMatch = blogPostsContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) blogPostTopics = JSON.parse(jsonMatch[0]);
  }
  if (!blogPostTopics || blogPostTopics.length === 0) throw new Error("Failed to generate blog post topics");
  console.log(`[runGenerateInitialCampaign] ✅ Generated ${blogPostTopics.length} blog post topics`);

  // Step 6: Save keywords to site
  await siteRef.update({
    targetedKeywords: keywords,
    primaryKeywords: keywords,
    hasCampaign: true,
    campaignStatus: "completed",
    status: "active",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Step 7: Create 12 calendar entries
  // First post is scheduled NOW (within 1 hour) so it goes live immediately.
  // Posts 2–12 are scheduled on the next 11 Mon/Wed/Fri slots at 02:00 UTC.
  const firstPostDate = new Date(); // publish immediately
  const mwfSchedule = getNextMWFDates(11); // 11 future MWF slots

  const blogPostPromises = blogPostTopics.map(async (topic, index) => {
    const scheduledDate = index === 0 ? firstPostDate : mwfSchedule[index - 1];

    const docRef = await calendarCollectionRef.add({
      blogTopic: topic.title,
      keyword: topic.keyword,
      blogDescription: topic.description,
      imagePrompt: `Professional illustration representing ${topic.keyword} for ${niche} business`,
      status: index === 0 ? "pending" : "scheduled",
      scheduledDate: admin.firestore.Timestamp.fromDate(scheduledDate),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      isPillar: false,
      childClusterIds: [],
    });
    return {id: docRef.id, ...topic};
  });

  const createdBlogPosts = await Promise.all(blogPostPromises);
  console.log(`[runGenerateInitialCampaign] ✅ Created ${createdBlogPosts.length} calendar entries`);

  // Step 8: Generate and approve content for the first blog post
  const firstPost = createdBlogPosts[0];
  try {
    const contentResult = await generateBlogContent({
      keyword: firstPost.keyword,
      blogTopic: firstPost.title,
      blogDescription: firstPost.description,
      imagePrompt: `Professional illustration representing ${firstPost.keyword} for ${niche} business`,
      siteId,
      calendarId: firstPost.id,
    });
    await calendarCollectionRef.doc(firstPost.id).update({
      generatedContent: contentResult.htmlContent,
      blogTitle: contentResult.blogTitle,
      blogDescription: contentResult.blogDescription,
      status: "approved",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("[runGenerateInitialCampaign] First post content generated and approved");
  } catch (contentError: any) {
    console.warn(`[runGenerateInitialCampaign] ⚠️ First post content generation failed: ${contentError.message}`);
    // Non-fatal — daily automation will retry
  }

  return {
    success: true,
    keywordsCount: keywords.length,
    blogPostsCount: blogPostTopics.length,
    firstBlogPostId: createdBlogPosts[0].id,
  };
}

/**
 * Callable Function: Generate Initial Campaign
 * Auto-generates SEO keywords and pillar topics for a new user's first site
 * Generates content for the first blog immediately
 */
export const generateInitialCampaignCallable = region.runWith({
  timeoutSeconds: 540, // 9 minutes for AI generation
  memory: "1GB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const userId = context.auth.uid;
  const {siteId} = data;

  if (!siteId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "siteId is required"
    );
  }

  try {
    return await runGenerateInitialCampaign(siteId, userId);
  } catch (error: any) {
    console.error("[generateInitialCampaignCallable] ❌ Error:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate initial campaign",
      error.message
    );
  }
});

/**
 * Callable Function: Ensure 12 Unpublished Posts
 * Checks and maintains 12 unpublished blog posts in the content calendar
 * Called on page load to ensure content pipeline stays full
 */
export const ensure12UnpublishedPostsCallable = region.runWith({
  timeoutSeconds: 540, // 9 minutes for AI generation
  memory: "1GB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const {siteId} = data;

  if (!siteId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "siteId is required"
    );
  }

  try {
    console.log(`[ensure12UnpublishedPostsCallable] Checking site: ${siteId}`);

    // Step 1: Get site data
    const siteRef = admin.firestore().collection("sites").doc(siteId);
    const siteDoc = await siteRef.get();

    if (!siteDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Site not found"
      );
    }

    const siteData = siteDoc.data();
    if (!siteData) {
      throw new functions.https.HttpsError(
        "not-found",
        "Site data is empty"
      );
    }

    // Step 2: Get all calendar entries and count unpublished
    const calendarRef = siteRef.collection("contentCalendar");
    const allEntriesSnapshot = await calendarRef.get();

    const unpublishedEntries = allEntriesSnapshot.docs.filter((doc) => {
      const data = doc.data();
      return data.status !== "published";
    });

    const unpublishedCount = unpublishedEntries.length;
    console.log(`[ensure12UnpublishedPostsCallable] Found ${unpublishedCount} unpublished posts`);

    // Step 3: If we have 12 or more, we're good
    if (unpublishedCount >= 12) {
      return {
        success: true,
        message: `Already have ${unpublishedCount} unpublished posts`,
        currentCount: unpublishedCount,
        needed: 0,
        created: 0,
      };
    }

    const needed = 12 - unpublishedCount;
    console.log(`[ensure12UnpublishedPostsCallable] Need to create ${needed} more posts`);

    // Auto-approve: when on, queue new titles for blog creation immediately so content is stored and visible before publish
    const autoApproveBlogs = siteData.autoApproveBlogs === true;

    // Step 4: Get site settings
    const niche = siteData.industry || "general";
    const agencyId = siteData.agencyId;

    // Get agency data for location/business context
    let location = "";
    let businessDescription = "";
    if (agencyId) {
      const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
      const agencyDoc = await agencyRef.get();
      if (agencyDoc.exists) {
        const agencyData = agencyDoc.data();
        location = agencyData?.location || agencyData?.country || "";
        businessDescription = agencyData?.businessDescription || "";
      }
    }

    // Step 5: Get anchor date to generate MWF slots from
    let anchorDate12: Date;
    if (unpublishedEntries.length > 0) {
      const dates = unpublishedEntries
        .map((doc) => {
          const sd = doc.data().scheduledDate;
          return sd ? (sd as admin.firestore.Timestamp).toDate() : null;
        })
        .filter((d): d is Date => d !== null);
      anchorDate12 = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();
    } else {
      anchorDate12 = new Date();
    }
    const mwfSlots12 = getNextMWFDates(needed, anchorDate12);

    // Step 6: Get targeted keywords
    const targetedKeywords = (siteData.targetedKeywords || []) as string[];
    const usedKeywords = new Set<string>();
    allEntriesSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.keyword) {
        usedKeywords.add(data.keyword.toLowerCase());
      }
    });

    // Step 7: Generate new posts
    const createdPosts: string[] = [];
    for (let i = 0; i < needed; i++) {
      const scheduledDate = mwfSlots12[i];

      // Get or generate keyword
      let keyword: string;
      let blogTopic: string;
      let blogDescription: string;

      // Try to use an unused targeted keyword first
      const unusedKeyword = targetedKeywords.find((k) => !usedKeywords.has(k.toLowerCase()));
      if (unusedKeyword) {
        keyword = unusedKeyword;
        usedKeywords.add(keyword.toLowerCase());
        blogTopic = `Complete Guide to ${keyword}`;
        blogDescription = `A comprehensive guide about ${keyword} for ${niche} businesses.`;
      } else {
        // Generate new topic using AI
        const topicPrompt = `Generate a blog post topic for a ${niche} business${location ? ` in ${location}` : ""}${businessDescription ? ` described as: ${businessDescription}` : ""}.

Return ONLY valid JSON:
{
  "title": "Engaging blog post title (under 60 chars)",
  "keyword": "Primary SEO keyword (2-5 words)",
  "description": "Brief description of what this post covers (max 50 words)"
}`;

        const topicContent = await callGeminiAPI(topicPrompt, 1000);
        let topicJson = topicContent.trim();
        topicJson = topicJson.replace(/```json/g, "").replace(/```/g, "").trim();
        const firstBrace = topicJson.indexOf("{");
        const lastBrace = topicJson.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
          topicJson = topicJson.substring(firstBrace, lastBrace + 1);
        }

        try {
          const topicData = JSON.parse(topicJson);
          keyword = topicData.keyword || `SEO topic ${Date.now()}`;
          blogTopic = topicData.title || `Complete Guide to ${keyword}`;
          blogDescription = topicData.description || `A comprehensive guide about ${keyword}.`;
        } catch {
          // Fallback if parsing fails
          keyword = `SEO topic ${Date.now()}`;
          blogTopic = `Complete Guide to ${keyword}`;
          blogDescription = `A comprehensive guide about ${keyword}.`;
        }
      }

      // Create calendar entry as "planned" so it is eligible for content generation (worker only drafts status=planned).
      // When auto-approve is on, we queue draft_content immediately so the blog is generated and stored for viewing before publish.
      const calendarEntryRef = await calendarRef.add({
        blogTopic,
        keyword,
        blogDescription,
        imagePrompt: `Professional illustration representing ${keyword} for ${niche} business`,
        status: "planned",
        scheduledDate: admin.firestore.Timestamp.fromDate(scheduledDate),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isPillar: false,
        childClusterIds: [],
      });

      createdPosts.push(calendarEntryRef.id);
      console.log(`[ensure12UnpublishedPostsCallable] ✅ Created post ${i + 1}/${needed}: ${blogTopic}`);

      // When auto-approve is on, queue blog creation immediately so content is generated and stored in the system for review before publish
      if (autoApproveBlogs) {
        try {
          await enqueueTask({
            type: "draft_content",
            siteId: siteId,
            postId: calendarEntryRef.id,
          });
          console.log(`[ensure12UnpublishedPostsCallable] Queued draft_content for post ${calendarEntryRef.id} (auto-approve on)`);
        } catch (enqueueError: any) {
          console.error(`[ensure12UnpublishedPostsCallable] Failed to enqueue draft_content for ${calendarEntryRef.id}:`, enqueueError);
          // Don't fail the whole operation; hourly dispatcher will pick it up
        }
      }
    }

    return {
      success: true,
      message: `Created ${createdPosts.length} new posts to maintain 12 unpublished posts`,
      currentCount: unpublishedCount + createdPosts.length,
      needed,
      created: createdPosts.length,
    };
  } catch (error: any) {
    console.error("[ensure12UnpublishedPostsCallable] ❌ Error:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to ensure 12 unpublished posts",
      error.message
    );
  }
});

/**
 * Callable: Delete a site completely (site doc, contentCalendar, targetedKeywords, posts subcollections, and blogs docs for this site).
 * Only the site's agency members or app owners can delete.
 */
export const deleteSiteCompletelyCallable = region.runWith({
  timeoutSeconds: 120,
  memory: "512MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const {siteId} = data;
  if (!siteId || typeof siteId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "siteId is required"
    );
  }

  const uid = context.auth.uid;
  const email = (context.auth.token?.email as string) || "";

  try {
    const siteRef = admin.firestore().collection("sites").doc(siteId);
    const siteDoc = await siteRef.get();
    if (!siteDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Site not found"
      );
    }

    const siteData = siteDoc.data();
    const siteAgencyId = siteData?.agencyId;

    // Allow if app owner (super admin) or if user's agency matches site's agency
    const appOwner = isSuperAdmin(email);
    if (!appOwner) {
      const userRef = admin.firestore().collection("users").doc(uid);
      const userDoc = await userRef.get();
      const userAgencyId = userDoc.exists ? userDoc.data()?.agencyId : null;
      if (!siteAgencyId || siteAgencyId !== userAgencyId) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You can only delete sites that belong to your agency."
        );
      }
    }

    const BATCH_SIZE = 500;
    const db = admin.firestore();

    const deleteCollection = async (ref: admin.firestore.CollectionReference): Promise<number> => {
      let deleted = 0;
      let snapshot = await ref.limit(BATCH_SIZE).get();
      while (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((d) => {
          batch.delete(d.ref);
          deleted++;
        });
        await batch.commit();
        snapshot = await ref.limit(BATCH_SIZE).get();
      }
      return deleted;
    };

    // 1) contentCalendar subcollection
    const calendarRef = siteRef.collection("contentCalendar");
    const calendarDeleted = await deleteCollection(calendarRef);
    console.log(`[deleteSiteCompletelyCallable] Deleted ${calendarDeleted} contentCalendar docs`);

    // 2) targetedKeywords subcollection
    const keywordsRef = siteRef.collection("targetedKeywords");
    const keywordsDeleted = await deleteCollection(keywordsRef);
    console.log(`[deleteSiteCompletelyCallable] Deleted ${keywordsDeleted} targetedKeywords docs`);

    // 3) posts subcollection (analytics)
    const postsRef = siteRef.collection("posts");
    const postsDeleted = await deleteCollection(postsRef);
    console.log(`[deleteSiteCompletelyCallable] Deleted ${postsDeleted} posts docs`);

    // 4) blogs collection (docs where siteId == siteId)
    const blogsSnapshot = await db.collection("blogs").where("siteId", "==", siteId).get();
    if (!blogsSnapshot.empty) {
      const batch = db.batch();
      blogsSnapshot.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`[deleteSiteCompletelyCallable] Deleted ${blogsSnapshot.size} blogs docs`);
    }

    // 5) pageViews / timeOnPage / scrollDepth: optional cleanup (they reference blogId, not siteId directly; blogIds are calendar ids). We could query by siteId and delete. Let me check - pageViews have siteId. So delete pageViews where siteId == siteId. Same for timeOnPage, scrollDepth.
    const pageViewsSnap = await db.collection("pageViews").where("siteId", "==", siteId).get();
    if (!pageViewsSnap.empty) {
      const batch = db.batch();
      pageViewsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`[deleteSiteCompletelyCallable] Deleted ${pageViewsSnap.size} pageViews docs`);
    }

    const timeOnPageSnap = await db.collection("timeOnPage").where("siteId", "==", siteId).get();
    if (!timeOnPageSnap.empty) {
      const batch = db.batch();
      timeOnPageSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`[deleteSiteCompletelyCallable] Deleted ${timeOnPageSnap.size} timeOnPage docs`);
    }

    const scrollDepthSnap = await db.collection("scrollDepth").where("siteId", "==", siteId).get();
    if (!scrollDepthSnap.empty) {
      const batch = db.batch();
      scrollDepthSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`[deleteSiteCompletelyCallable] Deleted ${scrollDepthSnap.size} scrollDepth docs`);
    }

    // 6) Delete the site document
    await siteRef.delete();
    console.log(`[deleteSiteCompletelyCallable] ✅ Site ${siteId} and all related data deleted`);

    return {
      success: true,
      message: "Site and all associated data deleted permanently.",
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error("[deleteSiteCompletelyCallable] ❌ Error:", error);
    throw new functions.https.HttpsError(
      "internal",
      error.message || "Failed to delete site"
    );
  }
});

/**
 * Firestore Trigger: Send Welcome Email on Agency Creation
 * Triggers when a new agency document is created
 */
export const sendWelcomeEmailOnAgencyCreate = region.firestore
  .document("agencies/{agencyId}")
  .onCreate(async (snapshot, context) => {
    try {
      const agencyId = context.params.agencyId;
      const agencyData = snapshot.data();

      console.log(`[sendWelcomeEmailOnAgencyCreate] Processing welcome email for agency: ${agencyId}`);

      // Get the owner's email from the user document
      const ownerId = agencyData?.ownerId;
      if (!ownerId) {
        console.warn(`[sendWelcomeEmailOnAgencyCreate] ⚠️ Agency ${agencyId} has no ownerId, skipping email`);
        return;
      }

      // Fetch user document to get email
      const userRef = admin.firestore().collection("users").doc(ownerId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        console.warn(`[sendWelcomeEmailOnAgencyCreate] ⚠️ User document ${ownerId} not found, skipping email`);
        return;
      }

      const userData = userDoc.data();
      const userEmail = userData?.email;

      if (!userEmail) {
        console.warn(`[sendWelcomeEmailOnAgencyCreate] ⚠️ User ${ownerId} has no email, skipping welcome email`);
        return;
      }

      // Get app URL from environment or use default
      const appUrl = process.env.APP_URL || functions.config().app?.url || "https://apex-seo.app";

      // Send welcome email
      await sendEmail({
        to: userEmail,
        subject: "Welcome to Apex SEO 🚀",
        body: `
          Hi there,<br><br>
          Your account has been successfully created. We are thrilled to help you automate your growth.<br><br>
          Click the button below to access your dashboard and connect your site.
        `,
        ctaLink: appUrl,
        ctaText: "Login to Dashboard",
      });

      console.log(`[sendWelcomeEmailOnAgencyCreate] ✅ Welcome email sent to ${userEmail} for agency ${agencyId}`);
    } catch (error: any) {
      // Log error but don't crash - email failures shouldn't break agency creation
      console.error("[sendWelcomeEmailOnAgencyCreate] ❌ Error sending welcome email:", error);
    }
  });
export { onPostUpdated } from "./deployBlog";