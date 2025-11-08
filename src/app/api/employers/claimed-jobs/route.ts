import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/employers/claimed-jobs
 * Get all jobs claimed by the current employer
 *
 * Returns:
 * - List of claimed jobs with applicant counts and skills-verified counts
 *
 * Requires: EMPLOYER role
 */
export async function GET(request: NextRequest) {
  try {
    // Require employer role
    await requireRole(UserRole.EMPLOYER);

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

    // Get all claimed jobs for this employer
    const claimedJobs = await prisma.job.findMany({
      where: {
        employerId: employer.id,
        isClaimed: true,
      },
      include: {
        applications: {
          include: {
            candidate: {
              select: {
                hasTakenTest: true,
                testTier: true,
                testScore: true,
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
        claimedAt: "desc",
      },
    });

    // Format response with applicant counts and skills-verified counts
    const formattedJobs = claimedJobs.map((job) => {
      const skillsVerifiedApplicants = job.applications.filter(
        (app) => app.candidate.hasTakenTest && app.candidate.testScore !== null
      );

      // Count by tier
      const tierCounts = {
        ELITE: skillsVerifiedApplicants.filter((app) => app.candidate.testTier === "ELITE").length,
        ADVANCED: skillsVerifiedApplicants.filter((app) => app.candidate.testTier === "ADVANCED").length,
        INTERMEDIATE: skillsVerifiedApplicants.filter((app) => app.candidate.testTier === "INTERMEDIATE").length,
        BEGINNER: skillsVerifiedApplicants.filter((app) => app.candidate.testTier === "BEGINNER").length,
      };

      return {
        id: job.id,
        title: job.title,
        description: job.description,
        location: job.location,
        type: job.type,
        status: job.status,
        claimedAt: job.claimedAt,
        applicantsCount: job._count.applications,
        skillsVerifiedCount: skillsVerifiedApplicants.length,
        tierBreakdown: tierCounts,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        experienceLevel: job.experienceLevel,
        remote: job.remote,
        remoteType: job.remoteType,
      };
    });

    return NextResponse.json({
      claimedJobs: formattedJobs,
      totalClaimed: formattedJobs.length,
      totalApplicants: formattedJobs.reduce((sum, job) => sum + job.applicantsCount, 0),
      totalSkillsVerified: formattedJobs.reduce((sum, job) => sum + job.skillsVerifiedCount, 0),
    });
  } catch (error) {
    console.error("Get claimed jobs error:", error);

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
        error: "Failed to fetch claimed jobs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
