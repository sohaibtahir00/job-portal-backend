import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import {
  getTierDescription,
  getTierColor,
  getTierEmoji,
  getNextTierRequirements,
  TestTier,
} from "@/lib/test-tiers";

/**
 * GET /api/tests/results/[candidateId]
 * Get candidate test results with tier information
 *
 * Access control:
 * - ADMIN: Can view any candidate's test results
 * - EMPLOYER: Can view test results for candidates who applied to their jobs
 * - CANDIDATE: Can only view their own test results
 *
 * Query parameters:
 * - includeHistory: "true" to include all test attempts (default: false, shows only latest)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { candidateId: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { candidateId } = params;
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get("includeHistory") === "true";

    // Get candidate with test results
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        testResults: {
          orderBy: {
            completedAt: "desc",
          },
          include: {
            application: {
              select: {
                id: true,
                job: {
                  select: {
                    id: true,
                    title: true,
                    employer: {
                      select: {
                        id: true,
                        companyName: true,
                      },
                    },
                  },
                },
              },
            },
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

    // Check access permissions
    let hasAccess = false;

    if (user.role === UserRole.ADMIN) {
      hasAccess = true;
    } else if (user.role === UserRole.CANDIDATE) {
      // Candidates can only view their own results
      hasAccess = candidate.userId === user.id;
    } else if (user.role === UserRole.EMPLOYER) {
      // Employers can view results for candidates who applied to their jobs
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });

      if (employer) {
        // Check if candidate has applied to any of employer's jobs
        const applications = await prisma.application.findMany({
          where: {
            candidateId: candidate.id,
            job: {
              employerId: employer.id,
            },
          },
        });

        hasAccess = applications.length > 0;
      }
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Forbidden. You don't have access to these test results." },
        { status: 403 }
      );
    }

    // Build response based on whether candidate has taken test
    if (!candidate.hasTakenTest) {
      return NextResponse.json({
        candidate: {
          id: candidate.id,
          name: candidate.user.name,
          email: candidate.user.email,
        },
        hasTakenTest: false,
        testInviteSentAt: candidate.testInviteSentAt,
        message: candidate.testInviteSentAt
          ? "Test invitation sent. Waiting for candidate to complete the test."
          : "No test invitation sent yet.",
      });
    }

    // Get tier information
    const tier = candidate.testTier as TestTier;
    const tierInfo = {
      tier,
      description: getTierDescription(tier),
      color: getTierColor(tier),
      emoji: getTierEmoji(tier),
    };

    // Get next tier requirements
    const nextTierInfo =
      candidate.testScore && candidate.testPercentile
        ? getNextTierRequirements(candidate.testScore, candidate.testPercentile)
        : null;

    // Get test results (latest or all based on query param)
    const testResults = includeHistory
      ? candidate.testResults
      : candidate.testResults.slice(0, 1); // Get only the latest

    // Format test results for response
    const formattedResults = testResults.map((result) => ({
      id: result.id,
      testName: result.testName,
      testType: result.testType,
      score: result.score,
      maxScore: result.maxScore,
      percentageScore: ((result.score / result.maxScore) * 100).toFixed(1),
      status: result.status,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      feedback: result.feedback,
      application: result.application
        ? {
            id: result.application.id,
            jobTitle: result.application.job.title,
            companyName: result.application.job.employer.companyName,
          }
        : null,
      createdAt: result.createdAt,
    }));

    // Calculate statistics
    const completedTests = candidate.testResults.filter(
      (r) => r.status === "COMPLETED"
    );
    const averageScore =
      completedTests.length > 0
        ? completedTests.reduce((sum, r) => sum + (r.score / r.maxScore) * 100, 0) /
          completedTests.length
        : 0;

    const statistics = {
      totalTests: candidate.testResults.length,
      completedTests: completedTests.length,
      averageScore: averageScore.toFixed(1),
      highestScore: completedTests.length > 0
        ? Math.max(...completedTests.map((r) => (r.score / r.maxScore) * 100))
        : 0,
      lowestScore: completedTests.length > 0
        ? Math.min(...completedTests.map((r) => (r.score / r.maxScore) * 100))
        : 0,
    };

    // Response
    return NextResponse.json({
      candidate: {
        id: candidate.id,
        name: candidate.user.name,
        email: candidate.user.email,
      },
      hasTakenTest: true,
      currentScore: candidate.testScore,
      currentPercentile: candidate.testPercentile,
      lastTestDate: candidate.lastTestDate,
      tierInfo,
      nextTierInfo,
      testResults: formattedResults,
      statistics,
      includesHistory: includeHistory,
    });
  } catch (error) {
    console.error("Test results fetch error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to fetch test results",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
