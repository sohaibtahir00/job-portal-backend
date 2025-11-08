import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/employers/search-jobs
 * Search for unclaimed jobs by company name
 * Used in the "Claim & Convert" flow for employers
 *
 * Public endpoint (no authentication required for discovery)
 * Employers can search to see if their company's jobs are listed
 *
 * Query parameters:
 * - companyName: string (required)
 * - limit: number (optional, default 20)
 * - offset: number (optional, default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get("companyName");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Validate company name
    if (!companyName || companyName.trim().length < 2) {
      return NextResponse.json(
        { error: "Company name must be at least 2 characters" },
        { status: 400 }
      );
    }

    // Validate parameters
    if (limit < 1 || limit > 50) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 50" },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: "Offset must be non-negative" },
        { status: 400 }
      );
    }

    // Get current user (if authenticated) to check if they're an employer
    let currentEmployerId: string | null = null;
    try {
      const user = await getCurrentUser();
      if (user) {
        const employer = await prisma.employer.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        currentEmployerId = employer?.id || null;
      }
    } catch {
      // User not authenticated, continue with public search
    }

    // Search for jobs with company name match
    // Look in employer.companyName for exact or partial matches
    const jobs = await prisma.job.findMany({
      where: {
        employer: {
          companyName: {
            contains: companyName,
            mode: "insensitive",
          },
        },
        status: "ACTIVE", // Only show active jobs
        isClaimed: false, // Only show unclaimed jobs
      },
      include: {
        employer: {
          select: {
            id: true,
            companyName: true,
            companyLogo: true,
            location: true,
            verified: true,
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
      take: limit,
      skip: offset,
    });

    // Get total count
    const totalCount = await prisma.job.count({
      where: {
        employer: {
          companyName: {
            contains: companyName,
            mode: "insensitive",
          },
        },
        status: "ACTIVE",
        isClaimed: false,
      },
    });

    // Format response
    const formattedJobs = jobs.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      location: job.location,
      remote: job.remote,
      type: job.type,
      status: job.status,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      experienceLevel: job.experienceLevel,
      skills: job.skills,
      isClaimed: job.isClaimed,
      createdAt: job.createdAt,
      employer: job.employer,
      applicationCount: job._count.applications,
      canClaim: currentEmployerId !== null, // Can only claim if authenticated as employer
    }));

    return NextResponse.json({
      jobs: formattedJobs,
      searchQuery: companyName,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
      message:
        totalCount > 0
          ? `Found ${totalCount} unclaimed job${totalCount === 1 ? "" : "s"} for "${companyName}"`
          : `No unclaimed jobs found for "${companyName}"`,
    });
  } catch (error) {
    console.error("Search jobs error:", error);

    return NextResponse.json(
      {
        error: "Failed to search jobs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
