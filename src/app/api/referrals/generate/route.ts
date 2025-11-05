import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateReferralCode, REFERRAL_CONFIG } from "@/lib/referral";
import { formatCurrency } from "@/lib/stripe";

/**
 * POST /api/referrals/generate
 * Generate unique referral code for candidate
 *
 * Creates or returns existing referral code for the authenticated candidate.
 * Candidates can share this code to refer others and earn rewards.
 *
 * Requirements:
 * - Authenticated user with CANDIDATE role
 *
 * Response:
 * - 200: { referralCode, referralUrl, rewardAmount }
 * - 401: Not authenticated
 * - 403: Not a candidate
 * - 404: Candidate profile not found
 * - 500: Server error
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

    // Generate or get existing referral code
    const referralCode = await getOrCreateReferralCode(candidate.id);

    // Build referral URL
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const referralUrl = `${baseUrl}/signup?ref=${referralCode}`;

    // Get referral statistics
    const referrals = await prisma.referral.findMany({
      where: { referrerId: user.id },
    });

    const stats = {
      total: referrals.length,
      successful: referrals.filter((r) => r.status === "SUCCESSFUL").length,
      pending: referrals.filter((r) => r.status === "PENDING").length,
      earnings: candidate.referralEarnings,
    };

    return NextResponse.json({
      message: "Referral code generated successfully",
      referral: {
        code: referralCode,
        url: referralUrl,
        shareMessage: `Join ${process.env.NEXT_PUBLIC_APP_NAME || "our platform"} using my referral code: ${referralCode}`,
      },
      program: {
        rewardAmount: REFERRAL_CONFIG.rewardAmount,
        rewardAmountFormatted: formatCurrency(REFERRAL_CONFIG.rewardAmount),
        minimumTestScore: REFERRAL_CONFIG.minimumTestScore,
        minimumTestPercentile: REFERRAL_CONFIG.minimumTestPercentile,
        terms: `Earn ${formatCurrency(REFERRAL_CONFIG.rewardAmount)} for each candidate you refer who passes their skills test with a score of ${REFERRAL_CONFIG.minimumTestScore}+ and percentile ${REFERRAL_CONFIG.minimumTestPercentile}+.`,
      },
      stats,
      candidate: {
        id: candidate.id,
        name: candidate.user.name,
        referralEarnings: candidate.referralEarnings,
        referralEarningsFormatted: formatCurrency(candidate.referralEarnings),
      },
    });
  } catch (error) {
    console.error("Generate referral code error:", error);

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
        error: "Failed to generate referral code",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/referrals/generate
 * Get existing referral code (without generating new one)
 *
 * Requirements:
 * - Authenticated user with CANDIDATE role
 *
 * Response:
 * - 200: { referralCode, referralUrl } or { hasCode: false }
 * - 401: Not authenticated
 * - 403: Not a candidate
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(UserRole.CANDIDATE);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
      select: {
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

    if (!candidate.referralCode) {
      return NextResponse.json({
        hasCode: false,
        message: "No referral code generated yet. Use POST to generate one.",
      });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const referralUrl = `${baseUrl}/signup?ref=${candidate.referralCode}`;

    // Get referral statistics
    const referrals = await prisma.referral.findMany({
      where: { referrerId: user.id },
    });

    const stats = {
      total: referrals.length,
      successful: referrals.filter((r) => r.status === "SUCCESSFUL").length,
      pending: referrals.filter((r) => r.status === "PENDING").length,
      earnings: candidate.referralEarnings,
    };

    return NextResponse.json({
      hasCode: true,
      referral: {
        code: candidate.referralCode,
        url: referralUrl,
      },
      program: {
        rewardAmount: REFERRAL_CONFIG.rewardAmount,
        rewardAmountFormatted: formatCurrency(REFERRAL_CONFIG.rewardAmount),
      },
      stats,
    });
  } catch (error) {
    console.error("Get referral code error:", error);

    return NextResponse.json(
      {
        error: "Failed to get referral code",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
