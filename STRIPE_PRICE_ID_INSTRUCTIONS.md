# How to Find Your Stripe Price ID

## Quick Steps

1. **Go to Stripe Dashboard**: https://dashboard.stripe.com/products
2. **Click on your product**: "SEO Automation Seat" (Product ID: `prod_TTQL1Ig5auSqfv`)
3. **Scroll to the "Pricing" section**
4. **Look for the Price ID**: It will be displayed as `price_...` (e.g., `price_1ABC123xyz...`)
5. **Copy the Price ID**

## Visual Guide

In the Stripe Dashboard:
- Product Page → Scroll down to "Pricing" section
- You'll see your graduated pricing tiers
- Each tier has a **Price ID** displayed next to it
- **Important**: For graduated pricing, you typically have ONE Price ID that represents the entire pricing structure

## Store the Price ID

Once you have the Price ID, store it in Google Secret Manager:

```bash
# Using gcloud CLI
echo -n "price_YOUR_PRICE_ID_HERE" | gcloud secrets create STRIPE_PRICE_ID --data-file=-

# Grant access
gcloud secrets add-iam-policy-binding STRIPE_PRICE_ID \
  --member="serviceAccount:firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Or use the Google Cloud Console:
1. Go to: https://console.cloud.google.com/security/secret-manager
2. Click "CREATE SECRET"
3. Name: `STRIPE_PRICE_ID`
4. Value: Your `price_...` ID
5. Grant access to Firebase service account

## Important Notes

- **Graduated Pricing**: With graduated pricing, Stripe automatically calculates the correct amount based on quantity. You only need ONE Price ID for the entire pricing structure.
- **Test vs Live**: Make sure you're copying the Price ID from the correct mode (Test or Live) that matches your `STRIPE_SECRET_KEY`.
