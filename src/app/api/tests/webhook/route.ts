import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateTier } from "@/lib/test-tiers";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";
import { getTierBadgeHTML, getTierDescription } from "@/lib/test-tiers";

/**
 * POST /api/tests/webhook
 * Receive test results from iMocha or other testing platforms
 *
 * This endpoint processes webhook callbacks from testing platforms
 * Updates candidate test scores and tier status
 *
 * Expected webhook payload:
 * {
 *   "token": "test_invite_token",
 *   "candidateEmail": "candidate@example.com",
 *   "testName": "Technical Assessment",
 *   "testType": "Technical",
 *   "score": 85,
 *   "maxScore": 100,
 *   "percentile": 88,
 *   "startedAt": "2025-01-01T10:00:00Z",
 *   "completedAt": "2025-01-01T11:30:00Z",
 *   "feedback": "Excellent performance in algorithms",
 *   "metadata": {
 *     "duration": 90,
 *     "questions": 50,
 *     "correctAnswers": 42
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      token,
      candidateEmail,
      testName,
      testType,
      score,
      maxScore = 100,
      percentile,
      startedAt,
      completedAt,
      feedback,
      metadata,
    } = body;

    // Validate required fields
    if (!token && !candidateEmail) {
      return NextResponse.json(
        { error: "Either token or candidateEmail is required" },
        { status: 400 }
      );
    }

    if (score === undefined || score === null) {
      return NextResponse.json(
        { error: "Score is required" },
        { status: 400 }
      );
    }

    if (percentile === undefined || percentile === null) {
      return NextResponse.json(
        { error: "Percentile is required" },
        { status: 400 }
      );
    }

    // Validate score and percentile ranges
    if (score < 0 || score > maxScore) {
      return NextResponse.json(
        { error: `Score must be between 0 and ${maxScore}` },
        { status: 400 }
      );
    }

    if (percentile < 0 || percentile > 100) {
      return NextResponse.json(
        { error: "Percentile must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Find candidate by token or email
    let candidate;
    if (token) {
      candidate = await prisma.candidate.findUnique({
        where: { testInviteToken: token },
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
          { error: "Invalid test invitation token" },
          { status: 404 }
        );
      }
    } else {
      // Find by email
      const user = await prisma.user.findUnique({
        where: { email: candidateEmail },
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
        },
      });

      if (!user?.candidate) {
        return NextResponse.json(
          { error: "Candidate not found" },
          { status: 404 }
        );
      }

      candidate = user.candidate;
    }

    // Normalize score to 0-100 scale
    const normalizedScore = (score / maxScore) * 100;

    // Calculate tier based on score and percentile
    const tier = calculateTier(normalizedScore, percentile);

    // Update candidate with test results
    const updatedCandidate = await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        hasTakenTest: true,
        testScore: normalizedScore,
        testPercentile: percentile,
        testTier: tier,
        lastTestDate: completedAt ? new Date(completedAt) : new Date(),
        testInviteToken: null, // Clear token after use
        testInviteSentAt: null,
      },
    });

    // Find or create TestResult record
    let testResult;

    // Try to find existing TestResult with NOT_STARTED status for this candidate
    const existingTestResult = await prisma.testResult.findFirst({
      where: {
        candidateId: candidate.id,
        status: "NOT_STARTED",
        testName: testName || undefined,
        testType: testType || undefined,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existingTestResult) {
      // Update existing test result
      testResult = await prisma.testResult.update({
        where: { id: existingTestResult.id },
        data: {
          score: Math.round(normalizedScore),
          maxScore: 100,
          status: "COMPLETED",
          startedAt: startedAt ? new Date(startedAt) : null,
          completedAt: completedAt ? new Date(completedAt) : new Date(),
          feedback,
        },
      });
    } else {
      // Create new test result
      testResult = await prisma.testResult.create({
        data: {
          candidateId: candidate.id,
          applicationId: existingTestResult?.applicationId || null,
          testName: testName || "Skills Assessment",
          testType: testType || "General",
          score: Math.round(normalizedScore),
          maxScore: 100,
          status: "COMPLETED",
          startedAt: startedAt ? new Date(startedAt) : null,
          completedAt: completedAt ? new Date(completedAt) : new Date(),
          feedback,
        },
      });
    }

    // Process referral reward if applicable
    try {
      const { processReferralReward } = await import("@/lib/referral");
      await processReferralReward(candidate.userId);
    } catch (referralError) {
      console.error("Failed to process referral reward:", referralError);
      // Don't fail the webhook if referral processing fails
    }

    // Send confirmation email to candidate
    const tierBadge = getTierBadgeHTML(tier);
    const tierDescription = getTierDescription(tier);

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
                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 40px 60px; border-radius: 8px 8px 0 0; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                        🎉 Test Results Received!
                      </h1>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px; background-color: #ffffff;">
                      <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                        Hi <strong>${candidate.user.name}</strong>,
                      </p>

                      <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                        Great news! We've received your test results. Here's your performance summary:
                      </p>

                      <!-- Results Box -->
                      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%); border-radius: 8px; padding: 30px; margin: 0 0 30px;">
                        <tr>
                          <td style="text-align: center;">
                            <div style="margin-bottom: 20px;">
                              ${tierBadge}
                            </div>

                            <p style="margin: 0 0 10px; color: #666666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                              ${testName || "Skills Assessment"}
                            </p>

                            <div style="margin: 20px 0;">
                              <div style="display: inline-block; margin: 0 15px;">
                                <div style="font-size: 36px; font-weight: 700; color: #667eea;">
                                  ${normalizedScore.toFixed(1)}
                                </div>
                                <div style="font-size: 12px; color: #666666; text-transform: uppercase;">
                                  Score
                                </div>
                              </div>

                              <div style="display: inline-block; margin: 0 15px;">
                                <div style="font-size: 36px; font-weight: 700; color: #764ba2;">
                                  ${percentile}%
                                </div>
                                <div style="font-size: 12px; color: #666666; text-transform: uppercase;">
                                  Percentile
                                </div>
                              </div>
                            </div>

                            <p style="margin: 20px 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                              ${tierDescription}
                            </p>
                          </td>
                        </tr>
                      </table>

                      ${feedback ? `
                      <div style="background-color: #f9fafb; border-left: 4px solid #667eea; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                        <p style="margin: 0 0 10px; color: #667eea; font-weight: 600; font-size: 14px; text-transform: uppercase;">
                          Feedback
                        </p>
                        <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.6;">
                          ${feedback}
                        </p>
                      </div>
                      ` : ""}

                      ${metadata ? `
                      <div style="margin: 30px 0;">
                        <p style="margin: 0 0 15px; color: #333333; font-weight: 600; font-size: 14px;">
                          Test Details:
                        </p>
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
                          ${metadata.duration ? `
                          <tr>
                            <td style="padding: 8px 0; color: #666666;">Duration:</td>
                            <td style="padding: 8px 0; color: #333333; text-align: right;">${metadata.duration} minutes</td>
                          </tr>
                          ` : ""}
                          ${metadata.questions ? `
                          <tr>
                            <td style="padding: 8px 0; color: #666666; border-top: 1px solid #e5e7eb;">Questions:</td>
                            <td style="padding: 8px 0; color: #333333; text-align: right; border-top: 1px solid #e5e7eb;">${metadata.questions}</td>
                          </tr>
                          ` : ""}
                          ${metadata.correctAnswers !== undefined ? `
                          <tr>
                            <td style="padding: 8px 0; color: #666666; border-top: 1px solid #e5e7eb;">Correct Answers:</td>
                            <td style="padding: 8px 0; color: #333333; text-align: right; border-top: 1px solid #e5e7eb;">${metadata.correctAnswers}</td>
                          </tr>
                          ` : ""}
                        </table>
                      </div>
                      ` : ""}

                      <p style="margin: 30px 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                        Your test results have been saved to your profile and will be visible to employers when you apply for positions.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 10px; color: #999999; font-size: 12px; line-height: 1.6; text-align: center;">
                        Keep improving your skills to advance to higher tiers!
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

    // Send email to candidate
    try {
      await sendEmail({
        to: candidate.user.email,
        subject: `🎉 Your Test Results Are In - ${tier} Tier!`,
        html: emailHtml,
      });
    } catch (emailError) {
      console.error("Failed to send test results email:", emailError);
      // Don't fail the webhook if email fails
    }

    return NextResponse.json(
      {
        message: "Test results processed successfully",
        candidate: {
          id: updatedCandidate.id,
          name: candidate.user.name,
          email: candidate.user.email,
          score: normalizedScore,
          percentile,
          tier,
          lastTestDate: updatedCandidate.lastTestDate,
        },
        testResult: {
          id: testResult.id,
          testName: testResult.testName,
          testType: testResult.testType,
          score: testResult.score,
          maxScore: testResult.maxScore,
          status: testResult.status,
          completedAt: testResult.completedAt,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Test webhook error:", error);

    return NextResponse.json(
      {
        error: "Failed to process test results",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
