import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ClaimStatus } from "@prisma/client";

/**
 * POST /api/admin/applications/[id]/claim
 * Claim an application for admin tracking
 *
 * Body (optional):
 * - notes: string - Notes about why claiming this candidate
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
    const { notes } = body;

    // Get the application
    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        candidate: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        job: {
          select: { title: true, company: true },
        },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Check if already claimed
    if (application.claimStatus === ClaimStatus.CLAIMED) {
      return NextResponse.json(
        { error: "Application is already claimed" },
        { status: 400 }
      );
    }

    // Check if already converted
    if (application.claimStatus === ClaimStatus.CONVERTED) {
      return NextResponse.json(
        { error: "Application has already been converted to a placement" },
        { status: 400 }
      );
    }

    // Claim the application
    const updatedApplication = await prisma.application.update({
      where: { id },
      data: {
        claimStatus: ClaimStatus.CLAIMED,
        claimedAt: new Date(),
        claimedBy: user.id,
        claimNotes: notes || null,
      },
      include: {
        candidate: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        job: {
          select: { title: true, company: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Application claimed successfully",
      application: {
        id: updatedApplication.id,
        status: updatedApplication.status,
        claimStatus: updatedApplication.claimStatus,
        claimedAt: updatedApplication.claimedAt,
        claimedBy: updatedApplication.claimedBy,
        claimNotes: updatedApplication.claimNotes,
        candidate: {
          name: updatedApplication.candidate.user.name,
          email: updatedApplication.candidate.user.email,
        },
        job: {
          title: updatedApplication.job.title,
          company: updatedApplication.job.company,
        },
      },
    });
  } catch (error) {
    console.error("Claim application error:", error);
    return NextResponse.json(
      { error: "Failed to claim application" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/applications/[id]/claim
 * Unclaim/release an application (alias for release endpoint)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    // Get the application
    const application = await prisma.application.findUnique({
      where: { id },
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

    // Check if user is the one who claimed it (or is admin)
    if (application.claimedBy !== user.id) {
      return NextResponse.json(
        { error: "You can only release applications you have claimed" },
        { status: 403 }
      );
    }

    // Release the application
    const updatedApplication = await prisma.application.update({
      where: { id },
      data: {
        claimStatus: ClaimStatus.RELEASED,
        claimNotes: application.claimNotes
          ? `${application.claimNotes}\n\n[Released on ${new Date().toISOString()}]`
          : `[Released on ${new Date().toISOString()}]`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Application released successfully",
      application: {
        id: updatedApplication.id,
        claimStatus: updatedApplication.claimStatus,
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

/**
 * PATCH /api/admin/applications/[id]/claim
 * Update claim notes for an application
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { notes } = body;

    // Get the application
    const application = await prisma.application.findUnique({
      where: { id },
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

    // Update notes
    const updatedApplication = await prisma.application.update({
      where: { id },
      data: {
        claimNotes: notes,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Claim notes updated successfully",
      application: {
        id: updatedApplication.id,
        claimNotes: updatedApplication.claimNotes,
      },
    });
  } catch (error) {
    console.error("Update claim notes error:", error);
    return NextResponse.json(
      { error: "Failed to update claim notes" },
      { status: 500 }
    );
  }
}
