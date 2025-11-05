import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole, JobStatus, ApplicationStatus, PlacementStatus, PaymentStatus } from "@prisma/client";
import { formatCurrency } from "@/lib/stripe";

/**
 * GET /api/dashboard/admin
 * Get admin dashboard statistics and data
 *
 * Returns:
 * - Total users (by role)
 * - Total jobs (by status)
 * - Total applications (by status)
 * - Total placements (by status)
 * - Revenue statistics
 * - Platform growth metrics
 * - Recent activity
 * - System health indicators
 *
 * Requires: ADMIN role
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin role
    await requireRole(UserRole.ADMIN);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get all users
    const users = await prisma.user.findMany({
      include: {
        candidate: true,
        employer: true,
      },
    });

    // User statistics
    const userStats = {
      total: users.length,
      admins: users.filter((u) => u.role === UserRole.ADMIN).length,
      employers: users.filter((u) => u.role === UserRole.EMPLOYER).length,
      candidates: users.filter((u) => u.role === UserRole.CANDIDATE).length,
      active: users.filter((u) => u.status === "ACTIVE").length,
      inactive: users.filter((u) => u.status === "INACTIVE").length,
      suspended: users.filter((u) => u.status === "SUSPENDED").length,
      verified: users.filter((u) => u.emailVerified).length,
      unverified: users.filter((u) => !u.emailVerified).length,
    };

    // Get all jobs
    const jobs = await prisma.job.findMany({
      include: {
        employer: {
          select: {
            companyName: true,
            verified: true,
          },
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
    });

    // Job statistics
    const jobStats = {
      total: jobs.length,
      active: jobs.filter((j) => j.status === JobStatus.ACTIVE).length,
      draft: jobs.filter((j) => j.status === JobStatus.DRAFT).length,
      closed: jobs.filter((j) => j.status === JobStatus.CLOSED).length,
      expired: jobs.filter((j) => j.status === JobStatus.EXPIRED).length,
      totalViews: jobs.reduce((sum, j) => sum + j.views, 0),
      averageApplicationsPerJob:
        jobs.length > 0
          ? Math.round(jobs.reduce((sum, j) => sum + j._count.applications, 0) / jobs.length)
          : 0,
    };

    // Get all applications
    const applications = await prisma.application.findMany({
      include: {
        job: {
          select: {
            title: true,
            employer: {
              select: {
                companyName: true,
              },
            },
          },
        },
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
    });

    // Application statistics
    const applicationStats = {
      total: applications.length,
      pending: applications.filter((a) => a.status === ApplicationStatus.PENDING).length,
      reviewed: applications.filter((a) => a.status === ApplicationStatus.REVIEWED).length,
      shortlisted: applications.filter((a) => a.status === ApplicationStatus.SHORTLISTED).length,
      interviewScheduled: applications.filter((a) => a.status === ApplicationStatus.INTERVIEW_SCHEDULED).length,
      interviewed: applications.filter((a) => a.status === ApplicationStatus.INTERVIEWED).length,
      offered: applications.filter((a) => a.status === ApplicationStatus.OFFERED).length,
      accepted: applications.filter((a) => a.status === ApplicationStatus.ACCEPTED).length,
      rejected: applications.filter((a) => a.status === ApplicationStatus.REJECTED).length,
      withdrawn: applications.filter((a) => a.status === ApplicationStatus.WITHDRAWN).length,
      conversionRate:
        applications.length > 0
          ? ((applications.filter((a) => a.status === ApplicationStatus.ACCEPTED).length / applications.length) * 100).toFixed(2)
          : "0.00",
    };

    // Get all placements
    const placements = await prisma.placement.findMany({
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
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        job: {
          select: {
            title: true,
          },
        },
      },
    });

    // Placement statistics
    const placementStats = {
      total: placements.length,
      pending: placements.filter((p) => p.status === PlacementStatus.PENDING).length,
      confirmed: placements.filter((p) => p.status === PlacementStatus.CONFIRMED).length,
      completed: placements.filter((p) => p.status === PlacementStatus.COMPLETED).length,
      cancelled: placements.filter((p) => p.status === PlacementStatus.CANCELLED).length,
    };

    // Revenue statistics
    const totalRevenue = placements.reduce((sum, p) => sum + (p.placementFee || 0), 0);
    const paidRevenue = placements
      .filter((p) => p.paymentStatus === PaymentStatus.FULLY_PAID)
      .reduce((sum, p) => sum + (p.placementFee || 0), 0);
    const pendingRevenue = placements
      .filter((p) => p.paymentStatus !== PaymentStatus.FULLY_PAID)
      .reduce((sum, p) => {
        let pending = 0;
        if (!p.upfrontPaidAt && p.upfrontAmount) {
          pending += p.upfrontAmount;
        }
        if (p.upfrontPaidAt && !p.remainingPaidAt && p.remainingAmount) {
          pending += p.remainingAmount;
        }
        return sum + pending;
      }, 0);

    const revenueStats = {
      totalRevenue,
      totalRevenueFormatted: formatCurrency(totalRevenue),
      paidRevenue,
      paidRevenueFormatted: formatCurrency(paidRevenue),
      pendingRevenue,
      pendingRevenueFormatted: formatCurrency(pendingRevenue),
      averageRevenuePerPlacement:
        placements.length > 0 ? Math.round(totalRevenue / placements.length) : 0,
      averageRevenuePerPlacementFormatted:
        placements.length > 0 ? formatCurrency(Math.round(totalRevenue / placements.length)) : "$0.00",
      fullyPaidPlacements: placements.filter((p) => p.paymentStatus === PaymentStatus.FULLY_PAID).length,
      partiallyPaidPlacements: placements.filter((p) => p.paymentStatus === PaymentStatus.UPFRONT_PAID).length,
      unpaidPlacements: placements.filter((p) => p.paymentStatus === PaymentStatus.PENDING).length,
    };

    // Get test results
    const testResults = await prisma.testResult.findMany({
      where: {
        status: "COMPLETED",
      },
    });

    // Get candidates with test data
    const candidates = await prisma.candidate.findMany({
      where: {
        hasTakenTest: true,
      },
    });

    // Test and tier statistics
    const testStats = {
      totalTestsCompleted: testResults.length,
      candidatesWithTests: candidates.length,
      elite: candidates.filter((c) => c.testTier === "ELITE").length,
      advanced: candidates.filter((c) => c.testTier === "ADVANCED").length,
      intermediate: candidates.filter((c) => c.testTier === "INTERMEDIATE").length,
      beginner: candidates.filter((c) => c.testTier === "BEGINNER").length,
      averageScore:
        candidates.length > 0
          ? (candidates.reduce((sum, c) => sum + (c.testScore || 0), 0) / candidates.length).toFixed(2)
          : "0.00",
      averagePercentile:
        candidates.length > 0
          ? (candidates.reduce((sum, c) => sum + (c.testPercentile || 0), 0) / candidates.length).toFixed(2)
          : "0.00",
    };

    // Calculate growth metrics (30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const newUsersLast30Days = users.filter((u) => u.createdAt >= thirtyDaysAgo).length;
    const newUsersPrevious30Days = users.filter(
      (u) => u.createdAt >= sixtyDaysAgo && u.createdAt < thirtyDaysAgo
    ).length;

    const newJobsLast30Days = jobs.filter((j) => j.createdAt >= thirtyDaysAgo).length;
    const newJobsPrevious30Days = jobs.filter(
      (j) => j.createdAt >= sixtyDaysAgo && j.createdAt < thirtyDaysAgo
    ).length;

    const newApplicationsLast30Days = applications.filter((a) => a.appliedAt >= thirtyDaysAgo).length;
    const newApplicationsPrevious30Days = applications.filter(
      (a) => a.appliedAt >= sixtyDaysAgo && a.appliedAt < thirtyDaysAgo
    ).length;

    const newPlacementsLast30Days = placements.filter((p) => p.createdAt >= thirtyDaysAgo).length;
    const newPlacementsPrevious30Days = placements.filter(
      (p) => p.createdAt >= sixtyDaysAgo && p.createdAt < thirtyDaysAgo
    ).length;

    const calculateGrowthRate = (current: number, previous: number): string => {
      if (previous === 0) return current > 0 ? "100.00" : "0.00";
      return (((current - previous) / previous) * 100).toFixed(2);
    };

    const growthMetrics = {
      users: {
        last30Days: newUsersLast30Days,
        previous30Days: newUsersPrevious30Days,
        growthRate: calculateGrowthRate(newUsersLast30Days, newUsersPrevious30Days),
      },
      jobs: {
        last30Days: newJobsLast30Days,
        previous30Days: newJobsPrevious30Days,
        growthRate: calculateGrowthRate(newJobsLast30Days, newJobsPrevious30Days),
      },
      applications: {
        last30Days: newApplicationsLast30Days,
        previous30Days: newApplicationsPrevious30Days,
        growthRate: calculateGrowthRate(newApplicationsLast30Days, newApplicationsPrevious30Days),
      },
      placements: {
        last30Days: newPlacementsLast30Days,
        previous30Days: newPlacementsPrevious30Days,
        growthRate: calculateGrowthRate(newPlacementsLast30Days, newPlacementsPrevious30Days),
      },
    };

    // Recent activity (last 10 of each type)
    const recentUsers = users
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
      }));

    const recentJobs = jobs
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map((j) => ({
        id: j.id,
        title: j.title,
        companyName: j.employer.companyName,
        status: j.status,
        applicationsCount: j._count.applications,
        createdAt: j.createdAt,
      }));

    const recentApplications = applications
      .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        candidateName: a.candidate.user.name,
        jobTitle: a.job.title,
        companyName: a.job.employer.companyName,
        status: a.status,
        appliedAt: a.appliedAt,
      }));

    const recentPlacements = placements
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map((p) => ({
        id: p.id,
        candidateName: p.candidate.user.name,
        companyName: p.companyName,
        jobTitle: p.jobTitle,
        status: p.status,
        paymentStatus: p.paymentStatus,
        placementFee: p.placementFee,
        placementFeeFormatted: formatCurrency(p.placementFee || 0),
        createdAt: p.createdAt,
      }));

    // System health indicators
    const systemHealth = {
      verificationRate: userStats.total > 0 ? ((userStats.verified / userStats.total) * 100).toFixed(2) : "0.00",
      jobFillRate:
        jobStats.total > 0
          ? ((placementStats.total / jobStats.total) * 100).toFixed(2)
          : "0.00",
      applicationConversionRate: applicationStats.conversionRate,
      averageTimeToHire: "N/A", // Would need to calculate from application to placement dates
      platformUtilization: {
        activeEmployers: users.filter((u) => u.role === UserRole.EMPLOYER && u.status === "ACTIVE").length,
        employersWithActiveJobs: jobs
          .filter((j) => j.status === JobStatus.ACTIVE)
          .map((j) => j.employerId)
          .filter((value, index, self) => self.indexOf(value) === index).length,
        activeCandidates: users.filter((u) => u.role === UserRole.CANDIDATE && u.status === "ACTIVE").length,
        candidatesWithApplications: applications
          .map((a) => a.candidateId)
          .filter((value, index, self) => self.indexOf(value) === index).length,
      },
    };

    // Top performers
    const topEmployers = await prisma.employer.findMany({
      orderBy: {
        totalSpent: "desc",
      },
      take: 5,
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            jobs: true,
            placements: true,
          },
        },
      },
    });

    const topEmployersList = topEmployers.map((e) => ({
      id: e.id,
      companyName: e.companyName,
      totalSpent: e.totalSpent,
      totalSpentFormatted: formatCurrency(e.totalSpent),
      jobsPosted: e._count.jobs,
      placements: e._count.placements,
      verified: e.verified,
    }));

    const topCandidates = await prisma.candidate.findMany({
      where: {
        hasTakenTest: true,
      },
      orderBy: {
        testScore: "desc",
      },
      take: 5,
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            applications: true,
            placements: true,
          },
        },
      },
    });

    const topCandidatesList = topCandidates.map((c) => ({
      id: c.id,
      name: c.user.name,
      testScore: c.testScore,
      testPercentile: c.testPercentile,
      testTier: c.testTier,
      applications: c._count.applications,
      placements: c._count.placements,
      skills: c.skills,
    }));

    // Quick actions for admin
    const quickActions = [];

    if (userStats.unverified > 0) {
      quickActions.push({
        type: "UNVERIFIED_USERS",
        title: `${userStats.unverified} Unverified User${userStats.unverified > 1 ? "s" : ""}`,
        description: "Review and verify pending user accounts.",
        priority: "medium",
        count: userStats.unverified,
      });
    }

    if (applicationStats.pending > 50) {
      quickActions.push({
        type: "HIGH_PENDING_APPLICATIONS",
        title: "High Number of Pending Applications",
        description: `${applicationStats.pending} applications are awaiting employer review.`,
        priority: "medium",
        count: applicationStats.pending,
      });
    }

    if (revenueStats.pendingRevenue > 0) {
      quickActions.push({
        type: "PENDING_REVENUE",
        title: "Pending Revenue",
        description: `${formatCurrency(revenueStats.pendingRevenue)} in pending placement payments.`,
        priority: "high",
        amount: revenueStats.pendingRevenue,
      });
    }

    if (userStats.suspended > 0) {
      quickActions.push({
        type: "SUSPENDED_USERS",
        title: `${userStats.suspended} Suspended User${userStats.suspended > 1 ? "s" : ""}`,
        description: "Review suspended user accounts.",
        priority: "low",
        count: userStats.suspended,
      });
    }

    // Return comprehensive admin dashboard data
    return NextResponse.json({
      admin: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      userStats,
      jobStats,
      applicationStats,
      placementStats,
      revenueStats,
      testStats,
      growthMetrics,
      recentActivity: {
        users: recentUsers,
        jobs: recentJobs,
        applications: recentApplications,
        placements: recentPlacements,
      },
      systemHealth,
      topPerformers: {
        employers: topEmployersList,
        candidates: topCandidatesList,
      },
      quickActions,
      summary: {
        totalUsers: userStats.total,
        totalJobs: jobStats.total,
        totalApplications: applicationStats.total,
        totalPlacements: placementStats.total,
        totalRevenue: totalRevenue,
        paidRevenue: paidRevenue,
        pendingRevenue: pendingRevenue,
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Admin role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to fetch admin dashboard data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
