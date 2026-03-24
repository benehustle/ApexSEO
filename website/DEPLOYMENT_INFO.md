# Deployment Information

## 🎉 Your Website is Live!

**Production URL:** https://4e79c4f8.apex-seo-marketing.pages.dev
**Project Name:** apex-seo-marketing
**Platform:** Cloudflare Pages

## Pages Deployed

✅ **index.html** - Home page with features, pricing, and how it works
✅ **signup.html** - Sign up page for starting free trial
✅ **termsandconditions.html** - Terms and Conditions
✅ **privacy.html** - Privacy Policy

## Next Steps

### 1. Update Signup Redirects (IMPORTANT!)

The signup page currently has placeholder URLs. Update these to point to your actual app:

1. Open `signup.html`
2. Find these lines (around line 240-250):
   ```javascript
   window.location.href = 'YOUR_APP_URL_HERE/embed/signup';
   window.location.href = 'YOUR_APP_URL_HERE/login';
   ```
3. Replace with your actual Firebase app URL:
   ```javascript
   window.location.href = 'https://YOUR-PROJECT.firebaseapp.com/embed/signup';
   window.location.href = 'https://YOUR-PROJECT.firebaseapp.com/login';
   ```
4. Redeploy:
   ```bash
   wrangler pages deploy "/Users/benwake/Library/Mobile Documents/com~apple~CloudDocs/Apps/Apex SEO/website" --project-name=apex-seo-marketing
   ```

### 2. Add Custom Domain (Optional)

To use your own domain (e.g., www.apexseo.com):

1. Go to https://dash.cloudflare.com
2. Navigate to "Workers & Pages" > "apex-seo-marketing"
3. Click "Custom domains" tab
4. Click "Set up a custom domain"
5. Enter your domain and follow DNS instructions
6. SSL certificate will be automatically provisioned

### 3. Set Up Google Analytics (Optional)

To track visitors:

1. Create a Google Analytics 4 property
2. Get your GA4 Measurement ID (G-XXXXXXXXXX)
3. Add the tracking code to each HTML file before `</head>`:
   ```html
   <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
   <script>
     window.dataLayer = window.dataLayer || [];
     function gtag(){dataLayer.push(arguments);}
     gtag('js', new Date());
     gtag('config', 'G-XXXXXXXXXX');
   </script>
   ```
4. Redeploy

### 4. Set Up Meta & Google Ads Tracking (Optional)

For conversion tracking from ads:

**Meta Pixel:**
```html
<!-- Meta Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', 'YOUR_PIXEL_ID');
  fbq('track', 'PageView');
</script>
```

**Google Ads:**
```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-CONVERSION_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'AW-CONVERSION_ID');
</script>
```

Add conversion tracking on signup page:
```html
<script>
  gtag('event', 'conversion', {'send_to': 'AW-CONVERSION_ID/CONVERSION_LABEL'});
  fbq('track', 'Lead');
</script>
```

## How blog posts show on the website

Posts appear on the marketing site’s blog when you use **Post Now** for the **Apex SEO marketing site** (Site ID: `CrwYROIIGRhyGotnV4dh`).

1. **In the app:** Open that site’s content calendar, approve an entry (or use one that’s already approved), then click **Post Now**.
2. **Behind the scenes:** The Cloud Function marks the entry as published, fetches all published/approved entries from `sites/CrwYROIIGRhyGotnV4dh/contentCalendar`, builds the static blog (index + post pages), and deploys to Cloudflare Pages.
3. **Where to look:** After a minute or two, check:
   - **Blog index:** `https://apex-seo-marketing.pages.dev/blog` (or your custom domain `/blog`)
   - **Single post:** `https://apex-seo-marketing.pages.dev/blog/<slug>.html`

**Requirements:**

- Cloudflare credentials in **Secret Manager:** `CLOUDFLARE-ACCOUNT-ID` and `CLOUDFLARE-API-TOKEN` (with Pages write access).
- Cloudflare Pages project named **apex-seo-marketing** in the same account.
- Calendar entries with **status** `approved` or `published` and with **generatedContent** (and ideally **blogTitle**, **featuredImageUrl**). Only those are included in the deploy.

If posts still don’t show: check Firebase Functions logs for `processCalendarEntryCallable` and `buildAndDeploy` (e.g. “found N posts”, “Deployment Successful”, or Cloudflare/Secret Manager errors).

---

## Redeploying Updates

Whenever you make changes to the website:

```bash
wrangler pages deploy "/Users/benwake/Library/Mobile Documents/com~apple~CloudDocs/Apps/Apex SEO/website" --project-name=apex-seo-marketing
```

Or use the Cloudflare Dashboard for drag-and-drop deployment.

## Monitoring & Analytics

- **Cloudflare Analytics:** https://dash.cloudflare.com (built-in traffic analytics)
- **Performance:** Cloudflare CDN automatically caches and optimizes delivery
- **Uptime:** 99.99% uptime guaranteed by Cloudflare

## Support

For technical issues:
- Cloudflare Pages Docs: https://developers.cloudflare.com/pages/
- Support Email: support@apexseo.com

## Deployment History

- **January 28, 2026:** Initial deployment
  - Created all 4 pages with consistent header/footer
  - Added security headers (_headers file)
  - Configured redirects (_redirects file)
  - Deployed to Cloudflare Pages

---

**Pro Tip:** Set up automatic deployments by connecting your website to a GitHub repository. Every push to main will automatically deploy to Cloudflare Pages!
