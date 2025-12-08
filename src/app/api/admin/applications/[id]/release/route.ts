import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ClaimStatus } from "@prisma/client";

/**
 * POST /api/admin/applications/[id]/release
 * Release a claimed application back to the pool
 *
 * Body (optional):
 * - reason: string - Reason for releasing
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const { reason } = body;

    // Get the application
    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        candidate: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
        job: {
          select: { title: true },
        },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Check if claimed
    if (application.claimStatus !== ClaimStatus.CLAIMED) {
      return NextResponse.json(
        { error: "Application is not currently claimed" },
        { status: 400 }
      );
    }

    // Build release note
    const releaseNote = `[Released on ${new Date().toISOString()}]${reason ? ` Reason: ${reason}` : ""}`;
    const updatedNotes = application.claimNotes
      ? `${application.claimNotes}\n\n${releaseNote}`
      : releaseNote;

    // Release the application
    const updatedApplication = await prisma.application.update({
      where: { id },
      data: {
        claimStatus: ClaimStatus.RELEASED,
        claimNotes: updatedNotes,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Application released successfully",
      application: {
        id: updatedApplication.id,
        claimStatus: updatedApplication.claimStatus,
        candidate: application.candidate.user.name,
        job: application.job.title,
      },
    });
  } catch (error) {
    console.error("Release application error:", error);
    return NextResponse.json(
      { error: "Failed to release application" },
      { status: 500 }
    );
  }
}
