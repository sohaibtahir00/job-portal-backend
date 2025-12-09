import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { IntroductionStatus } from "@prisma/client";

/**
 * GET /api/admin/introductions/expired
 * Get recently expired introductions for audit/review
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const sinceDays = parseInt(searchParams.get("sinceDays") || "30");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const now = new Date();
    const sinceDate = new Date(now);
    sinceDate.setDate(sinceDate.getDate() - sinceDays);

    const skip = (page - 1) * limit;

    const [introductions, total] = await Promise.all([
      prisma.candidateIntroduction.findMany({
        where: {
          status: IntroductionStatus.EXPIRED,
          protectionEndsAt: {
            gte: sinceDate,
            lt: now,
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
            select: {
              checkInNumber: true,
              sentAt: true,
              respondedAt: true,
              responseType: true,
              responseRaw: true,
            },
          },
        },
        orderBy: { protectionEndsAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.candidateIntroduction.count({
        where: {
          status: IntroductionStatus.EXPIRED,
          protectionEndsAt: {
            gte: sinceDate,
            lt: now,
          },
        },
      }),
    ]);

    // Calculate days since expiry for each introduction
    const formattedIntroductions = introductions.map((intro) => {
      const daysSinceExpiry = Math.ceil(
        (now.getTime() - intro.protectionEndsAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Count check-in responses
      const totalCheckIns = intro.checkIns.length;
      const respondedCheckIns = intro.checkIns.filter((c) => c.respondedAt).length;

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
        daysSinceExpiry,
        status: intro.status,
        checkInStats: {
          total: totalCheckIns,
          responded: respondedCheckIns,
        },
        lastCheckIn: intro.checkIns[0] || null,
      };
    });

    // Get counts by time period for expired
    const [last30Days, last60Days, last90Days] = await Promise.all([
      prisma.candidateIntroduction.count({
        where: {
          status: IntroductionStatus.EXPIRED,
          protectionEndsAt: {
            gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
            lt: now,
          },
        },
      }),
      prisma.candidateIntroduction.count({
        where: {
          status: IntroductionStatus.EXPIRED,
          protectionEndsAt: {
            gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
            lt: now,
          },
        },
      }),
      prisma.candidateIntroduction.count({
        where: {
          status: IntroductionStatus.EXPIRED,
          protectionEndsAt: {
            gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
            lt: now,
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
        last30Days,
        last60Days,
        last90Days,
      },
    });
  } catch (error) {
    console.error("[Admin Expired Introductions] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch expired introductions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
