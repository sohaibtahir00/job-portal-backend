import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole, PlacementStatus, PaymentStatus } from "@prisma/client";

/**
 * GET /api/admin/placements/stats
 * Get placement financial statistics (admin only)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Build date filter
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = dateFilter;
    }

    // Get all placements with invoices
    const placements = await prisma.placement.findMany({
      where,
      include: {
        invoices: true,
      },
    });

    // Calculate statistics
    const totalPlacements = placements.length;
    const totalFees = placements.reduce((sum, p) => sum + (p.placementFee || 0), 0);

    // Check payment status using the paymentStatus field on placement
    const paidPlacements = placements.filter(
      (p) => p.paymentStatus === PaymentStatus.FULLY_PAID
    );
    const paidFees = paidPlacements.reduce((sum, p) => sum + (p.placementFee || 0), 0);

    const pendingPaymentPlacements = placements.filter(
      (p) => p.paymentStatus === PaymentStatus.PENDING || p.paymentStatus === PaymentStatus.UPFRONT_PAID
    );
    const pendingFees = pendingPaymentPlacements.reduce((sum, p) => sum + (p.placementFee || 0), 0);

    // Status-based filtering using PlacementStatus enum
    const pendingPlacements = placements.filter((p) => p.status === PlacementStatus.PENDING);
    const confirmedPlacements = placements.filter((p) => p.status === PlacementStatus.CONFIRMED);
    const completedPlacements = placements.filter((p) => p.status === PlacementStatus.COMPLETED);
    const cancelledPlacements = placements.filter((p) => p.status === PlacementStatus.CANCELLED);

    // Calculate average fee
    const averageFee = totalPlacements > 0 ? totalFees / totalPlacements : 0;

    // Get current month stats
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyPlacements = placements.filter(
      (p) => new Date(p.createdAt) >= firstDayOfMonth
    );
    const monthlyRevenue = monthlyPlacements.reduce((sum, p) => {
      if (p.paymentStatus === PaymentStatus.FULLY_PAID) {
        return sum + (p.placementFee || 0);
      }
      return sum;
    }, 0);

    return NextResponse.json({
      success: true,
      stats: {
        totalPlacements,
        totalFees,
        paidFees,
        pendingFees,
        averageFee,
        monthlyRevenue,
        byStatus: {
          pending: pendingPlacements.length,
          confirmed: confirmedPlacements.length,
          completed: completedPlacements.length,
          cancelled: cancelledPlacements.length,
        },
        byPayment: {
          paid: paidPlacements.length,
          pending: pendingPaymentPlacements.length,
        },
      },
    });
  } catch (error: any) {
    console.error("Get placement stats error:", error);
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch placement statistics" },
      { status: 500 }
    );
  }
}
