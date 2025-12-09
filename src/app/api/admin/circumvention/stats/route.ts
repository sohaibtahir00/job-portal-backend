import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { FlagStatus } from "@prisma/client";

/**
 * GET /api/admin/circumvention/stats
 * Get statistics for circumvention flags
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Get counts by status
    const [
      openCount,
      investigatingCount,
      invoiceSentCount,
      paidCount,
      disputedCount,
      falsePositiveCount,
      wroteOffCount,
      totalCount,
    ] = await Promise.all([
      prisma.circumventionFlag.count({ where: { status: FlagStatus.OPEN } }),
      prisma.circumventionFlag.count({ where: { status: FlagStatus.INVESTIGATING } }),
      prisma.circumventionFlag.count({ where: { status: FlagStatus.INVOICE_SENT } }),
      prisma.circumventionFlag.count({ where: { status: FlagStatus.PAID } }),
      prisma.circumventionFlag.count({ where: { status: FlagStatus.DISPUTED } }),
      prisma.circumventionFlag.count({ where: { status: FlagStatus.FALSE_POSITIVE } }),
      prisma.circumventionFlag.count({ where: { status: FlagStatus.WROTE_OFF } }),
      prisma.circumventionFlag.count(),
    ]);

    // Calculate potential revenue (sum of estimated fees for open/investigating flags)
    const potentialRevenueResult = await prisma.circumventionFlag.aggregate({
      where: {
        status: {
          in: [FlagStatus.OPEN, FlagStatus.INVESTIGATING, FlagStatus.INVOICE_SENT],
        },
        estimatedFeeOwed: { not: null },
      },
      _sum: {
        estimatedFeeOwed: true,
      },
    });

    // Calculate collected revenue (sum of invoice amounts for paid flags)
    const collectedRevenueResult = await prisma.circumventionFlag.aggregate({
      where: {
        status: FlagStatus.PAID,
        invoiceAmount: { not: null },
      },
      _sum: {
        invoiceAmount: true,
      },
    });

    // Calculate pending invoice amount
    const pendingInvoiceResult = await prisma.circumventionFlag.aggregate({
      where: {
        status: FlagStatus.INVOICE_SENT,
        invoiceAmount: { not: null },
      },
      _sum: {
        invoiceAmount: true,
      },
    });

    // Get recent flags (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentFlagsCount = await prisma.circumventionFlag.count({
      where: {
        detectedAt: { gte: thirtyDaysAgo },
      },
    });

    // Detection methods breakdown
    const detectionMethods = await prisma.circumventionFlag.groupBy({
      by: ["detectionMethod"],
      _count: { id: true },
    });

    return NextResponse.json({
      success: true,
      stats: {
        byStatus: {
          open: openCount,
          investigating: investigatingCount,
          invoiceSent: invoiceSentCount,
          paid: paidCount,
          disputed: disputedCount,
          falsePositive: falsePositiveCount,
          wroteOff: wroteOffCount,
        },
        total: totalCount,
        actionRequired: openCount + investigatingCount,
        recentFlags: recentFlagsCount,
        revenue: {
          potential: potentialRevenueResult._sum.estimatedFeeOwed?.toString() || "0",
          collected: collectedRevenueResult._sum.invoiceAmount?.toString() || "0",
          pending: pendingInvoiceResult._sum.invoiceAmount?.toString() || "0",
        },
        detectionMethods: detectionMethods.map((dm) => ({
          method: dm.detectionMethod,
          count: dm._count.id,
        })),
      },
    });
  } catch (error) {
    console.error("[Admin Circumvention Stats] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch circumvention stats" },
      { status: 500 }
    );
  }
}
