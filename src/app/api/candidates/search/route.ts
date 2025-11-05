import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole, JobType } from "@prisma/client";

/**
 * GET /api/candidates/search
 * Advanced candidate search with multiple filters
 * Employer-only endpoint for finding qualified candidates
 *
 * Query parameters:
 * - q: string (search query for name, bio, education)
 * - skills: string[] (comma-separated skills - matches ANY)
 * - skillsAll: string[] (comma-separated skills - matches ALL)
 * - location: string (city/state/country)
 * - experienceMin: number (minimum years of experience)
 * - experienceMax: number (maximum years of experience)
 * - availability: "true" | "false" (available for hire)
 * - preferredJobType: JobType (FULL_TIME, PART_TIME, etc.)
 * - testTier: string[] (ELITE, ADVANCED, INTERMEDIATE, BEGINNER)
 * - testScoreMin: number (minimum test score 0-100)
 * - testScoreMax: number (maximum test score 0-100)
 * - testPercentileMin: number (minimum percentile 0-100)
 * - hasTakenTest: "true" | "false" (has completed skills test)
 * - expectedSalaryMin: number (minimum expected salary)
 * - expectedSalaryMax: number (maximum expected salary)
 * - sortBy: "relevant" | "score_high" | "score_low" | "experience_high" | "experience_low" | "newest" (default: "relevant")
 * - limit: number (default: 20, max: 100)
 * - cursor: string (cursor for pagination)
 *
 * Returns:
 * - Paginated candidate listings with cursor-based pagination
 * - Skill match scores
 * - Test tier information
 * - Total count and filter statistics
 *
 * Authentication: Required (EMPLOYER or ADMIN role)
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);

    // Extract search parameters
    const searchQuery = searchParams.get("q");
    const skillsParam = searchParams.get("skills");
    const skillsAllParam = searchParams.get("skillsAll");
    const location = searchParams.get("location");
    const experienceMinParam = searchParams.get("experienceMin");
    const experienceMaxParam = searchParams.get("experienceMax");
    const availability = searchParams.get("availability");
    const preferredJobType = searchParams.get("preferredJobType");
    const testTierParams = searchParams.getAll("testTier");
    const testScoreMinParam = searchParams.get("testScoreMin");
    const testScoreMaxParam = searchParams.get("testScoreMax");
    const testPercentileMinParam = searchParams.get("testPercentileMin");
    const hasTakenTestParam = searchParams.get("hasTakenTest");
    const expectedSalaryMinParam = searchParams.get("expectedSalaryMin");
    const expectedSalaryMaxParam = searchParams.get("expectedSalaryMax");
    const sortBy = searchParams.get("sortBy") || "relevant";
    const limitParam = searchParams.get("limit");
    const cursor = searchParams.get("cursor");

    // Parse and validate parameters
    const limit = Math.min(parseInt(limitParam || "20", 10), 100);
    const skills = skillsParam ? skillsParam.split(",").map((s) => s.trim()) : [];
    const skillsAll = skillsAllParam ? skillsAllParam.split(",").map((s) => s.trim()) : [];
    const experienceMin = experienceMinParam ? parseInt(experienceMinParam, 10) : undefined;
    const experienceMax = experienceMaxParam ? parseInt(experienceMaxParam, 10) : undefined;
    const testScoreMin = testScoreMinParam ? parseFloat(testScoreMinParam) : undefined;
    const testScoreMax = testScoreMaxParam ? parseFloat(testScoreMaxParam) : undefined;
    const testPercentileMin = testPercentileMinParam ? parseFloat(testPercentileMinParam) : undefined;
    const expectedSalaryMin = expectedSalaryMinParam ? parseInt(expectedSalaryMinParam, 10) : undefined;
    const expectedSalaryMax = expectedSalaryMaxParam ? parseInt(expectedSalaryMaxParam, 10) : undefined;

    // Build where clause
    const where: any = {};

    // Full-text search on name, bio, education
    if (searchQuery) {
      where.OR = [
        { user: { name: { contains: searchQuery, mode: "insensitive" } } },
        { bio: { contains: searchQuery, mode: "insensitive" } },
        { education: { contains: searchQuery, mode: "insensitive" } },
      ];
    }

    // Skills filter - matches ANY of the specified skills
    if (skills.length > 0) {
      where.skills = { hasSome: skills };
    }

    // Skills filter - matches ALL of the specified skills
    if (skillsAll.length > 0) {
      where.AND = where.AND || [];
      skillsAll.forEach((skill) => {
        where.AND.push({
          skills: { has: skill },
        });
      });
    }

    // Location filter
    if (location) {
      where.location = { contains: location, mode: "insensitive" };
    }

    // Experience range filter
    if (experienceMin !== undefined) {
      where.experience = { gte: experienceMin };
    }
    if (experienceMax !== undefined) {
      where.experience = where.experience
        ? { ...where.experience, lte: experienceMax }
        : { lte: experienceMax };
    }

    // Availability filter
    if (availability === "true") {
      where.availability = true;
    } else if (availability === "false") {
      where.availability = false;
    }

    // Preferred job type filter
    if (preferredJobType) {
      where.preferredJobType = preferredJobType as JobType;
    }

    // Test tier filter
    if (testTierParams.length > 0) {
      where.testTier = { in: testTierParams };
    }

    // Test score range filter
    if (testScoreMin !== undefined) {
      where.testScore = { gte: testScoreMin };
    }
    if (testScoreMax !== undefined) {
      where.testScore = where.testScore
        ? { ...where.testScore, lte: testScoreMax }
        : { lte: testScoreMax };
    }

    // Test percentile filter
    if (testPercentileMin !== undefined) {
      where.testPercentile = { gte: testPercentileMin };
    }

    // Has taken test filter
    if (hasTakenTestParam === "true") {
      where.hasTakenTest = true;
    } else if (hasTakenTestParam === "false") {
      where.hasTakenTest = false;
    }

    // Expected salary range filter
    if (expectedSalaryMin !== undefined) {
      where.expectedSalary = { gte: expectedSalaryMin };
    }
    if (expectedSalaryMax !== undefined) {
      where.expectedSalary = where.expectedSalary
        ? { ...where.expectedSalary, lte: expectedSalaryMax }
        : { lte: expectedSalaryMax };
    }

    // Cursor-based pagination
    const cursorCondition = cursor ? { id: cursor } : undefined;

    // Build orderBy based on sortBy parameter
    let orderBy: any = { createdAt: "desc" }; // Default

    switch (sortBy) {
      case "score_high":
        orderBy = [{ testScore: "desc" }, { createdAt: "desc" }];
        break;
      case "score_low":
        orderBy = [{ testScore: "asc" }, { createdAt: "desc" }];
        break;
      case "experience_high":
        orderBy = [{ experience: "desc" }, { createdAt: "desc" }];
        break;
      case "experience_low":
        orderBy = [{ experience: "asc" }, { createdAt: "desc" }];
        break;
      case "newest":
        orderBy = { createdAt: "desc" };
        break;
      case "relevant":
      default:
        // For relevance, prioritize test scores + skills match
        orderBy = [{ testScore: "desc" }, { experience: "desc" }, { createdAt: "desc" }];
        break;
    }

    // Fetch candidates with cursor-based pagination
    const candidates = await prisma.candidate.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            status: true,
          },
        },
        _count: {
          select: {
            applications: true,
            placements: true,
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
    const hasMore = candidates.length > limit;
    const results = hasMore ? candidates.slice(0, limit) : candidates;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    // Format results
    const formattedCandidates = results.map((candidate) => {
      // Calculate skill match score
      let skillMatchScore = 0;
      let matchingSkills: string[] = [];

      if (skills.length > 0) {
        matchingSkills = candidate.skills.filter((skill) => skills.includes(skill));
        skillMatchScore = Math.round((matchingSkills.length / skills.length) * 100);
      } else if (skillsAll.length > 0) {
        matchingSkills = candidate.skills.filter((skill) => skillsAll.includes(skill));
        skillMatchScore = skillsAll.every((skill) => candidate.skills.includes(skill)) ? 100 : 0;
      }

      return {
        id: candidate.id,
        user: {
          id: candidate.user.id,
          name: candidate.user.name,
          email: candidate.user.email,
          image: candidate.user.image,
          status: candidate.user.status,
        },
        phone: candidate.phone,
        resume: candidate.resume,
        portfolio: candidate.portfolio,
        linkedIn: candidate.linkedIn,
        github: candidate.github,
        bio: candidate.bio,
        skills: candidate.skills,
        experience: candidate.experience,
        education: candidate.education,
        location: candidate.location,
        preferredJobType: candidate.preferredJobType,
        expectedSalary: candidate.expectedSalary,
        availability: candidate.availability,
        // Test information
        hasTakenTest: candidate.hasTakenTest,
        testScore: candidate.testScore,
        testPercentile: candidate.testPercentile,
        testTier: candidate.testTier,
        lastTestDate: candidate.lastTestDate,
        // Statistics
        applicationsCount: candidate._count.applications,
        placementsCount: candidate._count.placements,
        // Match scores
        ...(skills.length > 0 || skillsAll.length > 0
          ? {
              matchingSkills,
              skillMatchScore,
            }
          : {}),
        createdAt: candidate.createdAt,
      };
    });

    // Get total count for the search
    const totalCount = await prisma.candidate.count({ where });

    // Get filter statistics (aggregations)
    const [tierStats, availabilityStats, testStatusStats] = await Promise.all([
      // Count by test tier
      prisma.candidate.groupBy({
        by: ["testTier"],
        where: { ...where, testTier: undefined, hasTakenTest: true },
        _count: true,
      }),
      // Count by availability
      prisma.candidate.groupBy({
        by: ["availability"],
        where: { ...where, availability: undefined },
        _count: true,
      }),
      // Count by test status
      prisma.candidate.groupBy({
        by: ["hasTakenTest"],
        where: { ...where, hasTakenTest: undefined },
        _count: true,
      }),
    ]);

    // Format filter statistics
    const filterStats = {
      byTestTier: tierStats.reduce(
        (acc, stat) => {
          if (stat.testTier) {
            acc[stat.testTier] = stat._count;
          }
          return acc;
        },
        {} as Record<string, number>
      ),
      byAvailability: {
        available: availabilityStats.find((s) => s.availability === true)?._count || 0,
        notAvailable: availabilityStats.find((s) => s.availability === false)?._count || 0,
      },
      byTestStatus: {
        tested: testStatusStats.find((s) => s.hasTakenTest === true)?._count || 0,
        untested: testStatusStats.find((s) => s.hasTakenTest === false)?._count || 0,
      },
    };

    // Calculate experience and test score statistics
    const experienceStats = await prisma.candidate.aggregate({
      where,
      _min: { experience: true, testScore: true, testPercentile: true, expectedSalary: true },
      _max: { experience: true, testScore: true, testPercentile: true, expectedSalary: true },
      _avg: { experience: true, testScore: true, testPercentile: true, expectedSalary: true },
    });

    // Get top skills across all matching candidates
    const allMatchingCandidates = await prisma.candidate.findMany({
      where,
      select: { skills: true },
    });

    const skillFrequency: Record<string, number> = {};
    allMatchingCandidates.forEach((c) => {
      c.skills.forEach((skill) => {
        skillFrequency[skill] = (skillFrequency[skill] || 0) + 1;
      });
    });

    const topSkills = Object.entries(skillFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }));

    return NextResponse.json({
      candidates: formattedCandidates,
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
          skills,
          skillsAll,
          location,
          experienceMin,
          experienceMax,
          availability,
          preferredJobType,
          testTier: testTierParams,
          testScoreMin,
          testScoreMax,
          testPercentileMin,
          hasTakenTest: hasTakenTestParam,
          expectedSalaryMin,
          expectedSalaryMax,
          sortBy,
        },
        statistics: {
          ...filterStats,
          experienceRange: {
            min: experienceStats._min.experience,
            max: experienceStats._max.experience,
            avg: experienceStats._avg.experience
              ? Math.round(experienceStats._avg.experience)
              : null,
          },
          testScoreRange: {
            min: experienceStats._min.testScore,
            max: experienceStats._max.testScore,
            avg: experienceStats._avg.testScore
              ? Math.round(experienceStats._avg.testScore * 10) / 10
              : null,
          },
          testPercentileRange: {
            min: experienceStats._min.testPercentile,
            max: experienceStats._max.testPercentile,
            avg: experienceStats._avg.testPercentile
              ? Math.round(experienceStats._avg.testPercentile * 10) / 10
              : null,
          },
          expectedSalaryRange: {
            min: experienceStats._min.expectedSalary,
            max: experienceStats._max.expectedSalary,
            avg: experienceStats._avg.expectedSalary
              ? Math.round(experienceStats._avg.expectedSalary)
              : null,
          },
          topSkills,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        resultsCount: formattedCandidates.length,
        totalMatches: totalCount,
      },
    });
  } catch (error) {
    console.error("Candidate search error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Employer or Admin role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to search candidates",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
