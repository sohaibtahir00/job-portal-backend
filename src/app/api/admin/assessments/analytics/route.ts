import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/assessments/analytics
 * Get assessment analytics and statistics
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    // Get overall statistics
    const [totalAssessments, avgScoreResult, tierCounts] = await Promise.all([
      prisma.skillsAssessment.count(),
      prisma.skillsAssessment.aggregate({
        _avg: { score: true, duration: true },
      }),
      prisma.skillsAssessment.groupBy({
        by: ["tier"],
        _count: { tier: true },
      }),
    ]);

    // Format tier counts
    const tierDistribution: Record<string, number> = {
      Elite: 0,
      Advanced: 0,
      Proficient: 0,
      Intermediate: 0,
      Beginner: 0,
    };
    tierCounts.forEach((t) => {
      if (t.tier && tierDistribution.hasOwnProperty(t.tier)) {
        tierDistribution[t.tier] = t._count.tier;
      }
    });

    // Get monthly assessment counts for the year
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);

    const yearlyAssessments = await prisma.skillsAssessment.findMany({
      where: {
        completedAt: {
          gte: startOfYear,
          lte: endOfYear,
        },
      },
      select: {
        completedAt: true,
        score: true,
        tier: true,
      },
    });

    // Group by month
    const monthlyData: Record<string, { count: number; totalScore: number; scores: number[] }> = {};
    for (let m = 0; m < 12; m++) {
      const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
      monthlyData[monthKey] = { count: 0, totalScore: 0, scores: [] };
    }

    yearlyAssessments.forEach((a) => {
      const date = new Date(a.completedAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].count++;
        monthlyData[monthKey].totalScore += a.score;
        monthlyData[monthKey].scores.push(a.score);
      }
    });

    const monthlyBreakdown = Object.entries(monthlyData).map(([key, data]) => {
      const [y, m] = key.split("-");
      const monthName = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString("default", { month: "short" });
      return {
        month: monthName,
        year: parseInt(y),
        assessments: data.count,
        averageScore: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
      };
    });

    // Get score distribution (buckets of 10)
    const scoreDistribution = [
      { range: "0-10", count: 0 },
      { range: "11-20", count: 0 },
      { range: "21-30", count: 0 },
      { range: "31-40", count: 0 },
      { range: "41-50", count: 0 },
      { range: "51-60", count: 0 },
      { range: "61-70", count: 0 },
      { range: "71-80", count: 0 },
      { range: "81-90", count: 0 },
      { range: "91-100", count: 0 },
    ];

    const allScores = await prisma.skillsAssessment.findMany({
      select: { score: true },
    });

    allScores.forEach((a) => {
      const bucket = Math.min(Math.floor(a.score / 10), 9);
      scoreDistribution[bucket].count++;
    });

    // Get top performers
    const topPerformers = await prisma.skillsAssessment.findMany({
      where: { tier: "Elite" },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
      orderBy: { score: "desc" },
      take: 10,
    });

    // Get recent assessments
    const recentAssessments = await prisma.skillsAssessment.findMany({
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
      orderBy: { completedAt: "desc" },
      take: 10,
    });

    // Calculate completion rate (candidates who took test vs total candidates)
    const [totalCandidates, testedCandidates] = await Promise.all([
      prisma.candidate.count(),
      prisma.candidate.count({ where: { hasTakenTest: true } }),
    ]);

    const completionRate = totalCandidates > 0
      ? ((testedCandidates / totalCandidates) * 100).toFixed(1)
      : "0.0";

    return NextResponse.json({
      success: true,
      analytics: {
        summary: {
          totalAssessments,
          averageScore: Math.round(avgScoreResult._avg.score || 0),
          averageDuration: Math.round(avgScoreResult._avg.duration || 0),
          averageDurationFormatted: formatDuration(Math.round(avgScoreResult._avg.duration || 0)),
          completionRate: `${completionRate}%`,
          testedCandidates,
          totalCandidates,
        },
        tierDistribution,
        monthlyBreakdown,
        scoreDistribution,
        topPerformers: topPerformers.map((a) => ({
          id: a.id,
          score: a.score,
          tier: a.tier,
          completedAt: a.completedAt,
          candidate: {
            name: a.candidate.user.name,
            email: a.candidate.user.email,
            image: a.candidate.user.image,
          },
        })),
        recentAssessments: recentAssessments.map((a) => ({
          id: a.id,
          score: a.score,
          tier: a.tier,
          completedAt: a.completedAt,
          candidate: {
            name: a.candidate.user.name,
            email: a.candidate.user.email,
          },
        })),
      },
    });
  } catch (error) {
    console.error("Get assessment analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch assessment analytics" },
      { status: 500 }
    );
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
