import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * POST /api/admin/sync-interview-status
 * One-time sync script to update Application status to INTERVIEWED for completed interviews
 *
 * This fixes the historical data issue where interviews were marked COMPLETED
 * but applications were never updated to INTERVIEWED status.
 *
 * Run this once to sync all existing data.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Forbidden - Admin role required" },
        { status: 403 }
      );
    }

    console.log("[SYNC] Starting interview-application status sync...");

    // Find all interviews with COMPLETED status
    const completedInterviews = await prisma.interview.findMany({
      where: {
        status: "COMPLETED",
      },
      include: {
        application: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    console.log(`[SYNC] Found ${completedInterviews.length} completed interviews`);

    let syncedCount = 0;
    let alreadySyncedCount = 0;
    let errorCount = 0;

    for (const interview of completedInterviews) {
      try {
        // Only update if application is not already INTERVIEWED
        if (interview.application.status !== "INTERVIEWED") {
          await prisma.application.update({
            where: { id: interview.applicationId },
            data: { status: "INTERVIEWED" },
          });
          syncedCount++;
          console.log(`[SYNC] ✅ Updated application ${interview.applicationId} to INTERVIEWED`);
        } else {
          alreadySyncedCount++;
          console.log(`[SYNC] ⏭️ Application ${interview.applicationId} already INTERVIEWED`);
        }
      } catch (error) {
        errorCount++;
        console.error(`[SYNC] ❌ Failed to update application ${interview.applicationId}:`, error);
      }
    }

    const summary = {
      success: true,
      totalCompletedInterviews: completedInterviews.length,
      applicationsSynced: syncedCount,
      alreadySynced: alreadySyncedCount,
      errors: errorCount,
    };

    console.log("[SYNC] Completed:", summary);

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[SYNC] Fatal error:", error);
    return NextResponse.json(
      {
        error: "Failed to sync interview statuses",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
