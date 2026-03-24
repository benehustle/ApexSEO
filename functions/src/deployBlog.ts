import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import {execSync} from "child_process";
import {SecretManagerServiceClient} from "@google-cloud/secret-manager";

// Configuration
const CLOUDFLARE_PROJECT_NAME = "apex-seo-marketing";
const SITE_ID = "CrwYROIIGRhyGotnV4dh"; // Hardcoded Site ID for Apex SEO
const PROJECT_ID = process.env.GCLOUD_PROJECT || "apex-seo-ffbd0";
const LOCATION = "australia-southeast1";
const FUNCTIONS_BASE_URL = process.env.FIREBASE_FUNCTIONS_URL ||
  `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net`;

// Escape for HTML attribute content (quotes and ampersands)
function escapeHtmlAttr(s: string): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Generate analytics tracking script for injection into blog HTML (matches frontend tracking.service contract).
 * @param {string} blogId - Calendar/post document ID used as blogId in analytics.
 * @param {string} siteId - Site document ID.
 * @return {string} Inline script HTML for the blog page.
 */
function getTrackingScript(blogId: string, siteId: string): string {
  const trackingEndpoint = `${FUNCTIONS_BASE_URL}/trackPageView`;
  return `
<!-- Blog Analytics Tracker -->
<script>
(function() {
  const blogId = '${blogId.replace(/'/g, "\\'")}';
  const siteId = '${siteId.replace(/'/g, "\\'")}';
  const trackingEndpoint = '${trackingEndpoint}';
  function trackView() {
    const data = {
      blogId: blogId,
      siteId: siteId,
      timestamp: new Date().toISOString(),
      referrer: document.referrer || 'Direct',
      userAgent: navigator.userAgent,
      screenResolution: window.screen.width + 'x' + window.screen.height,
      language: navigator.language,
      url: window.location.href
    };
    fetch(trackingEndpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
      keepalive: true
    }).catch(function(e) { console.warn('Tracking failed', e); });
  }
  var startTime = Date.now();
  window.addEventListener('beforeunload', function() {
    var timeOnPage = Math.round((Date.now() - startTime) / 1000);
    navigator.sendBeacon(trackingEndpoint.replace('/trackPageView', '/trackTimeOnPage'), JSON.stringify({
      blogId: blogId,
      siteId: siteId,
      timeOnPage: timeOnPage
    }));
  });
  var maxScroll = 0;
  window.addEventListener('scroll', function() {
    var scrollPercent = Math.round((window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
    if (scrollPercent > maxScroll) maxScroll = scrollPercent;
  });
  window.addEventListener('beforeunload', function() {
    navigator.sendBeacon(trackingEndpoint.replace('/trackPageView', '/trackScrollDepth'), JSON.stringify({
      blogId: blogId,
      siteId: siteId,
      maxScroll: maxScroll
    }));
  });
  if (document.readyState === 'complete') { trackView(); } else { window.addEventListener('load', trackView); }
})();
</script>`;
}

// Secret Manager client
const secretClient = new SecretManagerServiceClient();

// Cache for Cloudflare secrets
let cachedCloudflareAccountId: string | null = null;
let cachedCloudflareApiToken: string | null = null;

// Paths (relative to the functions directory after deployment)
// When deployed, the "website" folder will be in the root of the function container
const WEBSITE_DIR = path.join(__dirname, "../website");
const BLOG_DIR = path.join(WEBSITE_DIR, "blog");
const TEMPLATE_PATH = path.join(BLOG_DIR, "template.html");

/**
 * Trigger: Runs whenever a post is updated or created.
 * Checks if the post is "approved" or "published" and belongs to the marketing site.
 */
export const onPostUpdated = functions.firestore
  .document("posts/{postId}")
  .onWrite(async (change, _context) => {
    const newData = change.after.exists ? change.after.data() : null;
    const oldData = change.before.exists ? change.before.data() : null;

    // 1. Check if we need to run
    if (!newData) {
      // Document deleted - we might want to rebuild to remove the post
      console.log("🗑️ Post deleted, rebuilding blog...");
    } else {
      // Check status change or content change
      const isApproved = ["approved", "published"].includes(newData.status);
      const wasApproved = oldData ? ["approved", "published"].includes(oldData.status) : false;

      if (!isApproved && !wasApproved) {
        console.log("Post not approved, skipping rebuild.");
        return null;
      }
    }

    // Check if the changed post belongs to this site
    if (newData && newData.siteId !== SITE_ID) {
      console.log(`Post belongs to site ${newData.siteId}, not our marketing site ${SITE_ID}. Skipping.`);
      return null;
    }

    console.log(`🚀 Starting Blog Rebuild for Site ID: ${SITE_ID}`);
    // We use admin.firestore() directly
    await buildAndDeploy(admin.firestore(), SITE_ID);
    return null;
  });

/**
 * Get Cloudflare Account ID from Secret Manager
 * @return {Promise<string>} Cloudflare Account ID
 */
async function getCloudflareAccountId(): Promise<string> {
  if (cachedCloudflareAccountId) {
    return cachedCloudflareAccountId;
  }

  const secretPath = `projects/${PROJECT_ID}/secrets/CLOUDFLARE-ACCOUNT-ID/versions/latest`;

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: secretPath,
    });

    const accountId = version.payload?.data?.toString();
    if (accountId && accountId.length > 0) {
      cachedCloudflareAccountId = accountId;
      return accountId;
    }
  } catch (error: any) {
    console.error("Failed to fetch CLOUDFLARE-ACCOUNT-ID from Secret Manager:", error.message);
  }

  // Fallback to environment variable
  if (process.env.CLOUDFLARE_ACCOUNT_ID) {
    cachedCloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    return cachedCloudflareAccountId;
  }

  throw new Error("CLOUDFLARE-ACCOUNT-ID not found in Secret Manager or environment variables");
}

/**
 * Get Cloudflare API Token from Secret Manager
 * @return {Promise<string>} Cloudflare API Token
 */
async function getCloudflareApiToken(): Promise<string> {
  if (cachedCloudflareApiToken) {
    return cachedCloudflareApiToken;
  }

  const secretPath = `projects/${PROJECT_ID}/secrets/CLOUDFLARE-API-TOKEN/versions/latest`;

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: secretPath,
    });

    const apiToken = version.payload?.data?.toString();
    if (apiToken && apiToken.length > 0) {
      cachedCloudflareApiToken = apiToken;
      return apiToken;
    }
  } catch (error: any) {
    console.error("Failed to fetch CLOUDFLARE-API-TOKEN from Secret Manager:", error.message);
  }

  // Fallback to environment variable
  if (process.env.CLOUDFLARE_API_TOKEN) {
    cachedCloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;
    return cachedCloudflareApiToken;
  }

  throw new Error("CLOUDFLARE-API-TOKEN not found in Secret Manager or environment variables");
}

/**
 * Core Logic: Fetch posts, generate HTML, deploy to Cloudflare
 * @param {admin.firestore.Firestore} db Firestore instance
 * @param {string} siteId The Site ID to fetch posts for
 */
export async function buildAndDeploy(db: admin.firestore.Firestore, siteId: string) {
  let accountId: string;
  let apiToken: string;

  try {
    accountId = await getCloudflareAccountId();
    apiToken = await getCloudflareApiToken();
  } catch (error: any) {
    console.error("❌ Failed to get Cloudflare credentials:", error.message);
    return;
  }

  // 1. Fetch Posts from contentCalendar subcollection
  console.log(`[buildAndDeploy] Fetching posts for siteId: ${siteId}`);
  const calendarSnapshot = await db.collection("sites")
    .doc(siteId)
    .collection("contentCalendar")
    .where("status", "in", ["approved", "published"])
    .orderBy("createdAt", "desc")
    .get();

  console.log(`[buildAndDeploy] Found ${calendarSnapshot.size} calendar entries with status approved/published`);

  const posts: any[] = [];
  calendarSnapshot.forEach((doc) => {
    const data = doc.data();
    // Map calendar entry to post format
    const post = {
      id: doc.id,
      title: data.blogTitle || data.blogTopic,
      content: data.generatedContent || "",
      slug: data.slug || (data.blogTopic ? data.blogTopic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") : ""),
      featuredImage: data.featuredImageUrl,
      createdAt: data.createdAt || data.generatedAt || admin.firestore.Timestamp.now(),
      keyword: data.keyword || "",
      blogDescription: data.blogDescription || data.blogTopic || "",
    };
    console.log(`[buildAndDeploy] Post: ${post.title} (slug: ${post.slug}, hasContent: ${!!post.content})`);
    posts.push(post);
  });
  console.log(`[buildAndDeploy] Total posts to deploy: ${posts.length}`);

  // Ensure a blogs doc exists for each post (for analytics dashboard)
  for (const post of posts) {
    try {
      await db.collection("blogs").doc(post.id).set({
        siteId,
        title: post.title,
        totalViews: 0,
      }, {merge: true});
    } catch (e: any) {
      console.warn(`[buildAndDeploy] Failed to ensure blogs doc for ${post.id}:`, e.message);
    }
  }

  // 2. Generate Files in Memory
  // We will collect all files to upload: existing website files + new blog files
  const filesToUpload: { path: string; content: string | Buffer }[] = [];

  // A. Read Template
  let template = "";
  try {
    template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  } catch (e) {
    console.error("Error reading template:", e);
    // Fallback or exit
    return;
  }

  // B. Generate Blog Post Files
  const generatedPosts: any[] = [];
  posts.forEach((post) => {
    const slug = post.slug || post.keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const date = post.createdAt ? new Date(post.createdAt.toDate()).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    }) : new Date().toLocaleDateString();

    const wordCount = post.content ? post.content.split(/\s+/).length : 0;
    const readTime = Math.ceil(wordCount / 200);

    const metaDescription = post.blogDescription || post.title || "";
    const metaKeywords = post.keyword || "";
    const ogImage = (post.featuredImage && post.featuredImage.startsWith("http")) ? post.featuredImage : "";
    const trackingScript = getTrackingScript(post.id, siteId);

    let html = template
      .replace(/{{TITLE}}/g, post.title)
      .replace(/{{CONTENT}}/g, post.content)
      .replace(/{{FEATURED_IMAGE}}/g, post.featuredImage || "../assets/apex-logo.png")
      .replace(/{{DATE}}/g, date)
      .replace(/{{READ_TIME}}/g, readTime.toString())
      .replace(/{{META_DESCRIPTION}}/g, escapeHtmlAttr(metaDescription))
      .replace(/{{META_KEYWORDS}}/g, escapeHtmlAttr(metaKeywords))
      .replace(/{{OG_IMAGE}}/g, escapeHtmlAttr(ogImage))
      .replace(/{{TRACKING_SCRIPT}}/g, trackingScript);
    // Legacy placeholder if present
    if (html.includes("{{excerpt}}")) {
      html = html.replace(/{{excerpt}}/g, escapeHtmlAttr(metaDescription));
    }

    filesToUpload.push({
      path: `blog/${slug}.html`,
      content: html,
    });

    generatedPosts.push({title: post.title, slug, date, image: post.featuredImage});
  });

  // C. Generate Blog Index
  try {
    const indexTemplatePath = path.join(BLOG_DIR, "index.html");
    let indexHtml = fs.readFileSync(indexTemplatePath, "utf8");

    const gridHtml = generatedPosts.length > 0 ?
      generatedPosts.map((post) => `
            <a href="${post.slug}.html" class="group block bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 hover:-translate-y-1">
                <div class="aspect-video overflow-hidden bg-slate-100 relative">
                    <img src="${post.image || "../assets/apex-logo.png"}" alt="${post.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
                <div class="p-6">
                    <div class="text-xs text-primary-600 font-semibold mb-2 uppercase tracking-wider">${post.date}</div>
                    <h3 class="text-xl font-bold text-slate-900 group-hover:text-primary-600 transition-colors mb-2 line-clamp-2">${post.title}</h3>
                    <div class="flex items-center text-primary-600 font-medium text-sm mt-4">
                        Read Article 
                        <svg class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                    </div>
                </div>
            </a>
        `).join("\n") :
      `
            <div class="col-span-3 text-center py-20 bg-white rounded-2xl border border-slate-200">
                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-2">No posts yet</h3>
                <p class="text-slate-500">Approve content and click &quot;Post Now&quot; for site CrwYROIIGRhyGotnV4dh to publish here.</p>
            </div>`;

    const gridRegex = /(<div id="blog-grid"[^>]*>)([\s\S]*?)(<\/div>)/;
    if (gridRegex.test(indexHtml)) {
      indexHtml = indexHtml.replace(gridRegex, `$1${gridHtml}$3`);
    }

    filesToUpload.push({
      path: "blog/index.html",
      content: indexHtml,
    });
  } catch (e) {
    console.error("Error generating index:", e);
  }

  // D. Add all other static files (css, js, images, other html pages)
  // We need to recursively read the WEBSITE_DIR
  const addDirectory = (dir: string, base: string) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      const relativePath = path.join(base, file);

      // Skip blog/index.html and template.html as we handled them
      if (relativePath === "blog/index.html" || relativePath === "blog/template.html") continue;

      if (stat.isDirectory()) {
        addDirectory(fullPath, relativePath);
      } else {
        filesToUpload.push({
          path: relativePath,
          content: fs.readFileSync(fullPath),
        });
      }
    }
  };

  addDirectory(WEBSITE_DIR, "");

  // 3. Deploy using Wrangler CLI (the official, proven method)
  console.log(`☁️ Deploying ${filesToUpload.length} files to Cloudflare using Wrangler...`);

  try {
    // Write all files to the website directory
    console.log("[buildAndDeploy] Writing files to disk...");
    for (const file of filesToUpload) {
      const filePath = path.join(WEBSITE_DIR, file.path);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true});
      }
      fs.writeFileSync(filePath, file.content);
    }
    console.log("[buildAndDeploy] ✅ All files written to disk");

    // Use Wrangler CLI to deploy
    console.log("[buildAndDeploy] Running Wrangler pages deploy...");
    const wranglerPath = path.join(__dirname, "../node_modules/.bin/wrangler");
    const command = `CLOUDFLARE_ACCOUNT_ID="${accountId}" CLOUDFLARE_API_TOKEN="${apiToken}" "${wranglerPath}" pages deploy "${WEBSITE_DIR}" --project-name="${CLOUDFLARE_PROJECT_NAME}" --compatibility-date=2024-01-01`;

    try {
      const output = execSync(command, {
        cwd: path.join(__dirname, ".."),
        encoding: "utf8",
        stdio: "pipe",
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      console.log("[buildAndDeploy] Wrangler output:", output);
      console.log("🎉 Deployment Successful!");
    } catch (wranglerError: any) {
      console.error("[buildAndDeploy] ❌ Wrangler deployment failed:");
      console.error("Error:", wranglerError.message);
      console.error("Stdout:", wranglerError.stdout);
      console.error("Stderr:", wranglerError.stderr);
      throw new Error(`Wrangler deployment failed: ${wranglerError.message}`);
    }
  } catch (error: any) {
    console.error("❌ Deployment Failed - Error details:");
    console.error("Message:", error.message);
    console.error("Full error:", error);
    throw error;
  }
}
