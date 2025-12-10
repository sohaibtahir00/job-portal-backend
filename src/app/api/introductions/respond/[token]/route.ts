import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CandidateResponse, IntroductionStatus } from "@prisma/client";
import { isTokenExpired } from "@/lib/tokens";
import {
  sendIntroductionAcceptedEmail,
  sendIntroductionDeclinedEmail,
  sendAdminIntroductionQuestionsAlert,
  EMAIL_CONFIG,
} from "@/lib/email";

/**
 * GET /api/introductions/respond/[token]
 * Returns introduction details for the candidate to review before responding
 * This is a public endpoint - no authentication required (token provides security)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    console.log(`[Introduction Respond] Looking up token: ${token.substring(0, 10)}...`);

    // Find introduction by token
    const introduction = await prisma.candidateIntroduction.findUnique({
      where: { responseToken: token },
      include: {
        employer: {
          select: {
            id: true,
            companyName: true,
            companyLogo: true,
            companyWebsite: true,
            industry: true,
            description: true,
            location: true,
          },
        },
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        job: {
          select: {
            id: true,
            title: true,
            location: true,
            type: true,
            remote: true,
            salaryMin: true,
            salaryMax: true,
            description: true,
          },
        },
      },
    });

    if (!introduction) {
      console.log(`[Introduction Respond GET] Token not found in database`);
      return NextResponse.json(
        {
          error: "Invalid or expired link",
          code: "INVALID_TOKEN",
        },
        { status: 404 }
      );
    }

    console.log(`[Introduction Respond GET] Found introduction ID: ${introduction.id}, status: ${introduction.status}`);

    // Check if token is expired
    if (isTokenExpired(introduction.responseTokenExpiry)) {
      return NextResponse.json(
        {
          error: "This link has expired. Please contact support for a new link.",
          code: "TOKEN_EXPIRED",
        },
        { status: 410 }
      );
    }

    // Check if already responded
    if (introduction.candidateResponse && introduction.candidateResponse !== CandidateResponse.PENDING) {
      return NextResponse.json(
        {
          error: "You have already responded to this introduction request",
          code: "ALREADY_RESPONDED",
          response: introduction.candidateResponse,
        },
        { status: 400 }
      );
    }

    // Return sanitized introduction details
    return NextResponse.json({
      introduction: {
        id: introduction.id,
        status: introduction.status,
        requestedAt: introduction.introRequestedAt,
        employer: {
          companyName: introduction.employer.companyName,
          logo: introduction.employer.companyLogo,
          website: introduction.employer.companyWebsite,
          industry: introduction.employer.industry,
          description: introduction.employer.description,
          location: introduction.employer.location,
        },
        job: introduction.job
          ? {
              title: introduction.job.title,
              location: introduction.job.location,
              type: introduction.job.type,
              remote: introduction.job.remote,
              salaryRange:
                introduction.job.salaryMin && introduction.job.salaryMax
                  ? `$${(introduction.job.salaryMin / 1000).toFixed(0)}k - $${(introduction.job.salaryMax / 1000).toFixed(0)}k`
                  : null,
              description: introduction.job.description,
            }
          : null,
        candidateName: introduction.candidate.user.name,
      },
    });
  } catch (error) {
    console.error("[Introduction Respond GET] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch introduction details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/introductions/respond/[token]
 * Process candidate's response (accept/decline/questions)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { response, message } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Validate response value
    const validResponses = [
      CandidateResponse.ACCEPTED,
      CandidateResponse.DECLINED,
      CandidateResponse.QUESTIONS,
    ];

    if (!response || !validResponses.includes(response)) {
      return NextResponse.json(
        {
          error: "Invalid response. Must be ACCEPTED, DECLINED, or QUESTIONS",
          validResponses,
        },
        { status: 400 }
      );
    }

    // Require message for QUESTIONS response
    if (response === CandidateResponse.QUESTIONS && !message) {
      return NextResponse.json(
        { error: "Message is required when selecting 'I Have Questions'" },
        { status: 400 }
      );
    }

    // Find introduction by token
    const introduction = await prisma.candidateIntroduction.findUnique({
      where: { responseToken: token },
      include: {
        employer: {
          include: {
            user: {
              select: {
                email: true,
                name: true,
              },
            },
          },
        },
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        job: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!introduction) {
      return NextResponse.json(
        {
          error: "Invalid or expired link",
          code: "INVALID_TOKEN",
        },
        { status: 404 }
      );
    }

    // Check if token is expired
    if (isTokenExpired(introduction.responseTokenExpiry)) {
      return NextResponse.json(
        {
          error: "This link has expired. Please contact support for a new link.",
          code: "TOKEN_EXPIRED",
        },
        { status: 410 }
      );
    }

    // Check if already responded
    if (introduction.candidateResponse && introduction.candidateResponse !== CandidateResponse.PENDING) {
      return NextResponse.json(
        {
          error: "You have already responded to this introduction request",
          code: "ALREADY_RESPONDED",
          response: introduction.candidateResponse,
        },
        { status: 400 }
      );
    }

    // Determine new status based on response
    let newStatus: IntroductionStatus = introduction.status;
    if (response === CandidateResponse.ACCEPTED) {
      newStatus = IntroductionStatus.INTRODUCED;
    } else if (response === CandidateResponse.DECLINED) {
      newStatus = IntroductionStatus.CANDIDATE_DECLINED;
    }
    // QUESTIONS keeps the same status (INTRO_REQUESTED)

    // Update introduction
    const updatedIntroduction = await prisma.candidateIntroduction.update({
      where: { id: introduction.id },
      data: {
        candidateResponse: response,
        candidateRespondedAt: new Date(),
        candidateMessage: message || null,
        status: newStatus,
        introducedAt:
          response === CandidateResponse.ACCEPTED ? new Date() : null,
        // Clear the token after use for security
        responseToken: null,
        responseTokenExpiry: null,
      },
    });

    // Send appropriate email to employer
    const jobTitle = introduction.job?.title || "Open Position";
    const appUrl = EMAIL_CONFIG.appUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (response === CandidateResponse.ACCEPTED) {
      // Send accepted email with candidate contact details
      await sendIntroductionAcceptedEmail({
        employerEmail: introduction.employer.user.email,
        employerName: introduction.employer.user.name,
        candidateName: introduction.candidate.user.name,
        candidateEmail: introduction.candidate.user.email,
        candidatePhone: introduction.candidate.phone || undefined,
        candidateLinkedIn: introduction.candidate.linkedIn || undefined,
        jobTitle,
        candidateProfileUrl: `${appUrl}/employer/candidates/${introduction.candidate.id}`,
      });

      console.log(
        `[Introduction Response] Candidate ${introduction.candidate.user.name} ACCEPTED introduction to ${introduction.employer.companyName}`
      );
    } else if (response === CandidateResponse.DECLINED) {
      // Send declined email
      await sendIntroductionDeclinedEmail({
        employerEmail: introduction.employer.user.email,
        employerName: introduction.employer.user.name,
        candidateFirstName: introduction.candidate.user.name.split(" ")[0],
        jobTitle,
        searchUrl: `${appUrl}/employer/candidates`,
      });

      console.log(
        `[Introduction Response] Candidate ${introduction.candidate.user.name} DECLINED introduction to ${introduction.employer.companyName}`
      );
    } else if (response === CandidateResponse.QUESTIONS) {
      // Send notification to admin about candidate questions
      const adminEmailResult = await sendAdminIntroductionQuestionsAlert({
        candidateName: introduction.candidate.user.name,
        candidateEmail: introduction.candidate.user.email,
        employerCompanyName: introduction.employer.companyName,
        jobTitle,
        questions: message,
        introductionId: introduction.id,
      });

      if (!adminEmailResult.success) {
        console.error(
          `[Introduction Response] Failed to send admin alert: ${adminEmailResult.error}`
        );
      }

      console.log(
        `[Introduction Response] Candidate ${introduction.candidate.user.name} has QUESTIONS for ${introduction.employer.companyName}: ${message}`
      );
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message:
        response === CandidateResponse.ACCEPTED
          ? "Thank you! Your contact information has been shared with the employer. They will reach out to you soon."
          : response === CandidateResponse.DECLINED
          ? "Thank you for your response. We've notified the employer."
          : "Thank you for your questions. Our team will review and get back to you.",
      response: updatedIntroduction.candidateResponse,
      status: updatedIntroduction.status,
    });
  } catch (error) {
    console.error("[Introduction Respond POST] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to process response",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
