# Check Your Secret Manager Configuration

## Step 1: Verify Secret Name

The code expects the secret to be named: **`anthropic-api-key`**

1. Go to [Secret Manager](https://console.cloud.google.com/security/secret-manager?project=apex-seo-ffbd0)
2. Check the **exact name** of your Anthropic API key secret
3. Is it named `anthropic-api-key`? (case-sensitive)

## Step 2: Check Secret Value

1. Click on your secret
2. Click on the latest version
3. Click **"VIEW SECRET VALUE"**
4. Verify it's your actual Anthropic API key (should start with `sk-ant-`)

## Step 3: Test After Redeploy

After I redeployed with better logging, try generating blogs again, then check the logs:

```bash
firebase functions:log | grep -A 5 "Secret\|API key\|demo"
```

The logs will now show:
- What secret path is being attempted
- Whether Secret Manager access succeeds
- What key is actually being used

## Common Issues

### Secret Name Mismatch
If your secret is named differently (e.g., `ANTHROPIC_API_KEY` or `anthropic-key`), you have two options:

**Option A:** Rename the secret to `anthropic-api-key`
1. Create a new secret with the correct name
2. Copy the value from the old secret
3. Delete the old secret

**Option B:** Update the code to use your secret name
- I can update the code to use a different secret name

### Secret Value is Wrong
- Make sure the secret value is your actual Anthropic API key
- It should start with `sk-ant-`
- No extra spaces or newlines

### Permissions Still Not Working
Even if you granted permissions, try:
1. Wait 5-10 minutes for propagation
2. Check IAM again to confirm the role is there
3. Try redeploying functions: `firebase deploy --only functions`
