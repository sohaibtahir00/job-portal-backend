import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole, IntroductionStatus, CandidateResponse } from "@prisma/client";
import { generateIntroductionToken, generateTokenExpiry } from "@/lib/tokens";
import { sendIntroductionRequestEmail } from "@/lib/email";

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

    // Generate response token for secure email link
    const responseToken = generateIntroductionToken();
    const responseTokenExpiry = generateTokenExpiry(7); // 7 days

    if (introduction) {
      // Check if already has a pending request
      if (introduction.status === IntroductionStatus.INTRO_REQUESTED &&
          introduction.candidateResponse === CandidateResponse.PENDING) {
        return NextResponse.json(
          {
            error: "Introduction already requested",
            message: "An introduction request is already pending for this candidate.",
          },
          { status: 400 }
        );
      }

      // Update existing record
      introduction = await prisma.candidateIntroduction.update({
        where: { id: introduction.id },
        data: {
          introRequestedAt: now,
          status: IntroductionStatus.INTRO_REQUESTED,
          candidateResponse: CandidateResponse.PENDING,
          responseToken,
          responseTokenExpiry,
          candidateMessage: null, // Clear any previous message
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
          candidateResponse: CandidateResponse.PENDING,
          responseToken,
          responseTokenExpiry,
        },
      });
      console.log('✅ [INTRODUCTIONS/REQUEST] Created new introduction with INTRO_REQUESTED status');
    }

    // Get job details for email
    const job = jobId ? await prisma.job.findUnique({
      where: { id: jobId },
      select: { title: true },
    }) : null;

    // Send email to candidate with response link
    const emailResult = await sendIntroductionRequestEmail({
      candidateEmail: candidate.user.email,
      candidateName: candidate.user.name,
      employerCompanyName: employer.companyName,
      employerDescription: employer.description || undefined,
      jobTitle: job?.title || "Open Position",
      responseToken,
    });

    if (!emailResult.success) {
      console.error('⚠️ [INTRODUCTIONS/REQUEST] Failed to send email:', emailResult.error);
      // Don't fail the request, just log the error
      // The introduction is still recorded and admin can resend if needed
    } else {
      console.log('📧 [INTRODUCTIONS/REQUEST] Email sent to candidate:', candidate.user.email);
    }

    console.log('✅ [INTRODUCTIONS/REQUEST] Introduction requested for candidate:', candidate.user.name);

    return NextResponse.json({
      success: true,
      introductionId: introduction.id,
      status: introduction.status,
      protectionEndsAt: introduction.protectionEndsAt,
      emailSent: emailResult.success,
      message: emailResult.success
        ? "Introduction request sent. The candidate will be notified via email."
        : "Introduction request recorded but email delivery failed. Please contact support.",
    });

  } catch (error) {
    console.error('❌ [INTRODUCTIONS/REQUEST] Error:', error);
    return NextResponse.json(
      { error: "Failed to request introduction" },
      { status: 500 }
    );
  }
}
