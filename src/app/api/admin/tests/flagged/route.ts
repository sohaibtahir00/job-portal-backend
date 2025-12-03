import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/tests/flagged
 * Get test results flagged for review
 *
 * Tests may be flagged for various reasons:
 * - Suspiciously high scores (>95 percentile with low completion time)
 * - Multiple retakes with significant score jumps
 * - Unusual patterns in answers
 * - Manual reports from candidates
 *
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - status: "pending" | "verified" | "rejected" | "all" (default: pending)
 * - sortBy: newest | oldest | score | percentile
 *
 * Returns:
 * - tests: Array of flagged test results
 * - pagination: { total, page, limit, totalPages }
 * - stats: { pending, verified, rejected }
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
    const statusFilter = searchParams.get("status") || "pending";
    const sortBy = searchParams.get("sortBy") || "newest";

    // Build where clause for flagged tests
    const where: any = {
      isFlagged: true,
    };

    if (statusFilter === "pending") {
      where.flagReviewStatus = null;
    } else if (statusFilter === "verified") {
      where.flagReviewStatus = "VERIFIED";
    } else if (statusFilter === "rejected") {
      where.flagReviewStatus = "REJECTED";
    }

    // Build orderBy
    let orderBy: any = { flaggedAt: "desc" };
    if (sortBy === "oldest") orderBy = { flaggedAt: "asc" };
    if (sortBy === "score") orderBy = { testScore: "desc" };
    if (sortBy === "percentile") orderBy = { testPercentile: "desc" };

    // Fetch flagged tests
    const [tests, total] = await Promise.all([
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
        },
      }),
      prisma.candidate.count({ where }),
    ]);

    // Get statistics
    const [pendingCount, verifiedCount, rejectedCount] = await Promise.all([
      prisma.candidate.count({
        where: { isFlagged: true, flagReviewStatus: null },
      }),
      prisma.candidate.count({
        where: { isFlagged: true, flagReviewStatus: "VERIFIED" },
      }),
      prisma.candidate.count({
        where: { isFlagged: true, flagReviewStatus: "REJECTED" },
      }),
    ]);

    const stats = {
      pending: pendingCount,
      verified: verifiedCount,
      rejected: rejectedCount,
      total: pendingCount + verifiedCount + rejectedCount,
    };

    // Format response
    const formattedTests = tests.map((candidate) => {
      // Calculate suspicious indicators
      const indicators: string[] = [];

      // High score indicator
      if (candidate.testScore && candidate.testScore >= 95) {
        indicators.push("Very high score");
      }

      // High percentile indicator
      if (candidate.testPercentile && candidate.testPercentile >= 95) {
        indicators.push("Top 5% percentile");
      }

      // Quick completion (if stored)
      if (candidate.testCompletionTime && candidate.testCompletionTime < 1800) {
        // Less than 30 minutes
        indicators.push("Fast completion time");
      }

      // Recent account with high score
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
        testCompletedAt: candidate.testCompletedAt,
        testCompletionTime: candidate.testCompletionTime,
        testAttempts: candidate.testAttempts,
        flaggedAt: candidate.flaggedAt,
        flagReason: candidate.flagReason,
        flagReviewStatus: candidate.flagReviewStatus,
        flagReviewedAt: candidate.flagReviewedAt,
        flagReviewNote: candidate.flagReviewNote,
        suspiciousIndicators: indicators,
        needsReview: !candidate.flagReviewStatus,
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
      stats,
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
