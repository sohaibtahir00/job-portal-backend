import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/candidates/saved-jobs
 * Get all saved jobs for the current candidate
 *
 * Requires CANDIDATE role
 *
 * Query parameters:
 * - limit: number (optional, default 50)
 * - offset: number (optional, default 0)
 * - sortBy: "savedAt" | "salary" (optional, default "savedAt")
 * - order: "asc" | "desc" (optional, default "desc")
 */
export async function GET(request: NextRequest) {
  try {
    // Require candidate role
    await requireRole(UserRole.CANDIDATE);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get candidate profile
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const sortBy = searchParams.get("sortBy") || "savedAt";
    const order = searchParams.get("order") || "desc";

    // Validate parameters
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: "Offset must be non-negative" },
        { status: 400 }
      );
    }

    // Build orderBy clause
    let orderBy: any = {};
    if (sortBy === "savedAt") {
      orderBy = { savedAt: order };
    } else if (sortBy === "salary") {
      orderBy = { job: { salaryMax: order } };
    } else {
      orderBy = { savedAt: order };
    }

    // Get saved jobs
    const savedJobs = await prisma.savedJob.findMany({
      where: {
        candidateId: candidate.id,
      },
      include: {
        job: {
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
        },
      },
      orderBy,
      take: limit,
      skip: offset,
    });

    // Get total count
    const totalCount = await prisma.savedJob.count({
      where: {
        candidateId: candidate.id,
      },
    });

    // Check which jobs the candidate has applied to
    const jobIds = savedJobs.map((sj) => sj.jobId);
    const applications = await prisma.application.findMany({
      where: {
        candidateId: candidate.id,
        jobId: { in: jobIds },
      },
      select: {
        jobId: true,
        status: true,
        appliedAt: true,
      },
    });

    const applicationMap = new Map(
      applications.map((app) => [app.jobId, app])
    );

    // Format response
    const formattedSavedJobs = savedJobs.map((savedJob) => {
      const application = applicationMap.get(savedJob.jobId);

      return {
        id: savedJob.id,
        savedAt: savedJob.savedAt,
        notes: savedJob.notes,
        job: {
          id: savedJob.job.id,
          title: savedJob.job.title,
          description: savedJob.job.description,
          location: savedJob.job.location,
          remote: savedJob.job.remote,
          type: savedJob.job.type,
          status: savedJob.job.status,
          salaryMin: savedJob.job.salaryMin,
          salaryMax: savedJob.job.salaryMax,
          experienceLevel: savedJob.job.experienceLevel,
          skills: savedJob.job.skills,
          isClaimed: savedJob.job.isClaimed,
          createdAt: savedJob.job.createdAt,
          employer: savedJob.job.employer,
          applicationCount: savedJob.job._count.applications,
        },
        hasApplied: !!application,
        application: application
          ? {
              status: application.status,
              appliedAt: application.appliedAt,
            }
          : null,
      };
    });

    return NextResponse.json({
      savedJobs: formattedSavedJobs,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error) {
    console.error("Get saved jobs error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions. Candidate role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to get saved jobs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
