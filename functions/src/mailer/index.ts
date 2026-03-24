/**
 * Email Service
 * Handles sending transactional emails via nodemailer
 */

import * as functions from "firebase-functions";
import * as nodemailer from "nodemailer";
import {wrapEmailBody} from "./templates";

// Email configuration
const getEmailConfig = () => {
  const config = functions.config().email;

  if (!config) {
    console.warn("[mailer] Email config not found. Using default SMTP settings.");
    return {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
    };
  }

  // Support multiple email providers
  if (config.sendgrid) {
    // SendGrid SMTP
    return {
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: {
        user: "apikey",
        pass: config.sendgrid.key || config.key,
      },
    };
  }

  if (config.postmark) {
    // Postmark SMTP
    return {
      host: "smtp.postmarkapp.com",
      port: 587,
      secure: false,
      auth: {
        user: config.postmark.key || config.key,
        pass: config.postmark.key || config.key,
      },
    };
  }

  // Generic SMTP (Gmail, custom SMTP, etc.)
  return {
    host: config.host || process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(config.port || process.env.SMTP_PORT || "587", 10),
    secure: config.secure === true || process.env.SMTP_SECURE === "true",
    auth: {
      user: config.user || process.env.SMTP_USER || "",
      pass: config.key || config.pass || process.env.SMTP_PASS || "",
    },
  };
};

// Create reusable transporter
let transporter: nodemailer.Transporter | null = null;

const getTransporter = (): nodemailer.Transporter => {
  if (!transporter) {
    const emailConfig = getEmailConfig();
    transporter = nodemailer.createTransport(emailConfig);
  }
  return transporter;
};

interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  ctaLink?: string;
  ctaText?: string;
  from?: string;
  /** Reply-To header (e.g. agency send-from email for monthly reports). */
  replyTo?: string;
  /** Optional full HTML body; when set, body is used as plain-text fallback only. */
  html?: string;
}

/**
 * Sends an email using the branded template
 * @param {SendEmailOptions} options - Email options
 * @return {Promise<void>}
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const {to, subject, body, ctaLink, ctaText, from, replyTo, html} = options;

  try {
    // Validate required fields
    if (!to || !subject || (!body && !html)) {
      throw new Error("Missing required email fields: to, subject, and body or html");
    }

    // Get email configuration
    const emailConfig = functions.config().email || {};
    const fromEmail = from || emailConfig.from || process.env.EMAIL_FROM || "noreply@apex-seo.app";
    const fromName = emailConfig.fromName || process.env.EMAIL_FROM_NAME || "Apex SEO";

    // Use provided HTML or wrap body in branded template
    const htmlBody = html || wrapEmailBody(body || "", ctaLink, ctaText);
    const textBody = body ? body.replace(/<[^>]*>/g, "") : htmlBody.replace(/<[^>]*>/g, "");

    // Get transporter
    const emailTransporter = getTransporter();

    // Send email
    const mailOptions: Record<string, unknown> = {
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html: htmlBody,
      text: textBody,
    };
    if (replyTo) {
      mailOptions.replyTo = replyTo;
    }

    const info = await emailTransporter.sendMail(mailOptions);
    console.log(`[mailer] ✅ Email sent successfully to ${to}. MessageId: ${info.messageId}`);
  } catch (error: any) {
    // Log error but don't crash
    console.error(`[mailer] ❌ Error sending email to ${to}:`, error);

    // Re-throw only if it's a configuration error (so we know to fix it)
    if (error.code === "EAUTH" || error.code === "ECONNECTION") {
      console.error("[mailer] ⚠️ Email configuration error. Please check your SMTP settings.");
    }
    // Don't throw - we don't want to crash the function if email fails
    // The error is logged for debugging
  }
}

/**
 * Verifies email transporter configuration
 * @return {Promise<boolean>} True if configuration is valid
 */
export async function verifyEmailConfig(): Promise<boolean> {
  try {
    const emailTransporter = getTransporter();
    await emailTransporter.verify();
    console.log("[mailer] ✅ Email configuration verified successfully");
    return true;
  } catch (error: any) {
    console.error("[mailer] ❌ Email configuration verification failed:", error);
    return false;
  }
}
