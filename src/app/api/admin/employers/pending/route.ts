import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ApprovalStatus } from "@prisma/client";

/**
 * GET /api/admin/employers/pending
 * Get all employers pending approval
 *
 * Query params:
 * - status: "PENDING" | "APPROVED" | "REJECTED" | "all" (default: "PENDING")
 * - search: search term for company name or email
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
    const status = searchParams.get("status") || "PENDING";
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (status !== "all") {
      where.approvalStatus = status as ApprovalStatus;
    }

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { user: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    // Get employers with pagination
    const [employers, total] = await Promise.all([
      prisma.employer.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              jobs: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.employer.count({ where }),
    ]);

    // Get summary counts
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prisma.employer.count({ where: { approvalStatus: ApprovalStatus.PENDING } }),
      prisma.employer.count({ where: { approvalStatus: ApprovalStatus.APPROVED } }),
      prisma.employer.count({ where: { approvalStatus: ApprovalStatus.REJECTED } }),
    ]);

    return NextResponse.json({
      success: true,
      employers: employers.map((e) => ({
        id: e.id,
        companyName: e.companyName,
        industry: e.industry,
        companySize: e.companySize,
        website: e.website,
        location: e.location,
        description: e.description,
        logo: e.logo,
        approvalStatus: e.approvalStatus,
        approvedAt: e.approvedAt,
        rejectedAt: e.rejectedAt,
        rejectionReason: e.rejectionReason,
        createdAt: e.createdAt,
        user: e.user,
        jobsCount: e._count.jobs,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: pendingCount + approvedCount + rejectedCount,
      },
    });
  } catch (error) {
    console.error("Get pending employers error:", error);
    return NextResponse.json(
      { error: "Failed to fetch employers" },
      { status: 500 }
    );
  }
}
