import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/admin/placements/stats
 * Get placement financial statistics (admin only)
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");

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

    // Get all placements
    const placements = await prisma.placement.findMany({
      where,
      include: {
        invoice: true,
      },
    });

    // Calculate statistics
    const totalPlacements = placements.length;
    const totalFees = placements.reduce((sum, p) => sum + p.placementFee, 0);

    const paidPlacements = placements.filter(
      (p) => p.invoice && p.invoice.status === "PAID"
    );
    const paidFees = paidPlacements.reduce((sum, p) => sum + p.placementFee, 0);

    const pendingPlacements = placements.filter(
      (p) => !p.invoice || p.invoice.status === "PENDING"
    );
    const pendingFees = pendingPlacements.reduce((sum, p) => sum + p.placementFee, 0);

    const activePlacements = placements.filter((p) => p.status === "ACTIVE");
    const completedPlacements = placements.filter((p) => p.status === "COMPLETED");
    const failedPlacements = placements.filter((p) => p.status === "FAILED");

    // Calculate average fee
    const averageFee = totalPlacements > 0 ? totalFees / totalPlacements : 0;

    // Get current month stats
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyPlacements = placements.filter(
      (p) => new Date(p.createdAt) >= firstDayOfMonth
    );
    const monthlyRevenue = monthlyPlacements.reduce((sum, p) => {
      if (p.invoice && p.invoice.status === "PAID") {
        return sum + p.placementFee;
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
          active: activePlacements.length,
          completed: completedPlacements.length,
          failed: failedPlacements.length,
          pending: pendingPlacements.length,
        },
        byPayment: {
          paid: paidPlacements.length,
          pending: pendingPlacements.length,
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
