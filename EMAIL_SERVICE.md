# Email Service Documentation

Complete guide for the Resend email integration in the Job Portal Backend.

## Table of Contents
1. [Overview](#overview)
2. [Setup](#setup)
3. [Email Templates](#email-templates)
4. [Integration Points](#integration-points)
5. [Testing](#testing)
6. [Customization](#customization)
7. [Best Practices](#best-practices)

---

## Overview

The Job Portal uses **Resend** for transactional email sending. The email service provides beautifully designed HTML email templates for all major user interactions.

### Features
- **9 Professional Email Templates**
- Responsive HTML designs
- Automatic email sending on key events
- Error handling and logging
- Environment-based configuration
- Graceful degradation (works without API key for development)

### Email Types
1. Welcome emails (Candidate & Employer)
2. Application confirmations
3. New application notifications
4. Application status updates
5. Test/assessment invitations
6. Job claim notifications
7. Payment reminders
8. Payment success confirmations

---

## Setup

### 1. Install Resend Package

```bash
npm install resend
```

### 2. Get Resend API Key

1. Sign up at https://resend.com
2. Verify your email
3. Go to **API Keys** section
4. Click **Create API Key**
5. Copy your API key (starts with `re_`)

### 3. Environment Variables

Add to your `.env` file:

```env
# Resend Email Service
RESEND_API_KEY=re_your_api_key_here

# Email Configuration (optional)
EMAIL_FROM="Job Portal <noreply@yourdomain.com>"
EMAIL_REPLY_TO="support@yourdomain.com"
NEXTAUTH_URL="http://localhost:3000"
```

### 4. Domain Verification (Production)

For production, you need to verify your sending domain:

1. Go to **Domains** in Resend dashboard
2. Click **Add Domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. Add the provided DNS records to your domain:
   - SPF record
   - DKIM records
   - DMARC record (optional but recommended)
5. Wait for verification (usually 5-30 minutes)
6. Update `EMAIL_FROM` to use your verified domain:
   ```env
   EMAIL_FROM="Job Portal <noreply@yourdomain.com>"
   ```

### 5. Development Without API Key

The email service gracefully handles missing API keys:
- Logs email sends to console instead
- Doesn't break the application
- Perfect for development/testing

---

## Email Templates

All email templates are defined in [src/lib/email.ts](src/lib/email.ts).

### 1. Candidate Welcome Email

**Trigger:** New candidate registration
**Function:** `sendCandidateWelcomeEmail()`
**Sent to:** New candidate

**Content:**
- Welcome message
- Quick start guide
- Dashboard link
- Pro tips for profile completion

**Parameters:**
```typescript
{
  email: string;
  name: string;
}
```

---

### 2. Employer Welcome Email

**Trigger:** New employer registration
**Function:** `sendEmployerWelcomeEmail()`
**Sent to:** New employer

**Content:**
- Welcome message
- Platform features overview
- Dashboard link
- Getting started checklist

**Parameters:**
```typescript
{
  email: string;
  name: string;
  companyName?: string;
}
```

---

### 3. Application Confirmation Email

**Trigger:** Candidate submits job application
**Function:** `sendApplicationConfirmationEmail()`
**Sent to:** Candidate who applied

**Content:**
- Application confirmation
- Job details
- Application ID
- Next steps
- Tips while waiting

**Parameters:**
```typescript
{
  email: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  applicationId: string;
}
```

---

### 4. New Application Notification Email

**Trigger:** Candidate submits job application
**Function:** `sendNewApplicationNotificationEmail()`
**Sent to:** Employer who posted the job

**Content:**
- New application alert
- Candidate overview (name, skills, experience)
- Job title
- Review application link
- Next steps guide

**Parameters:**
```typescript
{
  email: string;
  employerName: string;
  candidateName: string;
  jobTitle: string;
  applicationId: string;
  candidateSkills?: string[];
  candidateExperience?: number;
}
```

---

### 5. Application Status Update Email

**Trigger:** Employer changes application status
**Function:** `sendApplicationStatusUpdateEmail()`
**Sent to:** Candidate

**Content:**
- Status update notification
- New status (with emoji and color)
- Job and company details
- Optional message from employer
- View application link

**Parameters:**
```typescript
{
  email: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  status: string; // ApplicationStatus enum
  applicationId: string;
  message?: string;
}
```

**Status Colors & Emojis:**
- REVIEWED: 👀 Blue
- SHORTLISTED: ⭐ Purple
- INTERVIEW_SCHEDULED: 📅 Amber
- INTERVIEWED: ✅ Green
- OFFERED: 🎉 Green
- ACCEPTED: 🎊 Green
- REJECTED: ❌ Red

---

### 6. Test Invitation Email

**Trigger:** Employer invites candidate to take assessment
**Function:** `sendTestInvitationEmail()`
**Sent to:** Candidate

**Content:**
- Assessment invitation
- Test details (name, type)
- Deadline (if applicable)
- Assessment tips
- Start assessment link

**Parameters:**
```typescript
{
  email: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  testName: string;
  testType: string; // e.g., "Technical", "Aptitude"
  deadline?: Date;
  testUrl?: string;
}
```

---

### 7. Job Claim Notification Email

**Trigger:** Employer claims an aggregated job
**Function:** `sendJobClaimNotificationEmail()`
**Sent to:** System admin / original poster

**Content:**
- Job claim alert
- Claiming employer details
- Job details
- View job link

**Parameters:**
```typescript
{
  email: string;
  employerName: string;
  jobTitle: string;
  companyName: string;
  claimedBy: string;
  jobId: string;
}
```

---

### 8. Payment Reminder Email

**Trigger:** Remaining payment due date approaching
**Function:** `sendPaymentReminderEmail()`
**Sent to:** Employer

**Content:**
- Payment reminder (urgent if overdue)
- Payment details (candidate, position, amount)
- Due date
- Make payment link
- Payment structure breakdown

**Parameters:**
```typescript
{
  email: string;
  employerName: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  remainingAmount: number; // in cents
  dueDate: Date;
  placementId: string;
  daysUntilDue: number; // negative if overdue
}
```

**Urgency Levels:**
- **Overdue** (< 0 days): Red, high urgency
- **Due Soon** (<= 7 days): Amber, medium urgency
- **Reminder** (> 7 days): Green, low urgency

---

### 9. Payment Success Email

**Trigger:** Stripe webhook payment_intent.succeeded
**Function:** `sendPaymentSuccessEmail()`
**Sent to:** Employer

**Content:**
- Payment confirmation
- Payment amount and type (upfront/remaining)
- Placement details
- Receipt link
- Next payment info (if upfront)

**Parameters:**
```typescript
{
  email: string;
  employerName: string;
  candidateName: string;
  jobTitle: string;
  amount: number; // in cents
  paymentType: "upfront" | "remaining";
  placementId: string;
}
```

---

## Integration Points

Email sending is integrated at these API endpoints:

### 1. Registration - [/api/auth/register](src/app/api/auth/register/route.ts:90-110)

```typescript
// After creating candidate profile
await sendCandidateWelcomeEmail({
  email: user.email,
  name: user.name,
});

// After creating employer profile
await sendEmployerWelcomeEmail({
  email: user.email,
  name: user.name,
  companyName: employer.companyName,
});
```

---

### 2. Application Submission - [/api/applications](src/app/api/applications/route.ts:149-182)

```typescript
// Send confirmation to candidate
await sendApplicationConfirmationEmail({
  email: application.candidate.user.email,
  candidateName: application.candidate.user.name,
  jobTitle: application.job.title,
  companyName: application.job.employer.companyName,
  applicationId: application.id,
});

// Send notification to employer
await sendNewApplicationNotificationEmail({
  email: employer.user.email,
  employerName: employer.user.name,
  candidateName: application.candidate.user.name,
  jobTitle: application.job.title,
  applicationId: application.id,
  candidateSkills: candidate.skills,
  candidateExperience: candidate.experience || undefined,
});
```

---

### 3. Application Status Update - [/api/applications/[id]/status](src/app/api/applications/[id]/status/route.ts:146-154)

```typescript
// Send status update to candidate
await sendApplicationStatusUpdateEmail({
  email: updatedApplication.candidate.user.email,
  candidateName: updatedApplication.candidate.user.name,
  jobTitle: updatedApplication.job.title,
  companyName: updatedApplication.job.employer.companyName,
  status: status,
  applicationId: updatedApplication.id,
});
```

---

### 4. Payment Success - [/api/webhooks/stripe](src/app/api/webhooks/stripe/route.ts:174-212)

```typescript
// Send payment confirmation
await sendPaymentSuccessEmail({
  email: employer.user.email,
  employerName: employer.user.name,
  candidateName: placement.candidate.user.name,
  jobTitle: placement.jobTitle,
  amount: amount,
  paymentType: "upfront", // or "remaining"
  placementId: placement.id,
});
```

---

## Testing

### 1. Test Without Sending (Development)

Simply don't set `RESEND_API_KEY`. Emails will be logged to console:

```bash
Email not sent (no API key): Welcome to Job Portal! to user@example.com
```

### 2. Test with Resend

Set your API key and register a test user:

```bash
# Set API key
export RESEND_API_KEY=re_your_test_key

# Start server
npm run dev

# Register a test user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234",
    "name": "Test User",
    "role": "CANDIDATE"
  }'
```

Check your email inbox for the welcome email.

### 3. Test Email Templates

Create a test script to preview emails:

```typescript
// test-emails.ts
import {
  sendCandidateWelcomeEmail,
  sendApplicationConfirmationEmail,
} from "./src/lib/email";

async function testEmails() {
  // Test welcome email
  await sendCandidateWelcomeEmail({
    email: "test@example.com",
    name: "John Doe",
  });

  // Test application confirmation
  await sendApplicationConfirmationEmail({
    email: "test@example.com",
    candidateName: "John Doe",
    jobTitle: "Senior Developer",
    companyName: "Acme Corp",
    applicationId: "test123",
  });
}

testEmails();
```

### 4. Check Email Logs

Check server logs for email sending confirmation:

```
Email sent: Welcome to Job Portal! to test@example.com
Email sent: Application Received - Senior Developer at Acme Corp to test@example.com
```

### 5. Check Resend Dashboard

View sent emails in Resend dashboard:
1. Go to https://resend.com/emails
2. See all sent emails with status
3. View email content
4. Check delivery status

---

## Customization

### 1. Change Email Styling

Edit the `<style>` section in each email template in [src/lib/email.ts](src/lib/email.ts):

```typescript
<style>
  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
  .header { background: #4F46E5; color: white; padding: 30px; }
  .button { background: #4F46E5; color: white; padding: 12px 30px; }
</style>
```

**Brand Colors:**
- Candidate emails: `#4F46E5` (Indigo)
- Employer emails: `#059669` (Green)
- Payment emails: `#059669` (Green)
- Alerts: `#DC2626` (Red)

### 2. Add Company Logo

Update email header to include logo:

```html
<div class="header">
  <img src="https://yourdomain.com/logo.png" alt="Logo" style="height: 40px;">
  <h1>Welcome to Job Portal!</h1>
</div>
```

### 3. Custom Email Templates

Create new email template:

```typescript
export async function sendCustomEmail(data: {
  email: string;
  name: string;
  customData: any;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          /* Your styles */
        </style>
      </head>
      <body>
        <!-- Your content -->
      </body>
    </html>
  `;

  return sendEmail({
    to: data.email,
    subject: "Your Subject",
    html,
    text: "Plain text version",
  });
}
```

### 4. Change "From" Name

Update in `.env`:

```env
EMAIL_FROM="Your Company Name <noreply@yourdomain.com>"
```

### 5. Add Email Footer Links

Add to footer in templates:

```html
<div class="footer">
  <p><a href="${EMAIL_CONFIG.appUrl}/unsubscribe">Unsubscribe</a> |
     <a href="${EMAIL_CONFIG.appUrl}/privacy">Privacy Policy</a> |
     <a href="${EMAIL_CONFIG.appUrl}/terms">Terms of Service</a></p>
  <p>&copy; ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.</p>
</div>
```

---

## Best Practices

### 1. Email Deliverability

**Improve email deliverability:**

✅ **DO:**
- Verify your sending domain
- Use SPF, DKIM, and DMARC records
- Keep email content simple and clean
- Include unsubscribe links
- Send from a consistent address
- Monitor bounce rates

❌ **DON'T:**
- Use spam trigger words ("FREE", "WINNER", "CLICK NOW")
- Send too many emails in short time
- Use URL shorteners
- Send to invalid email addresses
- Change sending domain frequently

### 2. Error Handling

Always wrap email sends in try-catch:

```typescript
try {
  await sendWelcomeEmail({ ... });
} catch (error) {
  console.error("Failed to send welcome email:", error);
  // Don't let email failure break the main flow
}
```

Our email functions already handle errors gracefully.

### 3. Rate Limiting

Resend has rate limits:
- **Free plan:** 100 emails/day
- **Pro plan:** 50,000 emails/month
- **Enterprise:** Custom limits

For bulk emails, use batching:

```typescript
// Send in batches of 10
for (let i = 0; i < emails.length; i += 10) {
  const batch = emails.slice(i, i + 10);
  await Promise.all(
    batch.map(email => sendEmail({ ... }))
  );
  // Wait 1 second between batches
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

### 4. Testing

- Test emails in development before production
- Use test email addresses
- Check spam folder
- Test on multiple email clients (Gmail, Outlook, Apple Mail)
- Use responsive design testing tools

### 5. Analytics

Track email performance:
- Open rates
- Click-through rates
- Bounce rates
- Unsubscribe rates

Add tracking pixels in emails:

```html
<img src="https://yourdomain.com/track/email/${emailId}/open"
     alt=""
     width="1"
     height="1"
     style="display:none;">
```

### 6. Email Queue (Production)

For production, consider using a queue system:

```typescript
// Using Bull Queue
import Queue from 'bull';

const emailQueue = new Queue('emails', process.env.REDIS_URL);

// Add to queue instead of sending directly
emailQueue.add('welcome', {
  email: 'user@example.com',
  name: 'John Doe',
});

// Process queue
emailQueue.process('welcome', async (job) => {
  await sendCandidateWelcomeEmail(job.data);
});
```

Benefits:
- Retry failed sends
- Rate limiting
- Background processing
- Better error handling

### 7. Personalization

Make emails more personal:
- Use recipient's name
- Reference their actions
- Include relevant data
- Segment by user type

### 8. Compliance

Ensure GDPR/CAN-SPAM compliance:
- ✅ Include unsubscribe link
- ✅ Include physical address
- ✅ Honor opt-out requests within 10 days
- ✅ Include sender identification
- ✅ Use truthful subject lines
- ✅ Store consent records

---

## Troubleshooting

### Common Issues

#### 1. Emails Not Sending

**Check:**
- Is `RESEND_API_KEY` set correctly?
- Is the API key valid?
- Check server logs for errors
- Verify Resend dashboard for failed sends

#### 2. Emails Going to Spam

**Solutions:**
- Verify your sending domain
- Set up SPF/DKIM/DMARC records
- Avoid spam trigger words
- Include unsubscribe link
- Warm up your domain (start with small volume)

#### 3. Rate Limit Errors

**Solutions:**
- Upgrade Resend plan
- Implement email queue
- Batch sends with delays
- Use separate API keys for different email types

#### 4. Template Not Rendering

**Check:**
- HTML syntax errors
- Inline CSS (email clients don't support external CSS)
- Test in multiple email clients
- Use email testing tools (Litmus, Email on Acid)

#### 5. Broken Links

**Ensure:**
- `NEXTAUTH_URL` is set correctly
- Links use absolute URLs (not relative)
- URLs are properly encoded

---

## Future Enhancements

Potential improvements:

1. **Email Templates Engine**
   - Use Handlebars or React Email
   - Separate templates from logic
   - Easier to maintain

2. **Email Preferences**
   - Let users choose which emails to receive
   - Frequency settings
   - Digest emails

3. **Email Scheduling**
   - Schedule emails for specific times
   - Timezone-aware sending
   - Optimal send time

4. **A/B Testing**
   - Test different subject lines
   - Test different content
   - Measure performance

5. **Email Analytics**
   - Track opens and clicks
   - User engagement metrics
   - Conversion tracking

6. **Multi-language Support**
   - Detect user language
   - Send emails in user's preferred language
   - Template translation system

7. **Dynamic Content**
   - Personalized recommendations
   - Dynamic job suggestions
   - Behavioral triggers

---

## Resources

- **Resend Documentation:** https://resend.com/docs
- **Resend Dashboard:** https://resend.com/emails
- **Email Best Practices:** https://www.mailgun.com/blog/email-best-practices/
- **HTML Email Guide:** https://www.campaignmonitor.com/dev-resources/guides/coding/
- **Email Testing Tools:**
  - Litmus: https://litmus.com
  - Email on Acid: https://www.emailonacid.com
  - Mail Tester: https://www.mail-tester.com

---

**Last Updated:** January 2025
**Version:** 1.0.0
**Resend API:** v1
