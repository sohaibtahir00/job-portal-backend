import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { sendTestInvitationEmail } from "@/lib/email";
import crypto from "crypto";

/**
 * POST /api/tests/invite
 * Send test invitation to a candidate
 * Creates unique test link with token
 *
 * Requires EMPLOYER or ADMIN role
 *
 * Request body:
 * {
 *   "candidateId": "string" (optional if applicationId provided),
 *   "applicationId": "string" (optional if candidateId provided),
 *   "testName": "string",
 *   "testType": "Technical" | "Aptitude" | "Personality" | "Coding" | "other",
 *   "testUrl": "string" (optional - iMocha test URL),
 *   "deadline": "ISO date string" (optional),
 *   "message": "string" (optional - custom message for candidate)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require employer or admin role
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      candidateId,
      applicationId,
      testName,
      testType,
      testUrl,
      deadline,
      message,
    } = body;

    // Must provide either candidateId or applicationId
    if (!candidateId && !applicationId) {
      return NextResponse.json(
        { error: "Either candidateId or applicationId is required" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!testName || !testType) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          required: ["testName", "testType"],
        },
        { status: 400 }
      );
    }

    // Get candidate (either directly or through application)
    let candidate;
    let application = null;
    let job = null;

    if (applicationId) {
      // Get application with candidate and job details
      application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
          candidate: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
          job: {
            include: {
              employer: {
                select: {
                  userId: true,
                  companyName: true,
                },
              },
            },
          },
        },
      });

      if (!application) {
        return NextResponse.json(
          { error: "Application not found" },
          { status: 404 }
        );
      }

      // Verify employer owns this application (unless admin)
      if (user.role !== UserRole.ADMIN && application.job.employer.userId !== user.id) {
        return NextResponse.json(
          { error: "Forbidden. You can only send test invitations for your job applications." },
          { status: 403 }
        );
      }

      candidate = application.candidate;
      job = application.job;
    } else {
      // Get candidate directly
      candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      if (!candidate) {
        return NextResponse.json(
          { error: "Candidate not found" },
          { status: 404 }
        );
      }
    }

    // Generate unique test invitation token
    const testInviteToken = crypto.randomBytes(32).toString("hex");

    // Update candidate with test invite token
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        testInviteToken,
        testInviteSentAt: new Date(),
      },
    });

    // Get employer info for email
    let companyName = "Job Portal";
    if (user.role === UserRole.EMPLOYER) {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });
      companyName = employer?.companyName || "Job Portal";
    }

    // Build test URL
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const testLinkUrl = testUrl || `${baseUrl}/tests/take?token=${testInviteToken}`;

    // Send test invitation email
    await sendTestInvitationEmail({
      email: candidate.user.email,
      candidateName: candidate.user.name,
      jobTitle: job?.title || "Position",
      companyName: job?.employer.companyName || companyName,
      testName,
      testType,
      deadline: deadline ? new Date(deadline) : undefined,
      testUrl: testLinkUrl,
    });

    // Create test result record with NOT_STARTED status
    const testResult = await prisma.testResult.create({
      data: {
        candidateId: candidate.id,
        applicationId: applicationId || undefined,
        testName,
        testType,
        score: 0,
        maxScore: 100,
        status: "NOT_STARTED",
      },
    });

    return NextResponse.json(
      {
        message: "Test invitation sent successfully",
        invitation: {
          candidateId: candidate.id,
          candidateName: candidate.user.name,
          candidateEmail: candidate.user.email,
          testName,
          testType,
          testUrl: testLinkUrl,
          testInviteToken,
          deadline,
          sentAt: new Date(),
          testResultId: testResult.id,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Test invitation error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions. Employer role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to send test invitation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tests/invite?candidateId=xxx
 * Check if a candidate has a pending test invitation
 *
 * Requires EMPLOYER or ADMIN role
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const candidateId = searchParams.get("candidateId");

    if (!candidateId) {
      return NextResponse.json(
        { error: "candidateId query parameter is required" },
        { status: 400 }
      );
    }

    // Get candidate
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        testInviteToken: true,
        testInviteSentAt: true,
        hasTakenTest: true,
        lastTestDate: true,
        testScore: true,
        testPercentile: true,
        testTier: true,
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    const hasPendingInvite = !!(candidate.testInviteToken && !candidate.hasTakenTest);

    return NextResponse.json({
      candidateId: candidate.id,
      hasPendingInvite,
      testInviteSentAt: candidate.testInviteSentAt,
      hasTakenTest: candidate.hasTakenTest,
      lastTestDate: candidate.lastTestDate,
      testResults: candidate.hasTakenTest
        ? {
            score: candidate.testScore,
            percentile: candidate.testPercentile,
            tier: candidate.testTier,
          }
        : null,
    });
  } catch (error) {
    console.error("Test invitation status check error:", error);

    return NextResponse.json(
      {
        error: "Failed to check test invitation status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
