import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";

/**
 * PATCH /api/admin/tests/[id]/verify
 * Verify or reject a flagged test result
 *
 * Request Body:
 * - action: "verify" | "reject"
 * - note?: string (optional review note)
 * - resetTest?: boolean (for rejected tests - allow candidate to retake)
 *
 * Actions:
 * - verify: Mark test as legitimate, remove flag, keep score
 * - reject: Mark test as invalid, optionally reset for retake, may suspend user
 *
 * Response:
 * - 200: { success: true, candidate, action }
 * - 403: Unauthorized
 * - 404: Candidate not found
 * - 400: Invalid action or test not flagged
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // Require ADMIN role
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const { id } = params;
    const body = await request.json();
    const { action, note, resetTest } = body;

    // Validate action
    if (!action || !["verify", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'verify' or 'reject'." },
        { status: 400 }
      );
    }

    // Get candidate with user details
    const candidate = await prisma.candidate.findUnique({
      where: { id },
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

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Check if test is flagged
    if (!candidate.isFlagged) {
      return NextResponse.json(
        { error: "This test is not flagged for review." },
        { status: 400 }
      );
    }

    // Check if already reviewed
    if (candidate.flagReviewStatus) {
      return NextResponse.json(
        {
          error: `This test has already been ${candidate.flagReviewStatus.toLowerCase()}.`,
        },
        { status: 400 }
      );
    }

    let updatedCandidate;
    let emailSubject: string;
    let emailHtml: string;

    if (action === "verify") {
      // Verify test - mark as legitimate
      updatedCandidate = await prisma.candidate.update({
        where: { id },
        data: {
          isFlagged: false,
          flagReviewStatus: "VERIFIED",
          flagReviewedAt: new Date(),
          flagReviewNote: note || "Test verified as legitimate by admin",
        },
      });

      // Send verification email
      emailSubject = `✅ Your Test Results Have Been Verified`;
      emailHtml = `
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
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                          ✅ Test Results Verified
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
                          Good news! Your test results have been reviewed and verified by our team. Your scores are official and will be displayed to employers.
                        </p>

                        <!-- Test Results Box -->
                        <div style="background: #D1FAE5; border-left: 4px solid #10B981; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                          <p style="margin: 0 0 10px; color: #065F46; font-weight: 600; font-size: 16px;">
                            📊 Your Test Results
                          </p>
                          <p style="margin: 0; color: #047857; font-size: 14px;">
                            Score: <strong>${candidate.testScore}/100</strong><br>
                            Percentile: <strong>${candidate.testPercentile}%</strong><br>
                            Tier: <strong>${candidate.testTier}</strong>
                          </p>
                        </div>

                        ${note ? `<div style="background-color: #DBEAFE; border: 1px solid #60A5FA; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                          <p style="margin: 0 0 10px; color: #1E40AF; font-weight: 600; font-size: 14px;">
                            💬 Review Note:
                          </p>
                          <p style="margin: 0; color: #1E3A8A; font-size: 14px; line-height: 1.6;">
                            ${note}
                          </p>
                        </div>` : ""}

                        <div style="background-color: #F0FDF4; border: 1px solid #86EFAC; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                          <p style="margin: 0 0 10px; color: #166534; font-weight: 600; font-size: 14px;">
                            ✨ What's next:
                          </p>
                          <ul style="margin: 0; padding-left: 20px; color: #166534; font-size: 14px;">
                            <li>Your test results are now official</li>
                            <li>Employers can see your verified scores</li>
                            <li>Continue applying to jobs with confidence</li>
                          </ul>
                        </div>

                        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                          <tr>
                            <td style="border-radius: 6px; background: linear-gradient(135deg, #10B981 0%, #059669 100%);">
                              <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard"
                                 style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                                Go to Dashboard
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
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
    } else {
      // Reject test - mark as invalid
      const updateData: any = {
        flagReviewStatus: "REJECTED",
        flagReviewedAt: new Date(),
        flagReviewNote: note || "Test rejected after review",
      };

      // Optionally reset test for retake
      if (resetTest) {
        updateData.testScore = null;
        updateData.testPercentile = null;
        updateData.testTier = null;
        updateData.testCompletedAt = null;
        updateData.testCompletionTime = null;
        updateData.isFlagged = false;
      }

      updatedCandidate = await prisma.candidate.update({
        where: { id },
        data: updateData,
      });

      // Send rejection email
      emailSubject = `⚠️ Issue with Your Test Results`;
      emailHtml = `
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
                      <td style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 40px 40px 60px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                          ⚠️ Test Results Review
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
                          After reviewing your test results, we've identified some concerns that need to be addressed.
                        </p>

                        <!-- Reason Box -->
                        <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                          <p style="margin: 0 0 10px; color: #92400E; font-weight: 600; font-size: 14px;">
                            📋 Review Findings:
                          </p>
                          <p style="margin: 0; color: #78350F; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
                            ${note || candidate.flagReason || "Your test results did not pass our verification process."}
                          </p>
                        </div>

                        ${resetTest ? `<div style="background-color: #DBEAFE; border: 1px solid #60A5FA; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                          <p style="margin: 0 0 10px; color: #1E40AF; font-weight: 600; font-size: 14px;">
                            🔄 What happens next:
                          </p>
                          <ul style="margin: 0; padding-left: 20px; color: #1E3A8A; font-size: 14px;">
                            <li>Your previous test results have been cleared</li>
                            <li>You can retake the test to get verified results</li>
                            <li>Please ensure you follow all test guidelines</li>
                            <li>Contact support if you have questions</li>
                          </ul>
                        </div>` : `<div style="background-color: #FEE2E2; border: 1px solid #FCA5A5; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                          <p style="margin: 0 0 10px; color: #991B1B; font-weight: 600; font-size: 14px;">
                            ⚠️ Action Required:
                          </p>
                          <p style="margin: 0; color: #B91C1C; font-size: 14px; line-height: 1.6;">
                            Please contact our support team at <a href="mailto:${EMAIL_CONFIG.replyTo}" style="color: #DC2626;">${EMAIL_CONFIG.replyTo}</a> to resolve this issue.
                          </p>
                        </div>`}

                        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                          <tr>
                            <td style="border-radius: 6px; background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);">
                              <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}${resetTest ? "/test" : "/dashboard"}"
                                 style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                                ${resetTest ? "Retake Test" : "Go to Dashboard"}
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
                          Questions? Contact us at ${EMAIL_CONFIG.replyTo}
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
    }

    // Send email notification
    try {
      await sendEmail({
        to: candidate.user.email,
        subject: emailSubject,
        html: emailHtml,
      });
    } catch (emailError) {
      console.error("Failed to send test verification/rejection email:", emailError);
      // Don't fail the request if email fails
    }

    // Log admin action
    console.log(
      `[ADMIN] ${session.user.email} ${action}ed test for candidate ${id} (${candidate.user.email})${resetTest ? " - Test reset" : ""}${note ? ` - Note: ${note}` : ""}`
    );

    return NextResponse.json({
      success: true,
      action,
      candidate: {
        id: updatedCandidate.id,
        user: {
          id: candidate.user.id,
          name: candidate.user.name,
          email: candidate.user.email,
        },
        testScore: updatedCandidate.testScore,
        testPercentile: updatedCandidate.testPercentile,
        testTier: updatedCandidate.testTier,
        isFlagged: updatedCandidate.isFlagged,
        flagReviewStatus: updatedCandidate.flagReviewStatus,
        flagReviewedAt: updatedCandidate.flagReviewedAt,
        flagReviewNote: updatedCandidate.flagReviewNote,
      },
      message:
        action === "verify"
          ? "Test verified successfully"
          : resetTest
            ? "Test rejected and reset for retake"
            : "Test rejected",
    });
  } catch (error) {
    console.error("Admin test verification error:", error);
    return NextResponse.json(
      {
        error: "Failed to process test verification",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
