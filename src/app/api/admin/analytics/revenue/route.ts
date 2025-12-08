import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PaymentStatus, PlacementStatus } from "@prisma/client";
import { formatCurrency } from "@/lib/stripe";

/**
 * GET /api/admin/analytics/revenue
 * Get detailed revenue analytics for admin dashboard
 *
 * Returns:
 * - Total revenue (collected)
 * - Pending revenue (invoiced but not paid)
 * - Expected revenue (from active placements)
 * - Monthly breakdown
 * - Payment status breakdown
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const months = parseInt(searchParams.get("months") || "12");

    // Get all placements
    const placements = await prisma.placement.findMany({
      include: {
        invoices: true,
        employer: {
          select: {
            companyName: true,
          },
        },
        candidate: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Calculate revenue metrics
    let totalCollected = 0;
    let pendingUpfront = 0;
    let pendingRemaining = 0;
    let totalExpected = 0;

    placements.forEach(p => {
      const fee = p.placementFee || 0;
      totalExpected += fee;

      if (p.paymentStatus === PaymentStatus.FULLY_PAID) {
        totalCollected += fee;
      } else if (p.paymentStatus === PaymentStatus.UPFRONT_PAID) {
        totalCollected += (p.upfrontAmount || 0);
        pendingRemaining += (p.remainingAmount || 0);
      } else if (p.paymentStatus === PaymentStatus.PENDING) {
        pendingUpfront += (p.upfrontAmount || 0);
        pendingRemaining += (p.remainingAmount || 0);
      }
    });

    // Calculate monthly revenue breakdown
    const monthlyData: Record<string, { month: string; collected: number; pending: number; placements: number }> = {};
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = date.toLocaleString("default", { month: "short", year: "numeric" });
      monthlyData[monthKey] = { month: monthLabel, collected: 0, pending: 0, placements: 0 };
    }

    placements.forEach(p => {
      const createdDate = new Date(p.createdAt);
      const monthKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}`;

      if (monthlyData[monthKey]) {
        monthlyData[monthKey].placements += 1;

        if (p.paymentStatus === PaymentStatus.FULLY_PAID) {
          monthlyData[monthKey].collected += (p.placementFee || 0);
        } else if (p.paymentStatus === PaymentStatus.UPFRONT_PAID) {
          monthlyData[monthKey].collected += (p.upfrontAmount || 0);
          monthlyData[monthKey].pending += (p.remainingAmount || 0);
        } else {
          monthlyData[monthKey].pending += (p.placementFee || 0);
        }
      }
    });

    // Convert to array and reverse for chronological order
    const monthlyRevenue = Object.values(monthlyData).reverse();

    // Payment status breakdown
    const paymentBreakdown = {
      fullyPaid: placements.filter(p => p.paymentStatus === PaymentStatus.FULLY_PAID).length,
      upfrontPaid: placements.filter(p => p.paymentStatus === PaymentStatus.UPFRONT_PAID).length,
      pending: placements.filter(p => p.paymentStatus === PaymentStatus.PENDING).length,
      failed: placements.filter(p => p.paymentStatus === PaymentStatus.FAILED).length,
    };

    // Upcoming payments (placements with upfront paid, remaining due)
    const upcomingPayments = placements
      .filter(p =>
        p.paymentStatus === PaymentStatus.UPFRONT_PAID &&
        p.remainingAmount &&
        p.guaranteeEndDate
      )
      .map(p => ({
        id: p.id,
        candidate: p.candidate.user.name,
        company: p.companyName,
        amount: p.remainingAmount,
        amountFormatted: formatCurrency(p.remainingAmount || 0),
        dueDate: p.guaranteeEndDate,
        daysUntilDue: Math.ceil(
          ((p.guaranteeEndDate?.getTime() || 0) - now.getTime()) / (1000 * 60 * 60 * 24)
        ),
      }))
      .sort((a, b) => (a.daysUntilDue || 0) - (b.daysUntilDue || 0))
      .slice(0, 10);

    // Overdue payments
    const overduePlacements = placements.filter(p => {
      if (p.paymentStatus === PaymentStatus.FULLY_PAID) return false;

      // Check if remaining payment is overdue (after guarantee end date)
      if (p.paymentStatus === PaymentStatus.UPFRONT_PAID && p.guaranteeEndDate) {
        return new Date(p.guaranteeEndDate) < now;
      }

      return false;
    });

    const overdueAmount = overduePlacements.reduce((sum, p) => sum + (p.remainingAmount || 0), 0);

    // Calculate averages
    const averagePlacementFee = placements.length > 0
      ? Math.round(totalExpected / placements.length)
      : 0;

    const collectionRate = totalExpected > 0
      ? ((totalCollected / totalExpected) * 100).toFixed(1)
      : "0.0";

    return NextResponse.json({
      success: true,
      summary: {
        totalCollected,
        totalCollectedFormatted: formatCurrency(totalCollected),
        pendingUpfront,
        pendingUpfrontFormatted: formatCurrency(pendingUpfront),
        pendingRemaining,
        pendingRemainingFormatted: formatCurrency(pendingRemaining),
        totalPending: pendingUpfront + pendingRemaining,
        totalPendingFormatted: formatCurrency(pendingUpfront + pendingRemaining),
        totalExpected,
        totalExpectedFormatted: formatCurrency(totalExpected),
        overdueAmount,
        overdueAmountFormatted: formatCurrency(overdueAmount),
        overduePlacements: overduePlacements.length,
        averagePlacementFee,
        averagePlacementFeeFormatted: formatCurrency(averagePlacementFee),
        collectionRate: `${collectionRate}%`,
        totalPlacements: placements.length,
      },
      paymentBreakdown,
      monthlyRevenue,
      upcomingPayments,
    });
  } catch (error) {
    console.error("Revenue analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch revenue analytics" },
      { status: 500 }
    );
  }
}
