import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { JobStatus } from "@prisma/client";

/**
 * GET /api/companies
 * List all companies with public profiles
 * Public route - no authentication required
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");
    const skip = (page - 1) * limit;

    // Filters
    const industry = searchParams.get("industry");
    const companySize = searchParams.get("size");
    const location = searchParams.get("location");
    const search = searchParams.get("search");
    const verified = searchParams.get("verified");

    // Build where clause
    const where: any = {
      // Only show employers with at least company name
      companyName: {
        not: null,
      },
    };

    if (industry) {
      where.industry = {
        equals: industry,
        mode: "insensitive",
      };
    }

    if (companySize) {
      where.companySize = companySize;
    }

    if (location) {
      where.location = {
        contains: location,
        mode: "insensitive",
      };
    }

    if (verified === "true") {
      where.verified = true;
    }

    // Search by company name
    if (search) {
      where.companyName = {
        contains: search,
        mode: "insensitive",
      };
    }

    // Get total count for pagination
    const totalCount = await prisma.employer.count({ where });

    // Fetch employers with job counts
    const employers = await prisma.employer.findMany({
      where,
      select: {
        id: true,
        slug: true,
        companyName: true,
        companyLogo: true,
        industry: true,
        companySize: true,
        location: true,
        description: true,
        verified: true,
        createdAt: true,
        _count: {
          select: {
            jobs: {
              where: {
                status: JobStatus.ACTIVE,
              },
            },
          },
        },
      },
      orderBy: [
        // Verified companies first
        { verified: "desc" },
        // Then by most recent
        { createdAt: "desc" },
      ],
      skip,
      take: limit,
    });

    // Get total hires for each employer
    const employerIds = employers.map((e) => e.id);
    const placementCounts = await prisma.placement.groupBy({
      by: ["employerId"],
      where: {
        employerId: { in: employerIds },
        status: { in: ["COMPLETED", "ACTIVE", "CONFIRMED"] },
      },
      _count: {
        id: true,
      },
    });

    const placementMap = new Map(
      placementCounts.map((p) => [p.employerId, p._count.id])
    );

    // Transform response
    const companies = employers.map((employer) => ({
      id: employer.id,
      slug: employer.slug,
      companyName: employer.companyName,
      companyLogo: employer.companyLogo,
      industry: employer.industry,
      companySize: employer.companySize,
      location: employer.location,
      description: employer.description
        ? employer.description.substring(0, 200) +
          (employer.description.length > 200 ? "..." : "")
        : null,
      verified: employer.verified,
      activeJobsCount: employer._count.jobs,
      totalHires: placementMap.get(employer.id) || 0,
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return NextResponse.json({
      companies,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNext,
        hasPrev,
      },
    });
  } catch (error) {
    console.error("Companies listing error:", error);
    return NextResponse.json(
      { error: "Failed to fetch companies" },
      { status: 500 }
    );
  }
}
