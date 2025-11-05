import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { JobStatus } from "@prisma/client";
import {
  verifyCronAuth,
  createCronAuthError,
  logCronJob,
  formatDuration,
  batchProcess,
} from "@/lib/cron";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";

/**
 * POST /api/cron/expire-jobs
 * Mark jobs as expired after deadline or 60 days
 *
 * This endpoint should be called by a cron scheduler (Railway cron, cron-job.org, etc.)
 * Recommended schedule: Daily at 2 AM
 *
 * Authentication:
 * - Requires CRON_SECRET in Authorization header or x-cron-secret header
 * - Example: Authorization: Bearer YOUR_CRON_SECRET
 *
 * Process:
 * 1. Find ACTIVE jobs past deadline or older than 60 days
 * 2. Mark them as EXPIRED
 * 3. Send notification emails to employers
 *
 * Response:
 * - 200: { success: true, expired: N, notified: N }
 * - 401: Invalid authentication
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron authentication
    if (!verifyCronAuth(request)) {
      const error = createCronAuthError();
      return NextResponse.json(
        { error: error.error, message: error.message },
        { status: error.status }
      );
    }

    console.log("[CRON] Starting expire-jobs task...");

    // Calculate expiration date (60 days ago)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const now = new Date();

    // Find jobs to expire
    const jobsToExpire = await prisma.job.findMany({
      where: {
        status: JobStatus.ACTIVE,
        OR: [
          {
            // Jobs with deadline that has passed
            deadline: {
              lt: now,
            },
          },
          {
            // Jobs older than 60 days with no deadline
            deadline: null,
            createdAt: {
              lt: sixtyDaysAgo,
            },
          },
        ],
      },
      include: {
        employer: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
    });

    console.log(`[CRON] Found ${jobsToExpire.length} jobs to expire`);

    if (jobsToExpire.length === 0) {
      const result = logCronJob("expire-jobs", {
        success: true,
        processed: 0,
        message: "No jobs to expire",
      });

      return NextResponse.json({
        ...result,
        duration: formatDuration(startTime),
      });
    }

    // Expire jobs in batches
    const expiredJobIds: string[] = [];
    const emailsSent: number[] = [];

    const processResult = await batchProcess(
      jobsToExpire,
      async (job) => {
        // Mark job as expired
        await prisma.job.update({
          where: { id: job.id },
          data: { status: JobStatus.EXPIRED },
        });

        expiredJobIds.push(job.id);

        // Send notification email to employer
        try {
          const expiredReason = job.deadline
            ? `The application deadline (${job.deadline.toLocaleDateString()}) has passed.`
            : `This job was posted more than 60 days ago.`;

          const emailHtml = `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f5f5f5;">
                  <tr>
                    <td style="padding: 40px 20px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

                        <!-- Header -->
                        <tr>
                          <td style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 40px 40px 60px; border-radius: 8px 8px 0 0; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                              📅 Job Posting Expired
                            </h1>
                          </td>
                        </tr>

                        <!-- Content -->
                        <tr>
                          <td style="padding: 40px; background-color: #ffffff;">
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                              Hi <strong>${job.employer.user.name}</strong>,
                            </p>

                            <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                              Your job posting has been marked as expired:
                            </p>

                            <!-- Job Info Box -->
                            <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                              <p style="margin: 0 0 10px; color: #D97706; font-weight: 600; font-size: 16px;">
                                ${job.title}
                              </p>
                              <p style="margin: 0; color: #92400E; font-size: 14px;">
                                Posted: ${job.createdAt.toLocaleDateString()}<br>
                                ${job.deadline ? `Deadline: ${job.deadline.toLocaleDateString()}<br>` : ""}
                                Applications: ${job._count.applications}
                              </p>
                            </div>

                            <p style="margin: 0 0 30px; color: #666666; font-size: 14px; line-height: 1.6;">
                              <strong>Reason:</strong> ${expiredReason}
                            </p>

                            <div style="background-color: #F0FDF4; border: 1px solid #86EFAC; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                              <p style="margin: 0 0 10px; color: #166534; font-weight: 600; font-size: 14px;">
                                💡 What you can do:
                              </p>
                              <ul style="margin: 0; padding-left: 20px; color: #166534; font-size: 14px;">
                                <li>Review applications received (${job._count.applications} total)</li>
                                <li>Repost the job if still hiring</li>
                                <li>Close the position if filled</li>
                              </ul>
                            </div>

                            <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                              <tr>
                                <td style="border-radius: 6px; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);">
                                  <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/jobs/${job.id}"
                                     style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                                    View Job Details
                                  </a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                          <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                              © ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.
                            </p>
                          </td>
                        </tr>

                      </table>
                    </td>
                  </tr>
                </table>
              </body>
            </html>
          `;

          await sendEmail({
            to: job.employer.user.email,
            subject: `Job Posting Expired: ${job.title}`,
            html: emailHtml,
          });

          emailsSent.push(1);
        } catch (emailError) {
          console.error(`Failed to send expiration email for job ${job.id}:`, emailError);
          // Don't fail the job expiration if email fails
        }
      },
      { batchSize: 10, delayMs: 100 }
    );

    const result = logCronJob("expire-jobs", {
      success: true,
      processed: expiredJobIds.length,
      errors: processResult.errors,
      message: `Expired ${expiredJobIds.length} jobs, sent ${emailsSent.length} notifications`,
    });

    return NextResponse.json({
      ...result,
      expiredJobs: expiredJobIds.length,
      emailsSent: emailsSent.length,
      duration: formatDuration(startTime),
      errorDetails: processResult.errors > 0 ? processResult.errorDetails : undefined,
    });
  } catch (error) {
    console.error("[CRON] expire-jobs error:", error);

    const result = logCronJob("expire-jobs", {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        ...result,
        duration: formatDuration(startTime),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/expire-jobs
 * Get information about the cron job
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron authentication
    if (!verifyCronAuth(request)) {
      const error = createCronAuthError();
      return NextResponse.json(
        { error: error.error, message: error.message },
        { status: error.status }
      );
    }

    // Get count of jobs that would be expired
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const now = new Date();

    const count = await prisma.job.count({
      where: {
        status: JobStatus.ACTIVE,
        OR: [
          { deadline: { lt: now } },
          { deadline: null, createdAt: { lt: sixtyDaysAgo } },
        ],
      },
    });

    return NextResponse.json({
      job: "expire-jobs",
      description: "Mark jobs as expired after deadline or 60 days",
      schedule: "Daily at 2 AM (recommended)",
      pendingExpiration: count,
      config: {
        expirationDays: 60,
        notifyEmployers: true,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to get cron job info",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
