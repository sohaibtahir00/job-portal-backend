import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RiskLevel, FlagStatus, IntroductionStatus } from "@prisma/client";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";

/**
 * Valid check-in response statuses
 */
const VALID_STATUSES = [
  "interviewing",
  "offer",
  "hired_there",
  "hired_elsewhere",
  "rejected",
  "withdrew",
  "no_response",
  "still_looking",
] as const;

type CheckInStatus = (typeof VALID_STATUSES)[number];

/**
 * Map response status to risk level
 */
function getStatusRiskLevel(status: CheckInStatus): RiskLevel {
  switch (status) {
    case "hired_there":
      return RiskLevel.HIGH;
    case "offer":
    case "interviewing":
      return RiskLevel.MEDIUM;
    case "hired_elsewhere":
    case "rejected":
    case "withdrew":
    case "no_response":
      return RiskLevel.CLEAR;
    case "still_looking":
      return RiskLevel.LOW;
    default:
      return RiskLevel.LOW;
  }
}

/**
 * Get risk reason based on status
 */
function getStatusRiskReason(status: CheckInStatus, employerName: string): string {
  switch (status) {
    case "hired_there":
      return `Candidate reported being hired at ${employerName} - potential fee circumvention`;
    case "offer":
      return `Candidate received offer from ${employerName} - monitor for hire`;
    case "interviewing":
      return `Candidate actively interviewing with ${employerName}`;
    case "hired_elsewhere":
      return "Candidate was hired elsewhere - no fee applicable";
    case "rejected":
      return `${employerName} did not move forward with candidate`;
    case "withdrew":
      return "Candidate withdrew from consideration";
    case "no_response":
      return `Candidate never heard back from ${employerName}`;
    case "still_looking":
      return "Candidate still looking / waiting to hear back";
    default:
      return "Unknown status";
  }
}

/**
 * GET /api/check-in/respond/[token]
 * Get check-in details for response page
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Find check-in by token
    const checkIn = await prisma.candidateCheckIn.findUnique({
      where: { responseToken: token },
      include: {
        introduction: {
          include: {
            candidate: {
              include: {
                user: {
                  select: {
                    name: true,
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
    });

    if (!checkIn) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 404 }
      );
    }

    // Check token expiry
    const now = new Date();
    const isExpired = checkIn.responseTokenExpiry && checkIn.responseTokenExpiry < now;

    // Determine status
    let status: "pending" | "responded" | "expired" = "pending";
    if (checkIn.respondedAt) {
      status = "responded";
    } else if (isExpired) {
      status = "expired";
    }

    // Calculate days since introduction
    const introDate = checkIn.introduction.introducedAt || checkIn.introduction.createdAt;
    const daysSinceIntro = Math.floor(
      (now.getTime() - introDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return NextResponse.json({
      success: true,
      checkIn: {
        id: checkIn.id,
        candidateName: checkIn.introduction.candidate.user.name,
        employerCompanyName: checkIn.introduction.employer.companyName,
        jobTitle: checkIn.introduction.job?.title || "the position",
        introductionDate: introDate,
        daysSinceIntro,
        checkInNumber: checkIn.checkInNumber,
        status,
        previousResponse: checkIn.responseType,
      },
    });
  } catch (error) {
    console.error("[Check-in Response GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve check-in details" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/check-in/respond/[token]
 * Submit check-in response
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { status, message, startDate, roleTitle } = body;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Validate status
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          error: "Invalid status",
          validStatuses: VALID_STATUSES,
        },
        { status: 400 }
      );
    }

    // Find check-in by token
    const checkIn = await prisma.candidateCheckIn.findUnique({
      where: { responseToken: token },
      include: {
        introduction: {
          include: {
            candidate: {
              include: {
                user: {
                  select: {
                    id: true,
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
                user: {
                  select: {
                    email: true,
                  },
                },
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
        { error: "Invalid or expired token" },
        { status: 404 }
      );
    }

    // Check if already responded
    if (checkIn.respondedAt) {
      return NextResponse.json(
        {
          error: "Already responded",
          message: "You have already submitted a response for this check-in",
        },
        { status: 400 }
      );
    }

    // Check token expiry
    const now = new Date();
    if (checkIn.responseTokenExpiry && checkIn.responseTokenExpiry < now) {
      return NextResponse.json(
        { error: "Token expired" },
        { status: 400 }
      );
    }

    const intro = checkIn.introduction;
    const employerName = intro.employer.companyName;
    const riskLevel = getStatusRiskLevel(status as CheckInStatus);
    const riskReason = getStatusRiskReason(status as CheckInStatus, employerName);

    // Build parsed response data
    const responseParsed: Record<string, any> = {
      status,
      message: message || null,
      submittedAt: now.toISOString(),
    };

    // Add hire details if provided
    if (status === "hired_there") {
      if (startDate) responseParsed.startDate = startDate;
      if (roleTitle) responseParsed.roleTitle = roleTitle;
    }

    // Update check-in record
    await prisma.candidateCheckIn.update({
      where: { id: checkIn.id },
      data: {
        respondedAt: now,
        responseType: "clicked_button",
        responseRaw: JSON.stringify({ status, message, startDate, roleTitle }),
        responseParsed,
        riskLevel,
        riskReason,
        flaggedForReview: riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.MEDIUM,
      },
    });

    // If hired_there, create circumvention flag and send admin alert
    if (status === "hired_there") {
      // Create circumvention flag
      const flag = await prisma.circumventionFlag.create({
        data: {
          introductionId: intro.id,
          detectionMethod: "check_in_response",
          evidence: JSON.stringify({
            checkInId: checkIn.id,
            checkInNumber: checkIn.checkInNumber,
            candidateResponse: status,
            startDate: startDate || "Not provided",
            roleTitle: roleTitle || "Not provided",
            message: message || null,
            reportedAt: now.toISOString(),
          }),
          status: FlagStatus.OPEN,
        },
      });

      // Update introduction status to HIRED
      await prisma.candidateIntroduction.update({
        where: { id: intro.id },
        data: {
          status: IntroductionStatus.HIRED,
        },
      });

      // Send admin alert
      const adminEmail = process.env.ADMIN_EMAIL || "admin@getskillproof.com";
      const adminDashboardUrl = `${EMAIL_CONFIG.appUrl}/admin/introductions/${intro.id}`;

      await sendEmail({
        to: adminEmail,
        subject: `🚨 ALERT: Candidate reports being hired at ${employerName}`,
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
                .button { display: inline-block; background: #DC2626; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
                .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🚨 Potential Fee Circumvention</h1>
                </div>
                <div class="content">
                  <p><strong>${intro.candidate.user.name}</strong> has reported being hired at <strong>${employerName}</strong> through a check-in email response.</p>

                  <div class="alert-card">
                    <h3 style="margin-top: 0; color: #DC2626;">Details</h3>
                    <p><strong>Candidate:</strong> ${intro.candidate.user.name}</p>
                    <p><strong>Employer:</strong> ${employerName}</p>
                    <p><strong>Position:</strong> ${intro.job?.title || "Not specified"}</p>
                    <p><strong>Introduction Date:</strong> ${intro.introducedAt?.toLocaleDateString() || "N/A"}</p>
                    ${startDate ? `<p><strong>Reported Start Date:</strong> ${startDate}</p>` : ""}
                    ${roleTitle ? `<p><strong>Reported Role:</strong> ${roleTitle}</p>` : ""}
                    ${message ? `<p><strong>Additional Message:</strong> "${message}"</p>` : ""}
                    <p><strong>Check-in #:</strong> ${checkIn.checkInNumber}</p>
                    <p><strong>Flag ID:</strong> ${flag.id}</p>
                  </div>

                  <p><strong>Immediate Actions Required:</strong></p>
                  <ol>
                    <li>Verify the hire with the employer</li>
                    <li>Calculate the applicable placement fee</li>
                    <li>Send invoice to employer</li>
                  </ol>

                  <div style="text-align: center;">
                    <a href="${adminDashboardUrl}" class="button">View in Admin Dashboard</a>
                  </div>

                  <p>This circumvention flag has been automatically created and is awaiting your review.</p>
                </div>
                <div class="footer">
                  <p>This is an automated alert from SkillProof.</p>
                </div>
              </div>
            </body>
          </html>
        `,
        text: `ALERT: ${intro.candidate.user.name} reports being hired at ${employerName}. This may be a fee circumvention case. View details: ${adminDashboardUrl}`,
      });

      console.log(
        `[Check-in Response] HIGH RISK: ${intro.candidate.user.name} reports being hired at ${employerName}. Flag created: ${flag.id}`
      );
    }

    // Log the response
    console.log(
      `[Check-in Response] Check-in ${checkIn.id} responded with status: ${status}, riskLevel: ${riskLevel}`
    );

    return NextResponse.json({
      success: true,
      message: "Thank you for your response!",
      status,
      riskLevel,
    });
  } catch (error) {
    console.error("[Check-in Response POST] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to submit response",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
