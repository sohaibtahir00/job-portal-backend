import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/tests/flagged
 * Get test results that might need review based on suspicious patterns
 *
 * Since the database doesn't have explicit flagging fields, we identify
 * potentially suspicious tests based on:
 * - Very high scores (>= 95)
 * - Fast completion times
 * - New accounts with high scores
 *
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - status: "all" (only option for now since no flagging system)
 * - sortBy: newest | oldest | score
 *
 * Returns:
 * - tests: Array of suspicious test results
 * - pagination: { total, page, limit, totalPages }
 * - stats: { total }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    // Require ADMIN role
    if (!user || user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    // Filters
    const sortBy = searchParams.get("sortBy") || "newest";

    // Build orderBy
    let orderBy: any = { lastTestDate: "desc" };
    if (sortBy === "oldest") orderBy = { lastTestDate: "asc" };
    if (sortBy === "score") orderBy = { testScore: "desc" };

    // Find candidates with high test scores that might need review
    // We look for scores >= 90 as potentially suspicious
    const where = {
      hasTakenTest: true,
      testScore: {
        gte: 90,
      },
    };

    // Fetch potentially suspicious tests
    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              createdAt: true,
            },
          },
          skillsAssessments: {
            orderBy: { completedAt: "desc" },
            take: 1,
            select: {
              id: true,
              score: true,
              tier: true,
              duration: true,
              completedAt: true,
            },
          },
        },
      }),
      prisma.candidate.count({ where }),
    ]);

    // Format response with suspicious indicators
    const formattedTests = candidates.map((candidate) => {
      const indicators: string[] = [];
      const assessment = candidate.skillsAssessments[0];

      // High score indicator
      if (candidate.testScore && candidate.testScore >= 95) {
        indicators.push("Very high score (95+)");
      }

      // Fast completion indicator (less than 20 minutes for a full assessment)
      if (assessment?.duration && assessment.duration < 1200) {
        indicators.push("Fast completion time");
      }

      // New account with high score
      const accountAge = Date.now() - candidate.user.createdAt.getTime();
      const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);
      if (daysSinceCreation < 7 && candidate.testScore && candidate.testScore >= 90) {
        indicators.push("New account with high score");
      }

      return {
        id: candidate.id,
        user: {
          id: candidate.user.id,
          name: candidate.user.name,
          email: candidate.user.email,
          createdAt: candidate.user.createdAt,
        },
        testScore: candidate.testScore,
        testPercentile: candidate.testPercentile,
        testTier: candidate.testTier,
        testCompletedAt: candidate.lastTestDate,
        testDuration: assessment?.duration || null,
        suspiciousIndicators: indicators,
        // No flagging system implemented yet
        flagReviewStatus: null,
        needsReview: indicators.length > 0,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      tests: formattedTests,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
      },
      stats: {
        pending: total, // All are "pending" since no flagging system
        verified: 0,
        rejected: 0,
        total,
      },
    });
  } catch (error) {
    console.error("Admin flagged tests error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch flagged tests",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
