# Stripe Volume Pricing Setup Guide

## Step 1: Create Product in Stripe Dashboard

1. **Log in to Stripe Dashboard**: https://dashboard.stripe.com
2. **Navigate to Products**: Click "Products" in the left sidebar
3. **Click "+ Add product"**
4. **Product Details**:
   - **Name**: `SEO Automation Seat`
   - **Description**: `Per-site subscription for SEO automation service`
   - **Type**: Select **"Recurring"**
   - **Billing period**: Select **"Monthly"**

## Step 2: Set Up Graduated Pricing (Volume Pricing)

1. **In the Pricing section**, you'll see "Pricing model" dropdown
2. **Select "Graduated pricing"** (this enables volume-based pricing)
3. **Add Pricing Tiers**:

   **Tier 1: First 2 sites**
   - **Quantity**: `1` to `2`
   - **Unit price**: `$129.00` per month
   - Click "Add tier"

   **Tier 2: 3+ sites**
   - **Quantity**: `3` and above
   - **Unit price**: `$99.00` per month
   - Click "Add tier"

4. **Review**: Your pricing should look like:
   ```
   Sites 1-2: $129.00/month each
   Sites 3+: $99.00/month each
   ```

5. **Click "Save product"**

## Step 3: Get Your Stripe Keys

### Get the Price ID:
1. After saving, you'll see the product page
2. Under "Pricing", you'll see the price details
3. **Copy the Price ID** (starts with `price_...`)
   - Example: `price_1ABC123xyz...`
   - **Save this**: You'll need it for your code

### Get API Keys:
1. **Navigate to Developers → API keys** (in left sidebar)
2. You'll see two keys:
   - **Publishable key** (starts with `pk_...`)
   - **Secret key** (starts with `sk_...`) - Click "Reveal" to see it
3. **Important**: Use **Test mode** keys for development, **Live mode** keys for production
4. **Copy both keys**:
   - Publishable key: `pk_test_...` or `pk_live_...`
   - Secret key: `sk_test_...` or `sk_live_...`

## Step 4: Store Keys in Google Secret Manager

### Using Google Cloud Console:

1. **Go to**: https://console.cloud.google.com/security/secret-manager
2. **Select your project**: `apex-seo-ffbd0`
3. **Click "CREATE SECRET"** for each key:

   **Secret 1: Stripe Secret Key**
   - **Name**: `STRIPE_SECRET_KEY`
   - **Secret value**: Paste your `sk_test_...` or `sk_live_...`
   - **Click "CREATE SECRET"**

   **Secret 2: Stripe Publishable Key** (optional, if needed in backend)
   - **Name**: `STRIPE_PUBLISHABLE_KEY`
   - **Secret value**: Paste your `pk_test_...` or `pk_live_...`
   - **Click "CREATE SECRET"**

4. **Grant Access**:
   - Click on each secret
   - Go to "PERMISSIONS" tab
   - Click "ADD PRINCIPAL"
   - Add: `firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com`
   - Role: `Secret Manager Secret Accessor`
   - Click "SAVE"

### Using gcloud CLI (Alternative):

```bash
# Set your project
gcloud config set project apex-seo-ffbd0

# Create Stripe Secret Key
echo -n "sk_test_YOUR_KEY_HERE" | gcloud secrets create STRIPE_SECRET_KEY --data-file=-

# Create Stripe Publishable Key (optional)
echo -n "pk_test_YOUR_KEY_HERE" | gcloud secrets create STRIPE_PUBLISHABLE_KEY --data-file=-

# Grant access to Firebase service account
gcloud secrets add-iam-policy-binding STRIPE_SECRET_KEY \
  --member="serviceAccount:firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding STRIPE_PUBLISHABLE_KEY \
  --member="serviceAccount:firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Step 5: Store Price ID in Firebase Functions Config

The Price ID can be stored as an environment variable or in Secret Manager. For simplicity, we'll use Secret Manager:

```bash
# Create Price ID secret
echo -n "price_YOUR_PRICE_ID_HERE" | gcloud secrets create STRIPE_PRICE_ID --data-file=-

# Grant access
gcloud secrets add-iam-policy-binding STRIPE_PRICE_ID \
  --member="serviceAccount:firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Summary: What You Need

After setup, you should have:

1. **Product Name**: `SEO Automation Seat`
2. **Price ID**: `price_...` (from Stripe Dashboard)
3. **Publishable Key**: `pk_test_...` or `pk_live_...` (stored in Secret Manager as `STRIPE_PUBLISHABLE_KEY`)
4. **Secret Key**: `sk_test_...` or `sk_live_...` (stored in Secret Manager as `STRIPE_SECRET_KEY`)
5. **Price ID**: `price_...` (stored in Secret Manager as `STRIPE_PRICE_ID`)

## Pricing Structure

- **Sites 1-2**: $129/month each
- **Sites 3+**: $99/month each

Example calculations:
- 1 site = $129/month
- 2 sites = $258/month ($129 × 2)
- 3 sites = $387/month ($129 × 2 + $99 × 1)
- 5 sites = $591/month ($129 × 2 + $99 × 3)

## Next Steps

1. Install Stripe SDK: `cd functions && npm install stripe`
2. Add helper functions to `functions/src/index.ts` (see code below)
3. Update `createSiteCallable` to check billing limits
4. Create subscription management functions
