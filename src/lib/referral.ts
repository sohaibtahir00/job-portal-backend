/**
 * Referral Program Utilities
 *
 * Manages referral code generation, tracking, and payouts
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";
import { formatCurrency } from "@/lib/stripe";

// Referral program configuration
export const REFERRAL_CONFIG = {
  // Reward amount in cents ($50)
  rewardAmount: 5000,

  // Minimum test score to qualify for referral reward
  minimumTestScore: 60,

  // Minimum test percentile to qualify
  minimumTestPercentile: 60,

  // Referral code length
  codeLength: 8,

  // Referral code prefix
  codePrefix: "REF",

  // Expiration days (0 = never expires)
  expirationDays: 0,
} as const;

/**
 * Generate a unique referral code
 */
export function generateReferralCode(): string {
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${REFERRAL_CONFIG.codePrefix}${randomPart}`;
}

/**
 * Check if referral code is valid format
 */
export function isValidReferralCode(code: string): boolean {
  const pattern = new RegExp(
    `^${REFERRAL_CONFIG.codePrefix}[A-F0-9]{${REFERRAL_CONFIG.codeLength}}$`
  );
  return pattern.test(code);
}

/**
 * Create or get referral code for candidate
 */
export async function getOrCreateReferralCode(candidateId: string): Promise<string> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { referralCode: true },
  });

  if (!candidate) {
    throw new Error("Candidate not found");
  }

  // Return existing code if present
  if (candidate.referralCode) {
    return candidate.referralCode;
  }

  // Generate new unique code
  let referralCode: string;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    referralCode = generateReferralCode();
    attempts++;

    // Check if code is unique
    const existing = await prisma.candidate.findUnique({
      where: { referralCode },
    });

    if (!existing) {
      // Code is unique, save it
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { referralCode },
      });
      return referralCode;
    }
  } while (attempts < maxAttempts);

  throw new Error("Failed to generate unique referral code");
}

/**
 * Apply referral code during signup
 */
export async function applyReferralCode(
  email: string,
  referralCode: string
): Promise<{ success: boolean; error?: string; referrer?: any }> {
  try {
    // Validate code format
    if (!isValidReferralCode(referralCode)) {
      return { success: false, error: "Invalid referral code format" };
    }

    // Find candidate with this referral code
    const referrer = await prisma.candidate.findUnique({
      where: { referralCode },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!referrer) {
      return { success: false, error: "Referral code not found" };
    }

    // Cannot refer yourself
    if (referrer.user.email === email) {
      return { success: false, error: "Cannot use your own referral code" };
    }

    // Check if this email was already referred
    const existingReferral = await prisma.referral.findFirst({
      where: { email },
    });

    if (existingReferral) {
      return { success: false, error: "This email has already been referred" };
    }

    // Create referral record
    const expiresAt = REFERRAL_CONFIG.expirationDays > 0
      ? new Date(Date.now() + REFERRAL_CONFIG.expirationDays * 24 * 60 * 60 * 1000)
      : null;

    await prisma.referral.create({
      data: {
        referrerId: referrer.user.id,
        email,
        status: "PENDING",
        expiresAt,
      },
    });

    return {
      success: true,
      referrer: {
        id: referrer.id,
        name: referrer.user.name,
        code: referralCode,
      },
    };
  } catch (error) {
    console.error("Apply referral code error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to apply referral code",
    };
  }
}

/**
 * Check if referred candidate qualifies for referral reward
 * (completed test with minimum score)
 */
export async function checkReferralQualification(candidateId: string): Promise<boolean> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      hasTakenTest: true,
      testScore: true,
      testPercentile: true,
    },
  });

  if (!candidate || !candidate.hasTakenTest) {
    return false;
  }

  return (
    (candidate.testScore ?? 0) >= REFERRAL_CONFIG.minimumTestScore &&
    (candidate.testPercentile ?? 0) >= REFERRAL_CONFIG.minimumTestPercentile
  );
}

/**
 * Process referral reward when referee completes test
 */
export async function processReferralReward(
  refereeUserId: string
): Promise<{ success: boolean; reward?: number; error?: string }> {
  try {
    // Get referee candidate
    const refereeCandidate = await prisma.candidate.findUnique({
      where: { userId: refereeUserId },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!refereeCandidate) {
      return { success: false, error: "Referee candidate not found" };
    }

    // Check if referee qualifies
    const qualifies = await checkReferralQualification(refereeCandidate.id);
    if (!qualifies) {
      return { success: false, error: "Referee does not meet qualification criteria" };
    }

    // Find referral record
    const referral = await prisma.referral.findFirst({
      where: {
        email: refereeCandidate.user.email,
        status: "PENDING",
      },
      include: {
        referrer: {
          include: {
            candidate: true,
          },
        },
      },
    });

    if (!referral) {
      // No active referral found, this is okay
      return { success: true };
    }

    // Update referral to SUCCESSFUL
    const updatedReferral = await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: "SUCCESSFUL",
        referredUserId: refereeUserId,
        reward: REFERRAL_CONFIG.rewardAmount,
        payoutStatus: "PENDING",
      },
    });

    // Update referrer's earnings
    if (referral.referrer.candidate) {
      await prisma.candidate.update({
        where: { id: referral.referrer.candidate.id },
        data: {
          referralEarnings: {
            increment: REFERRAL_CONFIG.rewardAmount,
          },
        },
      });
    }

    // Send notification email to referrer
    try {
      await sendReferralSuccessEmail({
        referrerEmail: referral.referrer.email,
        referrerName: referral.referrer.name,
        refereeName: refereeCandidate.user.name,
        rewardAmount: REFERRAL_CONFIG.rewardAmount,
      });
    } catch (emailError) {
      console.error("Failed to send referral success email:", emailError);
      // Don't fail the reward processing if email fails
    }

    return {
      success: true,
      reward: REFERRAL_CONFIG.rewardAmount,
    };
  } catch (error) {
    console.error("Process referral reward error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to process referral reward",
    };
  }
}

/**
 * Send referral success email to referrer
 */
export async function sendReferralSuccessEmail(data: {
  referrerEmail: string;
  referrerName: string;
  refereeName: string;
  rewardAmount: number;
}): Promise<void> {
  const { referrerEmail, referrerName, refereeName, rewardAmount } = data;

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f5f5f5;">
          <tr>
            <td style="padding: 40px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 40px 40px 60px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 600;">
                      🎉 Referral Reward Earned!
                    </h1>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 40px; background-color: #ffffff;">
                    <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                      Hi <strong>${referrerName}</strong>,
                    </p>

                    <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                      Great news! Your referral <strong>${refereeName}</strong> has successfully completed their skills test and qualified for the referral program.
                    </p>

                    <!-- Reward Box -->
                    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background: linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%); border-radius: 8px; padding: 30px; margin: 0 0 30px;">
                      <tr>
                        <td style="text-align: center;">
                          <div style="font-size: 48px; font-weight: 700; color: #059669; margin-bottom: 10px;">
                            ${formatCurrency(rewardAmount)}
                          </div>
                          <div style="font-size: 14px; color: #065F46; text-transform: uppercase; letter-spacing: 1px;">
                            Referral Reward
                          </div>
                        </td>
                      </tr>
                    </table>

                    <div style="background-color: #F0FDF4; border-left: 4px solid #10B981; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                      <p style="margin: 0 0 10px; color: #059669; font-weight: 600; font-size: 14px;">
                        💰 Reward Status
                      </p>
                      <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.6;">
                        Your reward of <strong>${formatCurrency(rewardAmount)}</strong> has been added to your account. You can view your total earnings and payout history in your dashboard.
                      </p>
                    </div>

                    <p style="margin: 0 0 30px; color: #666666; font-size: 14px; line-height: 1.6;">
                      Keep sharing your referral code to earn more rewards! For every candidate you refer who passes their skills test, you'll earn ${formatCurrency(rewardAmount)}.
                    </p>

                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                      <tr>
                        <td style="border-radius: 6px; background: linear-gradient(135deg, #10B981 0%, #059669 100%);">
                          <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard"
                             style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                            View Dashboard
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px; color: #666666; font-size: 12px; line-height: 1.6; text-align: center;">
                      Keep referring and earning!
                    </p>
                    <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                      © ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  await sendEmail({
    to: referrerEmail,
    subject: `🎉 You earned ${formatCurrency(rewardAmount)} from your referral!`,
    html: emailHtml,
  });
}

/**
 * Get referral statistics for a user
 */
export async function getReferralStats(userId: string): Promise<{
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  totalEarnings: number;
  pendingEarnings: number;
}> {
  const [referrals, candidate] = await Promise.all([
    prisma.referral.findMany({
      where: { referrerId: userId },
    }),
    prisma.candidate.findUnique({
      where: { userId },
      select: { referralEarnings: true },
    }),
  ]);

  const successfulReferrals = referrals.filter((r) => r.status === "SUCCESSFUL").length;
  const pendingReferrals = referrals.filter((r) => r.status === "PENDING").length;
  const pendingEarnings = referrals
    .filter((r) => r.payoutStatus === "PENDING")
    .reduce((sum, r) => sum + (r.reward || 0), 0);

  return {
    totalReferrals: referrals.length,
    successfulReferrals,
    pendingReferrals,
    totalEarnings: candidate?.referralEarnings || 0,
    pendingEarnings,
  };
}

export default {
  REFERRAL_CONFIG,
  generateReferralCode,
  isValidReferralCode,
  getOrCreateReferralCode,
  applyReferralCode,
  checkReferralQualification,
  processReferralReward,
  sendReferralSuccessEmail,
  getReferralStats,
};
