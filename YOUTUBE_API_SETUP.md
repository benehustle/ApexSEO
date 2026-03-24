# YouTube API Key Setup Guide

## Step 1: Get Your YouTube API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: **apex-seo-ffbd0**
3. Navigate to **APIs & Services** → **Library**
4. Search for **"YouTube Data API v3"**
5. Click **Enable**
6. Go to **APIs & Services** → **Credentials**
7. Click **Create Credentials** → **API Key**
8. Copy your API key

### Optional: Restrict Your API Key (Recommended)

1. Click on your newly created API key to edit it
2. Under **Application restrictions**, select **HTTP referrers**
3. Add these referrers:
   - `https://apex-seo-ffbd0.web.app/*`
   - `http://localhost:*`
4. Under **API restrictions**, select **Restrict key**
5. Choose **YouTube Data API v3**
6. Click **Save**

## Step 2: Add the Key to Your Project

### For Local Development:

Create a `.env.local` file in the root of your project:

```bash
VITE_YOUTUBE_API_KEY=your_actual_youtube_api_key_here
```

### For Production:

Create a `.env.production` file in the root of your project:

```bash
VITE_YOUTUBE_API_KEY=your_actual_youtube_api_key_here
```

**Important:** The `.env.production` file should already be in `.gitignore` to prevent committing your API key.

## Step 3: Rebuild and Redeploy

After adding the key:

```bash
npm run build
firebase deploy --only hosting
```

## Notes

- The YouTube API has a **free quota** of 10,000 units per day
- Each search request costs **100 units**
- This means you can make approximately **100 searches per day** for free
- If you need more, you can request a quota increase in Google Cloud Console

## Troubleshooting

If you see `400 Bad Request` errors:
- Verify the API key is correct
- Check that YouTube Data API v3 is enabled
- Ensure the API key restrictions allow your domain
