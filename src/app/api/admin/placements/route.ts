import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PlacementStatus, PaymentStatus } from "@prisma/client";
import { formatCurrency } from "@/lib/stripe";

/**
 * GET /api/admin/placements
 * Get all placements with enhanced data for admin (includes guarantee status)
 *
 * Query params:
 * - status: filter by placement status
 * - paymentStatus: filter by payment status
 * - guaranteeStatus: filter by guarantee status (active, expiring_soon, expired, completed)
 * - search: search by candidate name, company, or job title
 * - page: pagination
 * - limit: items per page
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const paymentStatus = searchParams.get("paymentStatus");
    const guaranteeStatus = searchParams.get("guaranteeStatus");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status as PlacementStatus;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus as PaymentStatus;
    }

    // Handle guarantee status filter
    if (guaranteeStatus) {
      switch (guaranteeStatus) {
        case "active":
          where.guaranteeEndDate = { gt: now };
          where.status = { in: [PlacementStatus.PENDING, PlacementStatus.CONFIRMED] };
          break;
        case "expiring_soon":
          where.guaranteeEndDate = { gt: now, lte: sevenDaysFromNow };
          where.status = { in: [PlacementStatus.PENDING, PlacementStatus.CONFIRMED] };
          break;
        case "expired":
          where.guaranteeEndDate = { lte: now };
          where.status = { in: [PlacementStatus.PENDING, PlacementStatus.CONFIRMED] };
          break;
        case "completed":
          where.status = PlacementStatus.COMPLETED;
          break;
      }
    }

    if (search) {
      where.OR = [
        { jobTitle: { contains: search, mode: "insensitive" } },
        { companyName: { contains: search, mode: "insensitive" } },
        { candidate: { user: { name: { contains: search, mode: "insensitive" } } } },
      ];
    }

    // Get placements with relations
    const [placements, total] = await Promise.all([
      prisma.placement.findMany({
        where,
        include: {
          candidate: {
            include: {
              user: {
                select: { name: true, email: true },
              },
            },
          },
          employer: {
            select: {
              companyName: true,
              user: {
                select: { name: true, email: true },
              },
            },
          },
          job: {
            select: {
              id: true,
              title: true,
            },
          },
          invoices: {
            select: {
              id: true,
              status: true,
              invoiceType: true,
              amount: true,
              paidAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.placement.count({ where }),
    ]);

    // Enhance placement data with computed fields
    const enhancedPlacements = placements.map(p => {
      const guaranteeEndDate = p.guaranteeEndDate ? new Date(p.guaranteeEndDate) : null;
      let guaranteeStatusComputed = "none";
      let daysRemaining = 0;

      if (guaranteeEndDate) {
        daysRemaining = Math.ceil((guaranteeEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (p.status === PlacementStatus.COMPLETED) {
          guaranteeStatusComputed = "completed";
        } else if (daysRemaining < 0) {
          guaranteeStatusComputed = "expired";
        } else if (daysRemaining <= 7) {
          guaranteeStatusComputed = "expiring_soon";
        } else {
          guaranteeStatusComputed = "active";
        }
      }

      // Calculate payment progress
      let paymentProgress = 0;
      if (p.paymentStatus === PaymentStatus.FULLY_PAID) {
        paymentProgress = 100;
      } else if (p.paymentStatus === PaymentStatus.UPFRONT_PAID) {
        paymentProgress = p.upfrontPercentage || 50;
      }

      return {
        id: p.id,
        jobTitle: p.jobTitle,
        companyName: p.companyName,
        candidate: {
          id: p.candidateId,
          name: p.candidate.user.name,
          email: p.candidate.user.email,
        },
        employer: p.employer ? {
          id: p.employerId,
          companyName: p.employer.companyName,
          contactName: p.employer.user.name,
          contactEmail: p.employer.user.email,
        } : null,
        job: p.job ? {
          id: p.job.id,
          title: p.job.title,
        } : null,
        salary: p.salary,
        salaryFormatted: formatCurrency(p.salary || 0),
        startDate: p.startDate,
        status: p.status,
        // Payment info
        payment: {
          status: p.paymentStatus,
          progress: paymentProgress,
          placementFee: p.placementFee,
          placementFeeFormatted: formatCurrency(p.placementFee || 0),
          feePercentage: p.feePercentage,
          upfront: {
            amount: p.upfrontAmount,
            amountFormatted: formatCurrency(p.upfrontAmount || 0),
            percentage: p.upfrontPercentage,
            paid: !!p.upfrontPaidAt,
            paidAt: p.upfrontPaidAt,
          },
          remaining: {
            amount: p.remainingAmount,
            amountFormatted: formatCurrency(p.remainingAmount || 0),
            percentage: p.remainingPercentage,
            paid: !!p.remainingPaidAt,
            paidAt: p.remainingPaidAt,
          },
        },
        // Guarantee info
        guarantee: {
          status: guaranteeStatusComputed,
          periodDays: p.guaranteePeriodDays,
          endDate: p.guaranteeEndDate,
          daysRemaining: Math.max(0, daysRemaining),
          isActive: guaranteeStatusComputed === "active" || guaranteeStatusComputed === "expiring_soon",
          isExpiringSoon: guaranteeStatusComputed === "expiring_soon",
        },
        // Replacement info
        replacement: {
          requested: p.replacementRequested,
          requestedAt: p.replacementRequestedAt,
          reason: p.replacementReason,
          approved: p.replacementApproved,
          reviewedAt: p.replacementReviewedAt,
          daysWorked: p.replacementDaysWorked,
        },
        // Refund info
        refund: {
          amount: p.refundAmount,
          amountFormatted: formatCurrency(p.refundAmount || 0),
          processed: p.refundProcessed,
          processedAt: p.refundProcessedAt,
        },
        invoices: p.invoices,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    // Calculate summary stats
    const allPlacements = await prisma.placement.findMany({
      select: {
        status: true,
        paymentStatus: true,
        guaranteeEndDate: true,
        placementFee: true,
        upfrontPaidAt: true,
        remainingPaidAt: true,
        upfrontAmount: true,
        remainingAmount: true,
      },
    });

    let activeGuarantees = 0;
    let expiringSoon = 0;
    let totalCollected = 0;
    let totalPending = 0;

    allPlacements.forEach(p => {
      // Guarantee status
      if (p.guaranteeEndDate) {
        const daysRemaining = Math.ceil((new Date(p.guaranteeEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysRemaining > 7) activeGuarantees++;
        else if (daysRemaining > 0) expiringSoon++;
      }

      // Payment status
      if (p.paymentStatus === PaymentStatus.FULLY_PAID) {
        totalCollected += (p.placementFee || 0);
      } else if (p.paymentStatus === PaymentStatus.UPFRONT_PAID) {
        totalCollected += (p.upfrontAmount || 0);
        totalPending += (p.remainingAmount || 0);
      } else {
        totalPending += (p.placementFee || 0);
      }
    });

    return NextResponse.json({
      success: true,
      placements: enhancedPlacements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        total: allPlacements.length,
        byStatus: {
          pending: allPlacements.filter(p => p.status === PlacementStatus.PENDING).length,
          confirmed: allPlacements.filter(p => p.status === PlacementStatus.CONFIRMED).length,
          completed: allPlacements.filter(p => p.status === PlacementStatus.COMPLETED).length,
          cancelled: allPlacements.filter(p => p.status === PlacementStatus.CANCELLED).length,
        },
        byPayment: {
          pending: allPlacements.filter(p => p.paymentStatus === PaymentStatus.PENDING).length,
          upfrontPaid: allPlacements.filter(p => p.paymentStatus === PaymentStatus.UPFRONT_PAID).length,
          fullyPaid: allPlacements.filter(p => p.paymentStatus === PaymentStatus.FULLY_PAID).length,
        },
        guarantee: {
          active: activeGuarantees,
          expiringSoon,
        },
        revenue: {
          collected: totalCollected,
          collectedFormatted: formatCurrency(totalCollected),
          pending: totalPending,
          pendingFormatted: formatCurrency(totalPending),
        },
      },
    });
  } catch (error) {
    console.error("Get admin placements error:", error);
    return NextResponse.json(
      { error: "Failed to fetch placements" },
      { status: 500 }
    );
  }
}
