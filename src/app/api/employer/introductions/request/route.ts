import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole, IntroductionStatus } from "@prisma/client";

// Protection period duration in months
const PROTECTION_PERIOD_MONTHS = 12;

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
 * POST /api/employer/introductions/request
 * Employer requests introduction to a candidate
 * Request body: { candidateId: string, jobId?: string, message?: string }
 */
export async function POST(request: NextRequest) {
  console.log('🤝 [INTRODUCTIONS/REQUEST] POST request received');

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
        { error: "Service agreement must be signed to request introductions" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { candidateId, jobId, message } = body;

    if (!candidateId || typeof candidateId !== 'string') {
      return NextResponse.json(
        { error: "Candidate ID is required" },
        { status: 400 }
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

    // Verify job exists if provided
    if (jobId) {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
      });
      if (!job) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }
    }

    const now = new Date();
    const protectionEndDate = new Date(now);
    protectionEndDate.setMonth(protectionEndDate.getMonth() + PROTECTION_PERIOD_MONTHS);

    // Find or create introduction record
    let introduction = await prisma.candidateIntroduction.findUnique({
      where: {
        employerId_candidateId: {
          employerId: employer.id,
          candidateId,
        },
      },
    });

    if (introduction) {
      // Update existing record
      introduction = await prisma.candidateIntroduction.update({
        where: { id: introduction.id },
        data: {
          introRequestedAt: now,
          status: IntroductionStatus.INTRO_REQUESTED,
          // Update jobId if provided and different
          ...(jobId && jobId !== introduction.jobId ? { jobId } : {}),
        },
      });
      console.log('✅ [INTRODUCTIONS/REQUEST] Updated existing introduction to INTRO_REQUESTED');
    } else {
      // Create new introduction record with request
      introduction = await prisma.candidateIntroduction.create({
        data: {
          employerId: employer.id,
          candidateId,
          jobId: jobId || null,
          profileViewedAt: now,
          introRequestedAt: now,
          protectionStartsAt: now,
          protectionEndsAt: protectionEndDate,
          profileViews: 1,
          status: IntroductionStatus.INTRO_REQUESTED,
        },
      });
      console.log('✅ [INTRODUCTIONS/REQUEST] Created new introduction with INTRO_REQUESTED status');
    }

    // TODO: Trigger notification to candidate about introduction request
    // This will be implemented in a future update
    // await notifyCandidate(candidate.user.email, employer.companyName, message);

    console.log('✅ [INTRODUCTIONS/REQUEST] Introduction requested for candidate:', candidate.user.name);

    return NextResponse.json({
      success: true,
      introductionId: introduction.id,
      status: introduction.status,
      protectionEndsAt: introduction.protectionEndsAt,
    });

  } catch (error) {
    console.error('❌ [INTRODUCTIONS/REQUEST] Error:', error);
    return NextResponse.json(
      { error: "Failed to request introduction" },
      { status: 500 }
    );
  }
}
