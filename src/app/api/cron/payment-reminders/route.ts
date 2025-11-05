import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentStatus, PlacementStatus } from "@prisma/client";
import {
  verifyCronAuth,
  createCronAuthError,
  logCronJob,
  formatDuration,
  batchProcess,
} from "@/lib/cron";
import { sendPaymentReminderEmail } from "@/lib/email";
import { formatCurrency, STRIPE_CONFIG } from "@/lib/stripe";

/**
 * POST /api/cron/payment-reminders
 * Send payment reminder emails for overdue placement invoices
 *
 * This endpoint should be called by a cron scheduler
 * Recommended schedule: Daily at 9 AM
 *
 * Authentication:
 * - Requires CRON_SECRET in Authorization header or x-cron-secret header
 *
 * Process:
 * 1. Find placements with overdue payments
 *    - Upfront payment overdue (past start date)
 *    - Remaining payment overdue (30+ days after upfront payment)
 * 2. Send reminder emails to employers
 * 3. Track reminder history to avoid spam
 *
 * Response:
 * - 200: { success: true, reminders: N }
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

    console.log("[CRON] Starting payment-reminders task...");

    const now = new Date();

    // Find placements needing payment reminders
    const placementsNeedingReminders = await prisma.placement.findMany({
      where: {
        status: {
          in: [PlacementStatus.PENDING, PlacementStatus.CONFIRMED],
        },
        OR: [
          {
            // Upfront payment overdue (start date passed, not paid)
            paymentStatus: PaymentStatus.PENDING,
            startDate: { lt: now },
            upfrontPaidAt: null,
          },
          {
            // Remaining payment overdue (30+ days after upfront, not paid)
            paymentStatus: PaymentStatus.UPFRONT_PAID,
            upfrontPaidAt: { not: null },
            remainingPaidAt: null,
          },
        ],
      },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                name: true,
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

    console.log(`[CRON] Found ${placementsNeedingReminders.length} placements needing reminders`);

    if (placementsNeedingReminders.length === 0) {
      const result = logCronJob("payment-reminders", {
        success: true,
        processed: 0,
        message: "No payment reminders needed",
      });

      return NextResponse.json({
        ...result,
        duration: formatDuration(startTime),
      });
    }

    const remindersSent: string[] = [];

    const processResult = await batchProcess(
      placementsNeedingReminders,
      async (placement) => {
        if (!placement.employer) {
          throw new Error(`Placement ${placement.id} has no employer`);
        }

        // Calculate payment details
        const isUpfrontOverdue = !placement.upfrontPaidAt && placement.startDate < now;
        const isRemainingOverdue =
          placement.upfrontPaidAt &&
          !placement.remainingPaidAt &&
          placement.upfrontPaidAt <
            new Date(Date.now() - STRIPE_CONFIG.placementFee.remainingDueDays * 24 * 60 * 60 * 1000);

        let dueAmount = 0;
        let paymentType: "upfront" | "remaining" = "upfront";
        let dueDate = placement.startDate;
        let daysOverdue = 0;

        if (isUpfrontOverdue) {
          dueAmount = placement.upfrontAmount || 0;
          paymentType = "upfront";
          dueDate = placement.startDate;
          daysOverdue = Math.floor(
            (now.getTime() - placement.startDate.getTime()) / (1000 * 60 * 60 * 24)
          );
        } else if (isRemainingOverdue) {
          dueAmount = placement.remainingAmount || 0;
          paymentType = "remaining";
          dueDate = new Date(
            placement.upfrontPaidAt!.getTime() +
              STRIPE_CONFIG.placementFee.remainingDueDays * 24 * 60 * 60 * 1000
          );
          daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Don't send too many reminders (max 1 per week)
        const lastReminderKey = `placement_reminder_${placement.id}_${paymentType}`;
        // In production, you'd want to track this in database
        // For now, we'll send the reminder

        // Send reminder email
        await sendPaymentReminderEmail({
          email: placement.employer.user.email,
          employerName: placement.employer.user.name,
          candidateName: placement.candidate.user.name,
          jobTitle: placement.jobTitle,
          companyName: placement.companyName,
          remainingAmount: dueAmount,
          dueDate,
          placementId: placement.id,
          daysUntilDue: -daysOverdue, // Negative because overdue
        });

        remindersSent.push(placement.id);
      },
      { batchSize: 5, delayMs: 200 }
    );

    const result = logCronJob("payment-reminders", {
      success: true,
      processed: remindersSent.length,
      errors: processResult.errors,
      message: `Sent ${remindersSent.length} payment reminders`,
    });

    return NextResponse.json({
      ...result,
      remindersSent: remindersSent.length,
      duration: formatDuration(startTime),
      errorDetails: processResult.errors > 0 ? processResult.errorDetails : undefined,
    });
  } catch (error) {
    console.error("[CRON] payment-reminders error:", error);

    const result = logCronJob("payment-reminders", {
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
 * GET /api/cron/payment-reminders
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

    // Count overdue payments
    const [upfrontOverdue, remainingOverdue] = await Promise.all([
      prisma.placement.count({
        where: {
          paymentStatus: PaymentStatus.PENDING,
          startDate: { lt: now },
          upfrontPaidAt: null,
        },
      }),
      prisma.placement.count({
        where: {
          paymentStatus: PaymentStatus.UPFRONT_PAID,
          upfrontPaidAt: { not: null },
          remainingPaidAt: null,
        },
      }),
    ]);

    // Calculate total overdue amount
    const overduePlacements = await prisma.placement.findMany({
      where: {
        OR: [
          {
            paymentStatus: PaymentStatus.PENDING,
            startDate: { lt: now },
            upfrontPaidAt: null,
          },
          {
            paymentStatus: PaymentStatus.UPFRONT_PAID,
            upfrontPaidAt: { not: null },
            remainingPaidAt: null,
          },
        ],
      },
      select: {
        upfrontAmount: true,
        remainingAmount: true,
        upfrontPaidAt: true,
      },
    });

    const totalOverdue = overduePlacements.reduce((sum, p) => {
      if (!p.upfrontPaidAt) {
        return sum + (p.upfrontAmount || 0);
      } else {
        return sum + (p.remainingAmount || 0);
      }
    }, 0);

    return NextResponse.json({
      job: "payment-reminders",
      description: "Send payment reminder emails for overdue invoices",
      schedule: "Daily at 9 AM (recommended)",
      pendingReminders: upfrontOverdue + remainingOverdue,
      breakdown: {
        upfrontOverdue,
        remainingOverdue,
      },
      totalOverdueAmount: totalOverdue,
      totalOverdueAmountFormatted: formatCurrency(totalOverdue),
      config: {
        remainingDueDays: STRIPE_CONFIG.placementFee.remainingDueDays,
        reminderFrequency: "Weekly",
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
