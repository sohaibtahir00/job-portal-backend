import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { RiskLevel } from "@prisma/client";

/**
 * GET /api/admin/check-ins
 * Get all check-ins with filtering options
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const riskLevel = searchParams.get("riskLevel") as RiskLevel | null;
    const flaggedOnly = searchParams.get("flaggedOnly") === "true";
    const responded = searchParams.get("responded"); // 'true', 'false', or null for all
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Build where clause
    const whereClause: Record<string, unknown> = {};

    if (riskLevel) {
      whereClause.riskLevel = riskLevel;
    }

    if (flaggedOnly) {
      whereClause.flaggedForReview = true;
    }

    if (responded === "true") {
      whereClause.respondedAt = { not: null };
    } else if (responded === "false") {
      whereClause.respondedAt = null;
    }

    // Get check-ins with pagination
    const [checkIns, total] = await Promise.all([
      prisma.candidateCheckIn.findMany({
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
        orderBy: [
          { flaggedForReview: "desc" },
          { riskLevel: "desc" },
          { scheduledFor: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.candidateCheckIn.count({ where: whereClause }),
    ]);

    // Get stats
    const [totalCheckIns, flaggedCount, highRiskCount, respondedCount] =
      await Promise.all([
        prisma.candidateCheckIn.count(),
        prisma.candidateCheckIn.count({ where: { flaggedForReview: true } }),
        prisma.candidateCheckIn.count({ where: { riskLevel: RiskLevel.HIGH } }),
        prisma.candidateCheckIn.count({
          where: { respondedAt: { not: null } },
        }),
      ]);

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
        reviewedAt: ci.reviewedAt,
        reviewedBy: ci.reviewedBy,
        reviewNotes: ci.reviewNotes,
        candidateName: ci.introduction.candidate.user.name,
        candidateEmail: ci.introduction.candidate.user.email,
        employerCompanyName: ci.introduction.employer.companyName,
        jobTitle: ci.introduction.job?.title,
        introductionId: ci.introduction.id,
        createdAt: ci.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: totalCheckIns,
        flagged: flaggedCount,
        highRisk: highRiskCount,
        responded: respondedCount,
        responseRate:
          totalCheckIns > 0
            ? Math.round((respondedCount / totalCheckIns) * 100)
            : 0,
      },
    });
  } catch (error) {
    console.error("[Admin Check-ins] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch check-ins" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/check-ins
 * Update a check-in (mark as reviewed, add notes, etc.)
 */
export async function PATCH(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json();
    const { checkInId, reviewNotes, markReviewed, flaggedForReview, riskLevel } =
      body;

    if (!checkInId) {
      return NextResponse.json(
        { error: "checkInId is required" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (reviewNotes !== undefined) {
      updateData.reviewNotes = reviewNotes;
    }

    if (markReviewed) {
      updateData.reviewedAt = new Date();
      updateData.reviewedBy = authResult.id;
    }

    if (flaggedForReview !== undefined) {
      updateData.flaggedForReview = flaggedForReview;
    }

    if (riskLevel !== undefined) {
      updateData.riskLevel = riskLevel;
    }

    const checkIn = await prisma.candidateCheckIn.update({
      where: { id: checkInId },
      data: updateData,
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
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      checkIn: {
        id: checkIn.id,
        riskLevel: checkIn.riskLevel,
        flaggedForReview: checkIn.flaggedForReview,
        reviewedAt: checkIn.reviewedAt,
        reviewNotes: checkIn.reviewNotes,
        candidateName: checkIn.introduction.candidate.user.name,
        employerCompanyName: checkIn.introduction.employer.companyName,
      },
    });
  } catch (error) {
    console.error("[Admin Check-ins PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update check-in" },
      { status: 500 }
    );
  }
}
