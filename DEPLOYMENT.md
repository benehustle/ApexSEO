# Production Deployment Guide

## Prerequisites

1. ✅ Firebase CLI installed and logged in
2. ✅ All environment variables configured
3. ✅ Cloud Functions deployed
4. ✅ Firestore indexes built

## Step 1: Configure Secret Manager (✅ Already Done!)

The Anthropic API key is stored in Google Cloud Secret Manager. 

**Important:** Make sure Cloud Functions have permission to access the secret:

1. Go to [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam?project=apex-seo-ffbd0)
2. Find service account: `apex-seo-ffbd0@appspot.gserviceaccount.com`
3. Click **Edit** → **ADD ANOTHER ROLE**
4. Select: **Secret Manager Secret Accessor**
5. Click **SAVE**

**Secret Name:** The code expects the secret to be named `anthropic-api-key`. If yours is different, update `SECRET_NAME` in `functions/src/index.ts`.

See `SECRET_MANAGER_SETUP.md` for detailed instructions.

## Step 2: Prepare Production Environment Variables

1. Copy your `.env.local` to `.env.production`:
   ```bash
   cp .env.local .env.production
   ```

2. Review and update `.env.production` with production values:
   - Ensure all Firebase config values are correct
   - Update any API keys if needed
   - Remove any development-only variables

## Step 3: Build the Application

```bash
# Build for production (uses .env.production automatically)
npm run build
```

This creates the `dist/` folder with production-ready files.

## Step 4: Deploy to Firebase

### Option A: Deploy Everything
```bash
firebase deploy
```

### Option B: Deploy Specific Services
```bash
# Deploy only hosting
npm run deploy:hosting

# Deploy only functions
npm run deploy:functions

# Deploy only security rules
npm run deploy:rules
```

## Step 5: Verify Deployment

1. Check Firebase Console:
   - Hosting: https://console.firebase.google.com/project/apex-seo-ffbd0/hosting
   - Functions: https://console.firebase.google.com/project/apex-seo-ffbd0/functions

2. Test your production URL:
   - Visit your Firebase Hosting URL
   - Test login/signup
   - Test site creation
   - Test blog generation
   - Test publishing

## Environment Variables Reference

### Frontend (Baked into Build)
These are set in `.env.production` and baked into the build:
- `VITE_FIREBASE_*` - Firebase configuration
- `VITE_OPENAI_API_KEY` - For image generation (if used client-side)
- `VITE_YOUTUBE_API_KEY` - For video suggestions
- `VITE_DATAFORSEO_*` - For keyword research

### Backend (Cloud Functions)
These are stored in Google Cloud Secret Manager:
- `anthropic-api-key` - For AI content generation (stored in Secret Manager)
- The code automatically fetches from Secret Manager with fallback to environment variables

## Troubleshooting

### Build Fails
- Check that all required environment variables are in `.env.production`
- Verify Firebase config values are correct
- Check for TypeScript errors: `npm run build`

### Functions Don't Work
- Verify `ANTHROPIC_API_KEY` is set: `firebase functions:config:get`
- Check function logs: `firebase functions:log`
- Verify functions are deployed: `firebase functions:list`

### Hosting Issues
- Clear browser cache
- Check Firebase Hosting logs in console
- Verify `dist/` folder exists after build
- Check that `firebase.json` hosting config is correct

## Quick Deploy Script

Create a `deploy.sh` script:

```bash
#!/bin/bash
set -e

echo "🔨 Building application..."
npm run build

echo "🚀 Deploying to Firebase..."
firebase deploy

echo "✅ Deployment complete!"
```

Make it executable: `chmod +x deploy.sh`
Run it: `./deploy.sh`

## Post-Deployment Checklist

- [ ] Production URL loads correctly
- [ ] Authentication works
- [ ] Site creation works
- [ ] Blog generation works (test with real API key)
- [ ] WordPress publishing works
- [ ] Analytics tracking works
- [ ] No console errors
- [ ] All functions are accessible
- [ ] Environment variables are set correctly
