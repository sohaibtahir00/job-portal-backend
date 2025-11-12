import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { JobStatus } from "@prisma/client";

/**
 * GET /api/jobs/exclusive
 * Get exclusive jobs (requires skills-verified candidate)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (user.role !== "CANDIDATE") {
      return NextResponse.json(
        { error: "Only candidates can view exclusive jobs" },
        { status: 403 }
      );
    }

    // Check if candidate has completed skills assessment
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
      include: {
        skillsAssessments: {
          orderBy: { completedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    // Require skills assessment completion
    const hasCompletedAssessment = candidate.skillsAssessments.length > 0;

    if (!hasCompletedAssessment) {
      return NextResponse.json(
        {
          error: "Skills assessment required",
          message: "Complete your skills assessment to unlock exclusive jobs",
          requiresAssessment: true,
        },
        { status: 403 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");
    const niche = searchParams.get("niche");

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      isExclusive: true,
      status: JobStatus.ACTIVE,
    };

    if (niche) {
      where.niche = niche;
    }

    // Get exclusive jobs
    const [jobs, totalCount] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          employer: {
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
          _count: {
            select: {
              applications: true,
            },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);

    return NextResponse.json({
      jobs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      hasAccess: true,
    });
  } catch (error) {
    console.error("Get exclusive jobs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch exclusive jobs" },
      { status: 500 }
    );
  }
}
