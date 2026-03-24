# Create Missing Stripe Secrets

Firebase deployment is failing because these secrets don't exist yet:
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`

## Option 1: Create Placeholder Secrets (Quick Fix)

Create placeholder secrets so deployment can proceed. You'll update them with real values later.

### Using Google Cloud Console:

1. **Go to Secret Manager**: https://console.cloud.google.com/security/secret-manager?project=apex-seo-ffbd0
2. **Click "CREATE SECRET"**

   **Secret 1: STRIPE_PRICE_ID**
   - **Name**: `STRIPE_PRICE_ID`
   - **Secret value**: `placeholder_price_id` (you'll update this later)
   - Click "CREATE SECRET"
   - Go to "PERMISSIONS" tab
   - Click "ADD PRINCIPAL"
   - Principal: `firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com`
   - Role: `Secret Manager Secret Accessor`
   - Click "SAVE"

   **Secret 2: STRIPE_WEBHOOK_SECRET**
   - **Name**: `STRIPE_WEBHOOK_SECRET`
   - **Secret value**: `placeholder_webhook_secret` (you'll update this later)
   - Click "CREATE SECRET"
   - Go to "PERMISSIONS" tab
   - Click "ADD PRINCIPAL"
   - Principal: `firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com`
   - Role: `Secret Manager Secret Accessor`
   - Click "SAVE"

### Using gcloud CLI (if you have it installed):

```bash
# Set project
gcloud config set project apex-seo-ffbd0

# Create STRIPE_PRICE_ID
echo -n "placeholder_price_id" | gcloud secrets create STRIPE_PRICE_ID --data-file=-

# Create STRIPE_WEBHOOK_SECRET
echo -n "placeholder_webhook_secret" | gcloud secrets create STRIPE_WEBHOOK_SECRET --data-file=-

# Grant access to Firebase service account
gcloud secrets add-iam-policy-binding STRIPE_PRICE_ID \
  --member="serviceAccount:firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding STRIPE_WEBHOOK_SECRET \
  --member="serviceAccount:firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Option 2: Update Secrets with Real Values Later

After creating the placeholder secrets and deploying:

1. **Get your Stripe Price ID**:
   - Go to Stripe Dashboard → Products → "SEO Automation Seat"
   - Copy the Price ID (starts with `price_...`)
   - See `STRIPE_PRICE_ID_INSTRUCTIONS.md` for details

2. **Get your Stripe Webhook Secret**:
   - Go to Stripe Dashboard → Webhooks
   - Create a webhook endpoint (or use existing)
   - Copy the "Signing secret" (starts with `whsec_...`)
   - See `STRIPE_WEBHOOK_SETUP.md` for details

3. **Update the secrets**:
   - Go to Secret Manager in Google Cloud Console
   - Click on each secret
   - Click "ADD NEW VERSION"
   - Paste the real value
   - Click "ADD VERSION"

## After Creating Secrets

Once both secrets are created, try deploying again:

```bash
firebase deploy --only functions
```

The deployment should now succeed!
