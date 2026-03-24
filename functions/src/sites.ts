import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import fetch, {Response} from "node-fetch";

// Configure region to match Firestore
const region = functions.region("australia-southeast1");

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
 * Callable Function: Verify WordPress Connection
 * Tests if provided WordPress credentials have write permissions
 * Uses GET /wp-json/wp/v2/users/me?context=edit to verify without creating data
 */
export const verifyWordpressConnectionCallable = region.runWith({
  timeoutSeconds: 30,
  memory: "256MB",
}).https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const {url, username, applicationPassword, siteId, save} = data;

  // Validate required inputs
  if (!url) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "URL is required"
    );
  }

  if (!username) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Username is required"
    );
  }

  if (!applicationPassword) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Application Password is required"
    );
  }

  try {
    // Step 1: Input Cleaning - Normalize URL
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeWordPressUrl(url);
    } catch (error: any) {
      // If URL doesn't start with https, throw strict error
      if (url && !url.startsWith("https://")) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "URL must use HTTPS. Apple and Stripe require SSL encryption."
        );
      }
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Invalid URL format: ${error.message}`
      );
    }

    console.log(`[verifyWordpressConnectionCallable] Testing connection to: ${normalizedUrl}`);

    // Step 2: The Test Request - GET /wp-json/wp/v2/users/me?context=edit
    // This verifies credentials and privileges without creating junk data
    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/users/me?context=edit`;
    const auth = Buffer.from(`${username}:${applicationPassword}`).toString("base64");

    let response: Response;
    let responseData: any;

    try {
      // Use AbortController for timeout (node-fetch v2 doesn't support timeout option directly)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Try to parse JSON response
      const responseText = await response.text();
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = {raw: responseText.substring(0, 200)};
      }
    } catch (fetchError: any) {
      // Network/timeout errors
      console.error("[verifyWordpressConnectionCallable] Network error:", fetchError);

      // Check if it's an abort (timeout) error
      if (fetchError.name === "AbortError" || fetchError.message?.includes("aborted")) {
        return {
          success: false,
          code: "TIMEOUT",
          message: "Connection timeout. Your WordPress site may be slow or unreachable.",
        };
      }

      return {
        success: false,
        code: "NETWORK_ERROR",
        message: `Failed to connect to WordPress: ${fetchError.message || "Connection timeout or network error"}`,
      };
    }

    // Step 3: Error Handling - The Detective Work
    if (response.status === 200) {
      // Success - credentials are valid and user has edit permissions
      const blogName = responseData.name || responseData.slug || "WordPress Site";
      console.log(`[verifyWordpressConnectionCallable] ✅ Connection verified for: ${blogName}`);

      const result: any = {
        success: true,
        blogName: blogName,
        url: normalizedUrl,
      };

      // Step 4: Save on Success (Optional)
      if (save === true && siteId) {
        try {
          const siteRef = admin.firestore().collection("sites").doc(siteId);

          // Verify user owns this site
          const siteDoc = await siteRef.get();
          if (!siteDoc.exists) {
            return {
              ...result,
              warning: "Connection verified but site not found in database",
            };
          }

          const siteData = siteDoc.data();
          const userId = context.auth.uid;

          // Check ownership via agencyId
          if (siteData?.agencyId) {
            const agencyDoc = await admin.firestore().collection("agencies").doc(siteData.agencyId).get();
            if (agencyDoc.exists && agencyDoc.data()?.userId !== userId) {
              throw new functions.https.HttpsError(
                "permission-denied",
                "You do not have permission to update this site"
              );
            }
          } else if (siteData?.userId && siteData.userId !== userId) {
            throw new functions.https.HttpsError(
              "permission-denied",
              "You do not have permission to update this site"
            );
          }

          // Save verified credentials
          await siteRef.update({
            wordpressUrl: normalizedUrl,
            wordpressUsername: username,
            wordpressAppPassword: applicationPassword,
            wordpressConnectionVerified: true,
            wordpressConnectionVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`[verifyWordpressConnectionCallable] ✅ Saved credentials to site ${siteId}`);
          result.saved = true;
        } catch (saveError: any) {
          console.error("[verifyWordpressConnectionCallable] Failed to save credentials:", saveError);
          if (saveError instanceof functions.https.HttpsError) {
            throw saveError;
          }
          result.warning = `Connection verified but failed to save: ${saveError.message}`;
        }
      }

      return result;
    } else if (response.status === 401) {
      // Unauthorized - Invalid credentials
      console.error("[verifyWordpressConnectionCallable] ❌ 401 Unauthorized");
      return {
        success: false,
        code: "INVALID_CREDS",
        message: "Username or Application Password incorrect.",
      };
    } else if (response.status === 403) {
      // Forbidden - User exists but lacks permissions
      console.error("[verifyWordpressConnectionCallable] ❌ 403 Forbidden");
      return {
        success: false,
        code: "PERMISSIONS",
        message: "User exists but lacks Editor/Admin permissions.",
      };
    } else if (response.status === 404) {
      // Not Found - REST API disabled or blocked
      console.error("[verifyWordpressConnectionCallable] ❌ 404 Not Found");
      return {
        success: false,
        code: "API_DISABLED",
        message: "REST API not found. Check if a security plugin is blocking '/wp-json/'.",
      };
    } else if (response.status >= 500) {
      // Server Error
      console.error(`[verifyWordpressConnectionCallable] ❌ ${response.status} Server Error`);
      return {
        success: false,
        code: "SERVER_ERROR",
        message: "Your host is blocking the connection.",
      };
    } else {
      // Other error status
      console.error(`[verifyWordpressConnectionCallable] ❌ ${response.status} ${response.statusText}`);
      return {
        success: false,
        code: "UNKNOWN_ERROR",
        message: `WordPress returned status ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error: any) {
    console.error("[verifyWordpressConnectionCallable] ❌ Unexpected error:", error);

    // If it's already an HttpsError, re-throw it
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    // Otherwise, wrap it
    throw new functions.https.HttpsError(
      "internal",
      `Failed to verify WordPress connection: ${error.message || "Unknown error"}`
    );
  }
});
