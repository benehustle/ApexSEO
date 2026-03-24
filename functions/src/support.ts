import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Configure region to match Firestore
const region = functions.region("australia-southeast1");

/**
 * Check if a user is a super admin based on their email domain
 * Super admins are users with emails ending in:
 * - @spotonwebsites.com.au
 * - @myapex.io
 * @param {string|null|undefined} email - User email address
 * @return {boolean} True if user is a super admin
 */
function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;

  const normalizedEmail = email.toLowerCase().trim();
  return (
    normalizedEmail.endsWith("@spotonwebsites.com.au") ||
    normalizedEmail.endsWith("@myapex.io")
  );
}

/**
 * Callable Function: Create Ticket
 * Creates a new support ticket with the first message
 *
 * @param data - { agencyId, subject, message }
 * @returns { ticketId }
 */
export const createTicketCallable = region.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const userId = context.auth.uid;
  const {agencyId, subject, message} = data;

  // Validation
  if (!agencyId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: agencyId"
    );
  }

  if (!subject || !subject.trim()) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: subject"
    );
  }

  if (!message || !message.trim()) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: message"
    );
  }

  try {
    // Verify user has access to this agency
    const userRef = admin.firestore().collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "User document not found"
      );
    }

    const userData = userDoc.data();
    const userEmail = context.auth.token.email;

    if (userData?.agencyId !== agencyId) {
      // Check if user is super admin (can create tickets for any agency)
      if (!isSuperAdmin(userEmail)) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "User does not have access to this agency"
        );
      }
    }

    // Create ticket document
    const ticketRef = admin.firestore().collection("tickets").doc();
    const ticketId = ticketRef.id;

    const ticketData = {
      agencyId,
      subject: subject.trim(),
      status: "open" as const,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: userId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Create ticket and first message in a batch
    const batch = admin.firestore().batch();

    batch.set(ticketRef, ticketData);

    // Create first message in subcollection
    const messageRef = ticketRef.collection("messages").doc();
    batch.set(messageRef, {
      sender: "user" as const,
      text: message.trim(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    console.log(`[createTicketCallable] ✅ Created ticket ${ticketId} for agency ${agencyId}`);

    // Optional: Log notification (can be extended to send email/push notification)
    console.log(`[createTicketCallable] 📧 New ticket created: ${ticketId} - ${subject}`);

    return {
      success: true,
      ticketId,
    };
  } catch (error: any) {
    console.error("[createTicketCallable] ❌ Error:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to create ticket",
      error.message
    );
  }
});

/**
 * Callable Function: Reply to Ticket
 * Adds a message to a ticket and updates status
 *
 * @param data - { ticketId, message, isAdmin }
 * @returns { success: true }
 */
export const replyToTicketCallable = region.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const userId = context.auth.uid;
  const {ticketId, message, isAdmin} = data;

  // Validation
  if (!ticketId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: ticketId"
    );
  }

  if (!message || !message.trim()) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: message"
    );
  }

  if (typeof isAdmin !== "boolean") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: isAdmin (boolean)"
    );
  }

  try {
    // Get ticket
    const ticketRef = admin.firestore().collection("tickets").doc(ticketId);
    const ticketDoc = await ticketRef.get();

    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Ticket not found"
      );
    }

    const ticketData = ticketDoc.data();
    const agencyId = ticketData?.agencyId;

    // Verify permissions
    const userRef = admin.firestore().collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "User document not found"
      );
    }

    const userData = userDoc.data();
    const userEmail = context.auth.token.email;
    const isUserSuperAdmin = isSuperAdmin(userEmail);

    // Check if user has permission
    if (isAdmin && !isUserSuperAdmin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only super admins can send admin replies"
      );
    }

    if (!isAdmin && userData?.agencyId !== agencyId && !isUserSuperAdmin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "User does not have access to this ticket"
      );
    }

    // Determine new status based on sender
    let newStatus: "open" | "replied" | "closed" = ticketData?.status || "open";
    if (isAdmin) {
      // Admin reply -> set to 'replied'
      newStatus = "replied";
    } else {
      // User reply -> set to 'open' (if it was closed, reopen it)
      if (newStatus === "closed") {
        newStatus = "open";
      } else {
        newStatus = "open";
      }
    }

    // Add message and update ticket in a batch
    const batch = admin.firestore().batch();

    // Create message
    const messageRef = ticketRef.collection("messages").doc();
    batch.set(messageRef, {
      sender: isAdmin ? ("admin" as const) : ("user" as const),
      text: message.trim(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update ticket status and timestamp
    batch.update(ticketRef, {
      status: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    console.log(`[replyToTicketCallable] ✅ Added ${isAdmin ? "admin" : "user"} reply to ticket ${ticketId}, status: ${newStatus}`);

    return {
      success: true,
    };
  } catch (error: any) {
    console.error("[replyToTicketCallable] ❌ Error:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to reply to ticket",
      error.message
    );
  }
});

/**
 * Callable Function: Close Ticket
 * Sets ticket status to 'closed'
 *
 * @param data - { ticketId }
 * @returns { success: true }
 */
export const closeTicketCallable = region.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const userId = context.auth.uid;
  const {ticketId} = data;

  // Validation
  if (!ticketId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required field: ticketId"
    );
  }

  try {
    // Get ticket
    const ticketRef = admin.firestore().collection("tickets").doc(ticketId);
    const ticketDoc = await ticketRef.get();

    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Ticket not found"
      );
    }

    const ticketData = ticketDoc.data();
    const agencyId = ticketData?.agencyId;

    // Verify permissions
    const userRef = admin.firestore().collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "User document not found"
      );
    }

    const userData = userDoc.data();
    const userEmail = context.auth.token.email;
    const isUserSuperAdmin = isSuperAdmin(userEmail);

    // Only allow closing if user is super admin or ticket owner
    if (!isUserSuperAdmin && userData?.agencyId !== agencyId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "User does not have permission to close this ticket"
      );
    }

    // Update ticket status
    await ticketRef.update({
      status: "closed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[closeTicketCallable] ✅ Closed ticket ${ticketId}`);

    return {
      success: true,
    };
  } catch (error: any) {
    console.error("[closeTicketCallable] ❌ Error:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to close ticket",
      error.message
    );
  }
});
