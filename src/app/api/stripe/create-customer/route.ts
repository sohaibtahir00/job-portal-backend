import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/stripe/create-customer
 * Create a Stripe customer for the employer
 * Requires EMPLOYER or ADMIN role
 *
 * This endpoint:
 * 1. Checks if employer already has a Stripe customer ID
 * 2. If not, creates a new Stripe customer
 * 3. Stores the Stripe customer ID in the database
 * 4. Returns the customer ID for client-side use
 */
export async function POST() {
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

    // Check if employer already has a Stripe customer ID
    if (employer.stripeCustomerId) {
      // Verify the customer exists in Stripe
      try {
        const customer = await stripe.customers.retrieve(employer.stripeCustomerId);

        if (customer.deleted) {
          // Customer was deleted in Stripe, create a new one
          console.log(`Stripe customer ${employer.stripeCustomerId} was deleted, creating new one`);
        } else {
          // Customer exists, return it
          return NextResponse.json({
            customerId: employer.stripeCustomerId,
            message: "Stripe customer already exists",
            customer: {
              id: customer.id,
              email: customer.email,
              name: customer.name,
            },
          });
        }
      } catch (error: any) {
        // Customer doesn't exist in Stripe, create a new one
        if (error.code === "resource_missing") {
          console.log(`Stripe customer ${employer.stripeCustomerId} not found, creating new one`);
        } else {
          throw error;
        }
      }
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      name: employer.companyName,
      metadata: {
        employerId: employer.id,
        userId: user.id,
        companyName: employer.companyName,
      },
    });

    // Store Stripe customer ID in database
    await prisma.employer.update({
      where: { userId: user.id },
      data: {
        stripeCustomerId: customer.id,
      },
    });

    return NextResponse.json(
      {
        message: "Stripe customer created successfully",
        customerId: customer.id,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Stripe customer creation error:", error);

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
        error: "Failed to create Stripe customer",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/stripe/create-customer
 * Get the current employer's Stripe customer information
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

    if (!employer.stripeCustomerId) {
      return NextResponse.json({
        hasCustomer: false,
        message: "No Stripe customer exists for this employer",
      });
    }

    // Retrieve customer from Stripe
    try {
      const customer = await stripe.customers.retrieve(employer.stripeCustomerId);

      if (customer.deleted) {
        return NextResponse.json({
          hasCustomer: false,
          message: "Stripe customer was deleted",
        });
      }

      return NextResponse.json({
        hasCustomer: true,
        customerId: customer.id,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          created: new Date(customer.created * 1000).toISOString(),
        },
      });
    } catch (error: any) {
      if (error.code === "resource_missing") {
        return NextResponse.json({
          hasCustomer: false,
          message: "Stripe customer not found",
        });
      }
      throw error;
    }
  } catch (error) {
    console.error("Stripe customer fetch error:", error);

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
        error: "Failed to fetch Stripe customer",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
