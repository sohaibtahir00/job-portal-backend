import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { JobType, ExperienceLevel, JobStatus } from "@prisma/client";

/**
 * GET /api/jobs/search
 * Advanced job search with multiple filters and full-text search
 *
 * Query parameters:
 * - q: string (search query for title/description)
 * - type: JobType[] (FULL_TIME, PART_TIME, CONTRACT, INTERNSHIP, TEMPORARY)
 * - location: string (city/state/country)
 * - remote: "true" | "false" | "hybrid" (remote work options)
 * - experienceLevel: ExperienceLevel[] (ENTRY_LEVEL, MID_LEVEL, SENIOR_LEVEL, EXECUTIVE)
 * - salaryMin: number (minimum salary)
 * - salaryMax: number (maximum salary)
 * - skills: string[] (comma-separated skills)
 * - companyName: string (search by company)
 * - postedWithin: number (days - e.g., 7 for last week)
 * - sortBy: "newest" | "salary_high" | "salary_low" | "applicants_high" | "applicants_low" | "relevant" (default: "relevant")
 * - limit: number (default: 20, max: 100)
 * - cursor: string (cursor for pagination)
 *
 * Returns:
 * - Paginated job listings with cursor-based pagination
 * - Total count and filter statistics
 * - Next cursor for pagination
 *
 * Authentication: Optional (public endpoint, but can be authenticated for personalized results)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract search parameters
    const searchQuery = searchParams.get("q");
    const typeParams = searchParams.getAll("type");
    const location = searchParams.get("location");
    const remote = searchParams.get("remote");
    const experienceLevelParams = searchParams.getAll("experienceLevel");
    const salaryMinParam = searchParams.get("salaryMin");
    const salaryMaxParam = searchParams.get("salaryMax");
    const skillsParam = searchParams.get("skills");
    const companyName = searchParams.get("companyName");
    const postedWithinParam = searchParams.get("postedWithin");
    const sortBy = searchParams.get("sortBy") || "relevant";
    const limitParam = searchParams.get("limit");
    const cursor = searchParams.get("cursor");

    // Parse and validate parameters
    const limit = Math.min(parseInt(limitParam || "20", 10), 100);
    const salaryMin = salaryMinParam ? parseInt(salaryMinParam, 10) : undefined;
    const salaryMax = salaryMaxParam ? parseInt(salaryMaxParam, 10) : undefined;
    const skills = skillsParam ? skillsParam.split(",").map((s) => s.trim()) : [];
    const postedWithin = postedWithinParam ? parseInt(postedWithinParam, 10) : undefined;

    // Build where clause
    const where: any = {
      status: JobStatus.ACTIVE, // Only show active jobs
    };

    // Full-text search on title, description, and company name
    if (searchQuery) {
      where.OR = [
        { title: { contains: searchQuery, mode: "insensitive" } },
        { description: { contains: searchQuery, mode: "insensitive" } },
        { requirements: { contains: searchQuery, mode: "insensitive" } },
        { responsibilities: { contains: searchQuery, mode: "insensitive" } },
        { employer: { companyName: { contains: searchQuery, mode: "insensitive" } } },
      ];
    }

    // Job type filter
    if (typeParams.length > 0) {
      where.type = { in: typeParams as JobType[] };
    }

    // Location filter
    if (location) {
      where.location = { contains: location, mode: "insensitive" };
    }

    // Remote filter
    if (remote === "true") {
      where.remote = true;
    } else if (remote === "false") {
      where.remote = false;
    }
    // "hybrid" would require additional field in schema, skip for now

    // Experience level filter
    if (experienceLevelParams.length > 0) {
      where.experienceLevel = { in: experienceLevelParams as ExperienceLevel[] };
    }

    // Salary range filter
    if (salaryMin !== undefined || salaryMax !== undefined) {
      where.AND = where.AND || [];

      if (salaryMin !== undefined) {
        where.AND.push({
          OR: [
            { salaryMax: { gte: salaryMin } },
            { salaryMin: { gte: salaryMin } },
          ],
        });
      }

      if (salaryMax !== undefined) {
        where.AND.push({
          OR: [
            { salaryMin: { lte: salaryMax } },
            { salaryMax: { lte: salaryMax } },
          ],
        });
      }
    }

    // Skills filter (matches ANY of the specified skills)
    if (skills.length > 0) {
      where.skills = { hasSome: skills };
    }

    // Company name filter
    if (companyName) {
      where.employer = {
        companyName: { contains: companyName, mode: "insensitive" },
      };
    }

    // Posted within filter (e.g., last 7 days)
    if (postedWithin !== undefined) {
      const date = new Date();
      date.setDate(date.getDate() - postedWithin);
      where.createdAt = { gte: date };
    }

    // Cursor-based pagination
    const cursorCondition = cursor
      ? {
          id: cursor,
        }
      : undefined;

    // Build orderBy based on sortBy parameter
    let orderBy: any = { createdAt: "desc" }; // Default: newest

    switch (sortBy) {
      case "newest":
        orderBy = { createdAt: "desc" };
        break;
      case "salary_high":
        orderBy = { salaryMax: "desc" };
        break;
      case "salary_low":
        orderBy = { salaryMin: "asc" };
        break;
      case "applicants_high":
        // Note: This requires aggregation, we'll handle it differently
        orderBy = { createdAt: "desc" }; // Fallback for now
        break;
      case "applicants_low":
        orderBy = { createdAt: "desc" }; // Fallback for now
        break;
      case "relevant":
        // For relevance, we prioritize by search match + recency
        orderBy = searchQuery
          ? [{ createdAt: "desc" }] // Would need full-text search ranking
          : { createdAt: "desc" };
        break;
      default:
        orderBy = { createdAt: "desc" };
    }

    // Fetch jobs with cursor-based pagination
    const jobs = await prisma.job.findMany({
      where,
      include: {
        employer: {
          select: {
            id: true,
            companyName: true,
            companyLogo: true,
            companyWebsite: true,
            location: true,
            industry: true,
            verified: true,
          },
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
      orderBy,
      take: limit + 1, // Fetch one extra to check if there are more results
      ...(cursorCondition && {
        skip: 1, // Skip the cursor
        cursor: cursorCondition,
      }),
    });

    // Determine if there are more results
    const hasMore = jobs.length > limit;
    const results = hasMore ? jobs.slice(0, limit) : jobs;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    // If sorting by applicants, do it in memory (not ideal for large datasets)
    if (sortBy === "applicants_high") {
      results.sort((a, b) => b._count.applications - a._count.applications);
    } else if (sortBy === "applicants_low") {
      results.sort((a, b) => a._count.applications - b._count.applications);
    }

    // Format results
    const formattedJobs = results.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      responsibilities: job.responsibilities,
      type: job.type,
      status: job.status,
      location: job.location,
      remote: job.remote,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      experienceLevel: job.experienceLevel,
      skills: job.skills,
      benefits: job.benefits,
      deadline: job.deadline,
      slots: job.slots,
      views: job.views,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      employer: job.employer,
      applicationsCount: job._count.applications,
      // Calculate match score if skills filter is used
      ...(skills.length > 0 && {
        matchingSkills: job.skills.filter((skill) => skills.includes(skill)),
        skillMatchScore: Math.round(
          (job.skills.filter((skill) => skills.includes(skill)).length / skills.length) * 100
        ),
      }),
    }));

    // Get total count for the search (for statistics)
    const totalCount = await prisma.job.count({ where });

    // Get filter statistics (aggregations)
    const [typeStats, experienceStats, remoteStats] = await Promise.all([
      // Count by type
      prisma.job.groupBy({
        by: ["type"],
        where: { ...where, type: undefined },
        _count: true,
      }),
      // Count by experience level
      prisma.job.groupBy({
        by: ["experienceLevel"],
        where: { ...where, experienceLevel: undefined },
        _count: true,
      }),
      // Count remote vs on-site
      prisma.job.groupBy({
        by: ["remote"],
        where: { ...where, remote: undefined },
        _count: true,
      }),
    ]);

    // Format filter statistics
    const filterStats = {
      byType: typeStats.reduce(
        (acc, stat) => {
          acc[stat.type] = stat._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      byExperienceLevel: experienceStats.reduce(
        (acc, stat) => {
          acc[stat.experienceLevel] = stat._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      byRemote: {
        remote: remoteStats.find((s) => s.remote === true)?._count || 0,
        onsite: remoteStats.find((s) => s.remote === false)?._count || 0,
      },
    };

    // Calculate salary range statistics
    const salaryStats = await prisma.job.aggregate({
      where,
      _min: { salaryMin: true },
      _max: { salaryMax: true },
      _avg: { salaryMin: true, salaryMax: true },
    });

    return NextResponse.json({
      jobs: formattedJobs,
      pagination: {
        limit,
        hasMore,
        nextCursor,
        total: totalCount,
        currentPage: cursor ? "N/A (cursor-based)" : 1,
      },
      filters: {
        applied: {
          searchQuery,
          type: typeParams,
          location,
          remote,
          experienceLevel: experienceLevelParams,
          salaryMin,
          salaryMax,
          skills,
          companyName,
          postedWithin,
          sortBy,
        },
        statistics: {
          ...filterStats,
          salaryRange: {
            min: salaryStats._min.salaryMin,
            max: salaryStats._max.salaryMax,
            avgMin: Math.round(salaryStats._avg.salaryMin || 0),
            avgMax: Math.round(salaryStats._avg.salaryMax || 0),
          },
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        resultsCount: formattedJobs.length,
        totalMatches: totalCount,
      },
    });
  } catch (error) {
    console.error("Job search error:", error);

    return NextResponse.json(
      {
        error: "Failed to search jobs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
