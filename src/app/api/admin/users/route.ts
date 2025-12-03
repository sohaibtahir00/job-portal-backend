import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

/**
 * GET /api/admin/users
 * List all users with admin-level visibility
 *
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - role: UserRole filter (ADMIN, EMPLOYER, CANDIDATE)
 * - search: string (search by name, email)
 * - status: "active" | "suspended" | "all" (default: all)
 * - sortBy: newest | oldest | name | email | role
 * - includeStats: boolean (include user activity stats)
 *
 * Returns:
 * - users: Array of users with role-specific details
 * - pagination: { total, page, limit, totalPages }
 * - stats: { byRole, byStatus }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    // Require ADMIN role
    if (!user || user.role !== UserRole.ADMIN) {
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
    const roleFilter = searchParams.get("role") as UserRole | null;
    const searchQuery = searchParams.get("search");
    const statusFilter = searchParams.get("status") || "all";
    const sortBy = searchParams.get("sortBy") || "newest";
    const includeStats = searchParams.get("includeStats") === "true";

    // Build where clause
    const where: any = {};

    if (roleFilter) {
      where.role = roleFilter;
    }

    if (searchQuery) {
      where.OR = [
        { name: { contains: searchQuery, mode: "insensitive" } },
        { email: { contains: searchQuery, mode: "insensitive" } },
      ];
    }

    if (statusFilter === "active") {
      where.suspendedAt = null;
    } else if (statusFilter === "suspended") {
      where.suspendedAt = { not: null };
    }

    // Build orderBy
    let orderBy: any = { createdAt: "desc" };
    if (sortBy === "oldest") orderBy = { createdAt: "asc" };
    if (sortBy === "name") orderBy = { name: "asc" };
    if (sortBy === "email") orderBy = { email: "asc" };
    if (sortBy === "role") orderBy = { role: "asc" };

    // Fetch users
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          candidate: includeStats
            ? {
                include: {
                  _count: {
                    select: {
                      applications: true,
                      savedJobs: true,
                    },
                  },
                },
              }
            : true,
          employer: includeStats
            ? {
                include: {
                  _count: {
                    select: {
                      jobs: true,
                      placements: true,
                    },
                  },
                },
              }
            : true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Get role statistics
    const roleStats = await prisma.user.groupBy({
      by: ["role"],
      _count: {
        role: true,
      },
    });

    // Get status statistics
    const [activeCount, suspendedCount] = await Promise.all([
      prisma.user.count({ where: { suspendedAt: null } }),
      prisma.user.count({ where: { suspendedAt: { not: null } } }),
    ]);

    const stats = {
      byRole: roleStats.reduce(
        (acc, stat) => {
          acc[stat.role] = stat._count.role;
          return acc;
        },
        {} as Record<UserRole, number>
      ),
      byStatus: {
        active: activeCount,
        suspended: suspendedCount,
      },
    };

    // Format response
    const formattedUsers = users.map((user) => {
      const baseUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        suspendedAt: user.suspendedAt,
        suspensionReason: user.suspensionReason,
        isSuspended: !!user.suspendedAt,
      };

      // Add role-specific data
      if (user.role === UserRole.CANDIDATE && user.candidate) {
        return {
          ...baseUser,
          candidate: {
            id: user.candidate.id,
            phone: user.candidate.phone,
            location: user.candidate.location,
            skills: user.candidate.skills,
            testTier: user.candidate.testTier,
            testScore: user.candidate.testScore,
            testPercentile: user.candidate.testPercentile,
            profileCompleteness: user.candidate.profileCompleteness,
            availability: user.candidate.availability,
            resume: user.candidate.resume,
            ...(includeStats && {
              stats: {
                applications: user.candidate._count?.applications || 0,
                savedJobs: user.candidate._count?.savedJobs || 0,
              },
            }),
          },
        };
      } else if (user.role === UserRole.EMPLOYER && user.employer) {
        return {
          ...baseUser,
          employer: {
            id: user.employer.id,
            companyName: user.employer.companyName,
            companyWebsite: user.employer.companyWebsite,
            companyLogo: user.employer.companyLogo,
            industry: user.employer.industry,
            companySize: user.employer.companySize,
            ...(includeStats && {
              stats: {
                jobs: user.employer._count?.jobs || 0,
                placements: user.employer._count?.placements || 0,
              },
            }),
          },
        };
      }

      return baseUser;
    });

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      users: formattedUsers,
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
    console.error("Admin users list error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch users",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
