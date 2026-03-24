# Stripe Implementation Summary

## ✅ What's Already Done

1. **Helper Functions Added** to `functions/src/index.ts`:
   - `getStripeSecretKey()` - Retrieves Stripe secret key from Secret Manager
   - `getStripePublishableKey()` - Retrieves Stripe publishable key from Secret Manager
   - `getStripePriceId()` - Retrieves Stripe price ID from Secret Manager
   - All functions follow the same caching pattern as your other API key helpers

2. **Cache Variables Added**:
   - `cachedStripeSecretKey`
   - `cachedStripePublishableKey`
   - `cachedStripePriceId`

## 📋 Next Steps

### Step 1: Install Stripe SDK

```bash
cd functions
npm install stripe
npm install --save-dev @types/stripe
```

### Step 2: Create Stripe Product in Dashboard

Follow the detailed guide in `STRIPE_SETUP_GUIDE.md` to:
1. Create product "SEO Automation Seat"
2. Set up graduated pricing (2 tiers: $129 for first 2 sites, $99 for 3+)
3. Get your Price ID (`price_...`)
4. Get your API keys (`sk_...` and `pk_...`)

### Step 3: Store Keys in Secret Manager

Create these secrets in Google Cloud Secret Manager:

1. **STRIPE_SECRET_KEY**
   - Value: Your `sk_test_...` or `sk_live_...` key
   - Grant access to: `firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com`

2. **STRIPE_PUBLISHABLE_KEY** (optional, if needed in backend)
   - Value: Your `pk_test_...` or `pk_live_...` key
   - Grant access to: `firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com`

3. **STRIPE_PRICE_ID**
   - Value: Your `price_...` ID from the product
   - Grant access to: `firebase-adminsdk@apex-seo-ffbd0.iam.gserviceaccount.com`

### Step 4: Update `createSiteCallable` to Check Billing

Location: `functions/src/index.ts` around line 6922

Replace the TODO comment with actual Stripe subscription check:

```typescript
// Step 3: Check billing limits
if (agencyData.billingType !== "internal") {
  const stripeSecretKey = await getStripeSecretKey();
  if (!stripeSecretKey) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Stripe not configured. Please contact support."
    );
  }

  const Stripe = require("stripe");
  const stripe = new Stripe(stripeSecretKey);

  // Get or create subscription for this agency
  let subscription = await getOrCreateStripeSubscription(agencyId, stripe);
  
  // Count current sites for this agency
  const sitesSnapshot = await admin.firestore()
    .collection("sites")
    .where("agencyId", "==", agencyId)
    .get();
  
  const currentSiteCount = sitesSnapshot.size;
  const newSiteCount = currentSiteCount + 1;

  // Calculate required quantity based on pricing tiers
  // Sites 1-2: $129 each, Sites 3+: $99 each
  // For graduated pricing, we need to update the subscription quantity
  const priceId = await getStripePriceId();
  if (!priceId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Stripe price ID not configured"
    );
  }

  // Update subscription with new quantity
  await stripe.subscriptions.update(subscription.id, {
    items: [{
      id: subscription.items.data[0].id,
      price: priceId,
      quantity: newSiteCount,
    }],
  });

  console.log(`[createSiteCallable] ✅ Updated Stripe subscription to ${newSiteCount} sites`);
}
```

### Step 5: Create Helper Function for Subscription Management

Add this function to `functions/src/index.ts`:

```typescript
/**
 * Get or create Stripe subscription for an agency
 */
async function getOrCreateStripeSubscription(
  agencyId: string,
  stripe: any
): Promise<any> {
  const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
  const agencyDoc = await agencyRef.get();
  const agencyData = agencyDoc.data();

  // Check if subscription already exists
  if (agencyData?.stripeSubscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(
        agencyData.stripeSubscriptionId
      );
      if (subscription && subscription.status !== "canceled") {
        return subscription;
      }
    } catch (error) {
      console.warn(`[getOrCreateStripeSubscription] Failed to retrieve subscription: ${error}`);
      // Continue to create new subscription
    }
  }

  // Create new subscription
  const priceId = await getStripePriceId();
  if (!priceId) {
    throw new Error("Stripe price ID not configured");
  }

  // Get customer ID or create customer
  let customerId = agencyData?.stripeCustomerId;
  if (!customerId) {
    // You'll need to get customer email from user document
    const userRef = admin.firestore().collection("users").doc(agencyData?.ownerId);
    const userDoc = await userRef.get();
    const userEmail = userDoc.data()?.email || "customer@example.com";

    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: {
        agencyId: agencyId,
      },
    });
    customerId = customer.id;

    // Save customer ID to agency
    await agencyRef.update({
      stripeCustomerId: customerId,
    });
  }

  // Count existing sites
  const sitesSnapshot = await admin.firestore()
    .collection("sites")
    .where("agencyId", "==", agencyId)
    .get();
  const quantity = sitesSnapshot.size + 1; // +1 for the site being created

  // Create subscription
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{
      price: priceId,
      quantity: quantity,
    }],
    metadata: {
      agencyId: agencyId,
    },
  });

  // Save subscription ID to agency
  await agencyRef.update({
    stripeSubscriptionId: subscription.id,
  });

  return subscription;
}
```

## 📝 Important Notes

1. **Graduated Pricing**: Stripe's graduated pricing model automatically calculates the correct amount based on quantity:
   - Quantity 1-2: $129 each
   - Quantity 3+: $99 each
   - You just need to update the `quantity` in the subscription

2. **Test vs Live Mode**: 
   - Use `sk_test_...` keys for development
   - Use `sk_live_...` keys for production
   - Store them as separate secrets or use environment detection

3. **Subscription Updates**: When sites are added/removed, you'll need to:
   - Count current sites for the agency
   - Update subscription quantity
   - Stripe will automatically calculate the correct price based on graduated tiers

4. **Webhooks**: You'll eventually want to set up Stripe webhooks to handle:
   - Payment failures
   - Subscription cancellations
   - Subscription updates

## 🔗 Useful Resources

- [Stripe Graduated Pricing Docs](https://stripe.com/docs/billing/subscriptions/tiers)
- [Stripe Node.js SDK](https://stripe.com/docs/api/node)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
