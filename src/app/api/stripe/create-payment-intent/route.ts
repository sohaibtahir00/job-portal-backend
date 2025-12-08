import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole, PaymentStatus } from "@prisma/client";
import { stripe, calculatePlacementFee, calculatePlacementFeeAmounts, STRIPE_CONFIG } from "@/lib/stripe";

/**
 * POST /api/stripe/create-payment-intent
 * Create a payment intent for a placement fee
 * Requires EMPLOYER or ADMIN role
 *
 * Request body:
 * {
 *   "placementId": "string",
 *   "paymentType": "upfront" | "remaining"
 * }
 *
 * This endpoint:
 * 1. Validates the placement belongs to the employer
 * 2. Calculates the placement fee (20% of annual salary by default)
 * 3. Splits into 50% upfront and 50% remaining
 * 4. Creates a Stripe Payment Intent for the requested payment type
 * 5. Updates the placement with payment details
 * 6. Returns client secret for frontend payment confirmation
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

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found. Please create your profile first." },
        { status: 404 }
      );
    }

    // Auto-create Stripe customer if not exists
    let stripeCustomerId = employer.stripeCustomerId;

    if (!stripeCustomerId) {
      console.log(`Auto-creating Stripe customer for employer ${employer.id}`);

      const customer = await stripe.customers.create({
        email: user.email,
        name: employer.companyName,
        metadata: {
          employerId: employer.id,
          userId: user.id,
          companyName: employer.companyName,
          autoCreated: "true",
        },
      });

      // Save to database
      await prisma.employer.update({
        where: { id: employer.id },
        data: { stripeCustomerId: customer.id },
      });

      stripeCustomerId = customer.id;
      console.log(`Stripe customer created: ${customer.id}`);
    }

    const body = await request.json();
    const { placementId, paymentType } = body;

    // Validate required fields
    if (!placementId) {
      return NextResponse.json(
        { error: "placementId is required" },
        { status: 400 }
      );
    }

    if (!paymentType || !["upfront", "remaining"].includes(paymentType)) {
      return NextResponse.json(
        { error: "paymentType must be 'upfront' or 'remaining'" },
        { status: 400 }
      );
    }

    // Get placement details
    const placement = await prisma.placement.findUnique({
      where: { id: placementId },
      include: {
        candidate: {
          include: {
            applications: {
              include: {
                job: {
                  include: {
                    employer: true,
                  },
                },
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

    // Verify placement belongs to this employer (through job application)
    const placementEmployer = placement.candidate.applications.find(
      app => app.job.employerId === employer.id
    );

    if (!placementEmployer && user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Unauthorized. This placement does not belong to your company." },
        { status: 403 }
      );
    }

    // Validate placement has a salary
    if (!placement.salary) {
      return NextResponse.json(
        { error: "Placement must have a salary value to calculate fees" },
        { status: 400 }
      );
    }

    // Calculate placement fee if not already calculated
    let placementFee = placement.placementFee;
    let upfrontAmount = placement.upfrontAmount;
    let remainingAmount = placement.remainingAmount;

    if (!placementFee) {
      // Calculate 20% of annual salary as placement fee
      placementFee = calculatePlacementFee(placement.salary);
      const amounts = calculatePlacementFeeAmounts(placementFee);

      upfrontAmount = amounts.upfrontAmount;
      remainingAmount = amounts.remainingAmount;

      // Update placement with calculated amounts
      await prisma.placement.update({
        where: { id: placementId },
        data: {
          placementFee,
          upfrontAmount,
          remainingAmount,
        },
      });
    }

    // Determine which amount to charge
    const amountToCharge = paymentType === "upfront" ? upfrontAmount! : remainingAmount!;

    // Check if this payment has already been made
    if (paymentType === "upfront") {
      if (placement.upfrontPaidAt) {
        return NextResponse.json(
          {
            error: "Upfront payment has already been completed",
            paidAt: placement.upfrontPaidAt,
          },
          { status: 400 }
        );
      }
      if (placement.stripePaymentIntentId) {
        // Check if the existing payment intent is still valid
        try {
          const existingIntent = await stripe.paymentIntents.retrieve(
            placement.stripePaymentIntentId
          );

          if (existingIntent.status === "succeeded") {
            return NextResponse.json(
              {
                error: "Upfront payment has already been completed",
                paymentIntentId: existingIntent.id,
              },
              { status: 400 }
            );
          }

          // If payment intent exists but hasn't succeeded, return it
          if (existingIntent.status === "requires_payment_method" ||
              existingIntent.status === "requires_confirmation") {
            return NextResponse.json({
              clientSecret: existingIntent.client_secret,
              paymentIntentId: existingIntent.id,
              amount: existingIntent.amount,
              currency: existingIntent.currency,
              paymentType,
            });
          }
        } catch (error: any) {
          if (error.code !== "resource_missing") {
            throw error;
          }
          // If payment intent not found, create a new one
        }
      }
    } else {
      // Remaining payment
      if (placement.remainingPaidAt) {
        return NextResponse.json(
          {
            error: "Remaining payment has already been completed",
            paidAt: placement.remainingPaidAt,
          },
          { status: 400 }
        );
      }

      // Check if upfront payment has been made
      if (!placement.upfrontPaidAt) {
        return NextResponse.json(
          {
            error: "Upfront payment must be completed before paying the remaining amount",
            paymentStatus: placement.paymentStatus,
          },
          { status: 400 }
        );
      }

      if (placement.stripePaymentIntentId2) {
        // Check if the existing payment intent is still valid
        try {
          const existingIntent = await stripe.paymentIntents.retrieve(
            placement.stripePaymentIntentId2
          );

          if (existingIntent.status === "succeeded") {
            return NextResponse.json(
              {
                error: "Remaining payment has already been completed",
                paymentIntentId: existingIntent.id,
              },
              { status: 400 }
            );
          }

          // If payment intent exists but hasn't succeeded, return it
          if (existingIntent.status === "requires_payment_method" ||
              existingIntent.status === "requires_confirmation") {
            return NextResponse.json({
              clientSecret: existingIntent.client_secret,
              paymentIntentId: existingIntent.id,
              amount: existingIntent.amount,
              currency: existingIntent.currency,
              paymentType,
            });
          }
        } catch (error: any) {
          if (error.code !== "resource_missing") {
            throw error;
          }
          // If payment intent not found, create a new one
        }
      }
    }

    // Create Stripe Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountToCharge,
      currency: STRIPE_CONFIG.currency,
      customer: stripeCustomerId,
      metadata: {
        placementId: placement.id,
        candidateId: placement.candidateId,
        employerId: employer.id,
        paymentType,
        jobTitle: placement.jobTitle,
        companyName: placement.companyName,
      },
      description: `Placement fee - ${paymentType} payment for ${placement.jobTitle} at ${placement.companyName}`,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Update placement with payment intent ID
    const updateData: any = {};
    if (paymentType === "upfront") {
      updateData.stripePaymentIntentId = paymentIntent.id;
    } else {
      updateData.stripePaymentIntentId2 = paymentIntent.id;
    }

    await prisma.placement.update({
      where: { id: placementId },
      data: updateData,
    });

    return NextResponse.json(
      {
        message: "Payment intent created successfully",
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: amountToCharge,
        currency: STRIPE_CONFIG.currency,
        paymentType,
        placement: {
          id: placement.id,
          jobTitle: placement.jobTitle,
          companyName: placement.companyName,
          salary: placement.salary,
          placementFee,
          upfrontAmount,
          remainingAmount,
          paymentStatus: placement.paymentStatus,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Payment intent creation error:", error);

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
        error: "Failed to create payment intent",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
