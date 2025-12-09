import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { parseCheckInResponse, ParsedCheckInResponse } from "@/lib/openai";
import { RiskLevel, FlagStatus, IntroductionStatus } from "@prisma/client";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";

/**
 * POST /api/admin/check-ins/parse-reply
 * Parse a free-text email reply from a candidate and update the check-in record
 *
 * Body: {
 *   checkInId: string,
 *   emailContent: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json();
    const { checkInId, emailContent } = body;

    // Validate input
    if (!checkInId || typeof checkInId !== "string") {
      return NextResponse.json(
        { error: "checkInId is required" },
        { status: 400 }
      );
    }

    if (!emailContent || typeof emailContent !== "string") {
      return NextResponse.json(
        { error: "emailContent is required" },
        { status: 400 }
      );
    }

    if (emailContent.trim().length < 10) {
      return NextResponse.json(
        { error: "Email content is too short to parse" },
        { status: 400 }
      );
    }

    // Get check-in and introduction details
    const checkIn = await prisma.candidateCheckIn.findUnique({
      where: { id: checkInId },
      include: {
        introduction: {
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
            employer: {
              select: {
                id: true,
                companyName: true,
              },
            },
            job: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    });

    if (!checkIn) {
      return NextResponse.json(
        { error: "Check-in not found" },
        { status: 404 }
      );
    }

    // Parse with OpenAI
    console.log(`[Parse Reply] Parsing check-in ${checkInId} for ${checkIn.introduction.employer.companyName}`);

    const parsed = await parseCheckInResponse(
      emailContent,
      checkIn.introduction.employer.companyName
    );

    console.log(`[Parse Reply] Parsed result:`, {
      status: parsed.status,
      riskLevel: parsed.riskLevel,
      confidence: parsed.confidence,
    });

    const now = new Date();

    // Update check-in record
    await prisma.candidateCheckIn.update({
      where: { id: checkInId },
      data: {
        responseType: "free_text",
        responseRaw: emailContent,
        responseParsed: parsed as unknown as Record<string, unknown>,
        respondedAt: checkIn.respondedAt || now, // Keep original if already set
        riskLevel: parsed.riskLevel,
        riskReason: parsed.riskReason,
        flaggedForReview:
          parsed.riskLevel === RiskLevel.HIGH ||
          parsed.riskLevel === RiskLevel.MEDIUM,
      },
    });

    let flagCreated = false;
    let flagId: string | null = null;

    // Create circumvention flag if high risk
    if (parsed.riskLevel === RiskLevel.HIGH && parsed.status === "hired_there") {
      const flag = await prisma.circumventionFlag.create({
        data: {
          introductionId: checkIn.introduction.id,
          detectionMethod: "email_reply_parsing",
          evidence: JSON.stringify({
            checkInId: checkIn.id,
            checkInNumber: checkIn.checkInNumber,
            parsedResponse: parsed,
            originalEmail: emailContent,
            detectedAt: now.toISOString(),
            aiConfidence: parsed.confidence,
          }),
          status: FlagStatus.OPEN,
        },
      });

      flagCreated = true;
      flagId = flag.id;

      // Update introduction status to HIRED
      await prisma.candidateIntroduction.update({
        where: { id: checkIn.introduction.id },
        data: {
          status: IntroductionStatus.HIRED,
        },
      });

      // Send admin alert
      const adminEmail = process.env.ADMIN_EMAIL || "admin@getskillproof.com";
      const adminDashboardUrl = `${EMAIL_CONFIG.appUrl}/admin/introductions/${checkIn.introduction.id}`;

      await sendEmail({
        to: adminEmail,
        subject: `🚨 AI DETECTED: Candidate hired at ${checkIn.introduction.employer.companyName}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #DC2626; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                .alert-card { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #DC2626; }
                .ai-analysis { background: #EFF6FF; border: 1px solid #3B82F6; padding: 15px; border-radius: 6px; margin: 15px 0; }
                .original-email { background: #F3F4F6; padding: 15px; border-radius: 6px; margin: 15px 0; font-family: monospace; white-space: pre-wrap; font-size: 12px; }
                .button { display: inline-block; background: #DC2626; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
                .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
                .confidence { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
                .confidence-high { background: #DEF7EC; color: #03543F; }
                .confidence-medium { background: #FEF3C7; color: #92400E; }
                .confidence-low { background: #FEE2E2; color: #991B1B; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🤖 AI Detected Potential Circumvention</h1>
                </div>
                <div class="content">
                  <p>Our AI has analyzed a free-text email reply and detected that <strong>${checkIn.introduction.candidate.user.name}</strong> may have been hired at <strong>${checkIn.introduction.employer.companyName}</strong>.</p>

                  <div class="alert-card">
                    <h3 style="margin-top: 0; color: #DC2626;">Detection Details</h3>
                    <p><strong>Candidate:</strong> ${checkIn.introduction.candidate.user.name}</p>
                    <p><strong>Employer:</strong> ${checkIn.introduction.employer.companyName}</p>
                    <p><strong>Position:</strong> ${checkIn.introduction.job?.title || "Not specified"}</p>
                    <p><strong>Check-in #:</strong> ${checkIn.checkInNumber}</p>
                    <p><strong>Flag ID:</strong> ${flagId}</p>
                    ${parsed.startDateMentioned ? `<p><strong>Start Date Mentioned:</strong> ${parsed.startDateMentioned}</p>` : ""}
                    ${parsed.roleTitleMentioned ? `<p><strong>Role Mentioned:</strong> ${parsed.roleTitleMentioned}</p>` : ""}
                    ${parsed.salaryMentioned ? `<p><strong>Salary Mentioned:</strong> ${parsed.salaryMentioned}</p>` : ""}
                  </div>

                  <div class="ai-analysis">
                    <h4 style="margin-top: 0; color: #1E40AF;">🤖 AI Analysis</h4>
                    <p><strong>Status:</strong> ${parsed.status}</p>
                    <p><strong>Summary:</strong> ${parsed.summary}</p>
                    <p><strong>Risk Reason:</strong> ${parsed.riskReason || "N/A"}</p>
                    <p>
                      <strong>Confidence:</strong>
                      <span class="confidence confidence-${parsed.confidence}">${parsed.confidence.toUpperCase()}</span>
                    </p>
                    <p><strong>Suggested Action:</strong> ${parsed.suggestedAction}</p>
                  </div>

                  <h4>Original Email:</h4>
                  <div class="original-email">${emailContent.substring(0, 1000)}${emailContent.length > 1000 ? "..." : ""}</div>

                  <p><strong>Recommended Actions:</strong></p>
                  <ol>
                    <li>Review the original email for context</li>
                    <li>Verify the hire with the employer directly</li>
                    <li>Calculate and send the placement invoice</li>
                  </ol>

                  <div style="text-align: center;">
                    <a href="${adminDashboardUrl}" class="button">View in Admin Dashboard</a>
                  </div>
                </div>
                <div class="footer">
                  <p>This alert was generated by AI analysis. Please verify before taking action.</p>
                  <p>AI Confidence: ${parsed.confidence.toUpperCase()}</p>
                </div>
              </div>
            </body>
          </html>
        `,
        text: `AI ALERT: ${checkIn.introduction.candidate.user.name} appears to have been hired at ${checkIn.introduction.employer.companyName}. Summary: ${parsed.summary}. View details: ${adminDashboardUrl}`,
      });

      console.log(
        `[Parse Reply] HIGH RISK: Created circumvention flag ${flagId} for introduction ${checkIn.introduction.id}`
      );
    }

    return NextResponse.json({
      success: true,
      checkInId,
      parsed: {
        status: parsed.status,
        riskLevel: parsed.riskLevel,
        confidence: parsed.confidence,
        summary: parsed.summary,
        suggestedAction: parsed.suggestedAction,
        companyMentioned: parsed.companyMentioned,
        isIntroducedCompany: parsed.isIntroducedCompany,
        startDateMentioned: parsed.startDateMentioned,
        roleTitleMentioned: parsed.roleTitleMentioned,
      },
      flagCreated,
      flagId,
    });
  } catch (error) {
    console.error("[Parse Reply] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to parse email reply",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/check-ins/parse-reply
 * Get check-ins that need manual parsing (have responses but no parsed data)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // 'pending', 'flagged', 'all'

    const whereClause: Record<string, unknown> = {};

    if (status === "pending") {
      // Check-ins with responses but no parsed data
      whereClause.respondedAt = { not: null };
      whereClause.responseParsed = null;
    } else if (status === "flagged") {
      // Check-ins flagged for review
      whereClause.flaggedForReview = true;
    }

    const checkIns = await prisma.candidateCheckIn.findMany({
      where: whereClause,
      include: {
        introduction: {
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
            employer: {
              select: {
                companyName: true,
              },
            },
            job: {
              select: {
                title: true,
              },
            },
          },
        },
      },
      orderBy: {
        respondedAt: "desc",
      },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      checkIns: checkIns.map((ci) => ({
        id: ci.id,
        checkInNumber: ci.checkInNumber,
        scheduledFor: ci.scheduledFor,
        sentAt: ci.sentAt,
        respondedAt: ci.respondedAt,
        responseType: ci.responseType,
        responseRaw: ci.responseRaw,
        responseParsed: ci.responseParsed,
        riskLevel: ci.riskLevel,
        riskReason: ci.riskReason,
        flaggedForReview: ci.flaggedForReview,
        candidateName: ci.introduction.candidate.user.name,
        candidateEmail: ci.introduction.candidate.user.email,
        employerCompanyName: ci.introduction.employer.companyName,
        jobTitle: ci.introduction.job?.title,
        introductionId: ci.introduction.id,
      })),
      count: checkIns.length,
    });
  } catch (error) {
    console.error("[Parse Reply GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch check-ins" },
      { status: 500 }
    );
  }
}
