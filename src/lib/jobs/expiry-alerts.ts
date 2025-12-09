import { prisma } from "@/lib/prisma";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";
import { generateIntroductionToken, generateTokenExpiry } from "@/lib/tokens";
import { IntroductionStatus } from "@prisma/client";

/**
 * Result of the expiry alerts job run
 */
export interface ExpiryAlertsResult {
  expiringIn7Days: number;
  expiredMarked: number;
  alertsSent: number;
  finalCheckInsSent: number;
  errors: string[];
}

/**
 * Interface for introduction data with expiry info
 */
interface ExpiringIntroduction {
  id: string;
  candidateName: string;
  candidateEmail: string;
  employerCompanyName: string;
  jobTitle: string | null;
  introducedAt: Date | null;
  protectionEndsAt: Date;
  lastCheckIn: {
    respondedAt: Date | null;
    responseType: string | null;
    responseRaw: string | null;
  } | null;
}

/**
 * Run the expiry alerts job
 * This job should run daily (via cron, Vercel cron, or similar)
 *
 * It does three things:
 * 1. Finds introductions expiring in 7 days and sends admin alert
 * 2. Marks expired introductions as EXPIRED
 * 3. Optionally sends final check-in emails
 */
export async function runExpiryAlerts(): Promise<ExpiryAlertsResult> {
  const result: ExpiryAlertsResult = {
    expiringIn7Days: 0,
    expiredMarked: 0,
    alertsSent: 0,
    finalCheckInsSent: 0,
    errors: [],
  };

  const now = new Date();
  console.log(`[Expiry Alerts] Starting run at ${now.toISOString()}`);

  try {
    // Step 1: Find introductions expiring in exactly 7 days (6-7 day window)
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sixDaysFromNow = new Date(now);
    sixDaysFromNow.setDate(sixDaysFromNow.getDate() + 6);

    const expiringIn7Days = await prisma.candidateIntroduction.findMany({
      where: {
        status: IntroductionStatus.INTRODUCED,
        protectionEndsAt: {
          gte: sixDaysFromNow,
          lte: sevenDaysFromNow,
        },
      },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        employer: {
          select: {
            companyName: true,
          },
        },
        job: {
          select: {
            title: true,
          },
        },
        checkIns: {
          orderBy: { checkInNumber: "desc" },
          take: 1,
        },
      },
    });

    result.expiringIn7Days = expiringIn7Days.length;
    console.log(`[Expiry Alerts] Found ${expiringIn7Days.length} introductions expiring in 7 days`);

    // Send admin alert if there are expiring introductions
    if (expiringIn7Days.length > 0) {
      const introductionsData: ExpiringIntroduction[] = expiringIn7Days.map((intro) => ({
        id: intro.id,
        candidateName: intro.candidate.user.name,
        candidateEmail: intro.candidate.user.email,
        employerCompanyName: intro.employer.companyName,
        jobTitle: intro.job?.title || null,
        introducedAt: intro.introducedAt,
        protectionEndsAt: intro.protectionEndsAt,
        lastCheckIn: intro.checkIns[0]
          ? {
              respondedAt: intro.checkIns[0].respondedAt,
              responseType: intro.checkIns[0].responseType,
              responseRaw: intro.checkIns[0].responseRaw,
            }
          : null,
      }));

      const alertResult = await sendAdminExpiryAlert({
        introductions: introductionsData,
        daysUntilExpiry: 7,
      });

      if (alertResult.success) {
        result.alertsSent++;
        console.log(`[Expiry Alerts] Sent admin alert for ${expiringIn7Days.length} expiring introductions`);
      } else {
        result.errors.push(`Failed to send admin alert: ${alertResult.error}`);
      }
    }

    // Step 2: Mark expired introductions as EXPIRED
    const expiredCount = await prisma.candidateIntroduction.updateMany({
      where: {
        status: IntroductionStatus.INTRODUCED,
        protectionEndsAt: { lt: now },
      },
      data: {
        status: IntroductionStatus.EXPIRED,
      },
    });

    result.expiredMarked = expiredCount.count;
    console.log(`[Expiry Alerts] Marked ${expiredCount.count} introductions as expired`);

    console.log(
      `[Expiry Alerts] Completed. Expiring in 7 days: ${result.expiringIn7Days}, Expired marked: ${result.expiredMarked}, Alerts sent: ${result.alertsSent}`
    );

    return result;
  } catch (error) {
    const errorMsg = `Fatal error in expiry alerts job: ${error}`;
    console.error(`[Expiry Alerts] ${errorMsg}`);
    result.errors.push(errorMsg);
    return result;
  }
}

/**
 * Send admin alert email for expiring introductions
 */
async function sendAdminExpiryAlert(data: {
  introductions: ExpiringIntroduction[];
  daysUntilExpiry: number;
}): Promise<{ success: boolean; error?: string }> {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@getskillproof.com";
  const dashboardUrl = `${EMAIL_CONFIG.appUrl}/admin/introductions?filter=expiring`;

  const introductionsList = data.introductions
    .map((intro) => {
      const expiryDate = intro.protectionEndsAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const introDate = intro.introducedAt
        ? intro.introducedAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "N/A";

      let lastCheckInInfo = "No check-ins sent";
      if (intro.lastCheckIn) {
        if (intro.lastCheckIn.respondedAt) {
          const respondedDate = intro.lastCheckIn.respondedAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const summary =
            intro.lastCheckIn.responseRaw?.substring(0, 50) ||
            intro.lastCheckIn.responseType ||
            "Response received";
          lastCheckInInfo = `${respondedDate} - "${summary}"`;
        } else {
          lastCheckInInfo = "No response";
        }
      }

      return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">
            <strong>${intro.candidateName}</strong><br>
            <span style="color: #6B7280; font-size: 14px;">→ ${intro.employerCompanyName}</span>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${intro.jobTitle || "N/A"}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${introDate}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; color: #DC2626; font-weight: 600;">${expiryDate}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; font-size: 13px;">${lastCheckInInfo}</td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { background: #F59E0B; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .alert-box { background: #FEF3C7; border: 1px solid #F59E0B; padding: 15px; border-radius: 6px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; }
          th { background: #F3F4F6; padding: 12px; text-align: left; font-size: 14px; color: #374151; }
          .button { display: inline-block; background: #4F46E5; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Protection Periods Expiring Soon</h1>
            <p>${data.introductions.length} introduction${data.introductions.length > 1 ? "s" : ""} expiring in ${data.daysUntilExpiry} days</p>
          </div>
          <div class="content">
            <div class="alert-box">
              <strong>Action Required:</strong> The following candidate introductions have protection periods expiring in ${data.daysUntilExpiry} days.
              Consider sending a final check-in or follow-up before protection expires.
            </div>

            <table>
              <thead>
                <tr>
                  <th>Candidate → Company</th>
                  <th>Position</th>
                  <th>Introduced</th>
                  <th>Expires</th>
                  <th>Last Check-in</th>
                </tr>
              </thead>
              <tbody>
                ${introductionsList}
              </tbody>
            </table>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${dashboardUrl}" class="button">View in Dashboard</a>
            </div>

            <p style="margin-top: 30px;">
              <strong>Recommended Actions:</strong>
            </p>
            <ul>
              <li>Send a final check-in email to candidates who haven't responded recently</li>
              <li>Review any outstanding responses for potential circumvention</li>
              <li>Archive introductions where you've confirmed no hire occurred</li>
            </ul>
          </div>
          <div class="footer">
            <p>SkillProof | Fee Protection System</p>
            <p>This is an automated alert from your admin dashboard.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `⚠️ ${data.introductions.length} protection period${data.introductions.length > 1 ? "s" : ""} expiring in ${data.daysUntilExpiry} days`,
    html,
    text: `${data.introductions.length} candidate introduction(s) have protection periods expiring in ${data.daysUntilExpiry} days. View details at ${dashboardUrl}`,
  });
}

/**
 * Send final check-in email to candidate
 * Called when admin clicks "Send Final Check" button
 */
export async function sendFinalCheckInEmail(introductionId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const introduction = await prisma.candidateIntroduction.findUnique({
      where: { id: introductionId },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        employer: {
          select: {
            companyName: true,
          },
        },
        job: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!introduction) {
      return { success: false, error: "Introduction not found" };
    }

    // Generate new response token
    const responseToken = generateIntroductionToken();
    const tokenExpiry = generateTokenExpiry(14); // 14 days to respond

    // Update introduction with new token
    await prisma.candidateIntroduction.update({
      where: { id: introductionId },
      data: {
        responseToken,
        responseTokenExpiry: tokenExpiry,
      },
    });

    const candidateName = introduction.candidate.user.name;
    const candidateEmail = introduction.candidate.user.email;
    const companyName = introduction.employer.companyName;
    const jobTitle = introduction.job?.title || "the position";

    const baseUrl = EMAIL_CONFIG.appUrl;
    const yesLink = `${baseUrl}/check-in/respond/${responseToken}?response=yes`;
    const noLink = `${baseUrl}/check-in/respond/${responseToken}?response=no`;

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
            .button { display: inline-block; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 10px 5px; font-weight: bold; }
            .button-yes { background: #10B981; color: white; }
            .button-no { background: #6B7280; color: white; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
            .final-notice { background: #FEF3C7; border: 1px solid #F59E0B; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Final Check-in</h1>
              <p>${companyName} opportunity</p>
            </div>
            <div class="content">
              <p>Hi ${candidateName},</p>

              <p>About a year ago, we connected you with <strong>${companyName}</strong> for the <strong>${jobTitle}</strong> role.</p>

              <p>Just one final check - did you end up working with them at any point?</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${yesLink}" class="button button-yes">Yes, I work/worked there</a>
                <a href="${noLink}" class="button button-no">No, it didn't work out</a>
              </div>

              <div class="final-notice">
                <strong>Note:</strong> This is our last follow-up for this introduction. Thank you for your time and cooperation throughout the process.
              </div>

              <p>Best regards,<br>The SkillProof Team</p>
            </div>
            <div class="footer">
              <p>SkillProof | Connecting Talent with Opportunity</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailResult = await sendEmail({
      to: candidateEmail,
      subject: `Final check-in: ${companyName} opportunity`,
      html,
      text: `Hi ${candidateName}, About a year ago, we connected you with ${companyName} for the ${jobTitle} role. Did you end up working with them? Visit ${yesLink} for yes or ${noLink} for no. This is our last follow-up for this introduction. Best, The SkillProof Team`,
    });

    if (emailResult.success) {
      // Create a final check-in record
      await prisma.candidateCheckIn.create({
        data: {
          introductionId,
          checkInNumber: 6, // Final check-in
          scheduledFor: new Date(),
          sentAt: new Date(),
          responseToken,
          responseTokenExpiry: tokenExpiry,
        },
      });

      console.log(`[Expiry Alerts] Sent final check-in email for introduction ${introductionId}`);
    }

    return emailResult;
  } catch (error) {
    console.error(`[Expiry Alerts] Error sending final check-in:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get expiring introductions count by time period
 * Used for dashboard statistics
 */
export async function getExpiringIntroductionsCounts(): Promise<{
  in7Days: number;
  in30Days: number;
  in90Days: number;
  recentlyExpired: number;
}> {
  const now = new Date();

  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);

  const in90Days = new Date(now);
  in90Days.setDate(in90Days.getDate() + 90);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [expiring7, expiring30, expiring90, recentExpired] = await Promise.all([
    prisma.candidateIntroduction.count({
      where: {
        status: IntroductionStatus.INTRODUCED,
        protectionEndsAt: { gte: now, lte: in7Days },
      },
    }),
    prisma.candidateIntroduction.count({
      where: {
        status: IntroductionStatus.INTRODUCED,
        protectionEndsAt: { gte: now, lte: in30Days },
      },
    }),
    prisma.candidateIntroduction.count({
      where: {
        status: IntroductionStatus.INTRODUCED,
        protectionEndsAt: { gte: now, lte: in90Days },
      },
    }),
    prisma.candidateIntroduction.count({
      where: {
        status: IntroductionStatus.EXPIRED,
        protectionEndsAt: { gte: thirtyDaysAgo, lt: now },
      },
    }),
  ]);

  return {
    in7Days: expiring7,
    in30Days: expiring30,
    in90Days: expiring90,
    recentlyExpired: recentExpired,
  };
}
