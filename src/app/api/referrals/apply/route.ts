import { NextRequest, NextResponse } from "next/server";
import { applyReferralCode, REFERRAL_CONFIG } from "@/lib/referral";
import { formatCurrency } from "@/lib/stripe";

/**
 * POST /api/referrals/apply
 * Apply referral code during signup
 *
 * Validates and applies a referral code before user registration.
 * Creates a pending referral record that will be completed when
 * the referee passes their skills test.
 *
 * This endpoint is public (no authentication required) as it's
 * called during the signup process before the user account exists.
 *
 * Request body:
 * {
 *   "email": "string",
 *   "referralCode": "string"
 * }
 *
 * Response:
 * - 200: { success: true, referrer, reward }
 * - 400: Invalid code or validation error
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, referralCode } = body;

    // Validate required fields
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!referralCode) {
      return NextResponse.json(
        { error: "Referral code is required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Apply referral code
    const result = await applyReferralCode(email, referralCode.trim().toUpperCase());

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || "Failed to apply referral code",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Referral code applied successfully",
      referrer: result.referrer,
      reward: {
        amount: REFERRAL_CONFIG.rewardAmount,
        amountFormatted: formatCurrency(REFERRAL_CONFIG.rewardAmount),
        terms: `Complete your skills test with a score of ${REFERRAL_CONFIG.minimumTestScore}+ and percentile ${REFERRAL_CONFIG.minimumTestPercentile}+ to help ${result.referrer?.name} earn their referral reward.`,
      },
      instructions: [
        "Complete your registration",
        "Take the skills assessment test",
        `Score ${REFERRAL_CONFIG.minimumTestScore}+ with percentile ${REFERRAL_CONFIG.minimumTestPercentile}+`,
        `Your referrer will earn ${formatCurrency(REFERRAL_CONFIG.rewardAmount)}`,
      ],
    });
  } catch (error) {
    console.error("Apply referral code error:", error);

    return NextResponse.json(
      {
        error: "Failed to apply referral code",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/referrals/apply?code=XXX
 * Validate referral code without applying
 *
 * Public endpoint to check if a referral code is valid
 * before the signup form is submitted.
 *
 * Query parameters:
 * - code: Referral code to validate
 *
 * Response:
 * - 200: { valid: true, referrer }
 * - 400: Invalid code
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { error: "Referral code is required" },
        { status: 400 }
      );
    }

    const { prisma } = await import("@/lib/prisma");
    const { isValidReferralCode } = await import("@/lib/referral");

    // Validate code format
    if (!isValidReferralCode(code.trim().toUpperCase())) {
      return NextResponse.json({
        valid: false,
        error: "Invalid referral code format",
      });
    }

    // Find candidate with this code
    const candidate = await prisma.candidate.findUnique({
      where: { referralCode: code.trim().toUpperCase() },
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
      return NextResponse.json({
        valid: false,
        error: "Referral code not found",
      });
    }

    return NextResponse.json({
      valid: true,
      referrer: {
        name: candidate.user.name,
        code: candidate.referralCode,
      },
      reward: {
        amount: REFERRAL_CONFIG.rewardAmount,
        amountFormatted: formatCurrency(REFERRAL_CONFIG.rewardAmount),
      },
    });
  } catch (error) {
    console.error("Validate referral code error:", error);

    return NextResponse.json(
      {
        error: "Failed to validate referral code",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
