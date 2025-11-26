import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole, JobStatus, ApplicationStatus, PlacementStatus } from "@prisma/client";
import { formatCurrency } from "@/lib/stripe";

/**
 * GET /api/dashboard/employer
 * Get employer dashboard statistics and data
 *
 * Returns:
 * - Active jobs count
 * - Total applications received
 * - Applications by status
 * - Pending reviews count
 * - Active placements
 * - Total spent on placements
 * - Recent applications
 * - Top performing jobs
 * - Payment summary
 *
 * Requires: EMPLOYER role
 */
export async function GET(request: NextRequest) {
  try {
    // Get user and check role in one call
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (user.role !== UserRole.EMPLOYER) {
      return NextResponse.json(
        { error: "Forbidden - Employer role required" },
        { status: 403 }
      );
    }

    // Get employer with full data
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        jobs: {
          include: {
            applications: {
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
            },
            _count: {
              select: {
                applications: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        placements: {
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
            job: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    // Job statistics
    const jobStats = {
      total: employer.jobs.length,
      active: employer.jobs.filter((j) => j.status === JobStatus.ACTIVE).length,
      draft: employer.jobs.filter((j) => j.status === JobStatus.DRAFT).length,
      closed: employer.jobs.filter((j) => j.status === JobStatus.CLOSED).length,
      expired: employer.jobs.filter((j) => j.status === JobStatus.EXPIRED).length,
    };

    // Get all applications across all jobs
    const allApplications = employer.jobs.flatMap((job) => job.applications);

    // Application statistics
    const applicationStats = {
      total: allApplications.length,
      pending: allApplications.filter((a) => a.status === ApplicationStatus.PENDING).length,
      shortlisted: allApplications.filter((a) => a.status === ApplicationStatus.SHORTLISTED).length,
      inInterview: allApplications.filter((a) => a.status === ApplicationStatus.INTERVIEW_SCHEDULED || a.status === ApplicationStatus.INTERVIEWED).length,
      offered: allApplications.filter((a) => a.status === ApplicationStatus.OFFERED).length,
      accepted: allApplications.filter((a) => a.status === ApplicationStatus.ACCEPTED).length,
      rejected: allApplications.filter((a) => a.status === ApplicationStatus.REJECTED).length,
    };

    // Pending reviews (applications that need attention)
    const pendingReviews = applicationStats.pending;

    // Get recent applications (last 10)
    const recentApplications = allApplications
      .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())
      .slice(0, 10)
      .map((app) => {
        const job = employer.jobs.find((j) => j.id === app.jobId);
        return {
          id: app.id,
          candidateName: app.candidate.user.name,
          candidateEmail: app.candidate.user.email,
          jobTitle: job?.title || "Unknown",
          jobId: app.jobId,
          status: app.status,
          appliedAt: app.appliedAt,
          reviewedAt: app.reviewedAt,
          candidateSkills: app.candidate.skills,
          candidateExperience: app.candidate.experience,
          candidateTestTier: app.candidate.testTier,
          candidateLocation: app.candidate.location,
        };
      });

    // Top performing jobs (by application count)
    // Show both ACTIVE and DRAFT jobs so employers can see their newly created jobs
    const topJobs = employer.jobs
      .filter((j) => j.status === JobStatus.ACTIVE || j.status === JobStatus.DRAFT)
      .sort((a, b) => b._count.applications - a._count.applications)
      .slice(0, 5)
      .map((job) => ({
        id: job.id,
        title: job.title,
        location: job.location,
        type: job.type,
        status: job.status,
        applicationsCount: job._count.applications,
        views: job.views,
        postedAt: job.createdAt,
        deadline: job.deadline,
      }));

    // Placement statistics
    const placementStats = {
      total: employer.placements.length,
      pending: employer.placements.filter((p) => p.status === PlacementStatus.PENDING).length,
      confirmed: employer.placements.filter((p) => p.status === PlacementStatus.CONFIRMED).length,
      completed: employer.placements.filter((p) => p.status === PlacementStatus.COMPLETED).length,
      cancelled: employer.placements.filter((p) => p.status === PlacementStatus.CANCELLED).length,
    };

    // Active placements (within guarantee period)
    const now = new Date();
    const activePlacements = employer.placements
      .filter(
        (p) =>
          (p.status === PlacementStatus.PENDING || p.status === PlacementStatus.CONFIRMED) &&
          (!p.guaranteeEndDate || p.guaranteeEndDate > now)
      )
      .map((placement) => ({
        id: placement.id,
        candidateName: placement.candidate.user.name,
        jobTitle: placement.jobTitle,
        startDate: placement.startDate,
        status: placement.status,
        paymentStatus: placement.paymentStatus,
        placementFee: placement.placementFee,
        placementFeeFormatted: formatCurrency(placement.placementFee || 0),
        upfrontPaid: !!placement.upfrontPaidAt,
        remainingPaid: !!placement.remainingPaidAt,
        guaranteeEndDate: placement.guaranteeEndDate,
        daysInGuarantee: placement.guaranteeEndDate
          ? Math.max(0, Math.ceil((placement.guaranteeEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : 0,
      }));

    // Payment summary
    const totalRevenue = employer.totalSpent; // Total paid to platform
    const pendingPayments = employer.placements
      .filter((p) => p.paymentStatus !== "FULLY_PAID")
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

    const paymentSummary = {
      totalSpent: totalRevenue,
      totalSpentFormatted: formatCurrency(totalRevenue),
      pendingPayments,
      pendingPaymentsFormatted: formatCurrency(pendingPayments),
      fullyPaidPlacements: employer.placements.filter((p) => p.paymentStatus === "FULLY_PAID").length,
      placementsWithPendingPayment: employer.placements.filter(
        (p) => p.paymentStatus === "PENDING" || p.paymentStatus === "UPFRONT_PAID"
      ).length,
    };

    // Calculate activity timeline (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = {
      newApplications: allApplications.filter((a) => a.appliedAt >= thirtyDaysAgo).length,
      reviewedApplications: allApplications.filter(
        (a) => a.reviewedAt && a.reviewedAt >= thirtyDaysAgo
      ).length,
      newPlacements: employer.placements.filter((p) => p.createdAt >= thirtyDaysAgo).length,
      jobsPosted: employer.jobs.filter((j) => j.createdAt >= thirtyDaysAgo).length,
    };

    // Applications by job (for analytics)
    const applicationsByJob = employer.jobs
      .filter((j) => j.status === JobStatus.ACTIVE)
      .map((job) => ({
        jobId: job.id,
        jobTitle: job.title,
        applicationsCount: job.applications.length,
        pendingCount: job.applications.filter((a) => a.status === ApplicationStatus.PENDING).length,
        shortlistedCount: job.applications.filter((a) => a.status === ApplicationStatus.SHORTLISTED).length,
      }));

    // Candidate quality metrics (based on test tiers)
    const candidatesWithTests = allApplications.filter((a) => a.candidate.hasTakenTest);
    const candidateQualityMetrics = {
      totalCandidatesWithTests: candidatesWithTests.length,
      elite: candidatesWithTests.filter((a) => a.candidate.testTier === "ELITE").length,
      advanced: candidatesWithTests.filter((a) => a.candidate.testTier === "ADVANCED").length,
      intermediate: candidatesWithTests.filter((a) => a.candidate.testTier === "INTERMEDIATE").length,
      beginner: candidatesWithTests.filter((a) => a.candidate.testTier === "BEGINNER").length,
    };

    // Quick actions suggestions
    const quickActions = [];

    if (pendingReviews > 0) {
      quickActions.push({
        type: "REVIEW_APPLICATIONS",
        title: `${pendingReviews} Application${pendingReviews > 1 ? "s" : ""} Need Review`,
        description: "Review pending applications and update their status.",
        priority: "high",
        count: pendingReviews,
      });
    }

    if (jobStats.draft > 0) {
      quickActions.push({
        type: "PUBLISH_JOBS",
        title: `${jobStats.draft} Draft Job${jobStats.draft > 1 ? "s" : ""}`,
        description: "Complete and publish your draft job postings.",
        priority: "medium",
        count: jobStats.draft,
      });
    }

    if (pendingPayments > 0) {
      quickActions.push({
        type: "PENDING_PAYMENTS",
        title: "Pending Payments",
        description: `You have ${formatCurrency(pendingPayments)} in pending placement payments.`,
        priority: "high",
        amount: pendingPayments,
      });
    }

    if (jobStats.active === 0) {
      quickActions.push({
        type: "POST_JOB",
        title: "No Active Jobs",
        description: "Post a new job to start receiving applications.",
        priority: "high",
      });
    }

    if (applicationStats.shortlisted > 0) {
      quickActions.push({
        type: "SCHEDULE_INTERVIEWS",
        title: `${applicationStats.shortlisted} Shortlisted Candidate${applicationStats.shortlisted > 1 ? "s" : ""}`,
        description: "Schedule interviews with your shortlisted candidates.",
        priority: "medium",
        count: applicationStats.shortlisted,
      });
    }

    // Return dashboard data
    return NextResponse.json({
      employer: {
        id: employer.id,
        name: employer.user.name,
        email: employer.user.email,
        companyName: employer.companyName,
        companyLogo: employer.companyLogo,
        location: employer.location,
        industry: employer.industry,
        verified: employer.verified,
        // Include full jobs array for /employer/jobs page
        jobs: employer.jobs.map((job) => ({
          id: job.id,
          title: job.title,
          description: job.description,
          location: job.location,
          remote: job.remote,
          remoteType: job.remoteType,
          type: job.type,
          experienceLevel: job.experienceLevel,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          status: job.status,
          requirements: job.requirements,
          responsibilities: job.responsibilities,
          benefits: job.benefits,
          skills: job.skills,
          requiresAssessment: job.requiresAssessment,
          minSkillsScore: job.minSkillsScore,
          views: job.views,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          _count: {
            applications: job._count.applications,
          },
        })),
      },
      jobStats,
      applicationStats,
      pendingReviews,
      recentApplications,
      topJobs,
      placementStats,
      activePlacements,
      paymentSummary,
      recentActivity,
      applicationsByJob,
      candidateQualityMetrics,
      quickActions,
      summary: {
        activeJobs: jobStats.active,
        totalApplications: applicationStats.total,
        pendingReviews,
        activePlacements: activePlacements.length,
        totalSpent: totalRevenue,
        pendingPayments,
      },
    });
  } catch (error) {
    console.error("Employer dashboard error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Employer role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to fetch employer dashboard data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
