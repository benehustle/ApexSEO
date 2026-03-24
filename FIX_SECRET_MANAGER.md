# Fix Secret Manager Permissions - URGENT

## The Problem
Your Cloud Functions are getting `401 invalid x-api-key` errors because they don't have permission to read from Secret Manager.

## Quick Fix (5 minutes)

### Step 1: Grant Permission via Google Cloud Console

1. **Open Google Cloud Console IAM:**
   - Go to: https://console.cloud.google.com/iam-admin/iam?project=apex-seo-ffbd0

2. **Find the Cloud Functions Service Account:**
   - Look for: `apex-seo-ffbd0@appspot.gserviceaccount.com`
   - OR: `PROJECT_NUMBER-compute@developer.gserviceaccount.com`
   - If you don't see it, search for "compute" or "functions"

3. **Edit the Service Account:**
   - Click the **pencil/edit icon** next to the service account
   - Click **ADD ANOTHER ROLE**
   - Search for: `Secret Manager Secret Accessor`
   - Select it
   - Click **SAVE**

### Step 2: Verify Secret Exists

1. **Go to Secret Manager:**
   - https://console.cloud.google.com/security/secret-manager?project=apex-seo-ffbd0

2. **Check the secret name:**
   - Should be named: `anthropic-api-key`
   - If it has a different name, note it down

3. **Verify it has a version:**
   - Click on the secret
   - Make sure there's at least one version enabled

### Step 3: Wait and Test

1. **Wait 1-2 minutes** for permissions to propagate
2. **Try generating blogs again** in your app
3. **Check logs** if it still fails:
   ```bash
   firebase functions:log | grep generateKeywords
   ```

## Alternative: Use Environment Variable (Temporary Fix)

If Secret Manager permissions are taking too long, you can temporarily use an environment variable:

1. **Set environment variable in Firebase Console:**
   - Go to: https://console.firebase.google.com/project/apex-seo-ffbd0/functions/config
   - Click **Add Variable**
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your actual Anthropic API key
   - Click **Save**

2. **Redeploy functions:**
   ```bash
   firebase deploy --only functions
   ```

**Note:** This is less secure than Secret Manager, but will work immediately.

## Verify It's Working

After granting permissions, check the function logs:

```bash
firebase functions:log | grep -A 10 generateKeywords
```

You should see successful API calls instead of `401 invalid x-api-key` errors.
