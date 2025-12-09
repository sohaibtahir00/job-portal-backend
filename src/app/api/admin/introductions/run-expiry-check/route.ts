import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runExpiryAlerts } from "@/lib/jobs/expiry-alerts";

/**
 * POST /api/admin/introductions/run-expiry-check
 * Manually trigger the expiry alerts job (for testing)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    console.log("[Admin Expiry Check] Manually triggering expiry alerts");

    const result = await runExpiryAlerts();

    console.log("[Admin Expiry Check] Expiry alerts completed:", {
      expiringIn7Days: result.expiringIn7Days,
      expiredMarked: result.expiredMarked,
      alertsSent: result.alertsSent,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: true,
      message: "Expiry check completed successfully",
      result: {
        expiringIn7Days: result.expiringIn7Days,
        expiredMarked: result.expiredMarked,
        alertsSent: result.alertsSent,
        finalCheckInsSent: result.finalCheckInsSent,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
    });
  } catch (error) {
    console.error("[Admin Expiry Check] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to run expiry check",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
