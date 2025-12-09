import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { FlagStatus } from "@prisma/client";

/**
 * GET /api/admin/circumvention
 * Get all circumvention flags with filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as FlagStatus | null;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Build where clause
    const whereClause: Record<string, unknown> = {};

    if (status) {
      whereClause.status = status;
    }

    // Get flags with pagination
    const [flags, total] = await Promise.all([
      prisma.circumventionFlag.findMany({
        where: whereClause,
        include: {
          introduction: {
            include: {
              candidate: {
                include: {
                  user: {
                    select: {
                      name: true,
                      email: true,
                    },
                  },
                },
              },
              employer: {
                select: {
                  id: true,
                  companyName: true,
                  user: {
                    select: {
                      email: true,
                    },
                  },
                },
              },
              job: {
                select: {
                  title: true,
                  salaryMin: true,
                  salaryMax: true,
                },
              },
            },
          },
        },
        orderBy: [
          { status: "asc" }, // OPEN first
          { detectedAt: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.circumventionFlag.count({ where: whereClause }),
    ]);

    // Format response
    const formattedFlags = flags.map((flag) => {
      let evidence: Record<string, unknown> = {};
      try {
        evidence = JSON.parse(flag.evidence);
      } catch {
        evidence = { raw: flag.evidence };
      }

      return {
        id: flag.id,
        status: flag.status,
        detectedAt: flag.detectedAt,
        detectionMethod: flag.detectionMethod,
        evidence,
        estimatedSalary: flag.estimatedSalary?.toString() || null,
        estimatedFeeOwed: flag.estimatedFeeOwed?.toString() || null,
        feePercentage: flag.feePercentage?.toString() || null,
        resolvedAt: flag.resolvedAt,
        resolution: flag.resolution,
        resolutionNotes: flag.resolutionNotes,
        invoiceSentAt: flag.invoiceSentAt,
        invoiceAmount: flag.invoiceAmount?.toString() || null,
        invoicePaidAt: flag.invoicePaidAt,
        introduction: {
          id: flag.introduction.id,
          introducedAt: flag.introduction.introducedAt,
          status: flag.introduction.status,
        },
        candidate: {
          name: flag.introduction.candidate.user.name,
          email: flag.introduction.candidate.user.email,
        },
        employer: {
          id: flag.introduction.employer.id,
          companyName: flag.introduction.employer.companyName,
          email: flag.introduction.employer.user.email,
        },
        job: flag.introduction.job
          ? {
              title: flag.introduction.job.title,
              salaryMin: flag.introduction.job.salaryMin?.toString() || null,
              salaryMax: flag.introduction.job.salaryMax?.toString() || null,
            }
          : null,
        createdAt: flag.createdAt,
        updatedAt: flag.updatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      flags: formattedFlags,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[Admin Circumvention] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch circumvention flags" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/circumvention
 * Create a new circumvention flag manually
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json();
    const {
      introductionId,
      detectionMethod,
      evidence,
      estimatedSalary,
      feePercentage,
    } = body;

    if (!introductionId) {
      return NextResponse.json(
        { error: "introductionId is required" },
        { status: 400 }
      );
    }

    // Verify introduction exists
    const introduction = await prisma.candidateIntroduction.findUnique({
      where: { id: introductionId },
      include: {
        employer: {
          select: { companyName: true },
        },
        candidate: {
          include: {
            user: { select: { name: true } },
          },
        },
      },
    });

    if (!introduction) {
      return NextResponse.json(
        { error: "Introduction not found" },
        { status: 404 }
      );
    }

    // Calculate estimated fee if salary and percentage provided
    let estimatedFeeOwed = null;
    if (estimatedSalary && feePercentage) {
      estimatedFeeOwed = (parseFloat(estimatedSalary) * parseFloat(feePercentage)) / 100;
    }

    // Create flag
    const flag = await prisma.circumventionFlag.create({
      data: {
        introductionId,
        detectionMethod: detectionMethod || "manual",
        evidence: typeof evidence === "string" ? evidence : JSON.stringify(evidence || {}),
        estimatedSalary: estimatedSalary ? parseFloat(estimatedSalary) : null,
        feePercentage: feePercentage ? parseFloat(feePercentage) : null,
        estimatedFeeOwed,
        status: FlagStatus.OPEN,
      },
    });

    console.log(
      `[Admin Circumvention] Created flag ${flag.id} for introduction ${introductionId} (${introduction.candidate.user.name} → ${introduction.employer.companyName})`
    );

    return NextResponse.json({
      success: true,
      flag: {
        id: flag.id,
        status: flag.status,
        detectedAt: flag.detectedAt,
      },
    });
  } catch (error) {
    console.error("[Admin Circumvention POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to create circumvention flag" },
      { status: 500 }
    );
  }
}
