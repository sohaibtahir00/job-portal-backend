import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { JobStatus } from "@prisma/client";

/**
 * GET /api/employers/[id]
 * Get public employer/company profile
 * Public route - no authentication required
 *
 * Shows company information and active jobs
 * Used by candidates to learn about companies
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Fetch employer profile with public information
    const employer = await prisma.employer.findUnique({
      where: { id },
      select: {
        id: true,
        companyName: true,
        companyLogo: true,
        companyWebsite: true,
        companySize: true,
        industry: true,
        description: true,
        location: true,
        verified: true,
        createdAt: true,

        // Include active jobs
        jobs: {
          where: {
            status: JobStatus.ACTIVE,
          },
          select: {
            id: true,
            title: true,
            type: true,
            location: true,
            remote: true,
            experienceLevel: true,
            salaryMin: true,
            salaryMax: true,
            skills: true,
            createdAt: true,
            deadline: true,
            views: true,
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

        // Include statistics
        _count: {
          select: {
            jobs: true,
          },
        },
      },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer not found" },
        { status: 404 }
      );
    }

    // Calculate additional statistics
    const totalApplications = await prisma.application.count({
      where: {
        job: {
          employerId: employer.id,
        },
      },
    });

    const totalPlacements = await prisma.application.count({
      where: {
        job: {
          employerId: employer.id,
        },
        status: "ACCEPTED",
      },
    });

    // Get recent job postings (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentJobsCount = await prisma.job.count({
      where: {
        employerId: employer.id,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // Compile public statistics
    const publicStats = {
      totalJobs: employer._count.jobs,
      activeJobs: employer.jobs.length,
      totalApplicationsReceived: totalApplications,
      successfulPlacements: totalPlacements,
      recentlyHiring: recentJobsCount > 0,
    };

    return NextResponse.json({
      employer: {
        ...employer,
        _count: undefined, // Remove _count from response
      },
      stats: publicStats,
    });
  } catch (error) {
    console.error("Public employer profile fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch employer profile" },
      { status: 500 }
    );
  }
}
