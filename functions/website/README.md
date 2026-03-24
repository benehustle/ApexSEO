# Apex SEO Marketing Website

This is the marketing website for Apex SEO - an AI-powered WordPress automation platform.

## Pages

- `index.html` - Home page with features, pricing, and how it works
- `signup.html` - Sign up page for starting free trial
- `termsandconditions.html` - Terms and Conditions
- `privacy.html` - Privacy Policy

## Features

- ✅ Modern, responsive design using Tailwind CSS
- ✅ Consistent header and footer across all pages
- ✅ Mobile-friendly navigation
- ✅ SEO-optimized meta tags
- ✅ Fast loading with CDN-hosted assets

## Deployment to Cloudflare Pages

### Method 1: Deploy via Cloudflare Dashboard (Recommended)

1. **Login to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com
   - Navigate to "Workers & Pages" > "Pages"

2. **Create a New Project**
   - Click "Create a project"
   - Choose "Direct Upload"

3. **Upload Files**
   - Zip the contents of the `website` folder (not the folder itself)
   - Or drag and drop the HTML files directly

4. **Configure Project**
   - Project name: `apex-seo-marketing`
   - Production branch: Leave default
   - Build settings: None needed (static HTML)

5. **Deploy**
   - Click "Save and Deploy"
   - Your site will be live at: `https://apex-seo-marketing.pages.dev`

### Method 2: Deploy via Wrangler CLI

1. **Install Wrangler**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

3. **Deploy from the website directory**
   ```bash
   cd website
   wrangler pages deploy . --project-name=apex-seo-marketing
   ```

### Method 3: Connect to Git (Best for Updates)

1. **Push to GitHub/GitLab**
   - Create a new repository
   - Push the `website` folder contents

2. **Connect to Cloudflare Pages**
   - In Cloudflare Dashboard, choose "Connect to Git"
   - Select your repository
   - Configure:
     - Production branch: `main`
     - Build command: (leave empty)
     - Build output directory: `/`
   - Click "Save and Deploy"

## Custom Domain Setup

After deployment, you can add a custom domain:

1. Go to your Cloudflare Pages project
2. Click "Custom domains"
3. Click "Set up a custom domain"
4. Enter your domain (e.g., `www.apexseo.com`)
5. Follow DNS configuration instructions
6. SSL certificate will be automatically provisioned

## Post-Deployment Setup

After deploying, you need to update the signup redirect URLs in `signup.html`:

1. Open `signup.html`
2. Find these lines:
   ```javascript
   window.location.href = 'YOUR_APP_URL_HERE/embed/signup';
   window.location.href = 'YOUR_APP_URL_HERE/login';
   ```
3. Replace `YOUR_APP_URL_HERE` with your actual app URL
4. Redeploy

Example:
```javascript
window.location.href = 'https://apex-seo-app.firebaseapp.com/embed/signup';
window.location.href = 'https://apex-seo-app.firebaseapp.com/login';
```

## Performance Optimization

The site is already optimized:
- ✅ Tailwind CSS loaded from CDN
- ✅ Google Fonts with preconnect
- ✅ Minimal JavaScript
- ✅ No build process required
- ✅ Cloudflare CDN automatically caches assets

## Analytics (Optional)

To add Google Analytics:

1. Get your GA4 tracking ID
2. Add this before the closing `</head>` tag in each HTML file:
   ```html
   <!-- Google Analytics -->
   <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
   <script>
     window.dataLayer = window.dataLayer || [];
     function gtag(){dataLayer.push(arguments);}
     gtag('js', new Date());
     gtag('config', 'G-XXXXXXXXXX');
   </script>
   ```

## Maintenance

To update the site:
1. Edit the HTML files
2. Redeploy using any of the methods above
3. Cloudflare will automatically invalidate cache

## Troubleshooting

**Site not loading?**
- Check Cloudflare Pages deployment logs
- Ensure all HTML files are in the root directory
- Verify DNS settings if using custom domain

**Forms not working?**
- Update the redirect URLs in `signup.html`
- Ensure your app's signup page is accessible

**Mobile menu not working?**
- Check browser console for JavaScript errors
- Verify the mobile menu toggle script is present

## Support

For issues with the marketing site, contact: support@apexseo.com
