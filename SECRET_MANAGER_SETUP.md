# Secret Manager Setup Guide

## ✅ Secret Already Added

You've already added the Anthropic API key to Google Cloud Secret Manager. Great! Now we need to ensure the Cloud Functions have permission to access it.

## Step 1: Grant Cloud Functions Access to Secret Manager

The Cloud Functions service account needs permission to read the secret.

### Option A: Via Google Cloud Console (Recommended)

1. Go to [Google Cloud Console - IAM & Admin](https://console.cloud.google.com/iam-admin/iam?project=apex-seo-ffbd0)
2. Find the service account: `apex-seo-ffbd0@appspot.gserviceaccount.com` (or `PROJECT_ID@PROJECT_ID.iam.gserviceaccount.com`)
3. Click the **Edit** (pencil) icon
4. Click **ADD ANOTHER ROLE**
5. Select role: **Secret Manager Secret Accessor**
6. Click **SAVE**

### Option B: Via gcloud CLI

```bash
# Get the project number
PROJECT_NUMBER=$(gcloud projects describe apex-seo-ffbd0 --format="value(projectNumber)")

# Grant the Secret Manager Secret Accessor role
gcloud projects add-iam-policy-binding apex-seo-ffbd0 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Step 2: Verify Secret Name

The code expects the secret to be named `anthropic-api-key` by default. 

**What is your secret name in Secret Manager?**

If it's different, you can either:
1. Rename your secret to `anthropic-api-key`, OR
2. Set an environment variable when deploying:
   ```bash
   # This would require updating the code to use a different env var
   ```

The default secret name is: `anthropic-api-key`

To check your secret name:
1. Go to [Secret Manager](https://console.cloud.google.com/security/secret-manager?project=apex-seo-ffbd0)
2. Check the name of your Anthropic API key secret

## Step 3: Deploy Functions

After granting permissions, deploy the functions:

```bash
cd functions
npm run build
cd ..
firebase deploy --only functions
```

## Step 4: Test

1. Go to your app
2. Try generating keywords
3. Check function logs if it fails:
   ```bash
   firebase functions:log
   ```

## Troubleshooting

### Error: Permission denied
- Make sure you granted the **Secret Manager Secret Accessor** role
- The service account name should match your project

### Error: Secret not found
- Verify the secret name matches exactly (case-sensitive)
- Check that the secret exists in the same project
- Verify the secret has at least one version enabled

### Error: Secret version not found
- Make sure the secret has at least one version
- The code uses `versions/latest` which requires at least one version

## Code Details

The code will:
1. First try to fetch from Secret Manager (secret name: `anthropic-api-key`)
2. Fall back to `ANTHROPIC_API_KEY` environment variable if Secret Manager fails
3. Use "demo-key" as last resort (for local development)

The secret is cached after first fetch to avoid repeated API calls.
