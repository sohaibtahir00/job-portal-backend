import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runCheckInScheduler } from "@/lib/jobs/check-in-scheduler";

/**
 * POST /api/admin/check-ins/run-scheduler
 * Manually trigger the check-in scheduler (for testing)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    console.log("[Admin Check-ins] Manually triggering scheduler");

    const result = await runCheckInScheduler();

    console.log("[Admin Check-ins] Scheduler completed:", {
      created: result.created,
      sent: result.sent,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: true,
      message: "Check-in scheduler ran successfully",
      result: {
        checkInsCreated: result.created,
        emailsSent: result.sent,
        introductionsProcessed: result.introductionsProcessed,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
    });
  } catch (error) {
    console.error("[Admin Check-ins Run Scheduler] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to run scheduler",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
