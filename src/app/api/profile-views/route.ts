import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/profile-views
 * Get profile views for the current candidate
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

    if (user.role !== UserRole.CANDIDATE) {
      return NextResponse.json(
        { error: "Only candidates can view their profile views" },
        { status: 403 }
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

    // Get query parameters for pagination
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Get current date for this week calculation
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    // Fetch profile views with employer details
    const [profileViews, totalCount, weekCount, uniqueEmployers] = await Promise.all([
      prisma.profileView.findMany({
        where: { candidateId: candidate.id },
        orderBy: { viewedAt: "desc" },
        skip,
        take: limit,
        include: {
          employer: {
            select: {
              id: true,
              companyName: true,
              companyLogo: true,
              industry: true,
              location: true,
            },
          },
          job: {
            select: {
              id: true,
              title: true,
              location: true,
            },
          },
        },
      }),
      prisma.profileView.count({
        where: { candidateId: candidate.id },
      }),
      prisma.profileView.count({
        where: {
          candidateId: candidate.id,
          viewedAt: { gte: startOfWeek },
        },
      }),
      prisma.profileView.groupBy({
        by: ["employerId"],
        where: { candidateId: candidate.id },
      }),
    ]);

    // Calculate trend (comparing this week to last week)
    const lastWeekStart = new Date(startOfWeek);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const lastWeekCount = await prisma.profileView.count({
      where: {
        candidateId: candidate.id,
        viewedAt: { gte: lastWeekStart, lt: startOfWeek },
      },
    });

    const trend = lastWeekCount === 0
      ? (weekCount > 0 ? 100 : 0)
      : Math.round(((weekCount - lastWeekCount) / lastWeekCount) * 100);

    return NextResponse.json({
      views: profileViews,
      stats: {
        totalViews: totalCount,
        thisWeek: weekCount,
        uniqueViewers: uniqueEmployers.length,
        trend,
      },
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Get profile views error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile views" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/profile-views
 * Record a profile view (called by employers when viewing candidate profiles)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (user.role !== UserRole.EMPLOYER) {
      return NextResponse.json(
        { error: "Only employers can record profile views" },
        { status: 403 }
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

    const body = await req.json();
    const { candidateId, source, jobId } = body;

    if (!candidateId) {
      return NextResponse.json(
        { error: "Candidate ID is required" },
        { status: 400 }
      );
    }

    // Check if candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Record the profile view
    const profileView = await prisma.profileView.create({
      data: {
        candidateId,
        employerId: employer.id,
        source: source || "direct",
        jobId: jobId || null,
      },
      include: {
        employer: {
          select: {
            id: true,
            companyName: true,
            companyLogo: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      profileView,
    });
  } catch (error) {
    console.error("Record profile view error:", error);
    return NextResponse.json(
      { error: "Failed to record profile view" },
      { status: 500 }
    );
  }
}
