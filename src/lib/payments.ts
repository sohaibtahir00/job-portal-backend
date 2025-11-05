import { prisma } from "@/lib/prisma";
import { stripe, calculatePlacementFee, calculatePlacementFeeAmounts, STRIPE_CONFIG } from "@/lib/stripe";
import { PaymentStatus, PlacementStatus } from "@prisma/client";

/**
 * Payment helper functions for managing placement fees
 */

export interface PlacementPaymentDetails {
  placementId: string;
  salary: number;
  placementFee: number;
  upfrontAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  upfrontPaidAt?: Date | null;
  remainingPaidAt?: Date | null;
  remainingDueDate?: Date;
}

/**
 * Get payment details for a placement
 */
export async function getPlacementPaymentDetails(
  placementId: string
): Promise<PlacementPaymentDetails | null> {
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
    select: {
      id: true,
      salary: true,
      placementFee: true,
      upfrontAmount: true,
      remainingAmount: true,
      paymentStatus: true,
      upfrontPaidAt: true,
      remainingPaidAt: true,
    },
  });

  if (!placement || !placement.salary) {
    return null;
  }

  // Calculate fees if not already set
  let placementFee = placement.placementFee;
  let upfrontAmount = placement.upfrontAmount;
  let remainingAmount = placement.remainingAmount;

  if (!placementFee) {
    placementFee = calculatePlacementFee(placement.salary);
    const amounts = calculatePlacementFeeAmounts(placementFee);
    upfrontAmount = amounts.upfrontAmount;
    remainingAmount = amounts.remainingAmount;
  }

  // Calculate remaining payment due date (30 days after upfront payment)
  let remainingDueDate: Date | undefined;
  if (placement.upfrontPaidAt) {
    remainingDueDate = new Date(placement.upfrontPaidAt);
    remainingDueDate.setDate(
      remainingDueDate.getDate() + STRIPE_CONFIG.placementFee.remainingDueDays
    );
  }

  return {
    placementId: placement.id,
    salary: placement.salary,
    placementFee,
    upfrontAmount: upfrontAmount!,
    remainingAmount: remainingAmount!,
    paymentStatus: placement.paymentStatus,
    upfrontPaidAt: placement.upfrontPaidAt,
    remainingPaidAt: placement.remainingPaidAt,
    remainingDueDate,
  };
}

/**
 * Check if a placement is eligible for payment
 */
export async function isPlacementEligibleForPayment(
  placementId: string,
  paymentType: "upfront" | "remaining"
): Promise<{ eligible: boolean; reason?: string }> {
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
  });

  if (!placement) {
    return { eligible: false, reason: "Placement not found" };
  }

  if (!placement.salary) {
    return { eligible: false, reason: "Placement must have a salary value" };
  }

  if (placement.status === PlacementStatus.CANCELLED) {
    return { eligible: false, reason: "Placement has been cancelled" };
  }

  if (paymentType === "upfront") {
    if (placement.upfrontPaidAt) {
      return { eligible: false, reason: "Upfront payment already completed" };
    }
  } else {
    if (!placement.upfrontPaidAt) {
      return {
        eligible: false,
        reason: "Upfront payment must be completed first",
      };
    }
    if (placement.remainingPaidAt) {
      return { eligible: false, reason: "Remaining payment already completed" };
    }
  }

  return { eligible: true };
}

/**
 * Get all placements with pending payments for an employer
 */
export async function getPendingPaymentsForEmployer(employerId: string) {
  // Get all jobs for the employer
  const jobs = await prisma.job.findMany({
    where: { employerId },
    select: { id: true },
  });

  const jobIds = jobs.map((job) => job.id);

  // Get all applications for these jobs
  const applications = await prisma.application.findMany({
    where: {
      jobId: { in: jobIds },
      status: "ACCEPTED",
    },
    select: { candidateId: true },
  });

  const candidateIds = applications.map((app) => app.candidateId);

  // Get all placements for these candidates with pending payments
  const placements = await prisma.placement.findMany({
    where: {
      candidateId: { in: candidateIds },
      paymentStatus: {
        in: [PaymentStatus.PENDING, PaymentStatus.UPFRONT_PAID],
      },
      status: {
        not: PlacementStatus.CANCELLED,
      },
    },
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
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Calculate payment details for each placement
  const placementsWithDetails = await Promise.all(
    placements.map(async (placement) => {
      const paymentDetails = await getPlacementPaymentDetails(placement.id);
      return {
        ...placement,
        paymentDetails,
      };
    })
  );

  return placementsWithDetails;
}

/**
 * Get upcoming payment reminders (remaining payments due within next N days)
 */
export async function getUpcomingPaymentReminders(daysAhead: number = 7) {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  // Get all placements where upfront is paid but remaining is not
  const placements = await prisma.placement.findMany({
    where: {
      paymentStatus: PaymentStatus.UPFRONT_PAID,
      upfrontPaidAt: { not: null },
      status: { not: PlacementStatus.CANCELLED },
    },
    include: {
      candidate: {
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          applications: {
            include: {
              job: {
                include: {
                  employer: {
                    include: {
                      user: {
                        select: {
                          name: true,
                          email: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Filter placements where remaining payment is due within the next N days
  const upcomingPayments = placements
    .map((placement) => {
      const dueDate = new Date(placement.upfrontPaidAt!);
      dueDate.setDate(dueDate.getDate() + STRIPE_CONFIG.placementFee.remainingDueDays);

      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        placement,
        dueDate,
        daysUntilDue,
        isOverdue: daysUntilDue < 0,
      };
    })
    .filter((item) => item.daysUntilDue <= daysAhead)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return upcomingPayments;
}

/**
 * Calculate total revenue from placements
 */
export async function calculatePlacementRevenue(employerId?: string) {
  const whereClause: any = {
    paymentStatus: {
      in: [PaymentStatus.UPFRONT_PAID, PaymentStatus.FULLY_PAID],
    },
  };

  // If employerId is provided, filter by employer
  if (employerId) {
    const jobs = await prisma.job.findMany({
      where: { employerId },
      select: { id: true },
    });

    const jobIds = jobs.map((job) => job.id);

    const applications = await prisma.application.findMany({
      where: {
        jobId: { in: jobIds },
        status: "ACCEPTED",
      },
      select: { candidateId: true },
    });

    const candidateIds = applications.map((app) => app.candidateId);
    whereClause.candidateId = { in: candidateIds };
  }

  const placements = await prisma.placement.findMany({
    where: whereClause,
    select: {
      placementFee: true,
      upfrontAmount: true,
      remainingAmount: true,
      paymentStatus: true,
    },
  });

  let totalRevenue = 0;
  let upfrontRevenue = 0;
  let remainingRevenue = 0;

  placements.forEach((placement) => {
    if (placement.upfrontAmount) {
      upfrontRevenue += placement.upfrontAmount;
      totalRevenue += placement.upfrontAmount;
    }

    if (placement.paymentStatus === PaymentStatus.FULLY_PAID && placement.remainingAmount) {
      remainingRevenue += placement.remainingAmount;
      totalRevenue += placement.remainingAmount;
    }
  });

  return {
    totalRevenue,
    upfrontRevenue,
    remainingRevenue,
    placementCount: placements.length,
    fullyPaidCount: placements.filter(
      (p) => p.paymentStatus === PaymentStatus.FULLY_PAID
    ).length,
  };
}

/**
 * Validate Stripe webhook signature
 */
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
) {
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    return { valid: true, event };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid signature",
    };
  }
}

/**
 * Retry failed payment
 */
export async function retryFailedPayment(placementId: string, paymentType: "upfront" | "remaining") {
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
  });

  if (!placement) {
    throw new Error("Placement not found");
  }

  // Reset payment status to allow retry
  const updateData: any = {};

  if (paymentType === "upfront") {
    updateData.stripePaymentIntentId = null;
    updateData.paymentStatus = PaymentStatus.PENDING;
  } else {
    updateData.stripePaymentIntentId2 = null;
    // Only reset to UPFRONT_PAID if upfront was completed
    if (placement.upfrontPaidAt) {
      updateData.paymentStatus = PaymentStatus.UPFRONT_PAID;
    }
  }

  await prisma.placement.update({
    where: { id: placementId },
    data: updateData,
  });

  return { success: true, message: "Payment reset for retry" };
}
