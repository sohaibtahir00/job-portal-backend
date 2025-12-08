import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PaymentStatus, PlacementStatus } from "@prisma/client";
import { formatCurrency } from "@/lib/stripe";

/**
 * GET /api/admin/reports/financial
 * Generate comprehensive financial reports for admin
 *
 * Query params:
 * - period: "monthly" | "quarterly" | "yearly" | "custom"
 * - startDate: ISO date string (for custom period)
 * - endDate: ISO date string (for custom period)
 * - year: specific year to report on
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "monthly";
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    // Calculate date range based on period
    let startDate: Date;
    let endDate: Date;

    if (period === "custom" && startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else if (period === "yearly") {
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59);
    } else {
      // Default to current year
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59);
    }

    // Get all placements in the date range
    const placements = await prisma.placement.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        candidate: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
        employer: {
          select: {
            companyName: true,
          },
        },
        invoices: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Calculate summary metrics
    let totalRevenue = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let totalPlacements = placements.length;
    let fullyPaidCount = 0;
    let partiallyPaidCount = 0;
    let pendingCount = 0;

    placements.forEach(p => {
      const fee = p.placementFee || 0;
      totalRevenue += fee;

      if (p.paymentStatus === PaymentStatus.FULLY_PAID) {
        totalCollected += fee;
        fullyPaidCount++;
      } else if (p.paymentStatus === PaymentStatus.UPFRONT_PAID) {
        totalCollected += (p.upfrontAmount || 0);
        totalPending += (p.remainingAmount || 0);
        partiallyPaidCount++;
      } else {
        totalPending += fee;
        pendingCount++;
      }
    });

    // Calculate monthly breakdown
    const monthlyData: Record<string, {
      month: string;
      placements: number;
      revenue: number;
      collected: number;
      pending: number;
    }> = {};

    // Initialize all months
    for (let m = 0; m < 12; m++) {
      const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
      const monthLabel = new Date(year, m, 1).toLocaleString("default", { month: "short" });
      monthlyData[monthKey] = {
        month: monthLabel,
        placements: 0,
        revenue: 0,
        collected: 0,
        pending: 0,
      };
    }

    // Fill in actual data
    placements.forEach(p => {
      const createdDate = new Date(p.createdAt);
      const monthKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}`;

      if (monthlyData[monthKey]) {
        monthlyData[monthKey].placements++;
        monthlyData[monthKey].revenue += (p.placementFee || 0);

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

    const monthlyBreakdown = Object.values(monthlyData);

    // Calculate quarterly breakdown
    const quarterlyData = [
      { quarter: "Q1", months: ["Jan", "Feb", "Mar"], placements: 0, revenue: 0, collected: 0 },
      { quarter: "Q2", months: ["Apr", "May", "Jun"], placements: 0, revenue: 0, collected: 0 },
      { quarter: "Q3", months: ["Jul", "Aug", "Sep"], placements: 0, revenue: 0, collected: 0 },
      { quarter: "Q4", months: ["Oct", "Nov", "Dec"], placements: 0, revenue: 0, collected: 0 },
    ];

    monthlyBreakdown.forEach((m, idx) => {
      const quarterIdx = Math.floor(idx / 3);
      quarterlyData[quarterIdx].placements += m.placements;
      quarterlyData[quarterIdx].revenue += m.revenue;
      quarterlyData[quarterIdx].collected += m.collected;
    });

    // Calculate key metrics
    const avgPlacementValue = totalPlacements > 0
      ? Math.round(totalRevenue / totalPlacements)
      : 0;

    const collectionRate = totalRevenue > 0
      ? ((totalCollected / totalRevenue) * 100).toFixed(1)
      : "0.0";

    // Get top employers by revenue
    const employerRevenue: Record<string, { name: string; revenue: number; placements: number }> = {};

    placements.forEach(p => {
      const employerName = p.companyName || p.employer?.companyName || "Unknown";
      if (!employerRevenue[employerName]) {
        employerRevenue[employerName] = { name: employerName, revenue: 0, placements: 0 };
      }
      employerRevenue[employerName].revenue += (p.placementFee || 0);
      employerRevenue[employerName].placements++;
    });

    const topEmployers = Object.values(employerRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map(e => ({
        ...e,
        revenueFormatted: formatCurrency(e.revenue),
      }));

    // Calculate YoY comparison (if we have last year's data)
    const lastYearStart = new Date(year - 1, 0, 1);
    const lastYearEnd = new Date(year - 1, 11, 31, 23, 59, 59);

    const lastYearPlacements = await prisma.placement.findMany({
      where: {
        createdAt: {
          gte: lastYearStart,
          lte: lastYearEnd,
        },
      },
      select: {
        placementFee: true,
        paymentStatus: true,
        upfrontAmount: true,
      },
    });

    let lastYearRevenue = 0;
    let lastYearCollected = 0;

    lastYearPlacements.forEach(p => {
      lastYearRevenue += (p.placementFee || 0);
      if (p.paymentStatus === PaymentStatus.FULLY_PAID) {
        lastYearCollected += (p.placementFee || 0);
      } else if (p.paymentStatus === PaymentStatus.UPFRONT_PAID) {
        lastYearCollected += (p.upfrontAmount || 0);
      }
    });

    const yoyGrowth = lastYearRevenue > 0
      ? (((totalRevenue - lastYearRevenue) / lastYearRevenue) * 100).toFixed(1)
      : null;

    // Recent placements list
    const recentPlacements = placements.slice(0, 20).map(p => ({
      id: p.id,
      candidate: p.candidate.user.name,
      company: p.companyName || p.employer?.companyName,
      jobTitle: p.jobTitle,
      fee: p.placementFee,
      feeFormatted: formatCurrency(p.placementFee || 0),
      paymentStatus: p.paymentStatus,
      createdAt: p.createdAt,
      startDate: p.startDate,
    }));

    return NextResponse.json({
      success: true,
      report: {
        period: {
          type: period,
          year,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        summary: {
          totalRevenue,
          totalRevenueFormatted: formatCurrency(totalRevenue),
          totalCollected,
          totalCollectedFormatted: formatCurrency(totalCollected),
          totalPending,
          totalPendingFormatted: formatCurrency(totalPending),
          totalPlacements,
          avgPlacementValue,
          avgPlacementValueFormatted: formatCurrency(avgPlacementValue),
          collectionRate: `${collectionRate}%`,
        },
        paymentBreakdown: {
          fullyPaid: fullyPaidCount,
          partiallyPaid: partiallyPaidCount,
          pending: pendingCount,
        },
        monthlyBreakdown: monthlyBreakdown.map(m => ({
          ...m,
          revenueFormatted: formatCurrency(m.revenue),
          collectedFormatted: formatCurrency(m.collected),
          pendingFormatted: formatCurrency(m.pending),
        })),
        quarterlyBreakdown: quarterlyData.map(q => ({
          ...q,
          revenueFormatted: formatCurrency(q.revenue),
          collectedFormatted: formatCurrency(q.collected),
        })),
        topEmployers,
        comparison: {
          lastYear: {
            year: year - 1,
            revenue: lastYearRevenue,
            revenueFormatted: formatCurrency(lastYearRevenue),
            collected: lastYearCollected,
            collectedFormatted: formatCurrency(lastYearCollected),
            placements: lastYearPlacements.length,
          },
          yoyGrowth: yoyGrowth ? `${yoyGrowth}%` : "N/A",
        },
        recentPlacements,
      },
    });
  } catch (error) {
    console.error("Financial report error:", error);
    return NextResponse.json(
      { error: "Failed to generate financial report" },
      { status: 500 }
    );
  }
}
