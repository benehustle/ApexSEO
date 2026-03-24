import { collection, addDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

interface EmailData {
  to: string;
  template: string;
  subject: string;
  data: Record<string, any>;
}

class EmailService {
  private async queueEmail(emailData: EmailData) {
    // The Firebase extension will pick up emails from the 'mail' collection
    await addDoc(collection(db, 'mail'), {
      to: emailData.to,
      message: {
        subject: emailData.subject,
        html: await this.renderTemplate(emailData.template, emailData.data),
      },
      // Optional: Add reply-to
      replyTo: import.meta.env.VITE_EMAIL_REPLY_TO || 'noreply@apex-seo.com',
    });
  }

  private async renderTemplate(templateName: string, data: Record<string, any>): Promise<string> {
    // Load template from email-templates directory
    try {
      const templateResponse = await fetch(`/email-templates/${templateName}.html`);
      if (!templateResponse.ok) {
        throw new Error(`Template ${templateName} not found`);
      }
      let html = await templateResponse.text();

      // Simple template rendering - replace {{variables}}
      for (const [key, value] of Object.entries(data)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        html = html.replace(regex, String(value || ''));
      }

      // Handle array replacements (like topPosts)
      if (data.topPosts && Array.isArray(data.topPosts)) {
        const topPostsHtml = data.topPosts
          .map((post: any) => 
            `<li><strong>${post.title}</strong> - ${post.views} views</li>`
          )
          .join('');
        html = html.replace('{{topPosts}}', topPostsHtml);
      }

      // Handle conditional blocks (like {{#affectedSite}})
      if (data.affectedSite) {
        html = html.replace(/{{#affectedSite}}/g, '');
        html = html.replace(/{{\/affectedSite}}/g, '');
      } else {
        html = html.replace(/{{#affectedSite}}[\s\S]*?{{\/affectedSite}}/g, '');
      }

      return html;
    } catch (error) {
      console.error('Error rendering email template:', error);
      // Fallback to simple HTML
      return this.createFallbackTemplate(templateName, data);
    }
  }

  private createFallbackTemplate(_templateName: string, data: Record<string, any>): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>${data.subject || 'Notification'}</h2>
          <p>${JSON.stringify(data, null, 2)}</p>
        </body>
      </html>
    `;
  }

  async sendBlogPublished(
    userEmail: string,
    data: {
      siteName: string;
      blogTitle: string;
      publishDate: string;
      scheduledDate: string;
      wordpressUrl: string;
      analyticsUrl: string;
    }
  ) {
    await this.queueEmail({
      to: userEmail,
      template: 'blog-published',
      subject: `🎉 "${data.blogTitle}" is now live!`,
      data: {
        ...data,
        unsubscribeUrl: `${import.meta.env.VITE_APP_URL || window.location.origin}/settings?tab=notifications`,
      },
    });
  }

  async sendApprovalNeeded(
    userEmail: string,
    data: {
      count: number;
      siteName: string;
      blogTitle: string;
      keyword: string;
      wordCount: number;
      scheduledDate: string;
      approveUrl: string;
      rejectUrl: string;
      editUrl: string;
    }
  ) {
    await this.queueEmail({
      to: userEmail,
      template: 'blog-approval-needed',
      subject: `📝 ${data.count} blog(s) awaiting your approval`,
      data,
    });
  }

  async sendWeeklyReport(
    userEmail: string,
    data: {
      weekStart: string;
      weekEnd: string;
      blogsPublished: number;
      totalViews: number;
      avgTimeOnPage: number;
      topPosts: Array<{ title: string; views: number }>;
      dashboardUrl: string;
    }
  ) {
    await this.queueEmail({
      to: userEmail,
      template: 'weekly-report',
      subject: `📊 Your Weekly Blog Performance Report`,
      data,
    });
  }

  async sendErrorAlert(
    userEmail: string,
    error: {
      type: string;
      message: string;
      timestamp: string;
      affectedSite?: string;
      dashboardUrl?: string;
    }
  ) {
    await this.queueEmail({
      to: userEmail,
      template: 'error-alert',
      subject: `⚠️ Action Required: ${error.type}`,
      data: {
        ...error,
        dashboardUrl: error.dashboardUrl || `${import.meta.env.VITE_APP_URL || window.location.origin}/dashboard`,
      },
    });
  }

  async sendMilestone(
    userEmail: string,
    data: {
      blogTitle: string;
      milestone: string;
      totalViews: number;
      analyticsUrl: string;
    }
  ) {
    await this.queueEmail({
      to: userEmail,
      template: 'milestone',
      subject: `🎯 Milestone Reached: ${data.milestone}`,
      data,
    });
  }

  async sendDailyDigest(
    userEmail: string,
    data: {
      date: string;
      blogsPublished: number;
      blogsPending: number;
      totalViews: number;
      dashboardUrl: string;
    }
  ) {
    await this.queueEmail({
      to: userEmail,
      template: 'daily-digest',
      subject: `📬 Daily Digest - ${data.date}`,
      data,
    });
  }
}

export const emailService = new EmailService();
