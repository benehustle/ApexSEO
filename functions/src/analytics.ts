import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {getClientIP, checkIPRateLimit} from "./rateLimiting";
import {callGeminiAPI} from "./index";

// Configure region to match Firestore
const region = functions.region("australia-southeast1");

/**
 * HTTP Request Function: logAnalyticsEvent
 * Handles view and heartbeat events for blog posts
 *
 * @param eventType - 'view' or 'heartbeat'
 * @param siteId - Site ID
 * @param postId - Post ID
 * @param duration - Time duration in seconds (for heartbeat)
 */
export const logAnalyticsEvent = region.https.onRequest(async (req, res) => {
  // CORS handling
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
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
    const {siteId, postId, eventType, duration} = body;

    // Validation
    if (!siteId || !postId || !eventType) {
      res.status(400).send({error: "Missing required fields: siteId, postId, eventType"});
      return;
    }

    if (eventType !== "view" && eventType !== "heartbeat") {
      res.status(400).send({error: "eventType must be 'view' or 'heartbeat'"});
      return;
    }

    if (eventType === "heartbeat" && typeof duration !== "number") {
      res.status(400).send({error: "duration is required and must be a number for heartbeat events"});
      return;
    }

    const postRef = admin.firestore()
      .collection("sites")
      .doc(siteId)
      .collection("posts")
      .doc(postId);

    // Check if post exists
    const postDoc = await postRef.get();
    if (!postDoc.exists) {
      res.status(404).send({error: "Post not found"});
      return;
    }

    if (eventType === "view") {
      // Atomic increment views
      await postRef.update({
        views: admin.firestore.FieldValue.increment(1),
        lastViewedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[logAnalyticsEvent] Incremented views for post ${postId} in site ${siteId}`);
    } else if (eventType === "heartbeat") {
      // Use transaction to atomically update totalTimeOnPage and recalculate avgTimeOnPage
      await admin.firestore().runTransaction(async (transaction) => {
        const postSnapshot = await transaction.get(postRef);
        if (!postSnapshot.exists) {
          throw new Error("Post not found");
        }

        const postData = postSnapshot.data();
        const currentTotalTime = postData?.totalTimeOnPage || 0;
        const currentViewCount = postData?.views || 0;

        // Increment totalTimeOnPage by duration
        const newTotalTime = currentTotalTime + duration;

        // Calculate new average: total time / number of views
        const newAvgTime = currentViewCount > 0 ? newTotalTime / currentViewCount : duration;

        // Update both fields atomically
        transaction.update(postRef, {
          totalTimeOnPage: newTotalTime,
          avgTimeOnPage: Math.round(newAvgTime),
        });

        console.log(`[logAnalyticsEvent] Updated time on page for post ${postId}: added ${duration}s, new total=${newTotalTime}s, avg=${Math.round(newAvgTime)}s`);
      });
    }

    res.status(200).send({success: true});
  } catch (error: any) {
    console.error("[logAnalyticsEvent] Error:", error);
    res.status(500).send({error: "Internal server error", message: error.message});
  }
});

/**
 * Firestore Trigger: generateContentInsights
 * Generates AI insights when a post reaches 50 views
 *
 * Triggered on: sites/{siteId}/posts/{postId} document updates
 * Condition: before.views < 50 AND after.views >= 50 AND !post.insightGenerated
 */
export const generateContentInsights = region.firestore
  .document("sites/{siteId}/posts/{postId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const {postId} = context.params;

    try {
      // Check conditions: views crossed 50 threshold and insights not yet generated
      const beforeViews = before?.views || 0;
      const afterViews = after?.views || 0;
      const insightGenerated = after?.insightGenerated || false;

      if (beforeViews < 50 && afterViews >= 50 && !insightGenerated) {
        console.log(`[generateContentInsights] Post ${postId} reached 50 views, generating insights...`);

        const views = afterViews;
        const avgTimeOnPage = after?.avgTimeOnPage || 0;
        const title = after?.title || "this blog post";
        const content = after?.content || "";
        const excerpt = after?.excerpt || "";

        // Prepare prompt for AI analysis
        const prompt = `Analyze this blog post based on its performance metrics:

Title: ${title}
Excerpt: ${excerpt}
Content Preview: ${content.substring(0, 1000)}${content.length > 1000 ? "..." : ""}

Performance Metrics:
- Total Views: ${views}
- Average Time on Page: ${avgTimeOnPage} seconds

Please provide insights on:
1. Content engagement analysis (based on time on page)
2. Potential improvements or optimizations
3. What's working well based on the metrics
4. Recommendations for better performance

Keep the response concise and actionable (max 500 words).`;

        // Call AI API (Gemini)
        let aiInsights: string;
        try {
          aiInsights = await callGeminiAPI(prompt, 2000);
          console.log(`[generateContentInsights] Successfully generated insights for post ${postId}`);
        } catch (aiError: any) {
          console.error("[generateContentInsights] AI API error:", aiError);
          // Fallback message if AI fails
          aiInsights = `This post has reached ${views} views with an average time on page of ${avgTimeOnPage} seconds. Consider analyzing engagement patterns and optimizing content based on user behavior.`;
        }

        // Update post with insights
        await change.after.ref.update({
          aiInsights,
          insightGenerated: true,
          insightGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[generateContentInsights] ✅ Insights saved for post ${postId}`);
      } else {
        console.log(`[generateContentInsights] Skipping post ${postId}: beforeViews=${beforeViews}, afterViews=${afterViews}, insightGenerated=${insightGenerated}`);
      }
    } catch (error: any) {
      console.error(`[generateContentInsights] Error processing post ${postId}:`, error);
      // Don't throw - this is a background trigger
    }
  });

/**
 * Helper Function: getTrackerScript
 * Returns the raw JavaScript string to inject into HTML for tracking
 *
 * @param {string} logAnalyticsEventUrl - The full URL to the logAnalyticsEvent function
 * @param {string} siteId - Site ID
 * @param {string} postId - Post ID
 * @return {string} JavaScript code as string
 */
export function getTrackerScript(
  logAnalyticsEventUrl: string,
  siteId: string,
  postId: string
): string {
  return `
(function() {
  'use strict';
  
  const ANALYTICS_URL = '${logAnalyticsEventUrl}';
  const SITE_ID = '${siteId}';
  const POST_ID = '${postId}';
  const HEARTBEAT_INTERVAL = 15000; // 15 seconds
  
  let viewLogged = false;
  let startTime = Date.now();
  let heartbeatInterval = null;
  
  // Log initial view
  function logView() {
    if (viewLogged) return;
    viewLogged = true;
    
    fetch(ANALYTICS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteId: SITE_ID,
        postId: POST_ID,
        eventType: 'view'
      })
    }).catch(function(err) {
      console.warn('Analytics: Failed to log view', err);
    });
  }
  
  // Log heartbeat with duration
  function logHeartbeat() {
    const duration = Math.round((Date.now() - startTime) / 1000); // seconds
    
    fetch(ANALYTICS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siteId: SITE_ID,
        postId: POST_ID,
        eventType: 'heartbeat',
        duration: duration
      })
    }).catch(function(err) {
      console.warn('Analytics: Failed to log heartbeat', err);
    });
  }
  
  // Start tracking when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      logView();
      heartbeatInterval = setInterval(logHeartbeat, HEARTBEAT_INTERVAL);
    });
  } else {
    logView();
    heartbeatInterval = setInterval(logHeartbeat, HEARTBEAT_INTERVAL);
  }
  
  // Log final heartbeat when page unloads
  window.addEventListener('beforeunload', function() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    logHeartbeat();
  });
})();
`.trim();
}
