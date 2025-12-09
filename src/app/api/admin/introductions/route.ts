import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { IntroductionStatus } from "@prisma/client";

/**
 * GET /api/admin/introductions
 * Get all candidate introductions with filtering and pagination
 *
 * Query params:
 * - status: filter by introduction status
 * - employerId: filter by employer
 * - search: search by candidate name or employer company name
 * - page: page number (default: 1)
 * - limit: items per page (default: 20)
 *
 * Returns:
 * - Paginated list of introductions with candidate and employer details
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      console.log("[Admin Introductions] Unauthorized access attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const employerId = searchParams.get("employerId");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (status && status !== "all") {
      where.status = status as IntroductionStatus;
    }

    if (employerId) {
      where.employerId = employerId;
    }

    if (search) {
      where.OR = [
        {
          candidate: {
            user: { name: { contains: search, mode: "insensitive" } },
          },
        },
        {
          employer: {
            companyName: { contains: search, mode: "insensitive" },
          },
        },
      ];
    }

    // Get introductions with relations
    const [introductions, total] = await Promise.all([
      prisma.candidateIntroduction.findMany({
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
          employer: {
            select: {
              id: true,
              companyName: true,
              logo: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          job: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.candidateIntroduction.count({ where }),
    ]);

    // Format response
    const formattedIntroductions = introductions.map((intro) => ({
      id: intro.id,
      status: intro.status,
      profileViewedAt: intro.profileViewedAt,
      introRequestedAt: intro.introRequestedAt,
      candidateRespondedAt: intro.candidateRespondedAt,
      candidateResponse: intro.candidateResponse,
      introducedAt: intro.introducedAt,
      protectionStartsAt: intro.protectionStartsAt,
      protectionEndsAt: intro.protectionEndsAt,
      profileViews: intro.profileViews,
      resumeDownloads: intro.resumeDownloads,
      createdAt: intro.createdAt,
      updatedAt: intro.updatedAt,
      candidate: {
        id: intro.candidate.id,
        name: intro.candidate.user.name,
        email: intro.candidate.user.email,
        image: intro.candidate.user.image,
        userId: intro.candidate.user.id,
      },
      employer: {
        id: intro.employer.id,
        companyName: intro.employer.companyName,
        logo: intro.employer.logo,
        contactName: intro.employer.user.name,
        contactEmail: intro.employer.user.email,
        userId: intro.employer.user.id,
      },
      job: intro.job
        ? {
            id: intro.job.id,
            title: intro.job.title,
          }
        : null,
    }));

    return NextResponse.json({
      introductions: formattedIntroductions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + introductions.length < total,
      },
    });
  } catch (error) {
    console.error("[Admin Introductions] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch introductions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
