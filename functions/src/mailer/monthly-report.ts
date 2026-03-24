/**
 * Monthly client report email HTML template.
 * Placeholders: logoUrl, agencyName, siteName, monthYear, postsPublished, totalViews, topPostsHtml, dashboardUrl.
 */
export function getMonthlyReportHtml(vars: {
  logoUrl?: string | null;
  agencyName: string;
  siteName: string;
  monthYear: string;
  postsPublished: number;
  totalViews: number;
  topPostsHtml: string;
  dashboardUrl: string;
}): string {
  const {
    logoUrl,
    agencyName,
    siteName,
    monthYear,
    postsPublished,
    totalViews,
    topPostsHtml,
    dashboardUrl,
  } = vars;

  const logoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(agencyName)}" width="140" height="auto" style="max-width: 140px; height: auto; display: block; margin: 0 auto;" />`
    : `<p style="margin: 0; font-size: 18px; font-weight: 600; color: #1f2937;">${escapeHtml(agencyName)}</p>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1e293b; color: white; padding: 24px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: white; padding: 28px 20px; border: 1px solid #e5e7eb; }
    .stat-box { background: #f8fafc; padding: 16px; margin: 12px 0; border-radius: 8px; text-align: center; }
    .stat-number { font-size: 28px; font-weight: bold; color: #3b82f6; margin: 0; }
    .stat-label { margin: 4px 0 0 0; color: #64748b; font-size: 14px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; font-weight: 600; }
    .top-posts { list-style: none; padding: 0; margin: 16px 0 0 0; }
    .top-posts li { padding: 10px 12px; margin: 8px 0; background: #f8fafc; border-radius: 6px; border-left: 3px solid #3b82f6; }
    .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; background: #f1f5f9; border-radius: 0 0 8px 8px; }
    h2 { color: #1e293b; margin-top: 0; font-size: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoBlock}
      <p style="margin: 12px 0 0 0; font-size: 14px; opacity: 0.9;">Monthly Report · ${escapeHtml(siteName)}</p>
      <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.8;">${escapeHtml(monthYear)}</p>
    </div>
    <div class="content">
      <h2>Performance summary</h2>

      <div class="stat-box">
        <div class="stat-number">${postsPublished}</div>
        <p class="stat-label">Posts published</p>
      </div>

      <div class="stat-box">
        <div class="stat-number">${totalViews.toLocaleString()}</div>
        <p class="stat-label">Total page views</p>
      </div>

      ${topPostsHtml ? `<h3 style="margin-top: 24px; color: #1e293b; font-size: 16px;">Top posts</h3><ul class="top-posts">${topPostsHtml}</ul>` : ""}

      <div style="text-align: center;">
        <a href="${escapeHtml(dashboardUrl)}" class="button">View full analytics</a>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0;">Sent by ${escapeHtml(agencyName)} via Apex SEO</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
