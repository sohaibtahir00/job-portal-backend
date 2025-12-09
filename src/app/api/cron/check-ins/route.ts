import { NextRequest, NextResponse } from "next/server";
import { runCheckInScheduler } from "@/lib/jobs/check-in-scheduler";

/**
 * GET /api/cron/check-ins
 * Cron endpoint to run the check-in scheduler
 *
 * This should be called daily by:
 * - Vercel Cron (recommended for production)
 * - External cron service (e.g., cron-job.org)
 * - Server cron job
 *
 * Security: Requires CRON_SECRET to prevent unauthorized calls
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized calls
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // If CRON_SECRET is set, verify the authorization header
    if (cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        console.log("[Cron Check-ins] Unauthorized request - invalid or missing authorization header");
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    } else {
      // Log warning if CRON_SECRET is not set
      console.warn("[Cron Check-ins] WARNING: CRON_SECRET is not set - endpoint is unprotected");
    }

    console.log("[Cron Check-ins] Starting scheduled check-in job");

    const result = await runCheckInScheduler();

    console.log("[Cron Check-ins] Completed:", {
      checkInsCreated: result.created,
      emailsSent: result.sent,
      introductionsProcessed: result.introductionsProcessed,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: true,
      checkInsCreated: result.created,
      emailsSent: result.sent,
      introductionsProcessed: result.introductionsProcessed,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("[Cron Check-ins] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Check-in scheduler failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Also support POST for compatibility with some cron services
export async function POST(request: NextRequest) {
  return GET(request);
}
