import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { stripe } from "@/lib/stripe";

/**
 * GET /api/stripe/billing-status
 * Get the current employer's billing status including Stripe customer and payment method info
 * Requires EMPLOYER or ADMIN role
 */
export async function GET() {
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
      select: {
        id: true,
        companyName: true,
        stripeCustomerId: true,
      },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    let paymentMethod = null;
    let customerCreated = null;

    if (employer.stripeCustomerId) {
      // Fetch customer and payment method from Stripe
      try {
        const customer = await stripe.customers.retrieve(employer.stripeCustomerId);

        if (customer && !customer.deleted) {
          customerCreated = new Date(customer.created * 1000).toISOString();

          // Try to get default payment method
          if (customer.invoice_settings?.default_payment_method) {
            try {
              const pm = await stripe.paymentMethods.retrieve(
                customer.invoice_settings.default_payment_method as string
              );
              if (pm.card) {
                paymentMethod = {
                  id: pm.id,
                  last4: pm.card.last4,
                  expMonth: pm.card.exp_month,
                  expYear: pm.card.exp_year,
                  brand: pm.card.brand,
                };
              }
            } catch (pmError) {
              console.error("Error fetching payment method:", pmError);
            }
          }

          // If no default payment method, check for any attached payment methods
          if (!paymentMethod) {
            const paymentMethods = await stripe.paymentMethods.list({
              customer: employer.stripeCustomerId,
              type: "card",
              limit: 1,
            });

            if (paymentMethods.data.length > 0) {
              const pm = paymentMethods.data[0];
              if (pm.card) {
                paymentMethod = {
                  id: pm.id,
                  last4: pm.card.last4,
                  expMonth: pm.card.exp_month,
                  expYear: pm.card.exp_year,
                  brand: pm.card.brand,
                };
              }
            }
          }
        }
      } catch (stripeError: any) {
        if (stripeError.code === "resource_missing") {
          // Customer was deleted in Stripe, clear the ID
          await prisma.employer.update({
            where: { id: employer.id },
            data: { stripeCustomerId: null },
          });
          return NextResponse.json({
            stripeCustomerId: null,
            paymentMethod: null,
            customerCreated: null,
          });
        }
        console.error("Error fetching Stripe customer:", stripeError);
      }
    }

    return NextResponse.json({
      stripeCustomerId: employer.stripeCustomerId,
      paymentMethod,
      customerCreated,
    });

  } catch (error) {
    console.error("Billing status error:", error);

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
        error: "Failed to fetch billing status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
