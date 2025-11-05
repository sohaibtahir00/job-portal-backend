import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PlacementStatus } from "@prisma/client";
import {
  verifyCronAuth,
  createCronAuthError,
  logCronJob,
  formatDuration,
  batchProcess,
} from "@/lib/cron";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";
import { formatCurrency } from "@/lib/stripe";

/**
 * POST /api/cron/guarantee-checks
 * Check 90-day guarantee periods ending soon
 *
 * This endpoint should be called by a cron scheduler
 * Recommended schedule: Daily at 10 AM
 *
 * Authentication:
 * - Requires CRON_SECRET in Authorization header or x-cron-secret header
 *
 * Process:
 * 1. Find placements with guarantee periods ending in 7 days
 * 2. Send notification emails to employers
 * 3. Find placements with expired guarantees
 * 4. Update placement status if needed
 *
 * Response:
 * - 200: { success: true, notifications: N, expired: N }
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

    console.log("[CRON] Starting guarantee-checks task...");

    const now = new Date();

    // Calculate dates
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

    // Find placements with guarantees expiring in 7 days
    const placementsExpiringSoon = await prisma.placement.findMany({
      where: {
        status: PlacementStatus.CONFIRMED,
        guaranteeEndDate: {
          gte: sevenDaysFromNow,
          lt: eightDaysFromNow,
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
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        job: {
          select: {
            title: true,
          },
        },
      },
    });

    console.log(`[CRON] Found ${placementsExpiringSoon.length} guarantees expiring in 7 days`);

    // Send expiration warnings
    const warningsSent: string[] = [];

    if (placementsExpiringSoon.length > 0) {
      const warningResult = await batchProcess(
        placementsExpiringSoon,
        async (placement) => {
          if (!placement.employer || !placement.guaranteeEndDate) {
            throw new Error(`Placement ${placement.id} missing required data`);
          }

          const daysRemaining = Math.ceil(
            (placement.guaranteeEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

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
                          <td style="background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%); padding: 40px 40px 60px; border-radius: 8px 8px 0 0; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                              ⏰ Guarantee Period Ending Soon
                            </h1>
                          </td>
                        </tr>

                        <!-- Content -->
                        <tr>
                          <td style="padding: 40px; background-color: #ffffff;">
                            <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                              Hi <strong>${placement.employer.user.name}</strong>,
                            </p>

                            <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                              The ${placement.guaranteePeriodDays}-day guarantee period for one of your placements is ending in <strong>${daysRemaining} days</strong>.
                            </p>

                            <!-- Placement Info Box -->
                            <div style="background: #DBEAFE; border-left: 4px solid #3B82F6; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                              <p style="margin: 0 0 10px; color: #1E40AF; font-weight: 600; font-size: 16px;">
                                ${placement.candidate.user.name} - ${placement.jobTitle}
                              </p>
                              <p style="margin: 0; color: #1E3A8A; font-size: 14px;">
                                Start Date: ${placement.startDate.toLocaleDateString()}<br>
                                Guarantee Ends: ${placement.guaranteeEndDate.toLocaleDateString()}<br>
                                Placement Fee: ${formatCurrency(placement.placementFee || 0)}
                              </p>
                            </div>

                            <div style="background-color: #FEF3C7; border: 1px solid #FCD34D; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                              <p style="margin: 0 0 10px; color: #92400E; font-weight: 600; font-size: 14px;">
                                ⚠️ Important Reminder
                              </p>
                              <p style="margin: 0; color: #78350F; font-size: 14px; line-height: 1.6;">
                                If the candidate leaves or is terminated within the guarantee period, you may be eligible for a replacement or refund according to our guarantee terms.
                              </p>
                            </div>

                            <div style="background-color: #F0FDF4; border: 1px solid #86EFAC; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                              <p style="margin: 0 0 10px; color: #166534; font-weight: 600; font-size: 14px;">
                                ✅ What to do:
                              </p>
                              <ul style="margin: 0; padding-left: 20px; color: #166534; font-size: 14px;">
                                <li>Review the candidate's performance</li>
                                <li>If satisfied, no action needed - guarantee expires automatically</li>
                                <li>If there are issues, contact us before the guarantee expires</li>
                              </ul>
                            </div>

                            <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                              <tr>
                                <td style="border-radius: 6px; background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);">
                                  <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/placements/${placement.id}"
                                     style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                                    View Placement Details
                                  </a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                          <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0 0 10px; color: #666666; font-size: 12px; line-height: 1.6; text-align: center;">
                              Questions about the guarantee? Contact us at ${EMAIL_CONFIG.replyTo}
                            </p>
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
            to: placement.employer.user.email,
            subject: `⏰ Guarantee Period Ending in ${daysRemaining} Days - ${placement.candidate.user.name}`,
            html: emailHtml,
          });

          warningsSent.push(placement.id);
        },
        { batchSize: 5, delayMs: 200 }
      );
    }

    // Find placements with expired guarantees
    const placementsWithExpiredGuarantees = await prisma.placement.findMany({
      where: {
        status: PlacementStatus.CONFIRMED,
        guaranteeEndDate: {
          lt: now,
        },
      },
    });

    console.log(`[CRON] Found ${placementsWithExpiredGuarantees.length} placements with expired guarantees`);

    // Update status to COMPLETED for expired guarantees
    const completedPlacements: string[] = [];

    if (placementsWithExpiredGuarantees.length > 0) {
      const updateResult = await batchProcess(
        placementsWithExpiredGuarantees,
        async (placement) => {
          await prisma.placement.update({
            where: { id: placement.id },
            data: {
              status: PlacementStatus.COMPLETED,
            },
          });

          completedPlacements.push(placement.id);
        },
        { batchSize: 10, delayMs: 50 }
      );
    }

    const result = logCronJob("guarantee-checks", {
      success: true,
      processed: warningsSent.length + completedPlacements.length,
      message: `Sent ${warningsSent.length} warnings, completed ${completedPlacements.length} placements`,
    });

    return NextResponse.json({
      ...result,
      warningsSent: warningsSent.length,
      placementsCompleted: completedPlacements.length,
      duration: formatDuration(startTime),
    });
  } catch (error) {
    console.error("[CRON] guarantee-checks error:", error);

    const result = logCronJob("guarantee-checks", {
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
 * GET /api/cron/guarantee-checks
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

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

    // Count placements
    const [expiringSoon, expired] = await Promise.all([
      prisma.placement.count({
        where: {
          status: PlacementStatus.CONFIRMED,
          guaranteeEndDate: {
            gte: sevenDaysFromNow,
            lt: eightDaysFromNow,
          },
        },
      }),
      prisma.placement.count({
        where: {
          status: PlacementStatus.CONFIRMED,
          guaranteeEndDate: {
            lt: now,
          },
        },
      }),
    ]);

    return NextResponse.json({
      job: "guarantee-checks",
      description: "Check 90-day guarantee periods and send notifications",
      schedule: "Daily at 10 AM (recommended)",
      pendingActions: expiringSoon + expired,
      breakdown: {
        expiringSoonIn7Days: expiringSoon,
        expiredGuarantees: expired,
      },
      config: {
        warningDays: 7,
        defaultGuaranteePeriod: 90,
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
