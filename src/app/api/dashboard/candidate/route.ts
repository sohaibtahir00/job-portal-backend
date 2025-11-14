import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole, ApplicationStatus } from "@prisma/client";
import {
  getTierDescription,
  getTierColor,
  getTierEmoji,
  getNextTierRequirements,
  TestTier,
} from "@/lib/test-tiers";

/**
 * GET /api/dashboard/candidate
 * Get candidate dashboard statistics and data
 *
 * Returns:
 * - Application counts by status
 * - Recent applications
 * - Recommended jobs based on skills
 * - Test status and tier information
 * - Placement status
 * - Profile completeness
 *
 * Requires: CANDIDATE role
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

    if (user.role !== UserRole.CANDIDATE) {
      return NextResponse.json(
        { error: "Forbidden - Candidate role required" },
        { status: 403 }
      );
    }

    // Get candidate with full profile
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            emailVerified: true,
          },
        },
        applications: {
          include: {
            job: {
              include: {
                employer: {
                  select: {
                    companyName: true,
                    companyLogo: true,
                  },
                },
              },
            },
          },
          orderBy: {
            appliedAt: "desc",
          },
        },
        testResults: {
          where: {
            status: "COMPLETED",
          },
          orderBy: {
            completedAt: "desc",
          },
          take: 5,
        },
        placements: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
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
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    // Calculate application statistics by status
    const applicationStats = {
      total: candidate.applications.length,
      pending: candidate.applications.filter((a) => a.status === ApplicationStatus.PENDING).length,
      reviewed: candidate.applications.filter((a) => a.status === ApplicationStatus.REVIEWED).length,
      shortlisted: candidate.applications.filter((a) => a.status === ApplicationStatus.SHORTLISTED).length,
      interviewScheduled: candidate.applications.filter((a) => a.status === ApplicationStatus.INTERVIEW_SCHEDULED).length,
      interviewed: candidate.applications.filter((a) => a.status === ApplicationStatus.INTERVIEWED).length,
      offered: candidate.applications.filter((a) => a.status === ApplicationStatus.OFFERED).length,
      accepted: candidate.applications.filter((a) => a.status === ApplicationStatus.ACCEPTED).length,
      rejected: candidate.applications.filter((a) => a.status === ApplicationStatus.REJECTED).length,
      withdrawn: candidate.applications.filter((a) => a.status === ApplicationStatus.WITHDRAWN).length,
    };

    // Calculate active applications (not rejected or withdrawn)
    const activeApplications = candidate.applications.filter(
      (a) => a.status !== ApplicationStatus.REJECTED && a.status !== ApplicationStatus.WITHDRAWN
    ).length;

    // Get recent applications (last 5)
    const recentApplications = candidate.applications.slice(0, 5).map((app) => ({
      id: app.id,
      jobTitle: app.job.title,
      companyName: app.job.employer.companyName,
      companyLogo: app.job.employer.companyLogo,
      status: app.status,
      appliedAt: app.appliedAt,
      reviewedAt: app.reviewedAt,
      jobLocation: app.job.location,
      jobType: app.job.type,
      jobRemote: app.job.remote,
    }));

    // Calculate profile completeness
    const profileFields = {
      phone: !!candidate.phone,
      resume: !!candidate.resume,
      portfolio: !!candidate.portfolio,
      linkedIn: !!candidate.linkedIn,
      github: !!candidate.github,
      bio: !!candidate.bio,
      skills: candidate.skills.length > 0,
      experience: candidate.experience !== null,
      education: !!candidate.education,
      location: !!candidate.location,
      preferredJobType: !!candidate.preferredJobType,
      expectedSalary: !!candidate.expectedSalary,
    };

    const completedFields = Object.values(profileFields).filter(Boolean).length;
    const totalFields = Object.keys(profileFields).length;
    const profileCompletenessPercentage = Math.round((completedFields / totalFields) * 100);

    const missingFields = Object.entries(profileFields)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    // Test status and tier information
    let testInfo = null;
    if (candidate.hasTakenTest && candidate.testScore && candidate.testPercentile && candidate.testTier) {
      const tier = candidate.testTier as TestTier;
      const nextTier = getNextTierRequirements(candidate.testScore, candidate.testPercentile);

      testInfo = {
        hasTaken: true,
        score: candidate.testScore,
        percentile: candidate.testPercentile,
        tier: {
          name: tier,
          description: getTierDescription(tier),
          color: getTierColor(tier),
          emoji: getTierEmoji(tier),
        },
        lastTestDate: candidate.lastTestDate,
        nextTier: nextTier,
        recentTests: candidate.testResults.slice(0, 3).map((result) => ({
          id: result.id,
          testName: result.testName,
          testType: result.testType,
          score: result.score,
          maxScore: result.maxScore,
          percentageScore: ((result.score / result.maxScore) * 100).toFixed(1),
          completedAt: result.completedAt,
        })),
      };
    } else {
      testInfo = {
        hasTaken: false,
        inviteSent: !!candidate.testInviteSentAt,
        inviteSentAt: candidate.testInviteSentAt,
        message: candidate.testInviteSentAt
          ? "Test invitation pending. Complete your test to unlock your skill tier."
          : "No test invitation yet. Apply to jobs to receive test invitations.",
      };
    }

    // Placement information
    const activePlacement = candidate.placements.find(
      (p) => p.status === "PENDING" || p.status === "CONFIRMED"
    );

    const placementInfo = activePlacement
      ? {
          hasActivePlacement: true,
          placement: {
            id: activePlacement.id,
            jobTitle: activePlacement.jobTitle,
            companyName: activePlacement.companyName,
            startDate: activePlacement.startDate,
            status: activePlacement.status,
          },
        }
      : {
          hasActivePlacement: false,
          totalPlacements: candidate.placements.length,
          completedPlacements: candidate.placements.filter((p) => p.status === "COMPLETED").length,
        };

    // Get recommended jobs based on candidate skills and preferences
    const recommendedJobs = await prisma.job.findMany({
      where: {
        status: "ACTIVE",
        // Match candidate's preferred job type if set
        ...(candidate.preferredJobType && { type: candidate.preferredJobType }),
        // Exclude jobs already applied to
        NOT: {
          applications: {
            some: {
              candidateId: candidate.id,
            },
          },
        },
        // Match at least one skill if candidate has skills
        ...(candidate.skills.length > 0 && {
          skills: {
            hasSome: candidate.skills,
          },
        }),
      },
      include: {
        employer: {
          select: {
            companyName: true,
            companyLogo: true,
            location: true,
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
      take: 6,
    });

    const formattedRecommendedJobs = recommendedJobs.map((job) => ({
      id: job.id,
      title: job.title,
      companyName: job.employer.companyName,
      companyLogo: job.employer.companyLogo,
      location: job.location,
      remote: job.remote,
      type: job.type,
      experienceLevel: job.experienceLevel,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      skills: job.skills,
      matchingSkills: job.skills.filter((skill) => candidate.skills.includes(skill)),
      applicationsCount: job._count.applications,
      postedAt: job.createdAt,
    }));

    // Calculate activity timeline (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = {
      applicationsSubmitted: candidate.applications.filter(
        (a) => a.appliedAt >= thirtyDaysAgo
      ).length,
      statusUpdates: candidate.applications.filter(
        (a) => a.reviewedAt && a.reviewedAt >= thirtyDaysAgo
      ).length,
      testsCompleted: candidate.testResults.filter(
        (t) => t.completedAt && t.completedAt >= thirtyDaysAgo
      ).length,
    };

    // Quick actions suggestions
    const quickActions = [];

    if (profileCompletenessPercentage < 100) {
      quickActions.push({
        type: "COMPLETE_PROFILE",
        title: "Complete Your Profile",
        description: `Your profile is ${profileCompletenessPercentage}% complete. Add missing information to improve your chances.`,
        priority: "high",
        missingFields: missingFields.slice(0, 3),
      });
    }

    if (!candidate.hasTakenTest && candidate.testInviteSentAt) {
      quickActions.push({
        type: "TAKE_TEST",
        title: "Complete Your Skills Test",
        description: "You have a pending test invitation. Complete it to unlock your skill tier.",
        priority: "high",
      });
    }

    if (applicationStats.pending > 0) {
      quickActions.push({
        type: "PENDING_APPLICATIONS",
        title: `${applicationStats.pending} Application${applicationStats.pending > 1 ? "s" : ""} Pending`,
        description: "Check the status of your pending applications.",
        priority: "medium",
      });
    }

    if (formattedRecommendedJobs.length > 0) {
      quickActions.push({
        type: "BROWSE_JOBS",
        title: "New Recommended Jobs",
        description: `${formattedRecommendedJobs.length} new jobs match your skills and preferences.`,
        priority: "medium",
      });
    }

    if (applicationStats.offered > 0) {
      quickActions.push({
        type: "REVIEW_OFFERS",
        title: `${applicationStats.offered} Job Offer${applicationStats.offered > 1 ? "s" : ""}`,
        description: "You have pending job offers. Review and respond to them.",
        priority: "high",
      });
    }

    // Return dashboard data
    return NextResponse.json({
      candidate: {
        id: candidate.id,
        name: candidate.user.name,
        email: candidate.user.email,
        emailVerified: candidate.user.emailVerified,
        location: candidate.location,
        availability: candidate.availability,
        skills: candidate.skills,
        experience: candidate.experience,
      },
      applicationStats,
      activeApplications,
      recentApplications,
      profileCompleteness: {
        percentage: profileCompletenessPercentage,
        completedFields,
        totalFields,
        missingFields,
      },
      testInfo,
      placementInfo,
      recommendedJobs: formattedRecommendedJobs,
      recentActivity,
      quickActions,
      summary: {
        totalApplications: applicationStats.total,
        activeApplications,
        profileCompleteness: profileCompletenessPercentage,
        hasTestResults: candidate.hasTakenTest,
        testTier: candidate.testTier,
        hasActivePlacement: !!activePlacement,
      },
    });
  } catch (error) {
    console.error("Candidate dashboard error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Candidate role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to fetch candidate dashboard data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
