import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendFinalCheckInEmail } from "@/lib/jobs/expiry-alerts";

/**
 * POST /api/admin/introductions/[id]/final-check-in
 * Send final check-in email to candidate before protection expires
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { id } = await params;

    console.log(`[Admin Final Check-in] Sending final check-in for introduction ${id}`);

    const result = await sendFinalCheckInEmail(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send final check-in email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Final check-in email sent successfully",
    });
  } catch (error) {
    console.error("[Admin Final Check-in] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to send final check-in",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
