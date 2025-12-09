import { NextRequest, NextResponse } from "next/server";
import { runExpiryAlerts } from "@/lib/jobs/expiry-alerts";

/**
 * GET /api/cron/expiry-alerts
 * Cron endpoint to run the expiry alerts job
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
        console.log("[Cron Expiry Alerts] Unauthorized request - invalid or missing authorization header");
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    } else {
      // Log warning if CRON_SECRET is not set
      console.warn("[Cron Expiry Alerts] WARNING: CRON_SECRET is not set - endpoint is unprotected");
    }

    console.log("[Cron Expiry Alerts] Starting scheduled expiry alerts job");

    const result = await runExpiryAlerts();

    console.log("[Cron Expiry Alerts] Completed:", {
      expiringIn7Days: result.expiringIn7Days,
      expiredMarked: result.expiredMarked,
      alertsSent: result.alertsSent,
      finalCheckInsSent: result.finalCheckInsSent,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: true,
      expiringIn7Days: result.expiringIn7Days,
      expiredMarked: result.expiredMarked,
      alertsSent: result.alertsSent,
      finalCheckInsSent: result.finalCheckInsSent,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("[Cron Expiry Alerts] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Expiry alerts job failed",
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
