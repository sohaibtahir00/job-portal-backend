import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole, PaymentStatus } from "@prisma/client";
import { formatCurrency } from "@/lib/stripe";

/**
 * PATCH /api/placements/[id]/payment
 * Record manual payment for a placement (for admin use or cash/check payments)
 * This is separate from Stripe payments which are handled via webhooks
 *
 * Requires ADMIN role
 *
 * Request body:
 * {
 *   "paymentType": "upfront" | "remaining" | "full",
 *   "amount": number (in cents, optional - defaults to expected amount),
 *   "paymentMethod": "cash" | "check" | "bank_transfer" | "other",
 *   "transactionId": string (optional),
 *   "notes": string (optional)
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Only admins can manually record payments
    await requireAnyRole([UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const { id } = params;

    // Get placement
    const placement = await prisma.placement.findUnique({
      where: { id },
      include: {
        employer: true,
        candidate: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
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

    const body = await request.json();
    const {
      paymentType,
      amount,
      paymentMethod,
      transactionId,
      notes,
    } = body;

    // Validate payment type
    if (!["upfront", "remaining", "full"].includes(paymentType)) {
      return NextResponse.json(
        { error: "Invalid payment type. Must be 'upfront', 'remaining', or 'full'" },
        { status: 400 }
      );
    }

    // Validate payment method
    if (!paymentMethod) {
      return NextResponse.json(
        { error: "Payment method is required" },
        { status: 400 }
      );
    }

    const updateData: any = {};
    let recordedAmount = 0;
    let paymentDescription = "";

    if (paymentType === "upfront") {
      // Check if already paid
      if (placement.upfrontPaidAt) {
        return NextResponse.json(
          {
            error: "Upfront payment already recorded",
            paidAt: placement.upfrontPaidAt,
          },
          { status: 400 }
        );
      }

      recordedAmount = amount || placement.upfrontAmount || 0;
      updateData.upfrontPaidAt = new Date();
      updateData.paymentStatus = PaymentStatus.UPFRONT_PAID;
      paymentDescription = "Upfront payment (50%)";

    } else if (paymentType === "remaining") {
      // Check if upfront was paid first
      if (!placement.upfrontPaidAt) {
        return NextResponse.json(
          { error: "Upfront payment must be recorded before remaining payment" },
          { status: 400 }
        );
      }

      // Check if already paid
      if (placement.remainingPaidAt) {
        return NextResponse.json(
          {
            error: "Remaining payment already recorded",
            paidAt: placement.remainingPaidAt,
          },
          { status: 400 }
        );
      }

      recordedAmount = amount || placement.remainingAmount || 0;
      updateData.remainingPaidAt = new Date();
      updateData.paymentStatus = PaymentStatus.FULLY_PAID;
      paymentDescription = "Remaining payment (50%)";

    } else if (paymentType === "full") {
      // Record full payment at once
      if (placement.upfrontPaidAt && placement.remainingPaidAt) {
        return NextResponse.json(
          { error: "Full payment already recorded" },
          { status: 400 }
        );
      }

      recordedAmount = amount || placement.placementFee || 0;
      updateData.upfrontPaidAt = new Date();
      updateData.remainingPaidAt = new Date();
      updateData.paymentStatus = PaymentStatus.FULLY_PAID;
      paymentDescription = "Full payment";
    }

    // Update placement with payment info
    const notesText = [
      `${paymentDescription} recorded`,
      `Method: ${paymentMethod}`,
      transactionId ? `Transaction ID: ${transactionId}` : null,
      notes ? `Notes: ${notes}` : null,
      `Recorded by: ${user.name} (${user.email})`,
      `Recorded at: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n");

    updateData.notes = placement.notes
      ? `${placement.notes}\n\n---\n${notesText}`
      : notesText;

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
      },
    });

    // Update employer's totalSpent if fully paid
    if (updateData.paymentStatus === PaymentStatus.FULLY_PAID && placement.employerId) {
      await prisma.employer.update({
        where: { id: placement.employerId },
        data: {
          totalSpent: {
            increment: placement.placementFee || 0,
          },
        },
      });
    }

    return NextResponse.json({
      message: `${paymentDescription} recorded successfully`,
      placement: updatedPlacement,
      payment: {
        type: paymentType,
        amount: recordedAmount,
        amountFormatted: formatCurrency(recordedAmount),
        method: paymentMethod,
        transactionId,
        recordedBy: user.name,
        recordedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Payment recording error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions. Admin role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to record payment",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/placements/[id]/payment
 * Get payment history and status for a placement
 *
 * Access control:
 * - ADMIN: Can view any placement's payment info
 * - EMPLOYER: Can view their company's placements payment info
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

    // Get placement
    const placement = await prisma.placement.findUnique({
      where: { id },
      include: {
        employer: true,
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
    } else if (user.role === UserRole.EMPLOYER) {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });
      hasAccess = employer?.id === placement.employerId;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Forbidden. You don't have access to this placement's payment information." },
        { status: 403 }
      );
    }

    // Build payment history
    const paymentHistory = [];

    if (placement.upfrontPaidAt) {
      paymentHistory.push({
        type: "upfront",
        amount: placement.upfrontAmount || 0,
        amountFormatted: formatCurrency(placement.upfrontAmount || 0),
        paidAt: placement.upfrontPaidAt,
        paymentIntentId: placement.stripePaymentIntentId,
        method: placement.stripePaymentIntentId ? "stripe" : "manual",
      });
    }

    if (placement.remainingPaidAt) {
      paymentHistory.push({
        type: "remaining",
        amount: placement.remainingAmount || 0,
        amountFormatted: formatCurrency(placement.remainingAmount || 0),
        paidAt: placement.remainingPaidAt,
        paymentIntentId: placement.stripePaymentIntentId2,
        method: placement.stripePaymentIntentId2 ? "stripe" : "manual",
      });
    }

    // Calculate payment summary
    const totalPaid = (placement.upfrontPaidAt ? placement.upfrontAmount || 0 : 0) +
                      (placement.remainingPaidAt ? placement.remainingAmount || 0 : 0);

    const totalDue = placement.placementFee || 0;
    const remaining = totalDue - totalPaid;

    return NextResponse.json({
      placementId: placement.id,
      paymentStatus: placement.paymentStatus,
      summary: {
        totalDue,
        totalDueFormatted: formatCurrency(totalDue),
        totalPaid,
        totalPaidFormatted: formatCurrency(totalPaid),
        remaining,
        remainingFormatted: formatCurrency(remaining),
        percentagePaid: totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0,
      },
      schedule: {
        upfront: {
          amount: placement.upfrontAmount || 0,
          amountFormatted: formatCurrency(placement.upfrontAmount || 0),
          dueDate: placement.startDate,
          paidAt: placement.upfrontPaidAt,
          status: placement.upfrontPaidAt ? "paid" : "pending",
        },
        remaining: {
          amount: placement.remainingAmount || 0,
          amountFormatted: formatCurrency(placement.remainingAmount || 0),
          dueDate: placement.upfrontPaidAt
            ? new Date(placement.upfrontPaidAt.getTime() + 30 * 24 * 60 * 60 * 1000)
            : new Date(placement.startDate.getTime() + 30 * 24 * 60 * 60 * 1000),
          paidAt: placement.remainingPaidAt,
          status: placement.remainingPaidAt ? "paid" : placement.upfrontPaidAt ? "pending" : "locked",
        },
      },
      history: paymentHistory,
    });
  } catch (error) {
    console.error("Payment info fetch error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch payment information",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
