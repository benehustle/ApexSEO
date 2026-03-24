# Email Notification System Setup Guide

## Overview
This application uses Firebase Extensions with SendGrid to send email notifications. The system queues emails in Firestore, and the Firebase extension automatically sends them via SendGrid.

## 1. Install Firebase Email Extension

```bash
firebase ext:install firebase/firestore-send-email
```

Follow the prompts to configure:
- **SMTP server**: `smtp.sendgrid.net`
- **SMTP port**: `587` (or `465` for SSL)
- **SMTP username**: `apikey`
- **SMTP password**: Your SendGrid API key
- **Default FROM email**: `noreply@yourdomain.com`
- **Default reply-to email**: `support@yourdomain.com`

## 2. SendGrid Setup

### Create SendGrid Account
1. Sign up at https://sendgrid.com
2. Verify your email address
3. Complete account setup

### Create API Key
1. Go to Settings → API Keys
2. Click "Create API Key"
3. Name it "Firebase Extension"
4. Select "Full Access" or "Restricted Access" with Mail Send permissions
5. Copy the API key (you won't see it again!)

### Sender Authentication
1. Go to Settings → Sender Authentication
2. Choose either:
   - **Single Sender Verification**: Quick setup for testing
   - **Domain Authentication**: Required for production (recommended)

### Configure Domain (Production)
1. Add your domain in SendGrid
2. Add the required DNS records to your domain
3. Verify domain ownership
4. This improves deliverability and allows custom FROM addresses

## 3. Environment Variables

Add to your `.env` file:
```env
VITE_APP_URL=https://yourdomain.com
VITE_EMAIL_REPLY_TO=support@yourdomain.com
```

## 4. Firestore Rules

Ensure the `mail` collection is writable by authenticated users:

```javascript
match /mail/{mailId} {
  allow write: if request.auth != null;
  allow read: if false; // Extension handles reads
}
```

## 5. Email Templates

Email templates are stored in `/email-templates/`:
- `blog-published.html` - Sent when blog is published
- `blog-approval-needed.html` - Sent when blog needs approval
- `weekly-report.html` - Weekly performance summary
- `error-alert.html` - Critical error notifications
- `milestone.html` - Milestone achievements

## 6. Email Types

### Blog Published
- **Trigger**: When a blog is successfully published to WordPress
- **Recipients**: Blog owner (if `emailNotifications.blogPublished` is enabled)
- **Content**: Blog title, publish date, links to WordPress and analytics

### Approval Needed
- **Trigger**: When a new blog is generated and needs approval
- **Recipients**: Blog owner (if `emailNotifications.blogApprovalNeeded` is enabled)
- **Content**: Blog details, quick action links (approve/reject/edit)

### Weekly Report
- **Trigger**: Every Monday at 9 AM EST (scheduled Cloud Function)
- **Recipients**: All users with `emailNotifications.weeklyReport` enabled
- **Content**: Performance stats, top posts, engagement metrics

### Error Alerts
- **Trigger**: When critical errors occur
- **Recipients**: Affected users (if `emailNotifications.errorAlerts` is enabled)
- **Content**: Error details, affected site, action required

### Milestones
- **Trigger**: When blogs reach view milestones (100, 500, 1000, etc.)
- **Recipients**: Blog owner
- **Content**: Milestone achievement, view count, analytics link

## 7. Testing

### Test Email Sending
```typescript
import { emailService } from './services/email.service';

// Test blog published email
await emailService.sendBlogPublished('test@example.com', {
  siteName: 'Test Site',
  blogTitle: 'Test Blog Post',
  publishDate: new Date().toLocaleString(),
  scheduledDate: new Date().toLocaleString(),
  wordpressUrl: 'https://example.com/post',
  analyticsUrl: 'https://app.example.com/analytics',
});
```

### Check Email Queue
1. Go to Firebase Console → Firestore
2. Check the `mail` collection
3. Emails should appear and be processed by the extension

### Monitor Extension
1. Go to Firebase Console → Extensions
2. Click on "firestore-send-email"
3. View logs and metrics

## 8. Troubleshooting

### Emails Not Sending
1. Check extension logs in Firebase Console
2. Verify SendGrid API key is correct
3. Check SendGrid activity feed for delivery status
4. Ensure sender is verified in SendGrid
5. Check Firestore rules allow writes to `mail` collection

### Emails Going to Spam
1. Complete domain authentication in SendGrid
2. Use a verified sender email
3. Avoid spam trigger words in subject/content
4. Include unsubscribe links
5. Monitor SendGrid reputation

### Template Not Found
- Templates are served from `/email-templates/` directory
- Ensure templates are included in build
- Check template file names match exactly

## 9. User Preferences

Users can manage email preferences in Settings:
- Navigate to `/settings?tab=notifications`
- Toggle individual notification types
- Changes are saved to `userPreferences` collection

## 10. Production Checklist

- [ ] SendGrid account created and verified
- [ ] Domain authenticated in SendGrid
- [ ] Firebase extension installed and configured
- [ ] SMTP credentials tested
- [ ] Email templates reviewed and customized
- [ ] Environment variables set
- [ ] Firestore rules updated
- [ ] Test emails sent and received
- [ ] Unsubscribe links working
- [ ] Weekly report schedule verified
- [ ] Error handling tested

## Support

For issues:
1. Check Firebase Extension logs
2. Review SendGrid activity feed
3. Verify Firestore `mail` collection
4. Test with a simple email first
5. Check user preferences are enabled
