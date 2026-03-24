/**
 * Email Template Wrapper
 * Creates a responsive, branded HTML email template
 */

const LOGO_URL = "https://your-logo-url.com/logo.png"; // Replace with actual hosted logo URL
const APP_URL = process.env.APP_URL || "https://apex-seo.app"; // Replace with your app URL

/**
 * Wraps email content in a branded HTML template
 * @param {string} content - The main email body content (HTML)
 * @param {string} [ctaLink] - Optional CTA button link
 * @param {string} [ctaText] - Optional CTA button text
 * @return {string} Complete HTML email template
 */
export function wrapEmailBody(
  content: string,
  ctaLink?: string,
  ctaText?: string
): string {
  const ctaButton = ctaLink && ctaText ? `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 32px 0;">
      <tr>
        <td align="center" style="padding: 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td align="center" style="border-radius: 8px; background-color: #10b981;">
                <a href="${ctaLink}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: 'Open Sans', Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; background-color: #10b981;">
                  ${ctaText}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  ` : "";

  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>Apex SEO</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      outline: none;
      text-decoration: none;
    }
    
    /* Client-specific styles */
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      min-width: 100%;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    
    /* Prevent iOS blue links */
    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }
    
    /* Outlook link fix */
    .button-link {
      text-decoration: none !important;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; width: 100%; background-color: #f3f4f6; font-family: 'Open Sans', Helvetica, Arial, sans-serif;">
  <!-- Wrapper table -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 40px 40px 32px 40px;">
              <img src="${LOGO_URL}" alt="Apex SEO" width="150" height="auto" style="max-width: 150px; height: auto; display: block; margin: 0 auto;">
            </td>
          </tr>
          
          <!-- Body content -->
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <div style="font-family: 'Open Sans', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #374151;">
                ${content}
              </div>
              ${ctaButton}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px 40px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 0 0 16px 0;">
                    <p style="margin: 0; font-family: 'Open Sans', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #6b7280; font-weight: 600;">
                      Sent by Apex SEO
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 0 16px 0;">
                    <p style="margin: 0; font-family: 'Open Sans', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #9ca3af;">
                      123 Business Street, Suite 100<br>
                      City, State 12345<br>
                      United States
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0;">
                    <p style="margin: 0;">
                      <a href="${APP_URL}/unsubscribe" style="font-family: 'Open Sans', Helvetica, Arial, sans-serif; font-size: 12px; color: #9ca3af; text-decoration: underline;">
                        Unsubscribe
                      </a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
