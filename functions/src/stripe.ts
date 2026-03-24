import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import {SecretManagerServiceClient} from "@google-cloud/secret-manager";
import { getPriceIdForCountry, getCurrencyForCountry } from "./constants/prices";

// Secret Manager client
const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = process.env.GCLOUD_PROJECT || "apex-seo-ffbd0";

// Cache for Stripe secret key
let cachedStripeSecretKey: string | null = null;

/**
 * Get Stripe Secret Key from Secret Manager
 * Caches the result to avoid repeated API calls
 */
async function getStripeSecretKey(): Promise<string> {
  if (cachedStripeSecretKey) {
    return cachedStripeSecretKey;
  }

  const secretPath = `projects/${PROJECT_ID}/secrets/STRIPE_SECRET_KEY/versions/latest`;

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: secretPath,
    });

    const secretKey = version.payload?.data?.toString();
    if (secretKey && secretKey.length > 0) {
      cachedStripeSecretKey = secretKey;
      return secretKey;
    }
  } catch (error: any) {
    console.warn("Failed to fetch STRIPE_SECRET_KEY from Secret Manager:", error.message);
  }

  // Fallback to environment variable
  if (process.env.STRIPE_SECRET_KEY) {
    cachedStripeSecretKey = process.env.STRIPE_SECRET_KEY;
    return cachedStripeSecretKey;
  }

  throw new Error("STRIPE_SECRET_KEY not found in Secret Manager or environment variables");
}

/**
 * Get Stripe Price ID from Secret Manager (DEPRECATED - use getPriceIdForCountry instead)
 * Kept for backward compatibility but not currently used
 * @return {Promise<string>} Stripe Price ID
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Unused but kept for backward compatibility
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getStripePriceId(): Promise<string> {
  const secretPath = `projects/${PROJECT_ID}/secrets/STRIPE_PRICE_ID/versions/latest`;

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: secretPath,
    });

    const priceId = version.payload?.data?.toString();
    if (priceId && priceId.length > 0) {
      return priceId;
    }
  } catch (error: any) {
    console.warn("Failed to fetch STRIPE_PRICE_ID from Secret Manager:", error.message);
  }

  // Fallback to environment variable
  if (process.env.STRIPE_PRICE_ID) {
    return process.env.STRIPE_PRICE_ID;
  }

  // Default to USD price if no secret found
  return getPriceIdForCountry("US");
}

/**
 * Initialize Stripe client
 */
async function getStripeClient(): Promise<Stripe> {
  const secretKey = await getStripeSecretKey();
  return new Stripe(secretKey, {
    apiVersion: "2025-12-15.clover",
  });
}

/**
 * Get or create a Stripe customer for an agency
 * @param {string} agencyId - The Firestore agency document ID
 * @param {string} email - The customer email address
 * @return {Promise<string>} The Stripe customer ID
 */
export async function getOrCreateCustomer(
  agencyId: string,
  email: string
): Promise<string> {
  const stripe = await getStripeClient();
  const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
  const agencyDoc = await agencyRef.get();

  if (!agencyDoc.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Agency not found"
    );
  }

  const agencyData = agencyDoc.data();
  if (!agencyData) {
    throw new functions.https.HttpsError(
      "not-found",
      "Agency data is empty"
    );
  }

  // Check if customer ID already exists
  if (agencyData.stripeCustomerId) {
    try {
      // Verify the customer still exists in Stripe
      await stripe.customers.retrieve(agencyData.stripeCustomerId);
      return agencyData.stripeCustomerId;
    } catch (error: any) {
      console.warn(
        `[getOrCreateCustomer] Customer ${agencyData.stripeCustomerId} not found in Stripe, creating new one`
      );
      // Customer doesn't exist, continue to create new one
    }
  }

  // Create new customer in Stripe
  const customer = await stripe.customers.create({
    email: email,
    metadata: {
      agencyId: agencyId,
    },
  });

  // Save customer ID to agency document
  await agencyRef.update({
    stripeCustomerId: customer.id,
  });

  console.log(`[getOrCreateCustomer] ✅ Created Stripe customer ${customer.id} for agency ${agencyId}`);
  return customer.id;
}

/**
 * Callable Function: Create Checkout Session
 * Creates a Stripe Checkout session for subscription
 */
export const createCheckoutSessionCallable = functions
  .region("australia-southeast1")
  .runWith({
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_PRICE_ID"],
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {agencyId, quantity, successUrl, cancelUrl, country} = data;

    if (!agencyId || !quantity || !successUrl || !cancelUrl) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: agencyId, quantity, successUrl, cancelUrl"
      );
    }

    if (typeof quantity !== "number" || quantity < 1) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Quantity must be a positive number"
      );
    }

    try {
      const stripe = await getStripeClient();

      // Get country from input or fetch from agency document
      let countryCode = country;
      if (!countryCode) {
        const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
        const agencyDoc = await agencyRef.get();
        if (agencyDoc.exists) {
          const agencyData = agencyDoc.data();
          countryCode = agencyData?.country;
        }
      }

      // Get price ID based on country
      const priceId = getPriceIdForCountry(countryCode);
      const currency = getCurrencyForCountry(countryCode);

      console.log(
        `[createCheckoutSessionCallable] Using price ID ${priceId} for country ${countryCode || "unknown"} (currency: ${currency})`
      );

      // Get user email for customer creation
      const userDoc = await admin.firestore()
        .collection("users")
        .doc(context.auth.uid)
        .get();

      if (!userDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "User document not found"
        );
      }

      const userData = userDoc.data();
      const userEmail = userData?.email || context.auth.token.email;

      if (!userEmail) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "User email not found"
        );
      }

      // Get or create customer
      const customerId = await getOrCreateCustomer(agencyId, userEmail);

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [
          {
            price: priceId,
            quantity: quantity,
          },
        ],
        metadata: {
          agencyId: agencyId,
          currency: currency,
          country: countryCode || "unknown",
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
      });

      console.log(
        `[createCheckoutSessionCallable] ✅ Created checkout session ${session.id} for agency ${agencyId}`
      );

      return {
        url: session.url,
        sessionId: session.id,
      };
    } catch (error: any) {
      console.error("[createCheckoutSessionCallable] ❌ Error:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to create checkout session",
        error.message
      );
    }
  });

/**
 * Callable Function: Create Billing Portal Session
 * Creates a Stripe Billing Portal session for managing subscription
 * Automatically gets agencyId from the authenticated user's agency
 */
export const createPortalSessionCallable = functions
  .region("australia-southeast1")
  .runWith({
    secrets: ["STRIPE_SECRET_KEY"],
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const userId = context.auth.uid;
    const {returnUrl} = data;

    if (!returnUrl) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required field: returnUrl"
      );
    }

    try {
      const stripe = await getStripeClient();

      // Get user document to find agencyId
      const userRef = admin.firestore().collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "User document not found"
        );
      }

      const userData = userDoc.data();
      const agencyId = userData?.agencyId;

      if (!agencyId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "User does not have an agency. Please initialize your agency first."
        );
      }

      // Get agency document
      const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
      const agencyDoc = await agencyRef.get();

      if (!agencyDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Agency not found"
        );
      }

      const agencyData = agencyDoc.data();
      if (!agencyData?.stripeCustomerId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Agency does not have a Stripe customer. Please create a subscription first."
        );
      }

      // Create billing portal session
      const session = await stripe.billingPortal.sessions.create({
        customer: agencyData.stripeCustomerId,
        return_url: returnUrl,
      });

      console.log(
        `[createPortalSessionCallable] ✅ Created portal session ${session.id} for agency ${agencyId}`
      );

      return {
        url: session.url,
      };
    } catch (error: any) {
      console.error("[createPortalSessionCallable] ❌ Error:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to create portal session",
        error.message
      );
    }
  });

/**
 * Callable Function: Increment Subscription Quantity
 * Instantly adds one site to the subscription and charges pro-rata
 */
export const incrementSubscriptionCallable = functions
  .region("australia-southeast1")
  .runWith({
    secrets: ["STRIPE_SECRET_KEY"],
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {agencyId} = data;

    if (!agencyId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required field: agencyId"
      );
    }

    try {
      const stripe = await getStripeClient();

      // Get agency document
      const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
      const agencyDoc = await agencyRef.get();

      if (!agencyDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Agency not found"
        );
      }

      const agencyData = agencyDoc.data();
      if (!agencyData?.stripeSubscriptionId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Agency does not have an active Stripe subscription. Please create a subscription first."
        );
      }

      // Fetch subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(
        agencyData.stripeSubscriptionId
      );

      if (subscription.status === "canceled" || subscription.status === "unpaid") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Subscription is ${subscription.status}. Cannot increment quantity.`
        );
      }

      // Get the subscription item (assuming single item for now)
      if (!subscription.items.data || subscription.items.data.length === 0) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Subscription has no items"
        );
      }

      const subscriptionItem = subscription.items.data[0];
      const currentQuantity = subscriptionItem.quantity || 1;
      const newQuantity = currentQuantity + 1;

      // Update subscription with new quantity
      // Using 'always_invoice' to charge pro-rata immediately
      const updatedSubscription = await stripe.subscriptions.update(
        agencyData.stripeSubscriptionId,
        {
          items: [
            {
              id: subscriptionItem.id,
              quantity: newQuantity,
            },
          ],
          proration_behavior: "always_invoice",
        }
      );

      console.log(
        `[incrementSubscriptionCallable] ✅ Updated subscription ${agencyData.stripeSubscriptionId} from ${currentQuantity} to ${newQuantity} sites`
      );

      return {
        success: true,
        newQuantity: newQuantity,
        subscriptionId: updatedSubscription.id,
        currentPeriodEnd: (updatedSubscription as any).current_period_end,
      };
    } catch (error: any) {
      console.error("[incrementSubscriptionCallable] ❌ Error:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to increment subscription",
        error.message
      );
    }
  });

/**
 * Get Stripe Webhook Secret from Secret Manager
 */
async function getStripeWebhookSecret(): Promise<string> {
  const secretPath = `projects/${PROJECT_ID}/secrets/STRIPE_WEBHOOK_SECRET/versions/latest`;

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: secretPath,
    });

    const webhookSecret = version.payload?.data?.toString();
    if (webhookSecret && webhookSecret.length > 0) {
      return webhookSecret;
    }
  } catch (error: any) {
    console.warn("Failed to fetch STRIPE_WEBHOOK_SECRET from Secret Manager:", error.message);
  }

  // Fallback to environment variable
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    return process.env.STRIPE_WEBHOOK_SECRET;
  }

  throw new Error("STRIPE_WEBHOOK_SECRET not found in Secret Manager or environment variables");
}

/**
 * HTTP Function: Stripe Webhook Handler
 * Handles Stripe webhook events to sync payment status with Firestore
 */
export const handleStripeWebhook = functions
  .region("australia-southeast1")
  .runWith({
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .https.onRequest(async (req, res) => {
    // Only allow POST requests
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const stripeSignature = req.headers["stripe-signature"];
    if (!stripeSignature) {
      console.error("[handleStripeWebhook] ❌ Missing stripe-signature header");
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    try {
      const stripe = await getStripeClient();
      const webhookSecret = await getStripeWebhookSecret();

      // Get raw body for signature verification
      // Firebase Functions v2 automatically parses JSON, so we need to reconstruct
      // the raw body or use req.rawBody if available
      // Note: For production, you may need to use Express with express.raw() middleware
      let rawBody: string | Buffer;
      if ((req as any).rawBody) {
        rawBody = (req as any).rawBody;
      } else if (typeof req.body === "string") {
        rawBody = req.body;
      } else {
        // Reconstruct JSON string from parsed body (not ideal but works for verification)
        rawBody = JSON.stringify(req.body);
      }

      // Verify webhook signature
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          stripeSignature as string,
          webhookSecret
        );
      } catch (err: any) {
        console.error("[handleStripeWebhook] ❌ Webhook signature verification failed:", err.message);
        res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
        return;
      }

      console.log(`[handleStripeWebhook] ✅ Received event: ${event.type}`);

      // Handle different event types
      switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const agencyId = session.metadata?.agencyId;
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;

        if (!agencyId) {
          console.error("[handleStripeWebhook] ❌ Missing agencyId in checkout.session.completed");
          res.status(400).json({ error: "Missing agencyId in metadata" });
          return;
        }

        if (!subscriptionId || !customerId) {
          console.error("[handleStripeWebhook] ❌ Missing subscription or customer ID");
          res.status(400).json({ error: "Missing subscription or customer ID" });
          return;
        }

        // Update agency document
        const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
        await agencyRef.update({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          subscriptionStatus: "active",
          billingType: "stripe",
          subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(
          `[handleStripeWebhook] ✅ Updated agency ${agencyId} with subscription ${subscriptionId}`
        );
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;

        // Find agency by subscription ID
        const agenciesSnapshot = await admin
          .firestore()
          .collection("agencies")
          .where("stripeSubscriptionId", "==", subscriptionId)
          .limit(1)
          .get();

        if (agenciesSnapshot.empty) {
          console.warn(
            `[handleStripeWebhook] ⚠️ No agency found for subscription ${subscriptionId}`
          );
          res.json({ received: true });
          return;
        }

        const agencyDoc = agenciesSnapshot.docs[0];
        const agencyId = agencyDoc.id;

        // Determine subscription status
        // Check if subscription is in trial period
        const isTrial = subscription.status === "trialing" ||
                       (subscription.trial_end && subscription.trial_end * 1000 > Date.now());

        let subscriptionStatus = "active";
        if (isTrial) {
          subscriptionStatus = "trial";
        } else if (subscription.status === "past_due") {
          subscriptionStatus = "past_due";
        } else if (subscription.status === "canceled" || subscription.status === "unpaid") {
          subscriptionStatus = subscription.status;
        } else if (subscription.status === "active") {
          subscriptionStatus = "active";
        }

        // Get quantity from subscription items
        const quantity = subscription.items.data[0]?.quantity || 1;

        // Prepare update object
        const updateData: any = {
          subscriptionStatus: subscriptionStatus,
          siteCountLimit: quantity,
          subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Update trial end date if subscription is in trial
        if (isTrial && subscription.trial_end) {
          updateData.trialEndsAt = admin.firestore.Timestamp.fromDate(
            new Date(subscription.trial_end * 1000)
          );
        } else {
          // Clear trial end date if trial has ended
          updateData.trialEndsAt = admin.firestore.FieldValue.delete();
        }

        // Update agency document
        await agencyDoc.ref.update(updateData);

        console.log(
          `[handleStripeWebhook] ✅ Updated agency ${agencyId}: status=${subscriptionStatus}, quantity=${quantity}, trial=${isTrial}`
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;

        // Find agency by subscription ID
        const agenciesSnapshot = await admin
          .firestore()
          .collection("agencies")
          .where("stripeSubscriptionId", "==", subscriptionId)
          .limit(1)
          .get();

        if (agenciesSnapshot.empty) {
          console.warn(
            `[handleStripeWebhook] ⚠️ No agency found for subscription ${subscriptionId}`
          );
          res.json({ received: true });
          return;
        }

        const agencyDoc = agenciesSnapshot.docs[0];
        const agencyId = agencyDoc.id;

        // Update agency document
        await agencyDoc.ref.update({
          subscriptionStatus: "canceled",
          subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[handleStripeWebhook] ✅ Marked agency ${agencyId} subscription as canceled`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // Invoice.subscription can be a string ID or expanded Subscription object
        const subscriptionId = (invoice as any).subscription ?
          (typeof (invoice as any).subscription === "string" ?
            (invoice as any).subscription :
            (invoice as any).subscription?.id) :
          null;

        if (!subscriptionId) {
          console.warn("[handleStripeWebhook] ⚠️ Invoice has no subscription ID");
          res.json({ received: true });
          return;
        }

        // Find agency by subscription ID
        const agenciesSnapshot = await admin
          .firestore()
          .collection("agencies")
          .where("stripeSubscriptionId", "==", subscriptionId)
          .limit(1)
          .get();

        if (agenciesSnapshot.empty) {
          console.warn(
            `[handleStripeWebhook] ⚠️ No agency found for subscription ${subscriptionId}`
          );
          res.json({ received: true });
          return;
        }

        const agencyDoc = agenciesSnapshot.docs[0];
        const agencyId = agencyDoc.id;

        // Update agency document
        await agencyDoc.ref.update({
          subscriptionStatus: "past_due",
          subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[handleStripeWebhook] ✅ Marked agency ${agencyId} subscription as past_due`);
        break;
      }

      default:
        console.log(`[handleStripeWebhook] ℹ️ Unhandled event type: ${event.type}`);
      }

      // Return success response to Stripe
      res.json({ received: true });
    } catch (error: any) {
      console.error("[handleStripeWebhook] ❌ Error processing webhook:", error);
      res.status(500).json({ error: "Internal server error", message: error.message });
    }
  });

/**
 * Callable Function: Create Trial Subscription
 * Creates a Stripe subscription with a 7-day free trial
 * Requires payment method to be attached but won't charge until trial ends
 */
export const createTrialSubscriptionCallable = functions
  .region("australia-southeast1")
  .runWith({
    secrets: ["STRIPE_SECRET_KEY"],
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {email, paymentMethodId, priceId, country} = data;

    // priceId is now optional - we'll determine it from country if not provided
    if (!email || !paymentMethodId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: email, paymentMethodId"
      );
    }

    try {
      const stripe = await getStripeClient();

      // Get user document to find agencyId
      const userDoc = await admin.firestore()
        .collection("users")
        .doc(context.auth.uid)
        .get();

      if (!userDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "User document not found"
        );
      }

      const userData = userDoc.data();
      const agencyId = userData?.agencyId;

      if (!agencyId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "User does not have an agency. Please initialize your agency first."
        );
      }

      // Get country from input or fetch from agency document
      let countryCode = country;
      if (!countryCode) {
        const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
        const agencyDoc = await agencyRef.get();
        if (agencyDoc.exists) {
          const agencyData = agencyDoc.data();
          countryCode = agencyData?.country;
        }
      }

      // Determine price ID - use provided priceId or get from country
      const finalPriceId = priceId || getPriceIdForCountry(countryCode);
      const currency = getCurrencyForCountry(countryCode);

      console.log(
        `[createTrialSubscriptionCallable] Using price ID ${finalPriceId} for country ${countryCode || "unknown"} (currency: ${currency})`
      );

      // Get or create Stripe customer
      const customerId = await getOrCreateCustomer(agencyId, email);

      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      console.log(
        `[createTrialSubscriptionCallable] ✅ Attached payment method ${paymentMethodId} to customer ${customerId}`
      );

      // Set payment method as default for invoices
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      console.log(
        `[createTrialSubscriptionCallable] ✅ Set payment method ${paymentMethodId} as default for customer ${customerId}`
      );

      // Create subscription with 7-day trial
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{price: finalPriceId}],
        trial_period_days: 7,
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
        metadata: {
          currency: currency,
          country: countryCode || "unknown",
        },
      });

      console.log(
        `[createTrialSubscriptionCallable] ✅ Created subscription ${subscription.id} with 7-day trial for agency ${agencyId}`
      );

      // Calculate trial end date (7 days from now)
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);

      // Update agency document with subscription info
      const agencyRef = admin.firestore().collection("agencies").doc(agencyId);
      await agencyRef.update({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: "trial",
        trialEndsAt: admin.firestore.Timestamp.fromDate(trialEndsAt),
        billingType: "stripe",
        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `[createTrialSubscriptionCallable] ✅ Updated agency ${agencyId} with trial subscription info`
      );

      return {
        success: true,
        subscriptionId: subscription.id,
        customerId: customerId,
        trialEndsAt: trialEndsAt.toISOString(),
        status: subscription.status,
      };
    } catch (error: any) {
      console.error("[createTrialSubscriptionCallable] ❌ Error:", error);

      // Handle Stripe-specific errors
      if (error.type && error.type.startsWith("Stripe")) {
        throw new functions.https.HttpsError(
          "internal",
          `Stripe error: ${error.message}`,
          error.message
        );
      }

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        "internal",
        "Failed to create trial subscription",
        error.message
      );
    }
  });
