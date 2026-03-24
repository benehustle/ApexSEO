/**
 * Notification Triggers
 * Sends transactional emails for high-value events
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {sendEmail} from "./mailer";
import {getMonthlyReportHtml} from "./mailer/monthly-report";

const region = functions.region("australia-southeast1");

/**
 * Firestore Trigger: Campaign Ready Email
 * Sends email when a site's campaign is completed
 *
 * Trigger: onUpdate of sites/{siteId}
 * Condition: before.campaignStatus !== 'completed' && after.campaignStatus === 'completed'
 */
export const sendCampaignReadyEmail = region.firestore
  .document("sites/{siteId}")
  .onUpdate(async (change, context) => {
    try {
      const siteId = context.params.siteId;
      const beforeData = change.before.data();
      const afterData = change.after.data();

      console.log(`[sendCampaignReadyEmail] Processing site ${siteId}`);

      // Check if campaign status changed to 'completed'
      const beforeStatus = beforeData?.campaignStatus;
      const afterStatus = afterData?.campaignStatus;

      // Also check hasCampaign as fallback (if campaignStatus doesn't exist)
      const beforeHasCampaign = beforeData?.hasCampaign || false;
      const afterHasCampaign = afterData?.hasCampaign || false;

      // Trigger if:
      // 1. campaignStatus changed from non-'completed' to 'completed', OR
      // 2. hasCampaign changed from false to true (fallback for sites without campaignStatus)
      const campaignJustCompleted =
        (beforeStatus !== "completed" && afterStatus === "completed") ||
        (!beforeHasCampaign && afterHasCampaign && afterStatus !== "completed");

      if (!campaignJustCompleted) {
        console.log(`[sendCampaignReadyEmail] Campaign not completed for site ${siteId}, skipping`);
        return;
      }

      console.log(`[sendCampaignReadyEmail] ✅ Campaign completed for site ${siteId}, sending email`);

      // Get agency ID from site
      const agencyId = afterData?.agencyId;
      if (!agencyId) {
        console.warn(`[sendCampaignReadyEmail] ⚠️ Site ${siteId} has no agencyId, skipping email`);
        return;
      }

      // Fetch agency document to get owner
      const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
      const agencyDoc = await agencyRef.get();

      if (!agencyDoc.exists) {
        console.warn(`[sendCampaignReadyEmail] ⚠️ Agency ${agencyId} not found, skipping email`);
        return;
      }

      const agencyData = agencyDoc.data();
      const ownerId = agencyData?.ownerId;

      if (!ownerId) {
        console.warn(`[sendCampaignReadyEmail] ⚠️ Agency ${agencyId} has no ownerId, skipping email`);
        return;
      }

      // Fetch user document to get email
      const userRef = admin.firestore().collection("users").doc(ownerId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        console.warn(`[sendCampaignReadyEmail] ⚠️ User ${ownerId} not found, skipping email`);
        return;
      }

      const userData = userDoc.data();
      const userEmail = userData?.email;

      if (!userEmail) {
        console.warn(`[sendCampaignReadyEmail] ⚠️ User ${ownerId} has no email, skipping email`);
        return;
      }

      // Get app URL from environment or use default
      const appUrl = process.env.APP_URL || functions.config().app?.url || "https://apex-seo.app";

      // Send campaign ready email
      await sendEmail({
        to: userEmail,
        subject: "🚀 Your Strategy is Ready",
        body: `
          Great news! Apex has finished analyzing your niche. We have scheduled your first 12 topics based on high-volume keywords.<br><br>
          Your content calendar is now ready. Click below to review your strategy and see what we've planned for you.
        `,
        ctaLink: `${appUrl}/sites/${siteId}`,
        ctaText: "Review Strategy",
      });

      console.log(`[sendCampaignReadyEmail] ✅ Campaign ready email sent to ${userEmail} for site ${siteId}`);
    } catch (error: any) {
      // Log error but don't crash - email failures shouldn't break site updates
      console.error("[sendCampaignReadyEmail] ❌ Error sending campaign ready email:", error);
    }
  });

/**
 * Scheduled Function: Weekly Performance Email
 * Sends weekly performance reports every Monday at 9:00 AM
 *
 * Schedule: 0 9 * * 1 (Monday at 9 AM UTC)
 */
export const sendWeeklyPerformanceEmail = region.pubsub
  .schedule("0 9 * * 1") // Every Monday at 9:00 AM UTC
  .timeZone("UTC")
  .onRun(async (_context) => {
    try {
      console.log("[sendWeeklyPerformanceEmail] Starting weekly performance email job");

      // Calculate date range (last 7 days)
      const now = admin.firestore.Timestamp.now();
      const sevenDaysAgo = admin.firestore.Timestamp.fromMillis(
        now.toMillis() - 7 * 24 * 60 * 60 * 1000
      );

      // Query all active agencies
      const agenciesRef = admin.firestore().collection("agencies");
      const activeAgenciesQuery = agenciesRef.where("subscriptionStatus", "in", [
        "active",
        "trial",
        "agency_comp",
      ]);
      const agenciesSnapshot = await activeAgenciesQuery.get();

      if (agenciesSnapshot.empty) {
        console.log("[sendWeeklyPerformanceEmail] No active agencies found");
        return;
      }

      console.log(`[sendWeeklyPerformanceEmail] Found ${agenciesSnapshot.size} active agencies`);

      let emailsSent = 0;
      let emailsSkipped = 0;

      // Process each agency
      for (const agencyDoc of agenciesSnapshot.docs) {
        const agencyId = agencyDoc.id;
        const agencyData = agencyDoc.data();

        try {
          // Get owner ID
          const ownerId = agencyData?.ownerId;
          if (!ownerId) {
            console.warn(`[sendWeeklyPerformanceEmail] ⚠️ Agency ${agencyId} has no ownerId, skipping`);
            emailsSkipped++;
            continue;
          }

          // Fetch user document to get email
          const userRef = admin.firestore().collection("users").doc(ownerId);
          const userDoc = await userRef.get();

          if (!userDoc.exists) {
            console.warn(`[sendWeeklyPerformanceEmail] ⚠️ User ${ownerId} not found, skipping`);
            emailsSkipped++;
            continue;
          }

          const userData = userDoc.data();
          const userEmail = userData?.email;

          if (!userEmail) {
            console.warn(`[sendWeeklyPerformanceEmail] ⚠️ User ${ownerId} has no email, skipping`);
            emailsSkipped++;
            continue;
          }

          // Get all sites for this agency
          const sitesQuery = admin
            .firestore()
            .collection("sites")
            .where("agencyId", "==", agencyId);
          const sitesSnapshot = await sitesQuery.get();

          if (sitesSnapshot.empty) {
            console.log(`[sendWeeklyPerformanceEmail] Agency ${agencyId} has no sites, skipping`);
            emailsSkipped++;
            continue;
          }

          // Aggregate stats across all sites
          let totalPosts = 0;
          let totalViews = 0;

          for (const siteDoc of sitesSnapshot.docs) {
            const siteId = siteDoc.id;

            // Count posts created in the last 7 days from contentCalendar
            const calendarRef = admin
              .firestore()
              .collection("sites")
              .doc(siteId)
              .collection("contentCalendar");

            const calendarSnapshot = await calendarRef
              .where("createdAt", ">=", sevenDaysAgo)
              .get();

            totalPosts += calendarSnapshot.size;

            // Count views from posts in the last 7 days
            // Check both posts collection and blogs collection
            const postsRef = admin
              .firestore()
              .collection("sites")
              .doc(siteId)
              .collection("posts");

            const postsSnapshot = await postsRef
              .where("lastViewedAt", ">=", sevenDaysAgo)
              .get();

            // Sum views from posts
            postsSnapshot.docs.forEach((postDoc) => {
              const postData = postDoc.data();
              // For posts viewed in last 7 days, we count incremental views
              // Since we're querying by lastViewedAt, we'll estimate based on view count
              // For accuracy, we could query pageViews collection, but this is simpler
              const views = postData?.views || 0;
              // Only count if post was created in last 7 days or viewed recently
              if (postData?.lastViewedAt) {
                totalViews += Math.min(views, 100); // Cap per post to avoid overcounting
              }
            });

            // Also check blogs collection for views
            const blogsRef = admin.firestore().collection("blogs");
            const blogsQuery = blogsRef
              .where("siteId", "==", siteId)
              .where("lastViewedAt", ">=", sevenDaysAgo);

            const blogsSnapshot = await blogsQuery.get();
            blogsSnapshot.docs.forEach((blogDoc) => {
              const blogData = blogDoc.data();
              const views = blogData?.totalViews || 0;
              // Estimate views gained in last 7 days (simplified)
              if (blogData?.lastViewedAt) {
                totalViews += Math.min(views, 100); // Cap per blog
              }
            });
          }

          // Skip if no activity (0 posts and 0 views)
          if (totalPosts === 0 && totalViews === 0) {
            console.log(
              `[sendWeeklyPerformanceEmail] Agency ${agencyId} has no activity, skipping email`
            );
            emailsSkipped++;
            continue;
          }

          // Get app URL
          const appUrl = process.env.APP_URL || functions.config().app?.url || "https://apex-seo.app";

          // Send weekly performance email
          await sendEmail({
            to: userEmail,
            subject: `Weekly Report: ${totalViews.toLocaleString()} new views`,
            body: `
              Your AI has been busy! Here's what we published for you this week:<br><br>
              <strong>📝 ${totalPosts} new posts</strong> created<br>
              <strong>👁️ ${totalViews.toLocaleString()} new views</strong> gained<br><br>
              Keep up the great work! Your content is performing well.
            `,
            ctaLink: `${appUrl}/dashboard`,
            ctaText: "View Analytics",
          });

          emailsSent++;
          console.log(
            `[sendWeeklyPerformanceEmail] ✅ Weekly report sent to ${userEmail} (${totalPosts} posts, ${totalViews} views)`
          );
        } catch (error: any) {
          // Log error for this agency but continue with others
          console.error(
            `[sendWeeklyPerformanceEmail] ❌ Error processing agency ${agencyId}:`,
            error
          );
          emailsSkipped++;
        }
      }

      console.log(
        `[sendWeeklyPerformanceEmail] ✅ Job complete: ${emailsSent} emails sent, ${emailsSkipped} skipped`
      );
    } catch (error: any) {
      // Log error but don't crash - scheduled functions should be resilient
      console.error("[sendWeeklyPerformanceEmail] ❌ Error in weekly performance email job:", error);
    }
  });

/**
 * Scheduled Function: Monthly Client Reports
 * For each agency whose monthlyReportDayOfMonth matches today (1-28), sends one email per site
 * that has receiveMonthlyReport true and clientReportEmail set. Uses agency logo and reply-to.
 * Schedule: 0 9 * * * (daily at 9:00 AM UTC)
 */
export const sendMonthlyClientReports = region.pubsub
  .schedule("0 9 * * *")
  .timeZone("UTC")
  .onRun(async (_context) => {
    try {
      const now = new Date();
      const dayOfMonth = Math.min(now.getDate(), 28);
      console.log(`[sendMonthlyClientReports] Running for day of month: ${dayOfMonth}`);

      const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
        now.getTime() - 30 * 24 * 60 * 60 * 1000
      );

      const agenciesRef = admin.firestore().collection("agencies");
      const agenciesSnapshot = await agenciesRef
        .where("monthlyReportDayOfMonth", "==", dayOfMonth)
        .get();

      if (agenciesSnapshot.empty) {
        console.log("[sendMonthlyClientReports] No agencies scheduled for today");
        return;
      }

      const appUrl = process.env.APP_URL || functions.config().app?.url || "https://apex-seo.app";
      const monthYear = now.toLocaleString("default", {month: "long", year: "numeric"});

      let emailsSent = 0;

      for (const agencyDoc of agenciesSnapshot.docs) {
        const agencyId = agencyDoc.id;
        const agencyData = agencyDoc.data();
        const agencyName = agencyData?.name || "Agency";
        const logoUrl = agencyData?.logoUrl || null;
        const replyTo = agencyData?.googleSendFromEmail || undefined;

        const sitesSnapshot = await admin
          .firestore()
          .collection("sites")
          .where("agencyId", "==", agencyId)
          .get();

        for (const siteDoc of sitesSnapshot.docs) {
          const siteData = siteDoc.data();
          if (!siteData.receiveMonthlyReport) continue;
          const clientEmail = (siteData.clientReportEmail || "").trim();
          if (!clientEmail) continue;

          const siteId = siteDoc.id;
          const siteName = siteData.name || "Site";

          try {
            const calendarRef = admin
              .firestore()
              .collection("sites")
              .doc(siteId)
              .collection("contentCalendar");

            const calendarSnapshot = await calendarRef
              .where("scheduledDate", ">=", thirtyDaysAgo)
              .get();

            let postsPublished = 0;
            const publishedDates = new Set<string>();

            calendarSnapshot.docs.forEach((d) => {
              const data = d.data();
              if (data.status === "published") {
                postsPublished++;
                const sd = data.scheduledDate?.toDate?.();
                if (sd) publishedDates.add(sd.toISOString().slice(0, 10));
              }
            });

            const blogsRef = admin.firestore().collection("blogs");
            const blogsSnapshot = await blogsRef
              .where("siteId", "==", siteId)
              .get();

            let totalViews = 0;
            const blogRows: {title: string; views: number}[] = [];

            blogsSnapshot.docs.forEach((d) => {
              const data = d.data();
              const views = data.totalViews || 0;
              totalViews += views;
              const title = data.title || data.keyword || "Untitled";
              blogRows.push({title, views});
            });

            blogRows.sort((a, b) => b.views - a.views);
            const top5 = blogRows.slice(0, 5);
            const topPostsHtml = top5
              .map(
                (r) =>
                  `<li><strong>${escapeHtml(r.title)}</strong> — ${r.views.toLocaleString()} views</li>`
              )
              .join("");

            const dashboardUrl = `${appUrl}/sites/${siteId}`;

            const html = getMonthlyReportHtml({
              logoUrl,
              agencyName,
              siteName,
              monthYear,
              postsPublished,
              totalViews,
              topPostsHtml,
              dashboardUrl,
            });

            await sendEmail({
              to: clientEmail,
              subject: `Monthly report: ${siteName} — ${monthYear}`,
              body: `Monthly report for ${siteName}. ${postsPublished} posts published, ${totalViews.toLocaleString()} total views.`,
              html,
              replyTo,
            });

            emailsSent++;
            console.log(
              `[sendMonthlyClientReports] ✅ Sent report for site ${siteId} to ${clientEmail}`
            );
          } catch (err: any) {
            console.error(
              `[sendMonthlyClientReports] ❌ Error sending report for site ${siteId}:`,
              err
            );
          }
        }
      }

      console.log(`[sendMonthlyClientReports] ✅ Done. ${emailsSent} report(s) sent.`);
    } catch (error: any) {
      console.error("[sendMonthlyClientReports] ❌ Error in monthly report job:", error);
    }
  });

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
