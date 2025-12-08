import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ApplicationStatus } from "@prisma/client";

/**
 * GET /api/admin/analytics/pipeline
 * Get application pipeline/funnel analytics for admin dashboard
 *
 * Returns conversion rates and counts for each stage:
 * Applied -> Reviewed -> Shortlisted -> Interview -> Offered -> Accepted
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get date range from query params
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all applications within date range
    const applications = await prisma.application.findMany({
      where: {
        appliedAt: { gte: startDate },
      },
      select: {
        id: true,
        status: true,
        appliedAt: true,
        reviewedAt: true,
      },
    });

    // Count by status
    const statusCounts = {
      applied: applications.length,
      reviewed: applications.filter(a =>
        a.status !== ApplicationStatus.PENDING
      ).length,
      shortlisted: applications.filter(a =>
        [ApplicationStatus.SHORTLISTED, ApplicationStatus.INTERVIEW_SCHEDULED,
         ApplicationStatus.INTERVIEWED, ApplicationStatus.OFFERED,
         ApplicationStatus.ACCEPTED].includes(a.status)
      ).length,
      interviewScheduled: applications.filter(a =>
        [ApplicationStatus.INTERVIEW_SCHEDULED, ApplicationStatus.INTERVIEWED,
         ApplicationStatus.OFFERED, ApplicationStatus.ACCEPTED].includes(a.status)
      ).length,
      interviewed: applications.filter(a =>
        [ApplicationStatus.INTERVIEWED, ApplicationStatus.OFFERED,
         ApplicationStatus.ACCEPTED].includes(a.status)
      ).length,
      offered: applications.filter(a =>
        [ApplicationStatus.OFFERED, ApplicationStatus.ACCEPTED].includes(a.status)
      ).length,
      accepted: applications.filter(a =>
        a.status === ApplicationStatus.ACCEPTED
      ).length,
      rejected: applications.filter(a =>
        a.status === ApplicationStatus.REJECTED
      ).length,
      withdrawn: applications.filter(a =>
        a.status === ApplicationStatus.WITHDRAWN
      ).length,
    };

    // Calculate conversion rates
    const conversionRates = {
      reviewRate: statusCounts.applied > 0
        ? ((statusCounts.reviewed / statusCounts.applied) * 100).toFixed(1)
        : "0.0",
      shortlistRate: statusCounts.reviewed > 0
        ? ((statusCounts.shortlisted / statusCounts.reviewed) * 100).toFixed(1)
        : "0.0",
      interviewRate: statusCounts.shortlisted > 0
        ? ((statusCounts.interviewScheduled / statusCounts.shortlisted) * 100).toFixed(1)
        : "0.0",
      offerRate: statusCounts.interviewed > 0
        ? ((statusCounts.offered / statusCounts.interviewed) * 100).toFixed(1)
        : "0.0",
      acceptRate: statusCounts.offered > 0
        ? ((statusCounts.accepted / statusCounts.offered) * 100).toFixed(1)
        : "0.0",
      overallConversion: statusCounts.applied > 0
        ? ((statusCounts.accepted / statusCounts.applied) * 100).toFixed(2)
        : "0.00",
    };

    // Get pipeline data for visualization (funnel chart)
    const pipeline = [
      { stage: "Applied", count: statusCounts.applied, color: "#3B82F6" },
      { stage: "Reviewed", count: statusCounts.reviewed, color: "#8B5CF6" },
      { stage: "Shortlisted", count: statusCounts.shortlisted, color: "#EC4899" },
      { stage: "Interview", count: statusCounts.interviewScheduled, color: "#F59E0B" },
      { stage: "Interviewed", count: statusCounts.interviewed, color: "#10B981" },
      { stage: "Offered", count: statusCounts.offered, color: "#06B6D4" },
      { stage: "Accepted", count: statusCounts.accepted, color: "#22C55E" },
    ];

    // Get daily application trend
    const dailyTrend = await prisma.application.groupBy({
      by: ["appliedAt"],
      where: {
        appliedAt: { gte: startDate },
      },
      _count: true,
    });

    // Group by date
    const trendByDate: Record<string, number> = {};
    dailyTrend.forEach(item => {
      const date = item.appliedAt.toISOString().split("T")[0];
      trendByDate[date] = (trendByDate[date] || 0) + item._count;
    });

    return NextResponse.json({
      success: true,
      dateRange: {
        start: startDate.toISOString(),
        end: new Date().toISOString(),
        days,
      },
      statusCounts,
      conversionRates,
      pipeline,
      trend: Object.entries(trendByDate).map(([date, count]) => ({ date, count })),
    });
  } catch (error) {
    console.error("Pipeline analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline analytics" },
      { status: 500 }
    );
  }
}
