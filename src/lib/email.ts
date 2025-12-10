import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  console.warn("RESEND_API_KEY is not set in environment variables. Email functionality will be disabled.");
}

// Initialize Resend client
export const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Email addresses for different types of communications
 * - contact: Candidate & employer communications
 * - admin: Admin alerts and internal notifications
 * - billing: Invoices and payment emails
 * - noreply: Automated system emails (verification, password reset)
 * - support: Reply-to for support inquiries
 */
export const EMAIL_ADDRESSES = {
  contact: 'SkillProof <contact@getskillproof.com>',
  admin: 'SkillProof <admin@getskillproof.com>',
  billing: 'SkillProof Billing <billing@getskillproof.com>',
  noreply: 'SkillProof <noreply@getskillproof.com>',
  support: 'support@getskillproof.com',
};

/**
 * Email configuration
 * Note: appUrl is a getter function to ensure env vars are read at runtime, not build time
 */
export const EMAIL_CONFIG = {
  from: EMAIL_ADDRESSES.contact,
  replyTo: EMAIL_ADDRESSES.support,
  appName: "SkillProof",
  // Use getter to ensure FRONTEND_URL is read at runtime, not build time
  get appUrl() {
    return process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  },
};

/**
 * Email sending utility with error handling
 * @param options.from - Optional FROM address (defaults to EMAIL_ADDRESSES.contact)
 * @param options.replyTo - Optional Reply-To address (defaults to EMAIL_ADDRESSES.support)
 */
export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
  }>;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`Email not sent (no API key): ${options.subject} to ${options.to}`);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const result = await resend.emails.send({
      from: options.from || EMAIL_ADDRESSES.contact,
      replyTo: options.replyTo || EMAIL_ADDRESSES.support,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    });

    console.log(`Email sent: ${options.subject} to ${options.to}`);
    return { success: true, data: result };
  } catch (error) {
    console.error("Email sending error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Welcome email for new candidates
 */
export async function sendCandidateWelcomeEmail(data: {
  email: string;
  name: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          ul { margin: 20px 0; }
          li { margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${EMAIL_CONFIG.appName}!</h1>
          </div>
          <div class="content">
            <p>Hi ${data.name},</p>

            <p>Welcome to ${EMAIL_CONFIG.appName}! We're excited to help you find your next great opportunity.</p>

            <p><strong>Here's what you can do now:</strong></p>
            <ul>
              <li>Complete your candidate profile</li>
              <li>Upload your resume</li>
              <li>Browse available jobs</li>
              <li>Apply to positions that match your skills</li>
              <li>Take skill assessments to stand out</li>
            </ul>

            <a href="${EMAIL_CONFIG.appUrl}/dashboard/candidate" class="button">Go to Dashboard</a>

            <p><strong>Pro Tips:</strong></p>
            <ul>
              <li>Complete your profile to increase visibility to employers</li>
              <li>Add your skills and experience for better job matches</li>
              <li>Set up job alerts to get notified of new opportunities</li>
            </ul>

            <p>If you have any questions, feel free to reach out to our support team.</p>

            <p>Best regards,<br>The ${EMAIL_CONFIG.appName} Team</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${data.email}</p>
            <p>&copy; ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.email,
    subject: `Welcome to ${EMAIL_CONFIG.appName}!`,
    html,
    text: `Welcome to ${EMAIL_CONFIG.appName}! Complete your profile and start applying to jobs.`,
  });
}

/**
 * Welcome email for new employers
 */
export async function sendEmployerWelcomeEmail(data: {
  email: string;
  name: string;
  companyName?: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          ul { margin: 20px 0; }
          li { margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${EMAIL_CONFIG.appName}!</h1>
          </div>
          <div class="content">
            <p>Hi ${data.name},</p>

            <p>Welcome to ${EMAIL_CONFIG.appName}! ${data.companyName ? `We're excited to help ${data.companyName} find top talent.` : "We're excited to help you find top talent."}</p>

            <p><strong>Get started with these steps:</strong></p>
            <ul>
              <li>Complete your company profile</li>
              <li>Upload your company logo</li>
              <li>Post your first job opening</li>
              <li>Review candidate applications</li>
              <li>Schedule interviews with qualified candidates</li>
            </ul>

            <a href="${EMAIL_CONFIG.appUrl}/dashboard/employer" class="button">Go to Dashboard</a>

            <p><strong>Platform Features:</strong></p>
            <ul>
              <li>Post unlimited job openings</li>
              <li>Access to qualified candidate pool</li>
              <li>Applicant tracking system</li>
              <li>Skill assessment tools</li>
              <li>Analytics and reporting</li>
            </ul>

            <p>Need help getting started? Our support team is here to assist you.</p>

            <p>Best regards,<br>The ${EMAIL_CONFIG.appName} Team</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${data.email}</p>
            <p>&copy; ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.email,
    subject: `Welcome to ${EMAIL_CONFIG.appName} - Start Hiring Today!`,
    html,
    text: `Welcome to ${EMAIL_CONFIG.appName}! Complete your company profile and start posting jobs.`,
  });
}

/**
 * Application received confirmation for candidate
 */
export async function sendApplicationConfirmationEmail(data: {
  email: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  applicationId: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .job-details { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #4F46E5; }
          .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application Received!</h1>
          </div>
          <div class="content">
            <div class="success-icon">✅</div>

            <p>Hi ${data.candidateName},</p>

            <p>Your application has been successfully submitted!</p>

            <div class="job-details">
              <h3 style="margin-top: 0; color: #4F46E5;">Application Details</h3>
              <p><strong>Position:</strong> ${data.jobTitle}</p>
              <p><strong>Company:</strong> ${data.companyName}</p>
              <p><strong>Application ID:</strong> ${data.applicationId}</p>
            </div>

            <p><strong>What happens next?</strong></p>
            <ul>
              <li>The employer will review your application</li>
              <li>You'll receive an email if your application moves forward</li>
              <li>You can track your application status in your dashboard</li>
            </ul>

            <a href="${EMAIL_CONFIG.appUrl}/dashboard/candidate/applications" class="button">View Application</a>

            <p><strong>Tips while you wait:</strong></p>
            <ul>
              <li>Keep your profile updated</li>
              <li>Apply to other relevant positions</li>
              <li>Complete skill assessments to boost your profile</li>
            </ul>

            <p>Good luck!</p>

            <p>Best regards,<br>The ${EMAIL_CONFIG.appName} Team</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${data.email}</p>
            <p>&copy; ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.email,
    subject: `Application Received - ${data.jobTitle} at ${data.companyName}`,
    html,
    text: `Your application for ${data.jobTitle} at ${data.companyName} has been received. Track your application status in your dashboard.`,
  });
}

/**
 * New application notification for employer
 */
export async function sendNewApplicationNotificationEmail(data: {
  email: string;
  employerName: string;
  candidateName: string;
  jobTitle: string;
  applicationId: string;
  candidateSkills?: string[];
  candidateExperience?: number;
}) {
  const skillsList = data.candidateSkills && data.candidateSkills.length > 0
    ? `<p><strong>Skills:</strong> ${data.candidateSkills.join(", ")}</p>`
    : "";

  const experienceInfo = data.candidateExperience !== undefined
    ? `<p><strong>Experience:</strong> ${data.candidateExperience} years</p>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .candidate-card { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #059669; }
          .button { display: inline-block; background: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .notification-icon { font-size: 48px; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Application Received</h1>
          </div>
          <div class="content">
            <div class="notification-icon">📋</div>

            <p>Hi ${data.employerName},</p>

            <p>You have a new application for your job posting!</p>

            <div class="candidate-card">
              <h3 style="margin-top: 0; color: #059669;">Application Details</h3>
              <p><strong>Candidate:</strong> ${data.candidateName}</p>
              <p><strong>Position:</strong> ${data.jobTitle}</p>
              ${experienceInfo}
              ${skillsList}
              <p><strong>Application ID:</strong> ${data.applicationId}</p>
            </div>

            <a href="${EMAIL_CONFIG.appUrl}/dashboard/employer/applications/${data.applicationId}" class="button">Review Application</a>

            <p><strong>Next Steps:</strong></p>
            <ul>
              <li>Review the candidate's profile and resume</li>
              <li>Update the application status (Reviewed, Shortlisted, etc.)</li>
              <li>Schedule an interview if the candidate is a good fit</li>
              <li>Add notes to track your evaluation</li>
            </ul>

            <p>Don't keep great candidates waiting!</p>

            <p>Best regards,<br>The ${EMAIL_CONFIG.appName} Team</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${data.email}</p>
            <p>&copy; ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.email,
    subject: `New Application - ${data.candidateName} applied for ${data.jobTitle}`,
    html,
    text: `${data.candidateName} has applied for ${data.jobTitle}. Review the application in your dashboard.`,
  });
}

/**
 * Test invitation email for candidate
 */
export async function sendTestInvitationEmail(data: {
  email: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  testName: string;
  testType: string;
  deadline?: Date;
  testUrl?: string;
}) {
  const deadlineInfo = data.deadline
    ? `<p><strong>Deadline:</strong> ${data.deadline.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })}</p>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #7C3AED; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .test-card { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #7C3AED; }
          .button { display: inline-block; background: #7C3AED; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .urgent { background: #FEF3C7; border: 1px solid #F59E0B; padding: 15px; border-radius: 6px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You're Invited to Take an Assessment</h1>
          </div>
          <div class="content">
            <p>Hi ${data.candidateName},</p>

            <p>Great news! ${data.companyName} has invited you to complete an assessment as the next step in your application process.</p>

            <div class="test-card">
              <h3 style="margin-top: 0; color: #7C3AED;">Assessment Details</h3>
              <p><strong>Assessment Name:</strong> ${data.testName}</p>
              <p><strong>Type:</strong> ${data.testType}</p>
              <p><strong>Position:</strong> ${data.jobTitle}</p>
              <p><strong>Company:</strong> ${data.companyName}</p>
              ${deadlineInfo}
            </div>

            ${data.deadline ? '<div class="urgent">⏰ <strong>Important:</strong> Please complete this assessment before the deadline.</div>' : ""}

            <a href="${data.testUrl || EMAIL_CONFIG.appUrl + "/dashboard/candidate/tests"}" class="button">Start Assessment</a>

            <p><strong>Assessment Tips:</strong></p>
            <ul>
              <li>Find a quiet place with good internet connection</li>
              <li>Allocate enough time to complete without interruptions</li>
              <li>Read all instructions carefully before starting</li>
              <li>Answer honestly and to the best of your ability</li>
            </ul>

            <p>Good luck with your assessment!</p>

            <p>Best regards,<br>The ${EMAIL_CONFIG.appName} Team</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${data.email}</p>
            <p>&copy; ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.email,
    subject: `Assessment Invitation - ${data.jobTitle} at ${data.companyName}`,
    html,
    text: `You've been invited to complete a ${data.testType} assessment for ${data.jobTitle} at ${data.companyName}.`,
  });
}

/**
 * Job claim notification for employer
 */
export async function sendJobClaimNotificationEmail(data: {
  email: string;
  employerName: string;
  jobTitle: string;
  companyName: string;
  claimedBy: string;
  jobId: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #DC2626; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .alert { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #DC2626; }
          .button { display: inline-block; background: #DC2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Job Listing Claimed</h1>
          </div>
          <div class="content">
            <p>Hi ${data.employerName},</p>

            <p>A job listing has been claimed by another employer.</p>

            <div class="alert">
              <h3 style="margin-top: 0; color: #DC2626;">Job Claim Details</h3>
              <p><strong>Job Title:</strong> ${data.jobTitle}</p>
              <p><strong>Company:</strong> ${data.companyName}</p>
              <p><strong>Claimed By:</strong> ${data.claimedBy}</p>
              <p><strong>Job ID:</strong> ${data.jobId}</p>
            </div>

            <p><strong>What does this mean?</strong></p>
            <ul>
              <li>This job was previously aggregated from external sources</li>
              <li>The employer has now claimed ownership of this listing</li>
              <li>The job status has been updated to DRAFT for review</li>
              <li>The employer can now manage applications directly</li>
            </ul>

            <a href="${EMAIL_CONFIG.appUrl}/dashboard/employer/jobs/${data.jobId}" class="button">View Job</a>

            <p>If you have any questions about this claim, please contact our support team.</p>

            <p>Best regards,<br>The ${EMAIL_CONFIG.appName} Team</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${data.email}</p>
            <p>&copy; ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.email,
    subject: `Job Claimed - ${data.jobTitle} at ${data.companyName}`,
    html,
    text: `The job listing for ${data.jobTitle} at ${data.companyName} has been claimed by ${data.claimedBy}.`,
  });
}

/**
 * Payment reminder email for remaining payment
 */
export async function sendPaymentReminderEmail(data: {
  email: string;
  employerName: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  remainingAmount: number;
  dueDate: Date;
  placementId: string;
  daysUntilDue: number;
}) {
  const isOverdue = data.daysUntilDue < 0;
  const urgencyClass = isOverdue ? "overdue" : data.daysUntilDue <= 7 ? "urgent" : "reminder";
  const urgencyColor = isOverdue ? "#DC2626" : data.daysUntilDue <= 7 ? "#F59E0B" : "#059669";

  const urgencyMessage = isOverdue
    ? `⚠️ <strong>OVERDUE:</strong> Payment is ${Math.abs(data.daysUntilDue)} days overdue`
    : data.daysUntilDue === 0
    ? "⚠️ <strong>DUE TODAY:</strong> Payment is due today"
    : `⏰ Payment due in ${data.daysUntilDue} days`;

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(data.remainingAmount / 100);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${urgencyColor}; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .payment-card { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid ${urgencyColor}; }
          .button { display: inline-block; background: ${urgencyColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .urgency-banner { background: ${isOverdue ? "#FEE2E2" : "#FEF3C7"}; border: 1px solid ${urgencyColor}; padding: 15px; border-radius: 6px; margin: 20px 0; text-align: center; }
          .amount { font-size: 32px; font-weight: bold; color: ${urgencyColor}; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${isOverdue ? "Payment Overdue" : "Payment Reminder"}</h1>
          </div>
          <div class="content">
            <p>Hi ${data.employerName},</p>

            <div class="urgency-banner">
              ${urgencyMessage}
            </div>

            <p>This is a ${isOverdue ? "notice" : "reminder"} that the remaining placement fee payment is ${isOverdue ? "overdue" : "due soon"}.</p>

            <div class="payment-card">
              <h3 style="margin-top: 0; color: ${urgencyColor};">Payment Details</h3>
              <p><strong>Candidate:</strong> ${data.candidateName}</p>
              <p><strong>Position:</strong> ${data.jobTitle}</p>
              <p><strong>Company:</strong> ${data.companyName}</p>
              <p><strong>Due Date:</strong> ${data.dueDate.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
              })}</p>
            </div>

            <div class="amount">${formattedAmount}</div>

            <a href="${EMAIL_CONFIG.appUrl}/dashboard/employer/payments/${data.placementId}" class="button">Make Payment</a>

            <p><strong>Payment Structure:</strong></p>
            <ul>
              <li>50% upfront payment: ✅ Completed</li>
              <li>50% remaining payment: ${isOverdue ? "⚠️ Overdue" : "⏳ Due soon"}</li>
            </ul>

            ${isOverdue ? `
            <p><strong>Please note:</strong> Late payments may affect your account status. Please complete this payment as soon as possible.</p>
            ` : `
            <p><strong>Payment Methods:</strong></p>
            <ul>
              <li>Credit/Debit Card</li>
              <li>Bank Transfer</li>
              <li>ACH Payment</li>
            </ul>
            `}

            <p>If you have any questions about this payment, please contact our billing team.</p>

            <p>Best regards,<br>The ${EMAIL_CONFIG.appName} Team</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${data.email}</p>
            <p>&copy; ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.email,
    subject: isOverdue
      ? `Payment Overdue - ${formattedAmount} for ${data.jobTitle} Placement`
      : `Payment Reminder - ${formattedAmount} Due ${data.daysUntilDue === 0 ? "Today" : `in ${data.daysUntilDue} Days`}`,
    html,
    text: `Reminder: Remaining placement fee of ${formattedAmount} is due ${isOverdue ? `${Math.abs(data.daysUntilDue)} days ago` : data.daysUntilDue === 0 ? "today" : `in ${data.daysUntilDue} days`}.`,
    from: EMAIL_ADDRESSES.billing,
    replyTo: EMAIL_ADDRESSES.billing.replace('SkillProof Billing <', '').replace('>', ''),
  });
}

/**
 * Application status update notification for candidate
 */
export async function sendApplicationStatusUpdateEmail(data: {
  email: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  status: string;
  applicationId: string;
  message?: string;
}) {
  const statusColors: Record<string, string> = {
    REVIEWED: "#3B82F6",
    SHORTLISTED: "#8B5CF6",
    INTERVIEW_SCHEDULED: "#F59E0B",
    INTERVIEWED: "#10B981",
    OFFERED: "#059669",
    ACCEPTED: "#059669",
    REJECTED: "#DC2626",
  };

  const statusEmojis: Record<string, string> = {
    REVIEWED: "👀",
    SHORTLISTED: "⭐",
    INTERVIEW_SCHEDULED: "📅",
    INTERVIEWED: "✅",
    OFFERED: "🎉",
    ACCEPTED: "🎊",
    REJECTED: "❌",
  };

  const color = statusColors[data.status] || "#4F46E5";
  const emoji = statusEmojis[data.status] || "📋";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${color}; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .status-card { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid ${color}; }
          .button { display: inline-block; background: ${color}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .emoji { font-size: 48px; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application Update</h1>
          </div>
          <div class="content">
            <div class="emoji">${emoji}</div>

            <p>Hi ${data.candidateName},</p>

            <p>Your application status has been updated!</p>

            <div class="status-card">
              <h3 style="margin-top: 0; color: ${color};">Status Update</h3>
              <p><strong>Position:</strong> ${data.jobTitle}</p>
              <p><strong>Company:</strong> ${data.companyName}</p>
              <p><strong>New Status:</strong> ${data.status.replace(/_/g, " ")}</p>
            </div>

            ${data.message ? `<p><strong>Message from employer:</strong><br>${data.message}</p>` : ""}

            <a href="${EMAIL_CONFIG.appUrl}/dashboard/candidate/applications/${data.applicationId}" class="button">View Application</a>

            <p>Check your dashboard for more details and next steps.</p>

            <p>Best regards,<br>The ${EMAIL_CONFIG.appName} Team</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${data.email}</p>
            <p>&copy; ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.email,
    subject: `Application Update - ${data.jobTitle} at ${data.companyName}`,
    html,
    text: `Your application for ${data.jobTitle} at ${data.companyName} has been updated to: ${data.status.replace(/_/g, " ")}`,
  });
}

/**
 * Payment success confirmation email
 */
export async function sendPaymentSuccessEmail(data: {
  email: string;
  employerName: string;
  candidateName: string;
  jobTitle: string;
  amount: number;
  paymentType: "upfront" | "remaining";
  placementId: string;
}) {
  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(data.amount / 100);

  const isFullyPaid = data.paymentType === "remaining";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .success-card { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #059669; }
          .button { display: inline-block; background: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
          .amount { font-size: 32px; font-weight: bold; color: #059669; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Successful!</h1>
          </div>
          <div class="content">
            <div class="success-icon">✅</div>

            <p>Hi ${data.employerName},</p>

            <p>Your payment has been processed successfully!</p>

            <div class="amount">${formattedAmount}</div>

            <div class="success-card">
              <h3 style="margin-top: 0; color: #059669;">Payment Details</h3>
              <p><strong>Payment Type:</strong> ${data.paymentType === "upfront" ? "Upfront Payment (50%)" : "Remaining Payment (50%)"}</p>
              <p><strong>Candidate:</strong> ${data.candidateName}</p>
              <p><strong>Position:</strong> ${data.jobTitle}</p>
              <p><strong>Amount Paid:</strong> ${formattedAmount}</p>
              <p><strong>Payment Date:</strong> ${new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
              })}</p>
            </div>

            ${isFullyPaid ? `
            <p><strong>🎉 Placement Fully Paid!</strong></p>
            <p>All payments for this placement have been completed. Thank you!</p>
            ` : `
            <p><strong>Next Payment:</strong></p>
            <p>The remaining 50% payment (${formattedAmount}) will be due in 30 days.</p>
            <p>We'll send you a reminder before the due date.</p>
            `}

            <a href="${EMAIL_CONFIG.appUrl}/dashboard/employer/payments/${data.placementId}" class="button">View Receipt</a>

            <p>A detailed receipt has been sent to your email and is available in your dashboard.</p>

            <p>Thank you for using ${EMAIL_CONFIG.appName}!</p>

            <p>Best regards,<br>The ${EMAIL_CONFIG.appName} Team</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${data.email}</p>
            <p>&copy; ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.email,
    subject: `Payment Confirmed - ${formattedAmount} ${isFullyPaid ? "(Fully Paid)" : "(50% Upfront)"}`,
    html,
    text: `Your ${data.paymentType} payment of ${formattedAmount} has been processed successfully.`,
    from: EMAIL_ADDRESSES.billing,
    replyTo: 'billing@getskillproof.com',
  });
}

/**
 * Email verification for new users
 */
export async function sendEmailVerificationEmail(data: {
  email: string;
  name: string;
  verificationToken: string;
}) {
  const verificationUrl = `${EMAIL_CONFIG.appUrl}/api/auth/verify-email?token=${data.verificationToken}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #4F46E5; color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; margin: 25px 0; font-weight: bold; font-size: 16px; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .icon { font-size: 48px; text-align: center; margin: 20px 0; }
          .note { background: #F3F4F6; padding: 15px; border-radius: 6px; font-size: 14px; color: #6B7280; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verify Your Email</h1>
          </div>
          <div class="content">
            <div class="icon">📧</div>

            <p>Hi ${data.name},</p>

            <p>Thanks for signing up for ${EMAIL_CONFIG.appName}!</p>

            <p>Click the button below to verify your email address and complete your account setup:</p>

            <div style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </div>

            <div class="note">
              <p style="margin: 0;"><strong>Note:</strong> This link expires in 24 hours.</p>
              <p style="margin: 10px 0 0 0;">If you didn't create an account with ${EMAIL_CONFIG.appName}, you can safely ignore this email.</p>
            </div>

            <p style="margin-top: 30px;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #4F46E5; font-size: 14px;">${verificationUrl}</p>

            <p>Best regards,<br>The ${EMAIL_CONFIG.appName} Team</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${data.email}</p>
            <p>&copy; ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.email,
    subject: `Verify your ${EMAIL_CONFIG.appName} account`,
    html,
    text: `Hi ${data.name}, Thanks for signing up! Please verify your email by visiting: ${verificationUrl}. This link expires in 24 hours.`,
    from: EMAIL_ADDRESSES.noreply,
    replyTo: undefined, // No reply-to for verification emails
  });
}

/**
 * Introduction request email to candidate
 * Sent when an employer requests an introduction to a candidate
 */
export async function sendIntroductionRequestEmail(data: {
  candidateEmail: string;
  candidateName: string;
  employerCompanyName: string;
  employerDescription?: string;
  jobTitle: string;
  responseToken: string;
}): Promise<{ success: boolean; error?: string; data?: any }> {
  // Use token-based URLs for secure response
  const responseBaseUrl = `${EMAIL_CONFIG.appUrl}/introductions/respond/${data.responseToken}`;
  const acceptUrl = responseBaseUrl;
  const declineUrl = responseBaseUrl;
  const questionsUrl = responseBaseUrl;

  // Extract first name for personalization
  const firstName = data.candidateName.split(" ")[0];

  const companyDescription = data.employerDescription || `A company hiring for ${data.jobTitle}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .company-card { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #4F46E5; }
          .button-primary { display: inline-block; background: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 10px 5px 10px 0; font-weight: bold; }
          .button-secondary { display: inline-block; background: #6B7280; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 10px 5px 10px 0; font-weight: bold; }
          .button-outline { display: inline-block; background: white; color: #4F46E5; padding: 12px 26px; text-decoration: none; border-radius: 6px; margin: 10px 5px 10px 0; font-weight: bold; border: 2px solid #4F46E5; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .steps { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; }
          .steps ol { margin: 10px 0; padding-left: 20px; }
          .steps li { margin: 10px 0; }
          .cta-section { text-align: center; margin: 30px 0; }
          .expiry-note { background: #FEF3C7; border: 1px solid #F59E0B; padding: 12px; border-radius: 6px; margin: 20px 0; text-align: center; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${data.employerCompanyName} is Interested in You!</h1>
          </div>
          <div class="content">
            <p>Hi ${firstName},</p>

            <p>Great news! <strong>${data.employerCompanyName}</strong> has reviewed your profile on SkillProof and would like to connect with you about the <strong>${data.jobTitle}</strong> role.</p>

            <div class="company-card">
              <h3 style="margin-top: 0; color: #4F46E5;">About ${data.employerCompanyName}</h3>
              <p style="margin-bottom: 0;">${companyDescription}</p>
            </div>

            <div class="steps">
              <h3 style="margin-top: 0;">What happens next:</h3>
              <ol>
                <li>If you're interested, we'll share your contact details with them</li>
                <li>They'll reach out to schedule an interview</li>
                <li>We'll support you through the entire process</li>
              </ol>
            </div>

            <div class="cta-section">
              <a href="${acceptUrl}" class="button-primary">I'm Interested - Connect Us</a>
              <a href="${declineUrl}" class="button-secondary">Not Interested</a>
              <br>
              <a href="${questionsUrl}" class="button-outline">I Have Questions First</a>
            </div>

            <div class="expiry-note">
              ⏰ This opportunity will remain open for <strong>7 days</strong>.
            </div>

            <p>Best,<br>The SkillProof Team</p>
          </div>
          <div class="footer">
            <p>You're receiving this because you have a profile on SkillProof.</p>
            <p>&copy; ${new Date().getFullYear()} SkillProof. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.candidateEmail,
    subject: `${data.employerCompanyName} is interested in connecting with you`,
    html,
    text: `Hi ${firstName}, Great news! ${data.employerCompanyName} has reviewed your profile on SkillProof and would like to connect with you about the ${data.jobTitle} role. Visit your dashboard to respond to this introduction request.`,
  });
}

/**
 * Introduction accepted email to employer
 * Sent when a candidate accepts an introduction request
 */
export async function sendIntroductionAcceptedEmail(data: {
  employerEmail: string;
  employerName: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  candidateLinkedIn?: string;
  jobTitle: string;
  candidateProfileUrl: string;
}): Promise<{ success: boolean; error?: string; data?: any }> {
  const contactDetails = [];
  contactDetails.push(`<li><strong>Email:</strong> <a href="mailto:${data.candidateEmail}" style="color: #4F46E5;">${data.candidateEmail}</a></li>`);
  if (data.candidatePhone) {
    contactDetails.push(`<li><strong>Phone:</strong> <a href="tel:${data.candidatePhone}" style="color: #4F46E5;">${data.candidatePhone}</a></li>`);
  }
  if (data.candidateLinkedIn) {
    contactDetails.push(`<li><strong>LinkedIn:</strong> <a href="${data.candidateLinkedIn}" style="color: #4F46E5;" target="_blank">${data.candidateLinkedIn}</a></li>`);
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
          .contact-card { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #059669; }
          .contact-card ul { list-style: none; padding: 0; margin: 0; }
          .contact-card li { margin: 10px 0; }
          .button { display: inline-block; background: #059669; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .tips { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; }
          .tips ol { margin: 10px 0; padding-left: 20px; }
          .tips li { margin: 8px 0; }
          .reminder { background: #FEF3C7; border: 1px solid #F59E0B; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Great News!</h1>
          </div>
          <div class="content">
            <div class="success-icon">🎉</div>

            <p>Hi ${data.employerName},</p>

            <p>Good news! <strong>${data.candidateName}</strong> is interested in connecting with you about the <strong>${data.jobTitle}</strong> role.</p>

            <p>Their contact information is now available:</p>

            <div style="text-align: center;">
              <a href="${data.candidateProfileUrl}" class="button">View Candidate Profile</a>
            </div>

            <div class="contact-card">
              <h3 style="margin-top: 0; color: #059669;">Candidate Contact Details</h3>
              <ul>
                ${contactDetails.join("")}
              </ul>
            </div>

            <div class="tips">
              <h3 style="margin-top: 0;">Suggested next steps:</h3>
              <ol>
                <li><strong>Reach out within 48 hours</strong> - candidates respond best to quick follow-up</li>
                <li>Schedule an initial call to discuss the role</li>
                <li>Keep us posted on your progress</li>
              </ol>
            </div>

            <p>Need help with interview scheduling or have questions? Just reply to this email.</p>

            <div class="reminder">
              <strong>Reminder:</strong> This candidate is covered under your Service Agreement. If you hire ${data.candidateName}, the applicable placement fee applies.
            </div>

            <p>Best,<br>The SkillProof Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} SkillProof. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.employerEmail,
    subject: `${data.candidateName} accepted your introduction request`,
    html,
    text: `Hi ${data.employerName}, Good news! ${data.candidateName} is interested in connecting with you about the ${data.jobTitle} role. Contact: ${data.candidateEmail}${data.candidatePhone ? `, Phone: ${data.candidatePhone}` : ""}. View their full profile in your dashboard.`,
  });
}

/**
 * Introduction declined email to employer
 * Sent when a candidate declines an introduction request
 */
export async function sendIntroductionDeclinedEmail(data: {
  employerEmail: string;
  employerName: string;
  candidateFirstName: string;
  jobTitle: string;
  searchUrl: string;
}): Promise<{ success: boolean; error?: string; data?: any }> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #6B7280; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .info-card { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #6B7280; }
          .button { display: inline-block; background: #4F46E5; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .cta-section { text-align: center; margin: 30px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Update on Your Introduction Request</h1>
          </div>
          <div class="content">
            <p>Hi ${data.employerName},</p>

            <p>Unfortunately, the candidate you requested an introduction to for the <strong>${data.jobTitle}</strong> role is not available at this time.</p>

            <div class="info-card">
              <p style="margin: 0;">This could mean they've accepted another opportunity, aren't looking for new roles currently, or aren't the right fit for this specific position.</p>
            </div>

            <p>Don't worry - we have other qualified candidates for your role:</p>

            <div class="cta-section">
              <a href="${data.searchUrl}" class="button">Browse More Candidates</a>
            </div>

            <p>Our team is also happy to help you find the perfect match. Just reply to this email if you'd like personalized recommendations.</p>

            <p>Best,<br>The SkillProof Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} SkillProof. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.employerEmail,
    subject: `Update on your introduction request`,
    html,
    text: `Hi ${data.employerName}, Unfortunately, the candidate you requested an introduction to for the ${data.jobTitle} role is not available at this time. Browse more candidates at ${data.searchUrl}`,
  });
}

/**
 * Admin notification when candidate has questions about introduction
 * Sent to admin email when candidate selects "I Have Questions"
 */
export async function sendAdminIntroductionQuestionsAlert(data: {
  candidateName: string;
  candidateEmail: string;
  employerCompanyName: string;
  jobTitle: string;
  questions: string;
  introductionId: string;
}): Promise<{ success: boolean; error?: string; data?: any }> {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@getskillproof.com";
  const adminDashboardUrl = `${EMAIL_CONFIG.appUrl}/admin/introductions/${data.introductionId}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #7C3AED; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .info-card { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #7C3AED; }
          .questions-box { background: #F3F4F6; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #E5E7EB; }
          .questions-box blockquote { margin: 0; font-style: italic; color: #374151; white-space: pre-wrap; }
          .button { display: inline-block; background: #7C3AED; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .alert-icon { font-size: 48px; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Candidate Has Questions</h1>
          </div>
          <div class="content">
            <div class="alert-icon">❓</div>

            <p><strong>${data.candidateName}</strong> has questions before accepting an introduction to <strong>${data.employerCompanyName}</strong>.</p>

            <div class="info-card">
              <h3 style="margin-top: 0; color: #7C3AED;">Introduction Details</h3>
              <p><strong>Candidate:</strong> ${data.candidateName}</p>
              <p><strong>Email:</strong> <a href="mailto:${data.candidateEmail}" style="color: #7C3AED;">${data.candidateEmail}</a></p>
              <p><strong>Employer:</strong> ${data.employerCompanyName}</p>
              <p><strong>Position:</strong> ${data.jobTitle}</p>
            </div>

            <div class="questions-box">
              <h3 style="margin-top: 0;">Their Questions:</h3>
              <blockquote>"${data.questions}"</blockquote>
            </div>

            <div style="text-align: center;">
              <a href="${adminDashboardUrl}" class="button">View in Admin Dashboard</a>
            </div>

            <p><strong>Suggested actions:</strong></p>
            <ul>
              <li>Respond to candidate directly via email</li>
              <li>Relay questions to employer if appropriate</li>
              <li>Update the introduction status in the admin dashboard</li>
            </ul>

            <p>The candidate's contact information has NOT been shared with the employer yet.</p>
          </div>
          <div class="footer">
            <p>This is an automated alert from SkillProof.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `Candidate has questions about introduction - ${data.candidateName}`,
    html,
    text: `${data.candidateName} has questions before accepting introduction to ${data.employerCompanyName} for ${data.jobTitle}. Their questions: "${data.questions}". View in admin dashboard: ${adminDashboardUrl}`,
    from: EMAIL_ADDRESSES.admin,
    replyTo: 'admin@getskillproof.com',
  });
}

/**
 * Check-in email to candidate
 * Sent periodically (30, 60, 90, 180, 365 days) after introduction to detect potential circumvention
 */
export async function sendCheckInEmail(data: {
  candidateEmail: string;
  candidateName: string;
  employerCompanyName: string;
  jobTitle: string;
  checkInNumber: number; // 1=30d, 2=60d, 3=90d, 4=180d, 5=365d
  responseToken: string;
  introductionDate: Date;
}): Promise<{ success: boolean; error?: string; data?: any }> {
  const firstName = data.candidateName.split(" ")[0];
  const baseUrl = `${EMAIL_CONFIG.appUrl}/check-in/respond/${data.responseToken}`;

  // Create status links with query params
  const statusLinks = {
    interviewing: `${baseUrl}?status=interviewing`,
    offer: `${baseUrl}?status=offer`,
    hired_there: `${baseUrl}?status=hired_there`,
    hired_elsewhere: `${baseUrl}?status=hired_elsewhere`,
    rejected: `${baseUrl}?status=rejected`,
    withdrew: `${baseUrl}?status=withdrew`,
    no_response: `${baseUrl}?status=no_response`,
    still_looking: `${baseUrl}?status=still_looking`,
  };

  // Calculate days since introduction
  const daysSinceIntro = Math.floor(
    (Date.now() - data.introductionDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Different email content based on check-in number
  const checkInMessages: Record<number, { subject: string; greeting: string; mainQuestion: string }> = {
    1: {
      subject: `Quick check-in: How's it going with ${data.employerCompanyName}?`,
      greeting: `It's been about a month since we connected you with ${data.employerCompanyName}. We wanted to check in!`,
      mainQuestion: "Have you had a chance to interview with them?",
    },
    2: {
      subject: `Following up: Any updates on ${data.employerCompanyName}?`,
      greeting: `Hope you're doing well! It's been about 2 months since your introduction to ${data.employerCompanyName}.`,
      mainQuestion: "How has the process been going?",
    },
    3: {
      subject: `90-day check-in: ${data.employerCompanyName} opportunity`,
      greeting: `Just checking in - it's been about 3 months since we connected you with ${data.employerCompanyName}.`,
      mainQuestion: "What's the current status of this opportunity?",
    },
    4: {
      subject: `6-month update request: ${data.employerCompanyName}`,
      greeting: `It's been about 6 months since your introduction to ${data.employerCompanyName}. We'd love a quick update!`,
      mainQuestion: "Where did things land with this opportunity?",
    },
    5: {
      subject: `Annual check-in: ${data.employerCompanyName} connection`,
      greeting: `Time flies! It's been a year since we connected you with ${data.employerCompanyName}.`,
      mainQuestion: "We'd love to know how things worked out.",
    },
  };

  const message = checkInMessages[data.checkInNumber] || checkInMessages[1];

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .status-section { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; }
          .status-grid { display: grid; gap: 10px; margin: 20px 0; }
          .status-btn { display: block; padding: 14px 20px; text-align: center; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 5px 0; }
          .status-positive { background: #059669; color: white; }
          .status-interview { background: #3B82F6; color: white; }
          .status-neutral { background: #6B7280; color: white; }
          .status-negative { background: #EF4444; color: white; }
          .status-outline { background: white; color: #4F46E5; border: 2px solid #4F46E5; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .note { background: #FEF3C7; border: 1px solid #F59E0B; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 14px; }
          .subtitle { color: #6B7280; font-size: 14px; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Quick Update Request</h1>
            <p class="subtitle">Re: ${data.jobTitle} at ${data.employerCompanyName}</p>
          </div>
          <div class="content">
            <p>Hi ${firstName},</p>

            <p>${message.greeting}</p>

            <p><strong>${message.mainQuestion}</strong></p>

            <div class="status-section">
              <p style="margin-top: 0; font-weight: bold;">Just click the option that best describes your situation:</p>

              <a href="${statusLinks.interviewing}" class="status-btn status-interview">
                📅 I'm in the interview process
              </a>

              <a href="${statusLinks.offer}" class="status-btn status-positive">
                🎉 I received an offer
              </a>

              <a href="${statusLinks.hired_there}" class="status-btn status-positive">
                ✅ I got hired there!
              </a>

              <a href="${statusLinks.hired_elsewhere}" class="status-btn status-neutral">
                🔄 I found a job elsewhere
              </a>

              <a href="${statusLinks.rejected}" class="status-btn status-negative">
                ❌ They didn't move forward with me
              </a>

              <a href="${statusLinks.withdrew}" class="status-btn status-neutral">
                🚫 I withdrew from consideration
              </a>

              <a href="${statusLinks.no_response}" class="status-btn status-neutral">
                📭 Never heard back from them
              </a>

              <a href="${statusLinks.still_looking}" class="status-btn status-outline">
                🔍 Still looking / Waiting to hear back
              </a>
            </div>

            <div class="note">
              <strong>Why are we asking?</strong><br>
              As your career partner, we like to follow up on introductions we facilitate. Your feedback helps us improve and ensure employers are responsive.
            </div>

            <p>Thanks for taking a moment to update us!</p>

            <p>Best,<br>The SkillProof Team</p>
          </div>
          <div class="footer">
            <p>You're receiving this because we introduced you to ${data.employerCompanyName} on ${data.introductionDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>
            <p>&copy; ${new Date().getFullYear()} SkillProof. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: data.candidateEmail,
    subject: message.subject,
    html,
    text: `Hi ${firstName}, ${message.greeting} ${message.mainQuestion} Please visit ${baseUrl} to let us know the current status. Thanks! - The SkillProof Team`,
  });
}

export default {
  sendCandidateWelcomeEmail,
  sendEmployerWelcomeEmail,
  sendApplicationConfirmationEmail,
  sendNewApplicationNotificationEmail,
  sendTestInvitationEmail,
  sendJobClaimNotificationEmail,
  sendPaymentReminderEmail,
  sendApplicationStatusUpdateEmail,
  sendPaymentSuccessEmail,
  sendEmailVerificationEmail,
  sendIntroductionRequestEmail,
  sendIntroductionAcceptedEmail,
  sendIntroductionDeclinedEmail,
  sendAdminIntroductionQuestionsAlert,
  sendCheckInEmail,
};
