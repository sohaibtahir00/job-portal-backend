import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// GET /api/admin/analytics/charts - Get chart data for admin dashboard
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get date range from query params (default: last 6 months)
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "6months";

    // Calculate date range
    const now = new Date();
    let startDate = new Date();

    switch (range) {
      case "7days":
        startDate.setDate(now.getDate() - 7);
        break;
      case "30days":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "90days":
        startDate.setMonth(now.getMonth() - 3);
        break;
      case "year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default: // 6months
        startDate.setMonth(now.getMonth() - 6);
    }

    // Get monthly placements and revenue
    const placements = await prisma.placement.findMany({
      where: {
        createdAt: { gte: startDate },
        status: "COMPLETED",
      },
      select: {
        createdAt: true,
        placementFee: true,
      },
    });

    // Group by month
    const monthlyData: Record<string, { placements: number; revenue: number }> = {};
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
      monthlyData[key] = { placements: 0, revenue: 0 };
    }

    placements.forEach((p) => {
      const date = new Date(p.createdAt);
      const key = `${months[date.getMonth()]} ${date.getFullYear()}`;
      if (monthlyData[key]) {
        monthlyData[key].placements += 1;
        monthlyData[key].revenue += p.placementFee || 0;
      }
    });

    const monthlyPlacements = Object.entries(monthlyData).map(([month, data]) => ({
      month: month.split(" ")[0], // Just month name
      placements: data.placements,
      revenue: data.revenue,
    }));

    // Get candidates by niche (based on skills/categories)
    const candidates = await prisma.candidate.findMany({
      where: {
        user: { isActive: true },
      },
      select: {
        skills: true,
      },
    });

    // Categorize by niche based on skills
    const nicheKeywords = {
      "AI/ML": ["machine learning", "ai", "artificial intelligence", "deep learning", "tensorflow", "pytorch", "nlp", "computer vision", "ml"],
      "Healthcare IT": ["healthcare", "medical", "health", "clinical", "ehr", "hipaa", "telemedicine"],
      "Fintech": ["fintech", "finance", "banking", "payment", "blockchain", "crypto", "trading"],
      "Cybersecurity": ["security", "cybersecurity", "penetration", "firewall", "encryption", "infosec", "soc"],
    };

    const candidatesByNiche: Record<string, number> = {
      "AI/ML": 0,
      "Healthcare IT": 0,
      "Fintech": 0,
      "Cybersecurity": 0,
      "Other": 0,
    };

    candidates.forEach((c) => {
      const skills = (c.skills || []).map((s: string) => s.toLowerCase());
      let matched = false;

      for (const [niche, keywords] of Object.entries(nicheKeywords)) {
        if (keywords.some((kw) => skills.some((s) => s.includes(kw)))) {
          candidatesByNiche[niche]++;
          matched = true;
          break;
        }
      }

      if (!matched) {
        candidatesByNiche["Other"]++;
      }
    });

    // Get application status distribution
    const applicationStatuses = await prisma.application.groupBy({
      by: ["status"],
      _count: true,
      where: {
        createdAt: { gte: startDate },
      },
    });

    const statusMapping: Record<string, string> = {
      PENDING: "Applied",
      SHORTLISTED: "Shortlisted",
      INTERVIEW_SCHEDULED: "Interviewing",
      INTERVIEWED: "Interviewing",
      OFFERED: "Offered",
      ACCEPTED: "Hired",
      REJECTED: "Rejected",
      WITHDRAWN: "Withdrawn",
    };

    const applicationStatusData: Record<string, number> = {
      Applied: 0,
      Shortlisted: 0,
      Interviewing: 0,
      Offered: 0,
      Hired: 0,
      Rejected: 0,
    };

    applicationStatuses.forEach((s) => {
      const mapped = statusMapping[s.status] || "Applied";
      if (applicationStatusData[mapped] !== undefined) {
        applicationStatusData[mapped] += s._count;
      }
    });

    // Get weekly signups
    const weeklySignups: { week: string; candidates: number; employers: number }[] = [];

    // Get signups for last 8 weeks
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const [candidateCount, employerCount] = await Promise.all([
        prisma.candidate.count({
          where: {
            user: {
              createdAt: {
                gte: weekStart,
                lt: weekEnd,
              },
            },
          },
        }),
        prisma.employer.count({
          where: {
            user: {
              createdAt: {
                gte: weekStart,
                lt: weekEnd,
              },
            },
          },
        }),
      ]);

      weeklySignups.push({
        week: `Week ${8 - i}`,
        candidates: candidateCount,
        employers: employerCount,
      });
    }

    return NextResponse.json({
      monthlyPlacements,
      candidatesByNiche: Object.entries(candidatesByNiche)
        .filter(([_, count]) => count > 0)
        .map(([niche, count]) => ({ niche, count })),
      applicationStatus: Object.entries(applicationStatusData)
        .filter(([_, count]) => count > 0)
        .map(([status, count]) => ({ status, count })),
      weeklySignups,
    });
  } catch (error) {
    console.error("Admin chart analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chart data" },
      { status: 500 }
    );
  }
}
