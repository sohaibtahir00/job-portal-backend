import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe, STRIPE_CONFIG } from "@/lib/stripe";
import { PaymentStatus } from "@prisma/client";
import Stripe from "stripe";
import { sendPaymentSuccessEmail } from "@/lib/email";

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 *
 * IMPORTANT: This endpoint must be excluded from middleware auth checks
 * Add to middleware.ts:
 * if (pathname.startsWith("/api/webhooks/")) {
 *   return NextResponse.next();
 * }
 *
 * Webhook events handled:
 * - payment_intent.succeeded: Update placement payment status
 * - payment_intent.payment_failed: Mark payment as failed
 *
 * Set up in Stripe Dashboard:
 * 1. Go to Developers > Webhooks
 * 2. Add endpoint: https://yourdomain.com/api/webhooks/stripe
 * 3. Select events: payment_intent.succeeded, payment_intent.payment_failed
 * 4. Copy webhook signing secret to STRIPE_WEBHOOK_SECRET env variable
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      console.error("No stripe-signature header found");
      return NextResponse.json(
        { error: "No signature provided" },
        { status: 400 }
      );
    }

    if (!STRIPE_CONFIG.webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        STRIPE_CONFIG.webhookSecret
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json(
        { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : "Unknown error"}` },
        { status: 400 }
      );
    }

    console.log(`Received webhook event: ${event.type}`);

    // Handle the event
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      {
        error: "Webhook processing failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const { placementId, paymentType } = paymentIntent.metadata;

  if (!placementId || !paymentType) {
    console.error("Missing metadata in payment intent:", paymentIntent.id);
    return;
  }

  console.log(`Processing successful payment for placement ${placementId}, type: ${paymentType}`);

  try {
    const placement = await prisma.placement.findUnique({
      where: { id: placementId },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                name: true,
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
                            email: true,
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
    });

    if (!placement) {
      console.error(`Placement ${placementId} not found`);
      return;
    }

    // Get the amount from payment intent
    const amount = paymentType === "upfront" ? placement.upfrontAmount : placement.remainingAmount;

    if (!amount) {
      console.error(`Amount not found for ${paymentType} payment`);
      return;
    }

    // Get employer details
    const employer = placement.candidate.applications[0]?.job?.employer;
    if (!employer) {
      console.error(`Employer not found for placement ${placementId}`);
      return;
    }

    // Update placement based on payment type
    if (paymentType === "upfront") {
      await prisma.placement.update({
        where: { id: placementId },
        data: {
          upfrontPaidAt: new Date(),
          paymentStatus: PaymentStatus.UPFRONT_PAID,
        },
      });

      console.log(`Upfront payment completed for placement ${placementId}`);

      // Send payment success email
      await sendPaymentSuccessEmail({
        email: employer.user.email,
        employerName: employer.user.name,
        candidateName: placement.candidate.user.name,
        jobTitle: placement.jobTitle,
        amount: amount,
        paymentType: "upfront",
        placementId: placement.id,
      });

      // TODO: Schedule reminder for remaining payment after 30 days
      // This could be done with a job queue (Bull, BullMQ) or a cron job
      // For now, log it
      const remainingDueDate = new Date();
      remainingDueDate.setDate(remainingDueDate.getDate() + STRIPE_CONFIG.placementFee.remainingDueDays);
      console.log(`Remaining payment due on: ${remainingDueDate.toISOString()}`);

    } else if (paymentType === "remaining") {
      await prisma.placement.update({
        where: { id: placementId },
        data: {
          remainingPaidAt: new Date(),
          paymentStatus: PaymentStatus.FULLY_PAID,
        },
      });

      console.log(`Remaining payment completed for placement ${placementId}. Placement fully paid!`);

      // Send payment success email
      await sendPaymentSuccessEmail({
        email: employer.user.email,
        employerName: employer.user.name,
        candidateName: placement.candidate.user.name,
        jobTitle: placement.jobTitle,
        amount: amount,
        paymentType: "remaining",
        placementId: placement.id,
      });
    }
  } catch (error) {
    console.error("Error updating placement after payment:", error);
    throw error;
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  const { placementId, paymentType } = paymentIntent.metadata;

  if (!placementId || !paymentType) {
    console.error("Missing metadata in payment intent:", paymentIntent.id);
    return;
  }

  console.log(`Processing failed payment for placement ${placementId}, type: ${paymentType}`);

  try {
    const placement = await prisma.placement.findUnique({
      where: { id: placementId },
    });

    if (!placement) {
      console.error(`Placement ${placementId} not found`);
      return;
    }

    // Update payment status to FAILED
    await prisma.placement.update({
      where: { id: placementId },
      data: {
        paymentStatus: PaymentStatus.FAILED,
      },
    });

    console.log(`Payment failed for placement ${placementId}`);

    // TODO: Send notification to employer about failed payment
    // TODO: Consider implementing retry logic or payment plan options
  } catch (error) {
    console.error("Error updating placement after payment failure:", error);
    throw error;
  }
}
