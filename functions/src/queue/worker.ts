import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {generateBlogContent, processCalendarEntry, callGeminiAPI} from "../index";
import {getNextMWFDates} from "../scheduling";

// Configure region to match Firestore
const region = functions.region("australia-southeast1");

/**
 * Generate a topic idea using AI
 * @param {Object} siteContext - Site context for topic generation
 * @return {Promise<Object>} Topic idea with keyword and title
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
 * Handle plan_topics task: Generate and schedule topics to maintain 12 unpublished posts
 * @param {string} siteId - Site ID
 * @return {Promise<void>}
 */
async function handlePlanTopics(siteId: string): Promise<void> {
  console.log(`[contentWorker] plan_topics: Processing site ${siteId}`);

  // Step 1: Get site data
  const siteRef = admin.firestore().collection("sites").doc(siteId);
  const siteDoc = await siteRef.get();

  if (!siteDoc.exists) {
    throw new Error(`Site not found: ${siteId}`);
  }

  const siteData = siteDoc.data();
  if (!siteData) {
    throw new Error(`Site data is empty for siteId: ${siteId}`);
  }

  // Check if site is active
  if (siteData.status !== "active") {
    console.log(`[contentWorker] plan_topics: Site ${siteId} is not active, skipping`);
    return; // Not an error - just skip
  }

  // Step 2: Count unpublished posts
  const calendarRef = siteRef.collection("contentCalendar");
  const allEntriesSnapshot = await calendarRef.get();

  const unpublishedEntries = allEntriesSnapshot.docs.filter((doc) => {
    const data = doc.data();
    return data.status !== "published";
  });

  const unpublishedCount = unpublishedEntries.length;
  console.log(`[contentWorker] plan_topics: Site ${siteId} has ${unpublishedCount} unpublished posts`);

  // If we already have 12 or more, we're done
  if (unpublishedCount >= 12) {
    console.log(`[contentWorker] plan_topics: Site ${siteId} already has ${unpublishedCount} unpublished posts, no action needed`);
    return;
  }

  const needed = 12 - unpublishedCount;
  console.log(`[contentWorker] plan_topics: Site ${siteId} needs ${needed} more posts`);

  // Step 3: Get site settings
  const niche = siteData.industry || "general";

  // Step 4: Find anchor date and generate MWF slots
  let anchorDateWorker: Date;
  if (unpublishedEntries.length > 0) {
    const dates = unpublishedEntries
      .map((doc) => {
        const sd = doc.data().scheduledDate;
        return sd ? (sd as admin.firestore.Timestamp).toDate() : null;
      })
      .filter((d): d is Date => d !== null);
    anchorDateWorker = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();
  } else {
    anchorDateWorker = new Date();
  }
  const mwfSlotsWorker = getNextMWFDates(needed, anchorDateWorker);

  // Step 5: Get targeted keywords
  const targetedKeywords = (siteData.targetedKeywords || []) as string[];
  const usedKeywords = new Set<string>();
  allEntriesSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.keyword) {
      usedKeywords.add(data.keyword.toLowerCase());
    }
  });

  // Step 6: Generate new posts on Mon/Wed/Fri at 02:00 UTC
  for (let i = 0; i < needed; i++) {
    const scheduledDate = mwfSlotsWorker[i];

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
      // Note: We could enhance this with location/businessDescription from agency
      // but for now we use siteData which may contain this context
      const topicIdea = await generateTopicIdea({
        name: siteData.name || "Website",
        industry: niche,
        targetAudience: siteData.targetAudience || "",
      });
      keyword = topicIdea.keyword;
      blogTopic = topicIdea.title;
      blogDescription = `A comprehensive guide about ${keyword}.`;
    }

    // Create calendar entry
    await calendarRef.add({
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

    console.log(`[contentWorker] plan_topics: ✅ Created post ${i + 1}/${needed}: ${blogTopic}`);
  }

  console.log(`[contentWorker] plan_topics: ✅ Completed for site ${siteId}, created ${needed} posts`);
}

/**
 * Handle draft_content task: Generate blog content for a planned post
 * @param {string} siteId - Site ID
 * @param {string} postId - Calendar entry ID
 * @return {Promise<void>}
 */
async function handleDraftContent(siteId: string, postId: string): Promise<void> {
  console.log(`[contentWorker] draft_content: Processing site ${siteId}, post ${postId}`);

  // Step 1: Get calendar entry
  const calendarRef = admin.firestore()
    .collection("sites")
    .doc(siteId)
    .collection("contentCalendar")
    .doc(postId);

  const calendarDoc = await calendarRef.get();

  if (!calendarDoc.exists) {
    throw new Error(`Calendar entry not found: ${postId} for site ${siteId}`);
  }

  const calendarData = calendarDoc.data();
  if (!calendarData) {
    throw new Error(`Calendar entry data is empty for ${postId}`);
  }

  // Check if already has content
  if (calendarData.generatedContent) {
    console.log(`[contentWorker] draft_content: Post ${postId} already has content, skipping`);
    return; // Not an error - already done
  }

  // Check if status is 'planned'
  if (calendarData.status !== "planned") {
    console.log(`[contentWorker] draft_content: Post ${postId} status is '${calendarData.status}', not 'planned', skipping`);
    return; // Not an error - might have been processed already
  }

  // Step 2: Fetch Site - Retrieve site document to get settings
  const siteDoc = await admin.firestore().collection("sites").doc(siteId).get();
  if (!siteDoc.exists) {
    throw new Error(`Site not found: ${siteId}`);
  }

  const site = siteDoc.data();
  if (!site) {
    throw new Error(`Site data is empty for siteId: ${siteId}`);
  }

  const autoApprove = site.autoApprove === true || site.autoApproveBlogs === true;

  // Step 3: Generate - Run the existing AI generation logic to get the HTML
  const contentResult = await generateBlogContent({
    keyword: calendarData.keyword as string,
    blogTopic: calendarData.blogTopic as string || `Complete Guide to ${calendarData.keyword}`,
    blogDescription: calendarData.blogDescription as string || `A comprehensive guide about ${calendarData.keyword}.`,
    siteId: siteId,
    calendarId: postId,
  });

  // Step 4: Determine Status - Check autoApprove flag to decide final status
  const status = autoApprove ? "approved" : "pending";

  // Step 5: Save - Update the post document with the new content and status
  await calendarRef.update({
    generatedContent: contentResult.htmlContent,
    blogTitle: contentResult.blogTitle,
    blogDescription: contentResult.blogDescription,
    status: status,
    updatedAt: admin.firestore.Timestamp.now(),
  });

  // Log: Drafted Post with Auto-Approve status
  console.log(`Drafted Post ${postId}. Auto-Approve: ${autoApprove} -> Status: ${status}`);
}

/**
 * Handle publish_post task: Publish an approved post to WordPress
 * @param {string} siteId - Site ID
 * @param {string} postId - Calendar entry ID
 * @return {Promise<void>}
 */
async function handlePublishPost(siteId: string, postId: string): Promise<void> {
  console.log(`[contentWorker] publish_post: Processing site ${siteId}, post ${postId}`);

  // Use the existing processCalendarEntry function which handles the full workflow
  const result = await processCalendarEntry(siteId, postId, "publish");

  if (!result.success) {
    // Check if it's a permanent error (e.g., site deleted, invalid config)
    const errorMessage = result.error || "Unknown error";
    if (errorMessage.includes("not found") || errorMessage.includes("missing") || errorMessage.includes("invalid")) {
      // Permanent error - don't retry
      console.log(`[contentWorker] publish_post: Permanent error for post ${postId}: ${errorMessage}`);
      throw new Error(`PERMANENT_ERROR: ${errorMessage}`);
    }
    // Temporary error - throw to trigger retry
    throw new Error(`Failed to publish post: ${errorMessage}`);
  }

  console.log(`[contentWorker] publish_post: ✅ Published post ${postId} to WordPress. Post ID: ${result.postId}, URL: ${result.postUrl}`);
}

/**
 * Verify request is from Cloud Tasks or Admin
 * @param {functions.Request} req - HTTP request
 * @return {boolean} True if request is authorized
 */
function verifyRequest(req: functions.Request): boolean {
  // Check for Cloud Tasks header
  const cloudTasksHeader = req.get("X-CloudTasks-QueueName");
  if (cloudTasksHeader) {
    return true;
  }

  // Check for OIDC token (Cloud Tasks uses this)
  const authorization = req.get("Authorization");
  if (authorization && authorization.startsWith("Bearer ")) {
    return true;
  }

  // For local development/testing, allow if no auth header (you may want to remove this)
  // In production, you should require proper authentication
  return false;
}

/**
 * HTTP Cloud Function: Content Worker
 * Processes tasks from Cloud Tasks queue
 * Handles: plan_topics, draft_content, publish_post
 */
export const contentWorker = region.runWith({
  timeoutSeconds: 540, // 9 minutes (allows time for AI generation)
  memory: "1GB",
}).https.onRequest(async (req, res) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  // Verify request is from Cloud Tasks or Admin
  if (!verifyRequest(req)) {
    console.error("[contentWorker] Unauthorized request");
    res.status(403).json({error: "Unauthorized"});
    return;
  }

  try {
    // Parse task payload
    const payload = req.body;
    if (!payload || !payload.type || !payload.siteId) {
      res.status(400).json({error: "Invalid payload: missing type or siteId"});
      return;
    }

    const {type, siteId, postId} = payload;
    console.log(`[contentWorker] Received task: type=${type}, siteId=${siteId}, postId=${postId || "N/A"}`);

    // Route to appropriate handler
    switch (type) {
    case "plan_topics":
      await handlePlanTopics(siteId);
      break;

    case "draft_content":
      if (!postId) {
        res.status(400).json({error: "postId is required for draft_content task"});
        return;
      }
      await handleDraftContent(siteId, postId);
      break;

    case "publish_post":
      if (!postId) {
        res.status(400).json({error: "postId is required for publish_post task"});
        return;
      }
      await handlePublishPost(siteId, postId);
      break;

    default:
      res.status(400).json({error: `Unknown task type: ${type}`});
      return;
    }

    // Success - return 200
    res.status(200).json({
      success: true,
      type: type,
      siteId: siteId,
      postId: postId || null,
    });
  } catch (error: any) {
    console.error("[contentWorker] Error processing task:", error);

    // Check if it's a permanent error (should not retry)
    if (error.message && error.message.includes("PERMANENT_ERROR")) {
      // Return 200 to acknowledge and remove from queue
      console.log("[contentWorker] Permanent error detected, acknowledging task");
      res.status(200).json({
        success: false,
        error: error.message,
        permanent: true,
      });
      return;
    }

    // Temporary error - return 500 to trigger retry
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
});
