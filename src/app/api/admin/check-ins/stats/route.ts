import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { RiskLevel } from "@prisma/client";

/**
 * GET /api/admin/check-ins/stats
 * Get statistics for check-ins dashboard
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Get date ranges
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get counts
    const [
      totalSent,
      totalResponded,
      totalPending,
      totalNoReply,
      totalFlagged,
      sentLast30Days,
      respondedLast30Days,
      highRiskCount,
      mediumRiskCount,
      pendingOlderThan7Days,
    ] = await Promise.all([
      // Total sent (has sentAt)
      prisma.candidateCheckIn.count({
        where: { sentAt: { not: null } },
      }),
      // Total responded
      prisma.candidateCheckIn.count({
        where: { respondedAt: { not: null } },
      }),
      // Total pending (sent but no response)
      prisma.candidateCheckIn.count({
        where: {
          sentAt: { not: null },
          respondedAt: null,
        },
      }),
      // No reply older than 14 days
      prisma.candidateCheckIn.count({
        where: {
          sentAt: { lte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) },
          respondedAt: null,
        },
      }),
      // Flagged for review
      prisma.candidateCheckIn.count({
        where: { flaggedForReview: true },
      }),
      // Sent in last 30 days
      prisma.candidateCheckIn.count({
        where: {
          sentAt: { gte: thirtyDaysAgo },
        },
      }),
      // Responded in last 30 days
      prisma.candidateCheckIn.count({
        where: {
          respondedAt: { gte: thirtyDaysAgo },
        },
      }),
      // High risk
      prisma.candidateCheckIn.count({
        where: { riskLevel: RiskLevel.HIGH },
      }),
      // Medium risk
      prisma.candidateCheckIn.count({
        where: { riskLevel: RiskLevel.MEDIUM },
      }),
      // Pending older than 7 days (needs follow-up)
      prisma.candidateCheckIn.count({
        where: {
          sentAt: { lte: sevenDaysAgo },
          respondedAt: null,
        },
      }),
    ]);

    // Response by check-in number
    const responseByCheckInNumber = await prisma.candidateCheckIn.groupBy({
      by: ["checkInNumber"],
      where: { sentAt: { not: null } },
      _count: { id: true },
    });

    const respondedByCheckInNumber = await prisma.candidateCheckIn.groupBy({
      by: ["checkInNumber"],
      where: { respondedAt: { not: null } },
      _count: { id: true },
    });

    // Build response rate by check-in number
    const checkInNumberLabels: Record<number, string> = {
      1: "30-day",
      2: "60-day",
      3: "90-day",
      4: "180-day",
      5: "365-day",
    };

    const byCheckInNumber = [1, 2, 3, 4, 5].map((num) => {
      const sent = responseByCheckInNumber.find((r) => r.checkInNumber === num)?._count.id || 0;
      const responded = respondedByCheckInNumber.find((r) => r.checkInNumber === num)?._count.id || 0;
      return {
        checkInNumber: num,
        label: checkInNumberLabels[num],
        sent,
        responded,
        responseRate: sent > 0 ? Math.round((responded / sent) * 100) : 0,
      };
    });

    // Upcoming check-ins (scheduled in next 7 days)
    const upcomingCheckIns = await prisma.candidateCheckIn.count({
      where: {
        scheduledFor: {
          gte: now,
          lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        sentAt: null,
      },
    });

    // Response rate
    const overallResponseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;
    const last30DaysResponseRate = sentLast30Days > 0 ? Math.round((respondedLast30Days / sentLast30Days) * 100) : 0;

    return NextResponse.json({
      success: true,
      stats: {
        overview: {
          sent: totalSent,
          responded: totalResponded,
          pending: totalPending,
          noReply: totalNoReply,
          flagged: totalFlagged,
        },
        last30Days: {
          sent: sentLast30Days,
          responded: respondedLast30Days,
          responseRate: last30DaysResponseRate,
        },
        risk: {
          high: highRiskCount,
          medium: mediumRiskCount,
        },
        needsAttention: {
          pendingOlderThan7Days,
          flaggedForReview: totalFlagged,
          upcoming: upcomingCheckIns,
        },
        byCheckInNumber,
        responseRate: {
          overall: overallResponseRate,
          last30Days: last30DaysResponseRate,
        },
      },
    });
  } catch (error) {
    console.error("[Admin Check-ins Stats] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch check-in stats" },
      { status: 500 }
    );
  }
}
