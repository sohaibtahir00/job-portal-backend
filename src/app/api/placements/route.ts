import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole, PlacementStatus, PaymentStatus, ApplicationStatus } from "@prisma/client";
import { calculatePlacementFeeAmounts } from "@/lib/stripe";

/**
 * POST /api/placements
 * Create a new placement record when a candidate is hired
 * Requires EMPLOYER or ADMIN role
 *
 * Request body:
 * {
 *   "candidateId": "string",
 *   "jobId": "string" (optional),
 *   "jobTitle": "string",
 *   "companyName": "string" (optional, defaults to employer's company),
 *   "startDate": "ISO date string",
 *   "salary": number (in cents),
 *   "feePercentage": number (optional, default 18),
 *   "guaranteePeriodDays": number (optional, default 90),
 *   "notes": "string" (optional)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require employer or admin role
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get employer profile
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!employer && user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Employer profile not found. Please create your profile first." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      candidateId,
      jobId,
      jobTitle,
      companyName,
      startDate,
      salary,
      feePercentage = 18,
      guaranteePeriodDays = 90,
      notes,
    } = body;

    // Validate required fields
    if (!candidateId || !jobTitle || !startDate || !salary) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          required: ["candidateId", "jobTitle", "startDate", "salary"],
        },
        { status: 400 }
      );
    }

    // Validate candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Validate job if provided
    let job = null;
    if (jobId) {
      job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          employer: true,
        },
      });

      if (!job) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      // Verify job belongs to this employer (unless admin)
      if (user.role !== UserRole.ADMIN && employer && job.employerId !== employer.id) {
        return NextResponse.json(
          { error: "Forbidden. You can only create placements for your own jobs." },
          { status: 403 }
        );
      }
    }

    // Validate salary
    if (typeof salary !== "number" || salary <= 0) {
      return NextResponse.json(
        { error: "Salary must be a positive number (in cents)" },
        { status: 400 }
      );
    }

    // Validate fee percentage
    if (typeof feePercentage !== "number" || feePercentage < 0 || feePercentage > 100) {
      return NextResponse.json(
        { error: "Fee percentage must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Calculate placement fee (18% of annual salary by default)
    const placementFee = Math.round(salary * (feePercentage / 100));
    const { upfrontAmount, remainingAmount } = calculatePlacementFeeAmounts(placementFee);

    // Calculate guarantee end date
    const startDateObj = new Date(startDate);
    const guaranteeEndDate = new Date(startDateObj);
    guaranteeEndDate.setDate(guaranteeEndDate.getDate() + guaranteePeriodDays);

    // Get company name
    const finalCompanyName = companyName || employer?.companyName || job?.employer?.companyName || "Unknown Company";

    // Create placement
    const placement = await prisma.placement.create({
      data: {
        candidateId,
        employerId: employer?.id || job?.employerId,
        jobId,
        jobTitle,
        companyName: finalCompanyName,
        startDate: startDateObj,
        salary,
        feePercentage,
        placementFee,
        upfrontAmount,
        remainingAmount,
        guaranteePeriodDays,
        guaranteeEndDate,
        status: PlacementStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        notes,
      },
      include: {
        candidate: {
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
        job: {
          select: {
            id: true,
            title: true,
            type: true,
          },
        },
      },
    });

    // If there's an associated job application, update it to ACCEPTED
    if (jobId) {
      await prisma.application.updateMany({
        where: {
          jobId,
          candidateId,
          status: {
            not: ApplicationStatus.ACCEPTED,
          },
        },
        data: {
          status: ApplicationStatus.ACCEPTED,
        },
      });
    }

    // Update candidate availability to false (they got placed)
    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        availability: false,
      },
    });

    return NextResponse.json(
      {
        message: "Placement created successfully",
        placement,
        paymentSchedule: {
          upfrontPayment: {
            amount: upfrontAmount,
            dueDate: startDateObj,
            status: "pending",
          },
          remainingPayment: {
            amount: remainingAmount,
            dueDate: new Date(startDateObj.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days later
            status: "pending",
          },
        },
        guaranteePeriod: {
          days: guaranteePeriodDays,
          endDate: guaranteeEndDate,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Placement creation error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions. Employer role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to create placement",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/placements
 * List all placements with filtering
 * Role-based access:
 * - ADMIN: See all placements
 * - EMPLOYER: See placements for their company
 * - CANDIDATE: See their own placements
 *
 * Query parameters:
 * - status: Filter by placement status
 * - paymentStatus: Filter by payment status
 * - candidateId: Filter by candidate
 * - employerId: Filter by employer
 * - page: Page number (default 1)
 * - limit: Items per page (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const paymentStatus = searchParams.get("paymentStatus");
    const candidateIdParam = searchParams.get("candidateId");
    const employerIdParam = searchParams.get("employerId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const skip = (page - 1) * limit;

    // Build where clause based on role
    const where: any = {};

    if (user.role === UserRole.CANDIDATE) {
      // Candidates can only see their own placements
      const candidate = await prisma.candidate.findUnique({
        where: { userId: user.id },
      });

      if (!candidate) {
        return NextResponse.json({ placements: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      }

      where.candidateId = candidate.id;
    } else if (user.role === UserRole.EMPLOYER) {
      // Employers can only see their company's placements
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });

      if (!employer) {
        return NextResponse.json({ placements: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      }

      where.employerId = employer.id;
    }
    // Admins can see all placements (no additional filter)

    // Apply filters
    if (status) {
      where.status = status;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (candidateIdParam && user.role === UserRole.ADMIN) {
      where.candidateId = candidateIdParam;
    }

    if (employerIdParam && user.role === UserRole.ADMIN) {
      where.employerId = employerIdParam;
    }

    // Get total count for pagination
    const total = await prisma.placement.count({ where });

    // Get placements
    const placements = await prisma.placement.findMany({
      where,
      include: {
        candidate: {
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
        job: {
          select: {
            id: true,
            title: true,
            type: true,
            location: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    return NextResponse.json({
      placements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Placements fetch error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch placements",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
