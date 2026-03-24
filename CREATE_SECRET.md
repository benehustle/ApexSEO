# Create the Secret in Secret Manager

## The Problem
The secret `anthropic-api-key` doesn't exist or has no versions in Secret Manager.

## Solution: Create the Secret

### Option 1: Via Google Cloud Console (Easiest)

1. **Go to Secret Manager:**
   - https://console.cloud.google.com/security/secret-manager?project=apex-seo-ffbd0

2. **Create a new secret:**
   - Click **"CREATE SECRET"**
   - **Name:** `anthropic-api-key` (must be exactly this, case-sensitive)
   - **Secret value:** Paste your Anthropic API key (should start with `sk-ant-`)
   - Click **"CREATE SECRET"**

3. **Verify it was created:**
   - You should see `anthropic-api-key` in the list
   - Click on it to see it has at least one version

### Option 2: Via gcloud CLI

```bash
# Set your Anthropic API key
ANTHROPIC_KEY="your-actual-api-key-here"

# Create the secret
echo -n "$ANTHROPIC_KEY" | gcloud secrets create anthropic-api-key \
  --project=apex-seo-ffbd0 \
  --data-file=-
```

### Option 3: If Your Secret Has a Different Name

If you already created the secret with a different name (e.g., `ANTHROPIC_API_KEY` or `anthropic-key`), you have two options:

**Option A:** Rename/Create with correct name
1. Go to Secret Manager
2. Create a new secret named `anthropic-api-key` with your API key value
3. Delete the old secret if you want

**Option B:** Update the code to use your secret name
- I can update the code to use whatever name you used

## After Creating the Secret

1. **Wait 1-2 minutes** for it to propagate
2. **Try generating blogs again**
3. **Check logs** to verify it's working:
   ```bash
   firebase functions:log | grep -A 5 "Successfully\|Secret"
   ```

## Verify It's Working

After creating the secret, the logs should show:
- `Successfully retrieved API key from Secret Manager` instead of
- `Failed to fetch secret from Secret Manager`

## Important Notes

- Secret name must be exactly: `anthropic-api-key` (lowercase, with hyphens)
- The secret must have at least one version enabled
- Your API key should start with `sk-ant-`
- No extra spaces or newlines in the secret value
