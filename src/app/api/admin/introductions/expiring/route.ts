import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { IntroductionStatus } from "@prisma/client";

/**
 * GET /api/admin/introductions/expiring
 * Get introductions with protection periods expiring soon
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const withinDays = parseInt(searchParams.get("withinDays") || "7");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + withinDays);

    const skip = (page - 1) * limit;

    const [introductions, total] = await Promise.all([
      prisma.candidateIntroduction.findMany({
        where: {
          status: IntroductionStatus.INTRODUCED,
          protectionEndsAt: {
            gte: now,
            lte: targetDate,
          },
        },
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
              contactName: true,
            },
          },
          job: {
            select: {
              id: true,
              title: true,
            },
          },
          checkIns: {
            orderBy: { checkInNumber: "desc" },
            take: 1,
            select: {
              checkInNumber: true,
              sentAt: true,
              respondedAt: true,
              responseType: true,
              responseRaw: true,
            },
          },
        },
        orderBy: { protectionEndsAt: "asc" },
        skip,
        take: limit,
      }),
      prisma.candidateIntroduction.count({
        where: {
          status: IntroductionStatus.INTRODUCED,
          protectionEndsAt: {
            gte: now,
            lte: targetDate,
          },
        },
      }),
    ]);

    // Calculate days until expiry for each introduction
    const formattedIntroductions = introductions.map((intro) => {
      const daysUntilExpiry = Math.ceil(
        (intro.protectionEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        id: intro.id,
        candidateId: intro.candidateId,
        candidateName: intro.candidate.user.name,
        candidateEmail: intro.candidate.user.email,
        employerId: intro.employerId,
        employerCompanyName: intro.employer.companyName,
        employerContactName: intro.employer.contactName,
        jobId: intro.jobId,
        jobTitle: intro.job?.title || null,
        introducedAt: intro.introducedAt,
        protectionEndsAt: intro.protectionEndsAt,
        daysUntilExpiry,
        status: intro.status,
        lastCheckIn: intro.checkIns[0] || null,
      };
    });

    // Get counts by time period
    const [in7Days, in30Days, in90Days] = await Promise.all([
      prisma.candidateIntroduction.count({
        where: {
          status: IntroductionStatus.INTRODUCED,
          protectionEndsAt: {
            gte: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.candidateIntroduction.count({
        where: {
          status: IntroductionStatus.INTRODUCED,
          protectionEndsAt: {
            gte: now,
            lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.candidateIntroduction.count({
        where: {
          status: IntroductionStatus.INTRODUCED,
          protectionEndsAt: {
            gte: now,
            lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return NextResponse.json({
      introductions: formattedIntroductions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      counts: {
        in7Days,
        in30Days,
        in90Days,
      },
    });
  } catch (error) {
    console.error("[Admin Expiring Introductions] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch expiring introductions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
