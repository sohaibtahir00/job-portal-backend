import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/assessments
 * Get all skills assessments with filters
 *
 * Query params:
 * - search: search by candidate name or email
 * - tier: filter by tier (Elite, Advanced, Proficient, Intermediate, Beginner)
 * - minScore: minimum score filter
 * - maxScore: maximum score filter
 * - startDate: filter by completion date start
 * - endDate: filter by completion date end
 * - page: page number (default: 1)
 * - limit: items per page (default: 20)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const tier = searchParams.get("tier");
    const minScore = searchParams.get("minScore");
    const maxScore = searchParams.get("maxScore");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (tier) {
      where.tier = tier;
    }

    if (minScore) {
      where.score = { ...where.score, gte: parseInt(minScore) };
    }

    if (maxScore) {
      where.score = { ...where.score, lte: parseInt(maxScore) };
    }

    if (startDate) {
      where.completedAt = { ...where.completedAt, gte: new Date(startDate) };
    }

    if (endDate) {
      where.completedAt = { ...where.completedAt, lte: new Date(endDate) };
    }

    if (search) {
      where.candidate = {
        user: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
      };
    }

    // Get assessments with pagination
    const [assessments, total] = await Promise.all([
      prisma.skillsAssessment.findMany({
        where,
        include: {
          candidate: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
        },
        orderBy: { completedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.skillsAssessment.count({ where }),
    ]);

    // Get tier distribution
    const [eliteCount, advancedCount, proficientCount, intermediateCount, beginnerCount] = await Promise.all([
      prisma.skillsAssessment.count({ where: { tier: "Elite" } }),
      prisma.skillsAssessment.count({ where: { tier: "Advanced" } }),
      prisma.skillsAssessment.count({ where: { tier: "Proficient" } }),
      prisma.skillsAssessment.count({ where: { tier: "Intermediate" } }),
      prisma.skillsAssessment.count({ where: { tier: "Beginner" } }),
    ]);

    // Calculate average score
    const avgScoreResult = await prisma.skillsAssessment.aggregate({
      _avg: { score: true },
    });

    return NextResponse.json({
      success: true,
      assessments: assessments.map((a) => ({
        id: a.id,
        score: a.score,
        tier: a.tier,
        duration: a.duration,
        durationFormatted: formatDuration(a.duration),
        completedAt: a.completedAt,
        sectionScores: JSON.parse(a.sectionScores),
        candidate: {
          id: a.candidate.id,
          name: a.candidate.user.name,
          email: a.candidate.user.email,
          image: a.candidate.user.image,
          headline: a.candidate.headline,
        },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        total: eliteCount + advancedCount + proficientCount + intermediateCount + beginnerCount,
        averageScore: Math.round(avgScoreResult._avg.score || 0),
        tierDistribution: {
          elite: eliteCount,
          advanced: advancedCount,
          proficient: proficientCount,
          intermediate: intermediateCount,
          beginner: beginnerCount,
        },
      },
    });
  } catch (error) {
    console.error("Get assessments error:", error);
    return NextResponse.json(
      { error: "Failed to fetch assessments" },
      { status: 500 }
    );
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
