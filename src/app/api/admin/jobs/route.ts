import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole, JobStatus } from "@prisma/client";

/**
 * GET /api/admin/jobs
 * List all jobs with admin-level visibility
 *
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - status: JobStatus filter (DRAFT, PENDING_APPROVAL, ACTIVE, EXPIRED, CLOSED)
 * - search: string (search by title, company, location)
 * - employerId: string (filter by employer)
 * - sortBy: newest | oldest | title | status
 *
 * Returns:
 * - jobs: Array of jobs with employer details
 * - pagination: { total, page, limit, totalPages }
 * - stats: { byStatus }
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Require ADMIN role
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    // Filters
    const statusFilter = searchParams.get("status") as JobStatus | null;
    const searchQuery = searchParams.get("search");
    const employerId = searchParams.get("employerId");
    const sortBy = searchParams.get("sortBy") || "newest";

    // Build where clause
    const where: any = {};

    if (statusFilter) {
      where.status = statusFilter;
    }

    if (searchQuery) {
      where.OR = [
        { title: { contains: searchQuery, mode: "insensitive" } },
        { description: { contains: searchQuery, mode: "insensitive" } },
        { location: { contains: searchQuery, mode: "insensitive" } },
        {
          employer: {
            companyName: { contains: searchQuery, mode: "insensitive" },
          },
        },
      ];
    }

    if (employerId) {
      where.employerId = employerId;
    }

    // Build orderBy
    let orderBy: any = { createdAt: "desc" };
    if (sortBy === "oldest") orderBy = { createdAt: "asc" };
    if (sortBy === "title") orderBy = { title: "asc" };
    if (sortBy === "status") orderBy = { status: "asc" };

    // Fetch jobs
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          employer: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          _count: {
            select: {
              applications: true,
              savedBy: true,
            },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);

    // Get status statistics
    const statusStats = await prisma.job.groupBy({
      by: ["status"],
      _count: {
        status: true,
      },
    });

    const stats = {
      byStatus: statusStats.reduce(
        (acc, stat) => {
          acc[stat.status] = stat._count.status;
          return acc;
        },
        {} as Record<JobStatus, number>
      ),
    };

    // Format response
    const formattedJobs = jobs.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      type: job.type,
      location: job.location,
      remoteType: job.remoteType,
      experienceLevel: job.experienceLevel,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      skills: job.skills,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      deadline: job.deadline,
      employer: {
        id: job.employer.id,
        companyName: job.employer.companyName,
        companyLogo: job.employer.companyLogo,
        user: {
          id: job.employer.user.id,
          name: job.employer.user.name,
          email: job.employer.user.email,
        },
      },
      stats: {
        applications: job._count.applications,
        saves: job._count.savedBy,
      },
      // Admin-specific fields
      requiresApproval: job.status === JobStatus.PENDING_APPROVAL,
      isDraft: job.status === JobStatus.DRAFT,
      isExpired: job.status === JobStatus.EXPIRED,
    }));

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      jobs: formattedJobs,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
      },
      stats,
    });
  } catch (error) {
    console.error("Admin jobs list error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch jobs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
