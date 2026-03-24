# OpenAI API Key Setup for Image Generation

## Option 1: Set as Environment Variable (Recommended)

1. Go to [Firebase Console → Functions → Configuration](https://console.firebase.google.com/project/apex-seo-ffbd0/functions/config)
2. Click **"Add variable"**
3. Set:
   - **Variable name:** `OPENAI_API_KEY`
   - **Value:** Your OpenAI API key (starts with `sk-`)
4. Click **"Save"**
5. Redeploy the function:
   ```bash
   firebase deploy --only functions:processBlogGeneration
   ```

## Option 2: Add to Secret Manager (More Secure)

1. Go to [Google Cloud Secret Manager](https://console.cloud.google.com/security/secret-manager?project=apex-seo-ffbd0)
2. Click **"CREATE SECRET"**
3. Set:
   - **Name:** `OPENAI_API_KEY`
   - **Secret value:** Your OpenAI API key
4. Click **"CREATE SECRET"**
5. Grant access to Cloud Functions service account:
   - Go to [IAM](https://console.cloud.google.com/iam-admin/iam?project=apex-seo-ffbd0)
   - Find: `apex-seo-ffbd0@appspot.gserviceaccount.com`
   - Ensure it has **"Secret Manager Secret Accessor"** role
6. Update `functions/src/index.ts` to fetch from Secret Manager (similar to Anthropic)

## Get Your OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/account/api-keys)
2. Click **"Create new secret key"**
3. Copy the key (you won't see it again!)

## Note

- Image generation is **optional** - blogs will still generate without images if the key is missing
- The function gracefully handles missing keys and continues without images
- Images are generated using DALL-E 3 at 1792x1024 resolution
