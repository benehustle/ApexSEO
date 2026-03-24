# How to Set Anthropic API Key for Cloud Functions

## Quick Setup (Firebase Console - Recommended)

1. **Go to Firebase Console:**
   - Visit: https://console.firebase.google.com/project/apex-seo-ffbd0/functions

2. **Navigate to Configuration:**
   - Click on **Functions** in the left sidebar
   - Click on the **Configuration** tab
   - Scroll down to **Environment variables** section

3. **Add Environment Variable:**
   - Click **Add variable** button
   - **Name**: `ANTHROPIC_API_KEY`
   - **Value**: `sk-ant-api03-YOUR_KEY_HERE` (paste your key from the Anthropic console)
   - Click **Save**

4. **Redeploy Functions:**
   ```bash
   firebase deploy --only functions
   ```

## Verify It's Set

After deploying, verify the environment variable is set:

1. Go to Firebase Console > Functions > Configuration
2. Check that `ANTHROPIC_API_KEY` appears in the Environment variables list
3. Test by generating keywords in your app

## Alternative: Using Legacy Method (Temporary)

If you need to use the legacy method temporarily:

```bash
firebase experiments:enable legacyRuntimeConfigCommands
firebase functions:config:set anthropic.key="your-key-here"
firebase deploy --only functions
```

**Warning:** This method is deprecated and will stop working in March 2026. Use the Firebase Console method instead.

## For Local Development

Create a `.env` file in the `functions/` directory:

```env
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

Then when running the emulator:
```bash
cd functions
npm run serve
```

The emulator will automatically load the `.env` file.
