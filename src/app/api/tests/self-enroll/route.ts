import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import crypto from "crypto";

/**
 * POST /api/tests/self-enroll
 * Allow candidates to self-enroll in skills assessment
 * This is triggered after successful job application
 *
 * Requires CANDIDATE role
 *
 * Request body:
 * {
 *   "niche": "string" (e.g., "AI/ML", "Frontend", "Backend")
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require candidate role
    await requireRole(UserRole.CANDIDATE);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get candidate profile
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
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
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    // Check if candidate has already taken the test
    if (candidate.hasTakenTest) {
      return NextResponse.json(
        {
          error: "You have already completed the skills assessment",
          testResults: {
            score: candidate.testScore,
            percentile: candidate.testPercentile,
            tier: candidate.testTier,
            lastTestDate: candidate.lastTestDate,
          },
        },
        { status: 400 }
      );
    }

    // Check if candidate already has a pending invitation
    if (candidate.testInviteToken && candidate.testInviteSentAt) {
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const existingTestUrl = `${baseUrl}/tests/take?token=${candidate.testInviteToken}`;

      return NextResponse.json(
        {
          message: "You already have a pending test invitation",
          testUrl: existingTestUrl,
          testInviteToken: candidate.testInviteToken,
          sentAt: candidate.testInviteSentAt,
        },
        { status: 200 }
      );
    }

    const body = await request.json();
    const { niche } = body;

    // Validate niche
    if (!niche) {
      return NextResponse.json(
        { error: "Niche is required" },
        { status: 400 }
      );
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

    // Build test URL
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const testUrl = `${baseUrl}/tests/take?token=${testInviteToken}`;

    // Create test result record with NOT_STARTED status
    const testResult = await prisma.testResult.create({
      data: {
        candidateId: candidate.id,
        testName: `${niche} Skills Assessment`,
        testType: "Technical",
        score: 0,
        maxScore: 100,
        status: "NOT_STARTED",
      },
    });

    return NextResponse.json(
      {
        message: "Successfully enrolled in skills assessment",
        enrollment: {
          candidateId: candidate.id,
          candidateName: candidate.user.name,
          niche,
          testUrl,
          testInviteToken,
          enrolledAt: new Date(),
          testResultId: testResult.id,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Self-enrollment error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions. Candidate role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to enroll in skills assessment",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tests/self-enroll
 * Check candidate's test enrollment status
 *
 * Requires CANDIDATE role
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

    // Get candidate profile
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
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
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const testUrl = candidate.testInviteToken
      ? `${baseUrl}/tests/take?token=${candidate.testInviteToken}`
      : null;

    return NextResponse.json({
      candidateId: candidate.id,
      hasPendingInvite: !!(candidate.testInviteToken && !candidate.hasTakenTest),
      testInviteSentAt: candidate.testInviteSentAt,
      hasTakenTest: candidate.hasTakenTest,
      lastTestDate: candidate.lastTestDate,
      testUrl,
      testResults: candidate.hasTakenTest
        ? {
            score: candidate.testScore,
            percentile: candidate.testPercentile,
            tier: candidate.testTier,
          }
        : null,
    });
  } catch (error) {
    console.error("Test enrollment status check error:", error);

    return NextResponse.json(
      {
        error: "Failed to check test enrollment status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
