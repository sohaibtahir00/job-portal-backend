import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/stripe";
import { getReferralStats, REFERRAL_CONFIG } from "@/lib/referral";

/**
 * GET /api/referrals
 * Get candidate's referrals list with statistics
 *
 * Returns all referrals made by the authenticated candidate,
 * including status, rewards, and earnings summary.
 *
 * Requirements:
 * - Authenticated user with CANDIDATE role
 *
 * Query parameters:
 * - status: Filter by status (PENDING, SUCCESSFUL, EXPIRED)
 * - limit: Number of results (default: 50)
 * - offset: Pagination offset (default: 0)
 *
 * Response:
 * - 200: { referrals, stats, earnings }
 * - 401: Not authenticated
 * - 403: Not a candidate
 * - 500: Server error
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    const limit = Math.min(parseInt(limitParam || "50", 10), 100);
    const offset = parseInt(offsetParam || "0", 10);

    // Get candidate profile
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        referralCode: true,
        referralEarnings: true,
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    // Build where clause
    const where: any = {
      referrerId: user.id,
    };

    if (statusFilter) {
      where.status = statusFilter;
    }

    // Get referrals with pagination
    const [referrals, totalCount] = await Promise.all([
      prisma.referral.findMany({
        where,
        include: {
          referredUser: {
            select: {
              id: true,
              name: true,
              email: true,
              candidate: {
                select: {
                  testScore: true,
                  testPercentile: true,
                  testTier: true,
                  lastTestDate: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.referral.count({ where }),
    ]);

    // Format referrals
    const formattedReferrals = referrals.map((ref) => ({
      id: ref.id,
      email: ref.email,
      name: ref.name,
      status: ref.status,
      reward: ref.reward,
      rewardFormatted: ref.reward ? formatCurrency(ref.reward) : null,
      payoutStatus: ref.payoutStatus,
      paidAt: ref.paidAt,
      createdAt: ref.createdAt,
      expiresAt: ref.expiresAt,
      isExpired: ref.expiresAt ? ref.expiresAt < new Date() : false,
      referredUser: ref.referredUser
        ? {
            id: ref.referredUser.id,
            name: ref.referredUser.name,
            email: ref.referredUser.email,
            testInfo: ref.referredUser.candidate
              ? {
                  score: ref.referredUser.candidate.testScore,
                  percentile: ref.referredUser.candidate.testPercentile,
                  tier: ref.referredUser.candidate.testTier,
                  lastTestDate: ref.referredUser.candidate.lastTestDate,
                }
              : null,
          }
        : null,
    }));

    // Get referral statistics
    const stats = await getReferralStats(user.id);

    // Calculate pagination
    const hasMore = offset + limit < totalCount;
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    // Get payout summary
    const payouts = {
      paid: referrals
        .filter((r) => r.payoutStatus === "PAID")
        .reduce((sum, r) => sum + (r.reward || 0), 0),
      pending: referrals
        .filter((r) => r.payoutStatus === "PENDING")
        .reduce((sum, r) => sum + (r.reward || 0), 0),
    };

    return NextResponse.json({
      referrals: formattedReferrals,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore,
        totalPages,
        currentPage,
      },
      stats: {
        ...stats,
        totalEarningsFormatted: formatCurrency(stats.totalEarnings),
        pendingEarningsFormatted: formatCurrency(stats.pendingEarnings),
      },
      payouts: {
        paid: payouts.paid,
        paidFormatted: formatCurrency(payouts.paid),
        pending: payouts.pending,
        pendingFormatted: formatCurrency(payouts.pending),
      },
      referralCode: candidate.referralCode,
      program: {
        rewardAmount: REFERRAL_CONFIG.rewardAmount,
        rewardAmountFormatted: formatCurrency(REFERRAL_CONFIG.rewardAmount),
        minimumTestScore: REFERRAL_CONFIG.minimumTestScore,
        minimumTestPercentile: REFERRAL_CONFIG.minimumTestPercentile,
      },
    });
  } catch (error) {
    console.error("Get referrals error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Candidate role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to get referrals",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
