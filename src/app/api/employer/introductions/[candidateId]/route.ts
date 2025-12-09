import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * Helper function to check if employer has signed service agreement
 */
async function checkServiceAgreement(employerId: string): Promise<boolean> {
  const agreement = await prisma.serviceAgreement.findUnique({
    where: { employerId },
  });
  return !!agreement;
}

/**
 * GET /api/employer/introductions/[candidateId]
 * Get introduction status for specific candidate
 * Returns: {
 *   hasIntroduction: boolean,
 *   status: IntroductionStatus,
 *   introRequestedAt: Date | null,
 *   protectionEndsAt: Date
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  console.log('👤 [INTRODUCTIONS/CANDIDATE] GET request received');

  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (user.role !== UserRole.EMPLOYER) {
      return NextResponse.json(
        { error: "Employer role required" },
        { status: 403 }
      );
    }

    const { candidateId } = await params;

    if (!candidateId) {
      return NextResponse.json(
        { error: "Candidate ID is required" },
        { status: 400 }
      );
    }

    // Find employer record
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    // Check service agreement
    const hasSigned = await checkServiceAgreement(employer.id);
    if (!hasSigned) {
      return NextResponse.json(
        { error: "Service agreement must be signed to access introductions" },
        { status: 403 }
      );
    }

    // Verify candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Find introduction record
    const introduction = await prisma.candidateIntroduction.findUnique({
      where: {
        employerId_candidateId: {
          employerId: employer.id,
          candidateId,
        },
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!introduction) {
      return NextResponse.json({
        hasIntroduction: false,
        candidateId,
        candidateName: candidate.user.name,
        status: null,
        introRequestedAt: null,
        candidateRespondedAt: null,
        candidateResponse: null,
        introducedAt: null,
        protectionStartsAt: null,
        protectionEndsAt: null,
        profileViews: 0,
        resumeDownloads: 0,
        job: null,
      });
    }

    console.log('✅ [INTRODUCTIONS/CANDIDATE] Found introduction for candidate:', candidateId);

    return NextResponse.json({
      hasIntroduction: true,
      introductionId: introduction.id,
      candidateId,
      candidateName: candidate.user.name,
      status: introduction.status,
      profileViewedAt: introduction.profileViewedAt,
      introRequestedAt: introduction.introRequestedAt,
      candidateRespondedAt: introduction.candidateRespondedAt,
      candidateResponse: introduction.candidateResponse,
      introducedAt: introduction.introducedAt,
      protectionStartsAt: introduction.protectionStartsAt,
      protectionEndsAt: introduction.protectionEndsAt,
      profileViews: introduction.profileViews,
      resumeDownloads: introduction.resumeDownloads,
      job: introduction.job,
      createdAt: introduction.createdAt,
      updatedAt: introduction.updatedAt,
    });

  } catch (error) {
    console.error('❌ [INTRODUCTIONS/CANDIDATE] Error:', error);
    return NextResponse.json(
      { error: "Failed to fetch introduction status" },
      { status: 500 }
    );
  }
}
