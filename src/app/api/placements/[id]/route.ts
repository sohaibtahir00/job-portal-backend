import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { formatCurrency, STRIPE_CONFIG } from "@/lib/stripe";

/**
 * GET /api/placements/[id]
 * Get detailed placement information including payment schedule
 *
 * Access control:
 * - ADMIN: Can view any placement
 * - EMPLOYER: Can view their company's placements
 * - CANDIDATE: Can view their own placements
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = params;

    // Get placement with full details
    const placement = await prisma.placement.findUnique({
      where: { id },
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
            remote: true,
          },
        },
      },
    });

    if (!placement) {
      return NextResponse.json(
        { error: "Placement not found" },
        { status: 404 }
      );
    }

    // Check access permissions
    let hasAccess = false;

    if (user.role === UserRole.ADMIN) {
      hasAccess = true;
    } else if (user.role === UserRole.CANDIDATE) {
      const candidate = await prisma.candidate.findUnique({
        where: { userId: user.id },
      });
      hasAccess = candidate?.id === placement.candidateId;
    } else if (user.role === UserRole.EMPLOYER) {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });
      hasAccess = employer?.id === placement.employerId;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Forbidden. You don't have access to this placement." },
        { status: 403 }
      );
    }

    // Calculate payment schedule
    const remainingPaymentDueDate = placement.upfrontPaidAt
      ? new Date(placement.upfrontPaidAt.getTime() + STRIPE_CONFIG.placementFee.remainingDueDays * 24 * 60 * 60 * 1000)
      : new Date(placement.startDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from start

    const paymentSchedule = {
      upfrontPayment: {
        amount: placement.upfrontAmount || 0,
        amountFormatted: formatCurrency(placement.upfrontAmount || 0),
        dueDate: placement.startDate,
        paidAt: placement.upfrontPaidAt,
        status: placement.upfrontPaidAt ? "paid" : "pending",
        paymentIntentId: placement.stripePaymentIntentId,
      },
      remainingPayment: {
        amount: placement.remainingAmount || 0,
        amountFormatted: formatCurrency(placement.remainingAmount || 0),
        dueDate: remainingPaymentDueDate,
        paidAt: placement.remainingPaidAt,
        status: placement.remainingPaidAt ? "paid" : placement.upfrontPaidAt ? "pending" : "locked",
        paymentIntentId: placement.stripePaymentIntentId2,
      },
      total: {
        amount: placement.placementFee || 0,
        amountFormatted: formatCurrency(placement.placementFee || 0),
        paid: (placement.upfrontPaidAt ? placement.upfrontAmount || 0 : 0) +
              (placement.remainingPaidAt ? placement.remainingAmount || 0 : 0),
        paidFormatted: formatCurrency(
          (placement.upfrontPaidAt ? placement.upfrontAmount || 0 : 0) +
          (placement.remainingPaidAt ? placement.remainingAmount || 0 : 0)
        ),
        remaining: (placement.placementFee || 0) -
                   ((placement.upfrontPaidAt ? placement.upfrontAmount || 0 : 0) +
                    (placement.remainingPaidAt ? placement.remainingAmount || 0 : 0)),
        remainingFormatted: formatCurrency(
          (placement.placementFee || 0) -
          ((placement.upfrontPaidAt ? placement.upfrontAmount || 0 : 0) +
           (placement.remainingPaidAt ? placement.remainingAmount || 0 : 0))
        ),
      },
    };

    // Calculate guarantee period info
    const now = new Date();
    const guaranteeInfo = {
      days: placement.guaranteePeriodDays,
      startDate: placement.startDate,
      endDate: placement.guaranteeEndDate,
      daysRemaining: placement.guaranteeEndDate
        ? Math.max(0, Math.ceil((placement.guaranteeEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : 0,
      isActive: placement.guaranteeEndDate ? placement.guaranteeEndDate > now : false,
      hasExpired: placement.guaranteeEndDate ? placement.guaranteeEndDate <= now : false,
    };

    // Calculate placement duration
    const placementDuration = {
      startDate: placement.startDate,
      endDate: placement.endDate,
      daysActive: placement.endDate
        ? Math.ceil((placement.endDate.getTime() - placement.startDate.getTime()) / (1000 * 60 * 60 * 24))
        : Math.ceil((now.getTime() - placement.startDate.getTime()) / (1000 * 60 * 60 * 24)),
      isActive: !placement.endDate,
    };

    // Format salary information
    const salaryInfo = {
      annual: placement.salary || 0,
      annualFormatted: formatCurrency(placement.salary || 0),
      monthly: placement.salary ? Math.round(placement.salary / 12) : 0,
      monthlyFormatted: placement.salary ? formatCurrency(Math.round(placement.salary / 12)) : "$0.00",
      feePercentage: placement.feePercentage,
      placementFee: placement.placementFee || 0,
      placementFeeFormatted: formatCurrency(placement.placementFee || 0),
    };

    return NextResponse.json({
      placement: {
        ...placement,
        paymentSchedule,
        guaranteeInfo,
        placementDuration,
        salaryInfo,
      },
    });
  } catch (error) {
    console.error("Placement fetch error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch placement details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/placements/[id]
 * Update placement details
 *
 * Access control:
 * - ADMIN: Can update any placement
 * - EMPLOYER: Can update their company's placements
 *
 * Request body:
 * {
 *   "status": PlacementStatus (optional),
 *   "endDate": ISO date string (optional),
 *   "notes": string (optional)
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.EMPLOYER) {
      return NextResponse.json(
        { error: "Forbidden. Only employers and admins can update placements." },
        { status: 403 }
      );
    }

    const { id } = params;

    // Get placement
    const placement = await prisma.placement.findUnique({
      where: { id },
    });

    if (!placement) {
      return NextResponse.json(
        { error: "Placement not found" },
        { status: 404 }
      );
    }

    // Check permissions for employer
    if (user.role === UserRole.EMPLOYER) {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });

      if (!employer || employer.id !== placement.employerId) {
        return NextResponse.json(
          { error: "Forbidden. You can only update your company's placements." },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { status, endDate, notes } = body;

    // Build update data
    const updateData: any = {};

    if (status !== undefined) {
      updateData.status = status;

      // If setting to COMPLETED, also set endDate if not already set
      if (status === "COMPLETED" && !placement.endDate && !endDate) {
        updateData.endDate = new Date();
      }
    }

    if (endDate !== undefined) {
      updateData.endDate = endDate ? new Date(endDate) : null;

      // If setting endDate, update candidate availability
      if (endDate) {
        await prisma.candidate.update({
          where: { id: placement.candidateId },
          data: { availability: true },
        });
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    // Update placement
    const updatedPlacement = await prisma.placement.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({
      message: "Placement updated successfully",
      placement: updatedPlacement,
    });
  } catch (error) {
    console.error("Placement update error:", error);

    return NextResponse.json(
      {
        error: "Failed to update placement",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/placements/[id]
 * Cancel a placement (soft delete)
 *
 * Access control:
 * - ADMIN: Can cancel any placement
 * - EMPLOYER: Can cancel their company's placements
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.EMPLOYER) {
      return NextResponse.json(
        { error: "Forbidden. Only employers and admins can cancel placements." },
        { status: 403 }
      );
    }

    const { id } = params;

    // Get placement
    const placement = await prisma.placement.findUnique({
      where: { id },
    });

    if (!placement) {
      return NextResponse.json(
        { error: "Placement not found" },
        { status: 404 }
      );
    }

    // Check permissions for employer
    if (user.role === UserRole.EMPLOYER) {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });

      if (!employer || employer.id !== placement.employerId) {
        return NextResponse.json(
          { error: "Forbidden. You can only cancel your company's placements." },
          { status: 403 }
        );
      }
    }

    // Soft delete by setting status to CANCELLED
    const cancelledPlacement = await prisma.placement.update({
      where: { id },
      data: {
        status: "CANCELLED",
        endDate: new Date(),
      },
    });

    // Update candidate availability back to true
    await prisma.candidate.update({
      where: { id: placement.candidateId },
      data: { availability: true },
    });

    return NextResponse.json({
      message: "Placement cancelled successfully",
      placement: cancelledPlacement,
    });
  } catch (error) {
    console.error("Placement cancellation error:", error);

    return NextResponse.json(
      {
        error: "Failed to cancel placement",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
