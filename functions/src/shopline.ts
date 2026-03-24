import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import fetch from "node-fetch";
import * as crypto from "crypto";
import {SecretManagerServiceClient} from "@google-cloud/secret-manager";

const region = functions.region("australia-southeast1");
const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = process.env.GCLOUD_PROJECT || "apex-seo-ffbd0";

let cachedShoplineAppKey: string | null = null;
let cachedShoplineAppSecret: string | null = null;

function getAppUrl(): string {
  return process.env.APP_URL || functions.config().app?.url || "https://apex-seo.app";
}

async function getSecretValue(secretName: string, envFallback: string): Promise<string | null> {
  const secretPath = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
  try {
    const [version] = await secretClient.accessSecretVersion({name: secretPath});
    const value = version.payload?.data?.toString();
    if (value && value.length > 0) return value;
  } catch (error: any) {
    console.warn(`[shopline] Failed to fetch ${secretName} from Secret Manager:`, error.message);
  }

  if (process.env[envFallback] && process.env[envFallback]!.length > 0) {
    return process.env[envFallback]!;
  }

  return null;
}

async function getShoplineAppKey(): Promise<string> {
  if (cachedShoplineAppKey) return cachedShoplineAppKey;
  const value = await getSecretValue("SHOPLINE_APP_KEY", "SHOPLINE_APP_KEY");
  if (!value) throw new Error("SHOPLINE_APP_KEY is not configured");
  cachedShoplineAppKey = value;
  return value;
}

async function getShoplineAppSecret(): Promise<string> {
  if (cachedShoplineAppSecret) return cachedShoplineAppSecret;
  const value = await getSecretValue("SHOPLINE_APP_SECRET", "SHOPLINE_APP_SECRET");
  if (!value) throw new Error("SHOPLINE_APP_SECRET is not configured");
  cachedShoplineAppSecret = value;
  return value;
}

function hmacSha256(input: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function verifyShoplineGetSignature(
  queryParams: Record<string, string>,
  appSecret: string
): boolean {
  const receivedSign = queryParams.sign;
  if (!receivedSign) return false;

  const filtered = Object.entries(queryParams)
    .filter(([k]) => k !== "sign")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  const expected = hmacSha256(filtered, appSecret);
  return timingSafeEqualHex(expected, receivedSign);
}

function parseCustomField(customField?: string): {siteId?: string; returnTo?: string; handle?: string} {
  if (!customField) return {};
  try {
    return JSON.parse(customField);
  } catch {
    return {};
  }
}

export const generateShoplineAuthUrlCallable = region.runWith({
  timeoutSeconds: 30,
  memory: "256MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }

  const handle = String(data?.handle || "").trim();
  const siteId = data?.siteId ? String(data.siteId).trim() : undefined;
  const returnTo = data?.returnTo ? String(data.returnTo).trim() : "/onboarding";
  const scope = String(data?.scope || "read_content,write_content");

  if (!handle) {
    throw new functions.https.HttpsError("invalid-argument", "Shopline handle is required");
  }

  try {
    const appKey = await getShoplineAppKey();
    const redirectUri = `${getAppUrl().replace(/\/$/, "")}/auth/callback`;
    const customField = JSON.stringify({siteId, returnTo, handle});

    const params = new URLSearchParams({
      appKey,
      responseType: "code",
      scope,
      redirectUri,
      customField,
    });

    const authUrl = `https://${handle}.myshopline.com/admin/oauth-web/#/oauth/authorize?${params.toString()}`;
    return {success: true, authUrl, redirectUri};
  } catch (error: any) {
    throw new functions.https.HttpsError(
      "internal",
      error.message || "Failed to generate Shopline authorization URL"
    );
  }
});

export const exchangeShoplineCodeCallable = region.runWith({
  timeoutSeconds: 30,
  memory: "256MB",
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }

  const userId = context.auth.uid;
  const code = String(data?.code || "").trim();
  const siteId = data?.siteId ? String(data.siteId).trim() : undefined;
  const queryParams = (data?.queryParams || {}) as Record<string, string>;
  const customFieldData = parseCustomField(data?.customField ? String(data.customField) : undefined);
  // handle can come from direct param or be recovered from customField (set during auth URL generation)
  const handle = (String(data?.handle || "").trim()) || (customFieldData.handle || "");
  const targetSiteId = siteId || customFieldData.siteId;

  if (!code) {
    throw new functions.https.HttpsError("invalid-argument", "Missing authorization code");
  }
  if (!handle) {
    throw new functions.https.HttpsError("invalid-argument", "Missing Shopline handle");
  }

  try {
    const appKey = await getShoplineAppKey();
    const appSecret = await getShoplineAppSecret();

    if (queryParams?.sign && !verifyShoplineGetSignature(queryParams, appSecret)) {
      throw new functions.https.HttpsError("permission-denied", "Invalid Shopline callback signature");
    }

    if (queryParams?.timestamp) {
      const ts = Number(queryParams.timestamp);
      if (!Number.isNaN(ts)) {
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;
        if (Math.abs(now - ts) > tenMinutes) {
          throw new functions.https.HttpsError("deadline-exceeded", "Shopline callback timestamp expired");
        }
      }
    }

    const tokenUrl = `https://${handle}.myshopline.com/admin/oauth/token/create`;
    const timestamp = Date.now().toString();
    const body = JSON.stringify({code});
    const sign = hmacSha256(`${body}${timestamp}`, appSecret);

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        appkey: appKey,
        timestamp,
        sign,
      },
      body,
    });

    const tokenResult: any = await response.json();
    if (!response.ok || tokenResult?.code !== 200 || !tokenResult?.data) {
      throw new functions.https.HttpsError(
        "internal",
        `Token exchange failed: ${tokenResult?.message || response.statusText || "Unknown error"}`
      );
    }

    const accessToken = tokenResult.data.accessToken || tokenResult.data.access_token;
    const expireTime = tokenResult.data.expireTime || tokenResult.data.expire_time || null;
    if (!accessToken) {
      throw new functions.https.HttpsError("internal", "Shopline did not return an access token");
    }

    if (targetSiteId) {
      const siteRef = admin.firestore().collection("sites").doc(targetSiteId);
      const siteDoc = await siteRef.get();

      if (!siteDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Site not found");
      }

      const siteData = siteDoc.data();
      if (!siteData) {
        throw new functions.https.HttpsError("not-found", "Site data missing");
      }

      if (siteData.agencyId) {
        const agencyDoc = await admin.firestore().collection("agencies").doc(siteData.agencyId).get();
        if (!agencyDoc.exists || !agencyDoc.data()?.members?.includes(userId)) {
          throw new functions.https.HttpsError("permission-denied", "You do not have access to this site");
        }
      } else if (siteData.userId !== userId) {
        throw new functions.https.HttpsError("permission-denied", "You do not have access to this site");
      }

      await siteRef.update({
        platform: "shopline",
        shoplineHandle: handle,
        shoplineAccessToken: accessToken,
        shoplineTokenExpiresAt: expireTime || null,
        status: "connected",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return {
      success: true,
      handle,
      accessToken,
      expireTime,
      siteId: targetSiteId || null,
      returnTo: customFieldData.returnTo || "/onboarding",
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", error.message || "Shopline callback exchange failed");
  }
});

/**
 * Publish a blog article to a Shopline store.
 * Uses the Shopline OpenAPI 2022-01 Articles endpoint.
 *
 * @param handle  - Shopline store handle (e.g. "mystore")
 * @param accessToken - OAuth access token for the store
 * @param article - Article content and metadata
 * @returns Post ID and URL for the published article
 */
export async function publishToShopline(
  handle: string,
  accessToken: string,
  article: {
    title: string;
    content: string;
    excerpt?: string;
    featuredImageUrl?: string;
    slug?: string;
  }
): Promise<{postId: string; postUrl: string}> {
  const baseUrl = `https://${handle}.myshopline.com`;

  // Step 1: Get the first available blog (or create one if none exist)
  const blogsRes = await fetch(`${baseUrl}/openapi/2022-01/blogs.json`, {
    method: "GET",
    headers: {
      "Authorization": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!blogsRes.ok) {
    const errText = await blogsRes.text();
    throw new Error(`Failed to fetch Shopline blogs: ${blogsRes.status} ${errText}`);
  }

  const blogsData: any = await blogsRes.json();
  const blogs: any[] = blogsData?.blogs || blogsData?.data?.blogs || [];

  let blogId: string;
  if (blogs.length > 0) {
    blogId = String(blogs[0].id);
  } else {
    // Create a default blog
    const createBlogRes = await fetch(`${baseUrl}/openapi/2022-01/blogs.json`, {
      method: "POST",
      headers: {
        "Authorization": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({blog: {title: "News"}}),
    });
    if (!createBlogRes.ok) {
      const errText = await createBlogRes.text();
      throw new Error(`Failed to create Shopline blog: ${createBlogRes.status} ${errText}`);
    }
    const newBlog: any = await createBlogRes.json();
    blogId = String(newBlog?.blog?.id || newBlog?.data?.blog?.id);
    if (!blogId) throw new Error("Failed to get blog ID from Shopline create blog response");
  }

  // Step 2: Build article payload
  const articlePayload: any = {
    article: {
      title: article.title,
      body_html: article.content,
      published: true,
    },
  };

  if (article.excerpt) {
    articlePayload.article.summary_html = article.excerpt;
  }

  if (article.slug) {
    articlePayload.article.handle = article.slug;
  }

  if (article.featuredImageUrl) {
    articlePayload.article.image = {src: article.featuredImageUrl};
  }

  // Step 3: Create the article
  const articleRes = await fetch(`${baseUrl}/openapi/2022-01/blogs/${blogId}/articles.json`, {
    method: "POST",
    headers: {
      "Authorization": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(articlePayload),
  });

  if (!articleRes.ok) {
    const errText = await articleRes.text();
    throw new Error(`Failed to create Shopline article: ${articleRes.status} ${errText}`);
  }

  const articleData: any = await articleRes.json();
  const created = articleData?.article || articleData?.data?.article;

  if (!created?.id) {
    throw new Error("Shopline article created but no ID returned");
  }

  const articleHandle = created.handle || article.slug || String(created.id);
  const postUrl = created.url || `${baseUrl}/blogs/${blogs[0]?.handle || "news"}/${articleHandle}`;

  return {postId: String(created.id), postUrl};
}

