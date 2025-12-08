import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { VerificationStatus } from "@prisma/client";

/**
 * POST /api/admin/candidates/[id]/verify
 * Verify or reject a candidate
 *
 * Body:
 * - action: "verify" | "reject" | "pending"
 * - notes: optional notes about the verification
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { action, notes } = body;

    if (!action || !["verify", "reject", "pending"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'verify', 'reject', or 'pending'" },
        { status: 400 }
      );
    }

    // Find the candidate
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true, name: true },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // Determine new status based on action
    let newStatus: VerificationStatus;
    let notificationMessage: string;
    let notificationType: string;

    switch (action) {
      case "verify":
        newStatus = VerificationStatus.VERIFIED;
        notificationMessage = "Your profile has been verified! This badge will be visible to employers.";
        notificationType = "CANDIDATE_VERIFIED";
        break;
      case "reject":
        if (!notes) {
          return NextResponse.json(
            { error: "Notes are required when rejecting verification" },
            { status: 400 }
          );
        }
        newStatus = VerificationStatus.REJECTED;
        notificationMessage = `Your verification was not approved. Reason: ${notes}. Please update your profile and try again.`;
        notificationType = "CANDIDATE_VERIFICATION_REJECTED";
        break;
      case "pending":
        newStatus = VerificationStatus.PENDING;
        notificationMessage = "Your profile is under review for verification.";
        notificationType = "CANDIDATE_VERIFICATION_PENDING";
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Update candidate verification status
    const updatedCandidate = await prisma.candidate.update({
      where: { id },
      data: {
        verificationStatus: newStatus,
        verifiedAt: action === "verify" ? new Date() : null,
        verifiedBy: action === "verify" ? user.id : null,
        verificationNotes: notes || null,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, image: true },
        },
      },
    });

    // Create notification for the candidate
    await prisma.notification.create({
      data: {
        userId: candidate.userId,
        type: notificationType,
        title: action === "verify" ? "Profile Verified" : action === "reject" ? "Verification Update" : "Verification in Progress",
        message: notificationMessage,
        data: {
          candidateId: candidate.id,
          verifiedBy: user.id,
          action,
          notes,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Candidate ${action === "verify" ? "verified" : action === "reject" ? "rejected" : "set to pending"} successfully`,
      candidate: {
        id: updatedCandidate.id,
        verificationStatus: updatedCandidate.verificationStatus,
        verifiedAt: updatedCandidate.verifiedAt,
        verificationNotes: updatedCandidate.verificationNotes,
        user: updatedCandidate.user,
      },
    });
  } catch (error) {
    console.error("Verify candidate error:", error);
    return NextResponse.json(
      { error: "Failed to update candidate verification" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/candidates/[id]/verify
 * Get candidate verification details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            emailVerified: true,
            createdAt: true,
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      candidate: {
        id: candidate.id,
        verificationStatus: candidate.verificationStatus,
        verifiedAt: candidate.verifiedAt,
        verifiedBy: candidate.verifiedBy,
        verificationNotes: candidate.verificationNotes,
        headline: candidate.headline,
        location: candidate.location,
        skills: candidate.skills,
        experience: candidate.experience,
        education: candidate.education,
        resume: candidate.resume,
        user: candidate.user,
      },
    });
  } catch (error) {
    console.error("Get candidate verification error:", error);
    return NextResponse.json(
      { error: "Failed to fetch candidate verification" },
      { status: 500 }
    );
  }
}
