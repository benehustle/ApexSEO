# Stripe Webhook Setup Guide

## Overview

The `handleStripeWebhook` function handles Stripe webhook events to sync payment status with Firestore.

## Prerequisites

1. **Stripe Webhook Secret**: You need to create a webhook endpoint in Stripe and get the signing secret.

## Step 1: Create Webhook Endpoint in Stripe Dashboard

1. **Go to Stripe Dashboard**: https://dashboard.stripe.com/webhooks
2. **Click "Add endpoint"**
3. **Endpoint URL**: 
   - After deploying, your function URL will be:
   - `https://australia-southeast1-apex-seo-ffbd0.cloudfunctions.net/handleStripeWebhook`
   - Replace `apex-seo-ffbd0` with your actual project ID
4. **Select events to listen to**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. **Click "Add endpoint"**
6. **Copy the "Signing secret"**: It starts with `whsec_...`

## Step 2: Store Webhook Secret in Secret Manager

```bash
# Using gcloud CLI
echo -n "whsec_YOUR_WEBHOOK_SECRET_HERE" | gcloud secrets create STRIPE_WEBHOOK_SECRET --data-file=-

# Grant access
gcloud secrets add-iam-policy-binding STRIPE_WEBHOOK_SECRET \
  --member="serviceAccount:firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Or use Google Cloud Console:
1. Go to: https://console.cloud.google.com/security/secret-manager
2. Click "CREATE SECRET"
3. Name: `STRIPE_WEBHOOK_SECRET`
4. Value: Your `whsec_...` secret from Stripe
5. Grant access to Firebase service account

## Step 3: Deploy the Function

```bash
cd functions
firebase deploy --only functions:handleStripeWebhook
```

## Step 4: Update Webhook URL in Stripe

1. Go back to Stripe Dashboard → Webhooks
2. Click on your endpoint
3. Update the URL with the actual deployed function URL
4. Click "Save"

## Step 5: Test the Webhook

1. In Stripe Dashboard → Webhooks → Your endpoint
2. Click "Send test webhook"
3. Select an event type (e.g., `checkout.session.completed`)
4. Click "Send test webhook"
5. Check Firebase Functions logs to verify it's working

## Events Handled

### `checkout.session.completed`
- **Trigger**: When a customer completes checkout
- **Action**: 
  - Updates `agencies/{agencyId}` with:
    - `stripeCustomerId`
    - `stripeSubscriptionId`
    - `subscriptionStatus: 'active'`
    - `billingType: 'stripe'`

### `customer.subscription.updated`
- **Trigger**: When subscription quantity or status changes
- **Action**:
  - Updates `subscriptionStatus` (active, past_due, etc.)
  - Updates `siteCountLimit` with current quantity

### `customer.subscription.deleted`
- **Trigger**: When subscription is canceled
- **Action**:
  - Sets `subscriptionStatus: 'canceled'`

### `invoice.payment_failed`
- **Trigger**: When payment fails
- **Action**:
  - Sets `subscriptionStatus: 'past_due'`

## Important Notes

### Raw Body Handling

Firebase Functions v2 automatically parses JSON bodies, which can cause issues with Stripe webhook signature verification. The current implementation attempts to use `req.rawBody` if available, but you may need to configure Express middleware for proper raw body handling.

**If you encounter signature verification errors**, you may need to:

1. Use Express with raw body middleware (recommended for production)
2. Or configure Firebase Functions to preserve raw body

### Testing in Development

For local testing, you can use Stripe CLI:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local function
stripe listen --forward-to http://localhost:5001/apex-seo-ffbd0/australia-southeast1/handleStripeWebhook
```

## Troubleshooting

### "Webhook signature verification failed"

- **Cause**: Raw body not available or incorrect webhook secret
- **Solution**: 
  1. Verify `STRIPE_WEBHOOK_SECRET` is correct in Secret Manager
  2. Ensure you're using the correct secret for your environment (test vs live)
  3. Check that the webhook URL matches exactly in Stripe Dashboard

### "Missing agencyId in metadata"

- **Cause**: `createCheckoutSessionCallable` didn't include `agencyId` in metadata
- **Solution**: Ensure `createCheckoutSessionCallable` sets `metadata.agencyId` when creating the session

### "No agency found for subscription"

- **Cause**: Agency document doesn't have `stripeSubscriptionId` set
- **Solution**: This is normal for some events. The webhook will still return success to Stripe.

## Monitoring

Check Firebase Functions logs:

```bash
firebase functions:log --only handleStripeWebhook
```

Look for:
- `✅ Received event: [event_type]` - Success
- `❌` - Errors
- `⚠️` - Warnings
