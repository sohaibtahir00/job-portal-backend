import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/admin/analytics - Get admin analytics data
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get counts
    const [
      totalCandidates,
      totalEmployers,
      activeJobs,
      assessmentsTaken,
      successfulHires,
    ] = await Promise.all([
      prisma.candidate.count({ where: { user: { isActive: true } } }),
      prisma.employer.count({ where: { user: { isActive: true } } }),
      prisma.job.count({ where: { status: "ACTIVE" } }),
      prisma.skillsAssessment.count(),
      prisma.placement.count({ where: { status: "COMPLETED" } }),
    ]);

    // Get previous month counts for comparison
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const [prevCandidates, prevEmployers, prevJobs, prevAssessments, prevHires] =
      await Promise.all([
        prisma.candidate.count({
          where: {
            user: {
              isActive: true,
              createdAt: { lt: lastMonth },
            },
          },
        }),
        prisma.employer.count({
          where: {
            user: {
              isActive: true,
              createdAt: { lt: lastMonth },
            },
          },
        }),
        prisma.job.count({
          where: {
            status: "ACTIVE",
            createdAt: { lt: lastMonth },
          },
        }),
        prisma.skillsAssessment.count({
          where: { completedAt: { lt: lastMonth } },
        }),
        prisma.placement.count({
          where: {
            status: "COMPLETED",
            createdAt: { lt: lastMonth },
          },
        }),
      ]);

    // Calculate percentage changes
    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return 100;
      return ((current - previous) / previous) * 100;
    };

    // Get revenue
    const placements = await prisma.placement.findMany({
      where: { status: "COMPLETED" },
      select: { placementFee: true },
    });
    const totalRevenue = placements.reduce((sum, p) => sum + (p.placementFee || 0), 0);

    // Recent activity
    const recentCandidates = await prisma.candidate.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true, createdAt: true } } },
    });

    const recentJobs = await prisma.job.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        employer: {
          select: {
            companyName: true,
          },
        },
      },
    });

    const recentAssessments = await prisma.skillsAssessment.findMany({
      take: 5,
      orderBy: { completedAt: "desc" },
      include: {
        candidate: {
          include: {
            user: { select: { name: true } },
          },
        },
      },
    });

    // Top performers
    const topPerformers = await prisma.skillsAssessment.findMany({
      take: 5,
      orderBy: { score: "desc" },
      include: {
        candidate: {
          include: {
            user: { select: { name: true } },
          },
        },
      },
    });

    // Top employers by hires
    const topEmployers = await prisma.employer.findMany({
      take: 5,
      include: {
        _count: {
          select: { placements: true },
        },
        placements: {
          where: { status: "COMPLETED" },
          select: { placementFee: true },
        },
      },
      orderBy: {
        placements: {
          _count: "desc",
        },
      },
    });

    return NextResponse.json({
      overview: {
        totalCandidates,
        candidatesChange: calculateChange(totalCandidates, prevCandidates),
        totalEmployers,
        employersChange: calculateChange(totalEmployers, prevEmployers),
        activeJobs,
        jobsChange: calculateChange(activeJobs, prevJobs),
        assessmentsTaken,
        assessmentsChange: calculateChange(assessmentsTaken, prevAssessments),
        totalRevenue,
        revenueChange: 22.4, // Mock for now
        successfulHires,
        hiresChange: calculateChange(successfulHires, prevHires),
      },
      recentActivity: [
        ...recentCandidates.map((c) => ({
          id: c.id,
          type: "candidate",
          action: "New candidate registered",
          name: c.user.name,
          timestamp: c.user.createdAt,
        })),
        ...recentJobs.map((j) => ({
          id: j.id,
          type: "job",
          action: "New job posted",
          name: `${j.title} at ${j.employer.companyName}`,
          timestamp: j.createdAt,
        })),
        ...recentAssessments.map((a) => ({
          id: a.id,
          type: "assessment",
          action: "Skills assessment completed",
          name: `${a.candidate.user.name} - Score: ${a.score}`,
          timestamp: a.completedAt,
        })),
      ]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, 10),
      topPerformers: topPerformers.map((p) => ({
        name: p.candidate.user.name,
        score: p.score,
        tier: p.tier,
      })),
      topEmployers: topEmployers.map((e) => ({
        name: e.companyName,
        hires: e._count.placements,
        revenue: `$${(
          e.placements.reduce((sum, p) => sum + (p.placementFee || 0), 0) / 1000
        ).toFixed(1)}k`,
      })),
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
