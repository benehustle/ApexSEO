---
name: Blog analytics and meta tags
overview: Ensure blog post analytics works by creating `blogs` documents on publish and injecting the tracking script into deployed HTML, and inject Meta Title, Meta Description, and Meta Keywords (and Open Graph) into the blog HTML template and build.
todos: []
---

# Blog analytics and meta tags

## Current state

**Analytics**

- Frontend ([`src/services/analytics.service.ts`](src/services/analytics.service.ts)) reads **blogs** (by `siteId`) and **pageViews** (by `blogId`) for metrics. Backend [`trackPageView`](functions/src/index.ts) (and `trackTimeOnPage` / `trackScrollDepth`) writes to **pageViews** and updates **blogs** via `blogRef.update(blogId)`.
- Published posts live only in **sites/{siteId}/contentCalendar/{calendarId}`**. No document is ever created in the **blogs** collection when publishing, so `blogRef.update(blogId)` fails (doc does not exist) and the Analytics dashboard has no data.
- The tracking script is implemented in the app ([`src/services/tracking.service.ts`](src/services/tracking.service.ts)) but is **not injected** into the actual blog pages (Cloudflare template or WordPress). So visitor views are never sent to the backend.

**Meta tags**

- [`functions/website/blog/template.html`](functions/website/blog/template.html) has `<title>{{TITLE}}</title>` and `<meta name="description" content="{{excerpt}}">`, but [`deployBlog.ts`](functions/src/deployBlog.ts) never replaces `{{excerpt}}` and does not pass `blogDescription` or `keyword` from the calendar. So meta description is literally `"{{excerpt}}"` and there is no keywords/meta tag.

---

## Part 1: Make analytics work

### 1.1 Ensure a `blogs` document exists for each published post

- **On WordPress publish**  

In [`processCalendarEntry`](functions/src/index.ts) (in the WordPress publish path, after the calendar doc is updated with `status: "published"`), create or merge a document at **blogs/{calendarId}** with at least: `siteId`, `title` (blogTitle), `totalViews: 0`, and optionally `wordpressPostUrl`, `publishedAt`. Use `set(..., { merge: true })` so existing fields (e.g. `totalViews`) are not overwritten.

- **On Cloudflare deploy**  

In [`buildAndDeploy`](functions/src/deployBlog.ts) in `deployBlog.ts`, after building the list of posts from contentCalendar, for each post call a small helper that does `db.collection("blogs").doc(post.id).set({ siteId, title: post.title, ... }, { merge: true })` so each deployed post has a corresponding blogs doc (post.id is the calendar doc id).

- **Backend tolerance**  

In [`trackPageView`](functions/src/index.ts), switch from `blogRef.update(...)` to `blogRef.set({ ...stats, siteId, title }, { merge: true })` (or ensure the doc exists before update). Use a pattern that creates the doc on first view if it does not exist (e.g. get then set/update), so analytics does not depend on publish-time creation alone.

### 1.2 Inject the tracking script into the blog HTML (Cloudflare)

- **Template**  

In [`functions/website/blog/template.html`](functions/website/blog/template.html), add a placeholder before `</body>`, e.g. `{{TRACKING_SCRIPT}}`. If the placeholder is missing for older templates, the replace can no-op.

- **Build**  

In [`buildAndDeploy`](functions/src/deployBlog.ts), when generating each post HTML:

  - Build the tracking script string that matches the frontend behavior: same payload as [`tracking.service.ts`](src/services/tracking.service.ts) (blogId, siteId, timestamp, referrer, userAgent, etc.) and POST to `trackPageView`, with `beforeunload` sending to `trackTimeOnPage` and scroll depth to `trackScrollDepth`.
  - Use the same Cloud Functions base URL (e.g. `https://australia-southeast1-apex-seo-ffbd0.cloudfunctions.net` or from env) and pass **blogId = post.id** (calendar doc id) and **siteId**.
  - Replace `{{TRACKING_SCRIPT}}` with that script (or leave empty if you do not want tracking on a given build).

Result: For Cloudflare-deployed blogs, every post page will send view/time/scroll to the backend and the Analytics dashboard (which queries `blogs` and `pageViews`) will show data.

### 1.3 WordPress

- Create the **blogs** doc on publish (as in 1.1). The tracking script cannot be injected into the WordPress `<head>` by this app (we only push post content). Options: (a) Document that the user should add the tracking snippet (from the app, e.g. in site or post settings) to their theme or a plugin; or (b) Expose the snippet via an API/callable so the app can show “Add this to your theme” with the correct blogId/siteId. No change to WordPress post content is required for the plan; focus on backend and Cloudflare.

---

## Part 2: Inject Meta Title, Meta Tag, and Meta Description in HTML

### 2.1 Template changes

In [`functions/website/blog/template.html`](functions/website/blog/template.html):

- **Meta title**  

Keep `<title>{{TITLE}} - Apex SEO Blog</title>` (or use a dedicated `{{META_TITLE}}` if you want title without suffix elsewhere). So meta title is already present; ensure it is replaced with the post’s blog title.

- **Meta description**  

Replace the current `<meta name="description" content="{{excerpt}}">` with `<meta name="description" content="{{META_DESCRIPTION}}">`.

- **Meta tag (keywords)**  

Add `<meta name="keywords" content="{{META_KEYWORDS}}">` in the `<head>`.

- **Open Graph (optional but recommended)**  

Add `og:title` and `og:description` (and optionally `og:image`) so shares show the right title and description.

### 2.2 Build data and replace in deployBlog

In [`deployBlog.ts`](functions/src/deployBlog.ts):

- When mapping calendar docs to posts, include **blogDescription** (meta description) and **keyword** (for meta keywords), e.g.  

`blogDescription: data.blogDescription || data.blogTopic`,

`keyword: data.keyword || ""`.

- When building each post’s HTML, replace:
  - `{{META_DESCRIPTION}}` with a sanitized string (e.g. escape quotes): `post.blogDescription || post.title || ""`.
  - `{{META_KEYWORDS}}` with `post.keyword || ""` (and escape if needed).
- Ensure `{{TITLE}}` remains the post’s display/meta title (already in use).

After this, the generated blog HTML will contain the correct meta title, meta description, and meta keywords (and OG tags if added).

---

## Flow summary

```mermaid
sequenceDiagram
  participant Publish as Publish flow
  participant Firestore as Firestore
  participant Visitor as Visitor browser
  participant CF as Cloud Functions

  Publish->>Firestore: Create/merge blogs/{calendarId} (siteId, title)
  Publish->>Firestore: contentCalendar updated (published)
  Note over Publish: Cloudflare: buildAndDeploy injects TRACKING_SCRIPT + meta placeholders

  Visitor->>Visitor: Load blog page (HTML with script + meta tags)
  Visitor->>CF: POST trackPageView(blogId, siteId, ...)
  CF->>Firestore: pageViews.add(); blogs.doc(blogId).set(merge) or update
  Analytics->>Firestore: getSiteMetrics(siteId) -> blogs where siteId
  Analytics->>Firestore: getBlogMetrics(blogId) -> pageViews where blogId
```

---

## Files to touch (summary)

| Area | File | Change |

|------|------|--------|

| Analytics | `functions/src/index.ts` | After WordPress publish, create/merge `blogs/{calendarId}`. In `trackPageView` (and if needed `trackTimeOnPage`/`trackScrollDepth`), ensure blog doc exists (e.g. set with merge or get-then-update). |

| Analytics | `functions/src/deployBlog.ts` | For each post from contentCalendar, create/merge `blogs/{post.id}`. Add tracking script generation (same contract as frontend) and replace `{{TRACKING_SCRIPT}}` in template. Pass `blogDescription` and `keyword` into post object; replace `{{META_DESCRIPTION}}`, `{{META_KEYWORDS}}` in template. |

| Meta | `functions/website/blog/template.html` | Use `{{META_DESCRIPTION}}`, add `{{META_KEYWORDS}}`, optionally add OG meta tags. Add `{{TRACKING_SCRIPT}}` before `</body>`. |

No change to the frontend analytics service or dashboard is required once `blogs` and `pageViews` are populated by the backend and the injected script.