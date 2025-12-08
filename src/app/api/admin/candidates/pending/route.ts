import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { VerificationStatus } from "@prisma/client";

/**
 * GET /api/admin/candidates/pending
 * Get candidates by verification status
 *
 * Query params:
 * - status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" | "all" (default: "PENDING")
 * - search: search term for name or email
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
      where.verificationStatus = status as VerificationStatus;
    }

    if (search) {
      where.OR = [
        { user: { email: { contains: search, mode: "insensitive" } } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { headline: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get candidates with pagination
    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
              createdAt: true,
              emailVerified: true,
            },
          },
          _count: {
            select: {
              applications: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.candidate.count({ where }),
    ]);

    // Get summary counts
    const [unverifiedCount, pendingCount, verifiedCount, rejectedCount] = await Promise.all([
      prisma.candidate.count({ where: { verificationStatus: VerificationStatus.UNVERIFIED } }),
      prisma.candidate.count({ where: { verificationStatus: VerificationStatus.PENDING } }),
      prisma.candidate.count({ where: { verificationStatus: VerificationStatus.VERIFIED } }),
      prisma.candidate.count({ where: { verificationStatus: VerificationStatus.REJECTED } }),
    ]);

    return NextResponse.json({
      success: true,
      candidates: candidates.map((c) => ({
        id: c.id,
        headline: c.headline,
        location: c.location,
        skills: c.skills,
        experience: c.experience,
        resume: c.resume,
        verificationStatus: c.verificationStatus,
        verifiedAt: c.verifiedAt,
        verificationNotes: c.verificationNotes,
        createdAt: c.createdAt,
        user: c.user,
        applicationsCount: c._count.applications,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        unverified: unverifiedCount,
        pending: pendingCount,
        verified: verifiedCount,
        rejected: rejectedCount,
        total: unverifiedCount + pendingCount + verifiedCount + rejectedCount,
      },
    });
  } catch (error) {
    console.error("Get pending candidates error:", error);
    return NextResponse.json(
      { error: "Failed to fetch candidates" },
      { status: 500 }
    );
  }
}
