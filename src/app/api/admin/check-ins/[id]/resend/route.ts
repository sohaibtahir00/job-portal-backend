import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { sendCheckInEmail } from "@/lib/email";
import { generateIntroductionToken, generateTokenExpiry } from "@/lib/tokens";
import { IntroductionStatus } from "@prisma/client";

/**
 * POST /api/admin/check-ins/[id]/resend
 * Resend a check-in email
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { id } = await params;

    // Get check-in with related data
    const checkIn = await prisma.candidateCheckIn.findUnique({
      where: { id },
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
    });

    if (!checkIn) {
      return NextResponse.json({ error: "Check-in not found" }, { status: 404 });
    }

    // Check if already responded
    if (checkIn.respondedAt) {
      return NextResponse.json(
        { error: "Check-in has already been responded to" },
        { status: 400 }
      );
    }

    // Check introduction status
    if (checkIn.introduction.status !== IntroductionStatus.INTRODUCED) {
      return NextResponse.json(
        {
          error: `Cannot resend check-in - introduction status is ${checkIn.introduction.status}`,
        },
        { status: 400 }
      );
    }

    // Generate new token
    const responseToken = generateIntroductionToken();
    const responseTokenExpiry = generateTokenExpiry(14); // 14 days

    // Send the email
    const emailResult = await sendCheckInEmail({
      candidateEmail: checkIn.introduction.candidate.user.email,
      candidateName: checkIn.introduction.candidate.user.name,
      employerCompanyName: checkIn.introduction.employer.companyName,
      jobTitle: checkIn.introduction.job?.title || "the position",
      checkInNumber: checkIn.checkInNumber,
      responseToken,
      introductionDate: checkIn.introduction.introducedAt || checkIn.introduction.createdAt,
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: `Failed to send email: ${emailResult.error}` },
        { status: 500 }
      );
    }

    // Update check-in with new token and sent timestamp
    await prisma.candidateCheckIn.update({
      where: { id },
      data: {
        sentAt: new Date(),
        responseToken,
        responseTokenExpiry,
      },
    });

    console.log(
      `[Admin Check-in Resend] Resent check-in #${checkIn.checkInNumber} for ${checkIn.introduction.candidate.user.name} to ${checkIn.introduction.employer.companyName}`
    );

    return NextResponse.json({
      success: true,
      message: "Check-in email resent successfully",
      checkIn: {
        id: checkIn.id,
        checkInNumber: checkIn.checkInNumber,
        sentTo: checkIn.introduction.candidate.user.email,
        sentAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[Admin Check-in Resend] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to resend check-in email",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
