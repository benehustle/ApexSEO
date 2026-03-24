import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {CloudTasksClient} from "@google-cloud/tasks";

// Configure region to match Firestore
const region = functions.region("australia-southeast1");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "apex-seo-ffbd0";
const LOCATION = "australia-southeast1";
const QUEUE_NAME = "apex-content-worker";

// Initialize Cloud Tasks client
const tasksClient = new CloudTasksClient();

/**
 * Get the worker function URL
 * This should point to your HTTP Cloud Function that processes tasks
 * @return {string} Worker function URL
 */
function getWorkerFunctionUrl(): string {
  return `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/contentWorker`;
}

/**
 * Enqueue a task to Cloud Tasks
 * Exported for use by ensure12UnpublishedPostsCallable (queue blog creation when auto-approve is on).
 * @param {Object} payload - Task payload (type, siteId, postId, etc.)
 * @return {Promise<string>} Task name/ID
 */
export async function enqueueTask(payload: {
  type: string;
  siteId: string;
  postId?: string;
}): Promise<string> {
  const queuePath = tasksClient.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);
  const workerUrl = getWorkerFunctionUrl();

  // Create task with OIDC token authentication
  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: workerUrl,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      oidcToken: {
        serviceAccountEmail: `${PROJECT_ID}@appspot.gserviceaccount.com`,
      },
    },
  };

  try {
    const [response] = await tasksClient.createTask({
      parent: queuePath,
      task: task,
    });

    const taskName = response.name || "";
    console.log(`[enqueueTask] ✅ Created task: ${taskName} for ${payload.type}`);
    return taskName;
  } catch (error: any) {
    console.error("[enqueueTask] ❌ Failed to create task:", error);
    throw new Error(`Failed to enqueue task: ${error.message}`);
  }
}

/**
 * Pass 1: Planning - Find sites with < 12 posts and enqueue planning tasks
 */
async function pass1Planning(): Promise<number> {
  console.log("[schedulerDispatcher] Pass 1: Planning - Scanning for sites with < 12 posts");

  let tasksEnqueued = 0;

  try {
    // Query all active sites
    const sitesSnapshot = await admin.firestore()
      .collection("sites")
      .where("status", "==", "active")
      .get();

    console.log(`[schedulerDispatcher] Found ${sitesSnapshot.size} active sites`);

    for (const siteDoc of sitesSnapshot.docs) {
      const siteId = siteDoc.id;
      const siteData = siteDoc.data();

      // Check if site has subscription (skip if not subscribed)
      if (!siteData.subscriptionStatus || siteData.subscriptionStatus !== "active") {
        continue;
      }

      // Count unpublished posts in contentCalendar
      const calendarRef = admin.firestore()
        .collection("sites")
        .doc(siteId)
        .collection("contentCalendar");

      const allPostsSnapshot = await calendarRef.get();
      const unpublishedCount = allPostsSnapshot.docs.filter((doc) => {
        const data = doc.data();
        return data.status !== "published";
      }).length;

      // If less than 12 unpublished posts, enqueue planning task
      if (unpublishedCount < 12) {
        try {
          await enqueueTask({
            type: "plan_topics",
            siteId: siteId,
          });
          tasksEnqueued++;
          console.log(`[schedulerDispatcher] ✅ Enqueued planning task for site ${siteId} (${unpublishedCount}/12 posts)`);
        } catch (error: any) {
          console.error(`[schedulerDispatcher] ❌ Failed to enqueue planning task for site ${siteId}:`, error);
        }
      }
    }

    console.log(`[schedulerDispatcher] Pass 1 Complete: Enqueued ${tasksEnqueued} planning tasks`);
    return tasksEnqueued;
  } catch (error: any) {
    console.error("[schedulerDispatcher] Pass 1 Error:", error);
    throw error;
  }
}

/**
 * Pass 2: Drafting - Enforce 3 Post Content Buffer
 * Ensures the next 3 chronological posts are fully generated (status 'pending_approval' or 'approved')
 * regardless of scheduled date
 */
async function pass2Drafting(): Promise<number> {
  console.log("[schedulerDispatcher] Pass 2: Drafting - Enforcing 3 Post Content Buffer");

  let tasksEnqueued = 0;

  try {
    const now = admin.firestore.Timestamp.now();

    // Step 1: Get all active sites
    const sitesSnapshot = await admin.firestore()
      .collection("sites")
      .where("status", "==", "active")
      .get();

    console.log(`[schedulerDispatcher] Found ${sitesSnapshot.size} active sites to check`);

    // Process each site
    for (const siteDoc of sitesSnapshot.docs) {
      const siteId = siteDoc.id;
      const siteData = siteDoc.data();

      // Check if site has subscription (skip if not subscribed)
      if (!siteData.subscriptionStatus || siteData.subscriptionStatus !== "active") {
        continue;
      }

      try {
        const calendarRef = admin.firestore()
          .collection("sites")
          .doc(siteId)
          .collection("contentCalendar");

        // Step 2: Count Ready Posts (status 'pending_approval' or 'approved' with scheduledDate > now)
        const readyPostsQuery = calendarRef
          .where("scheduledDate", ">", now)
          .orderBy("scheduledDate", "asc");

        const readyPostsSnapshot = await readyPostsQuery.get();

        const readyPosts = readyPostsSnapshot.docs.filter((doc) => {
          const data = doc.data();
          // Ready posts are those with content generated: 'pending', 'pending_approval', or 'approved'
          return data.status === "pending" || data.status === "pending_approval" || data.status === "approved";
        });

        const currentReadyCount = readyPosts.length;
        console.log(`[schedulerDispatcher] Site ${siteId}: ${currentReadyCount} ready posts (pending_approval/approved)`);

        // Step 3: Calculate Deficit
        const needed = Math.max(0, 3 - currentReadyCount);

        if (needed === 0) {
          console.log(`[schedulerDispatcher] Site ${siteId}: Already has 3+ ready posts, no action needed`);
          continue;
        }

        console.log(`[schedulerDispatcher] Site ${siteId}: Needs ${needed} more posts to maintain 3-post buffer`);

        // Step 4: Find Candidates - next 'planned' posts ordered by date ASC
        const plannedPostsQuery = calendarRef
          .where("status", "==", "planned")
          .orderBy("scheduledDate", "asc")
          .limit(needed);

        const plannedPostsSnapshot = await plannedPostsQuery.get();

        if (plannedPostsSnapshot.empty) {
          console.log(`[schedulerDispatcher] Site ${siteId}: No planned posts available to draft`);
          continue;
        }

        // Step 5: Enqueue drafting tasks for these posts
        for (const doc of plannedPostsSnapshot.docs) {
          const calendarId = doc.id;
          const postData = doc.data();
          const scheduledDate = postData.scheduledDate;

          try {
            await enqueueTask({
              type: "draft_content",
              siteId: siteId,
              postId: calendarId,
            });
            tasksEnqueued++;
            console.log(`[schedulerDispatcher] ✅ Enqueued drafting task for post ${calendarId} (site: ${siteId}, scheduled: ${scheduledDate?.toDate().toISOString() || "N/A"})`);
          } catch (error: any) {
            console.error(`[schedulerDispatcher] ❌ Failed to enqueue drafting task for post ${calendarId}:`, error);
          }
        }
      } catch (error: any) {
        console.error(`[schedulerDispatcher] ❌ Error processing site ${siteId}:`, error);
        // Continue with next site
      }
    }

    console.log(`[schedulerDispatcher] Pass 2 Complete: Enqueued ${tasksEnqueued} drafting tasks`);
    return tasksEnqueued;
  } catch (error: any) {
    console.error("[schedulerDispatcher] Pass 2 Error:", error);
    throw error;
  }
}

/**
 * Pass 3: Publishing - Find posts with status 'approved' and date <= now, enqueue publishing tasks
 */
async function pass3Publishing(): Promise<number> {
  console.log("[schedulerDispatcher] Pass 3: Publishing - Scanning for posts to publish (status='approved', date <= now)");

  let tasksEnqueued = 0;

  try {
    const now = admin.firestore.Timestamp.now();

    // Query all posts with status 'approved' and scheduledDate <= now
    const query = admin.firestore()
      .collectionGroup("contentCalendar")
      .where("status", "==", "approved")
      .where("scheduledDate", "<=", now);

    const snapshot = await query.get();
    console.log(`[schedulerDispatcher] Found ${snapshot.size} posts to publish`);

    for (const doc of snapshot.docs) {
      const calendarId = doc.id;

      // Extract siteId from document path
      const pathParts = doc.ref.path.split("/");
      const siteIdIndex = pathParts.indexOf("sites");
      if (siteIdIndex === -1 || siteIdIndex + 1 >= pathParts.length) {
        console.error(`[schedulerDispatcher] Could not extract siteId from path: ${doc.ref.path}`);
        continue;
      }
      const siteId = pathParts[siteIdIndex + 1];

      try {
        await enqueueTask({
          type: "publish_post",
          siteId: siteId,
          postId: calendarId,
        });
        tasksEnqueued++;
        console.log(`[schedulerDispatcher] ✅ Enqueued publishing task for post ${calendarId} (site: ${siteId})`);
      } catch (error: any) {
        console.error(`[schedulerDispatcher] ❌ Failed to enqueue publishing task for post ${calendarId}:`, error);
      }
    }

    console.log(`[schedulerDispatcher] Pass 3 Complete: Enqueued ${tasksEnqueued} publishing tasks`);
    return tasksEnqueued;
  } catch (error: any) {
    console.error("[schedulerDispatcher] Pass 3 Error:", error);
    throw error;
  }
}

/**
 * Main dispatcher function that runs all 3 passes
 */
async function runDispatcher(): Promise<{
  planningTasks: number;
  draftingTasks: number;
  publishingTasks: number;
  totalTasks: number;
}> {
  console.log("[schedulerDispatcher] ========================================");
  console.log("[schedulerDispatcher] Starting dispatcher scan...");
  console.log(`[schedulerDispatcher] Queue: ${QUEUE_NAME}`);
  console.log(`[schedulerDispatcher] Worker URL: ${getWorkerFunctionUrl()}`);

  const results = {
    planningTasks: 0,
    draftingTasks: 0,
    publishingTasks: 0,
    totalTasks: 0,
  };

  try {
    // Run all 3 passes sequentially
    results.planningTasks = await pass1Planning();
    results.draftingTasks = await pass2Drafting();
    results.publishingTasks = await pass3Publishing();

    results.totalTasks = results.planningTasks + results.draftingTasks + results.publishingTasks;

    console.log("[schedulerDispatcher] ========================================");
    console.log("[schedulerDispatcher] ✅ Dispatcher complete:");
    console.log(`[schedulerDispatcher]   Planning tasks: ${results.planningTasks}`);
    console.log(`[schedulerDispatcher]   Drafting tasks: ${results.draftingTasks}`);
    console.log(`[schedulerDispatcher]   Publishing tasks: ${results.publishingTasks}`);
    console.log(`[schedulerDispatcher]   Total tasks enqueued: ${results.totalTasks}`);
    console.log("[schedulerDispatcher] ========================================");

    return results;
  } catch (error: any) {
    console.error("[schedulerDispatcher] ❌ Fatal error in dispatcher:", error);
    throw error;
  }
}

/**
 * Scheduled Cloud Function: Scheduler Dispatcher
 * Runs every hour to scan for work and enqueue tasks to Cloud Tasks
 * Decouples "finding work" from "doing work" for better scalability
 */
export const schedulerDispatcher = region.runWith({
  timeoutSeconds: 540, // 9 minutes (allows time for scanning many sites)
  memory: "1GB",
}).pubsub
  .schedule("0 * * * *") // Every hour at minute 0
  .timeZone("UTC")
  .onRun(async (_context) => {
    try {
      return await runDispatcher();
    } catch (error: any) {
      console.error("[schedulerDispatcher] ❌ Fatal error:", error);
      console.error("[schedulerDispatcher] Error stack:", error.stack);
      throw error;
    }
  });
