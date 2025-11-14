import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  console.warn("RESEND_API_KEY is not set in environment variables. Email functionality will be disabled.");
}

// Initialize Resend client
export const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Email configuration
 */
export const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || "Job Portal <noreply@jobportal.com>",
  replyTo: process.env.EMAIL_REPLY_TO || "support@jobportal.com",
  appName: "Job Portal",
  appUrl: process.env.NEXTAUTH_URL || "http://localhost:3000",
};

/**
 * Email sending utility with error handling
 */
export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
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
      from: EMAIL_CONFIG.from,
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
};
