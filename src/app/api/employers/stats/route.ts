import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole, ApplicationStatus, JobStatus } from "@prisma/client";

/**
 * GET /api/employers/stats
 * Get comprehensive statistics for the employer
 * Requires EMPLOYER or ADMIN role
 *
 * Returns:
 * - Total jobs posted
 * - Active jobs count
 * - Total applications received
 * - Applications by status
 * - Total placements
 * - Recent activity metrics
 */
export async function GET() {
  try {
    // Require employer or admin role
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get employer profile
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    // Get all job IDs for this employer
    const jobs = await prisma.job.findMany({
      where: { employerId: employer.id },
      select: { id: true, status: true },
    });

    const jobIds = jobs.map(job => job.id);

    // Job statistics
    const jobStats = {
      total: jobs.length,
      active: jobs.filter(job => job.status === JobStatus.ACTIVE).length,
      draft: jobs.filter(job => job.status === JobStatus.DRAFT).length,
      closed: jobs.filter(job => job.status === JobStatus.CLOSED).length,
      expired: jobs.filter(job => job.status === JobStatus.EXPIRED).length,
    };

    // Application statistics
    const totalApplications = await prisma.application.count({
      where: { jobId: { in: jobIds } },
    });

    const applicationsByStatus = await prisma.application.groupBy({
      by: ["status"],
      where: { jobId: { in: jobIds } },
      _count: true,
    });

    const applicationStats = {
      total: totalApplications,
      pending: 0,
      reviewed: 0,
      shortlisted: 0,
      interviewScheduled: 0,
      interviewed: 0,
      offered: 0,
      accepted: 0,
      rejected: 0,
      withdrawn: 0,
    };

    // Map grouped results to stats object
    applicationsByStatus.forEach(group => {
      const statusKey = group.status.toLowerCase().replace(/_([a-z])/g, (_, letter) =>
        letter.toUpperCase()
      ) as keyof typeof applicationStats;
      if (statusKey in applicationStats) {
        applicationStats[statusKey] = group._count;
      }
    });

    // Calculate conversion rates
    const conversionRates = {
      applicationToReview: totalApplications > 0
        ? ((applicationStats.reviewed + applicationStats.shortlisted) / totalApplications) * 100
        : 0,
      reviewToInterview: (applicationStats.reviewed + applicationStats.shortlisted) > 0
        ? (applicationStats.interviewed / (applicationStats.reviewed + applicationStats.shortlisted)) * 100
        : 0,
      interviewToOffer: applicationStats.interviewed > 0
        ? (applicationStats.offered / applicationStats.interviewed) * 100
        : 0,
      offerToAcceptance: applicationStats.offered > 0
        ? (applicationStats.accepted / applicationStats.offered) * 100
        : 0,
    };

    // Get placements (accepted applications)
    const placements = await prisma.application.count({
      where: {
        jobId: { in: jobIds },
        status: ApplicationStatus.ACCEPTED,
      },
    });

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentApplications = await prisma.application.count({
      where: {
        jobId: { in: jobIds },
        appliedAt: { gte: thirtyDaysAgo },
      },
    });

    const recentJobs = await prisma.job.count({
      where: {
        employerId: employer.id,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // Top performing jobs (by application count)
    const topJobs = await prisma.job.findMany({
      where: { employerId: employer.id },
      include: {
        _count: {
          select: {
            applications: true,
          },
        },
      },
      orderBy: {
        applications: {
          _count: "desc",
        },
      },
      take: 5,
    });

    // Jobs with no applications (may need attention)
    const jobsWithoutApplications = await prisma.job.count({
      where: {
        employerId: employer.id,
        status: JobStatus.ACTIVE,
        applications: {
          none: {},
        },
      },
    });

    // Average time to first application
    const jobsWithApplications = await prisma.job.findMany({
      where: {
        employerId: employer.id,
        applications: {
          some: {},
        },
      },
      include: {
        applications: {
          orderBy: {
            appliedAt: "asc",
          },
          take: 1,
        },
      },
    });

    let totalTimeToFirstApp = 0;
    let jobsCountedForAvg = 0;

    jobsWithApplications.forEach(job => {
      if (job.applications.length > 0) {
        const timeDiff = job.applications[0].appliedAt.getTime() - job.createdAt.getTime();
        totalTimeToFirstApp += timeDiff;
        jobsCountedForAvg++;
      }
    });

    const avgTimeToFirstApplication = jobsCountedForAvg > 0
      ? Math.round(totalTimeToFirstApp / jobsCountedForAvg / (1000 * 60 * 60 * 24)) // Convert to days
      : 0;

    // Compile all statistics
    const stats = {
      jobs: jobStats,
      applications: applicationStats,
      conversionRates: {
        applicationToReview: Math.round(conversionRates.applicationToReview * 10) / 10,
        reviewToInterview: Math.round(conversionRates.reviewToInterview * 10) / 10,
        interviewToOffer: Math.round(conversionRates.interviewToOffer * 10) / 10,
        offerToAcceptance: Math.round(conversionRates.offerToAcceptance * 10) / 10,
      },
      placements,
      recentActivity: {
        last30Days: {
          applications: recentApplications,
          jobsPosted: recentJobs,
        },
      },
      insights: {
        topPerformingJobs: topJobs.map(job => ({
          id: job.id,
          title: job.title,
          applicationCount: job._count.applications,
          status: job.status,
          createdAt: job.createdAt,
        })),
        jobsWithoutApplications,
        avgTimeToFirstApplication: avgTimeToFirstApplication > 0
          ? `${avgTimeToFirstApplication} days`
          : "N/A",
      },
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Employer stats fetch error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions. Employer role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}
