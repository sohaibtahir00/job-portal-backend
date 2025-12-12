import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/newsletter
 * Subscribe to newsletter (public)
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Check if already subscribed
    const existing = await prisma.newsletter.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      if (existing.isActive) {
        return NextResponse.json(
          { error: "This email is already subscribed" },
          { status: 400 }
        );
      }

      // Re-subscribe if previously unsubscribed
      const updated = await prisma.newsletter.update({
        where: { email: email.toLowerCase() },
        data: {
          isActive: true,
          unsubscribedAt: null,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Successfully re-subscribed to newsletter",
        subscription: updated,
      });
    }

    // Create new subscription
    const subscription = await prisma.newsletter.create({
      data: {
        email: email.toLowerCase(),
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Successfully subscribed to newsletter",
      subscription,
    }, { status: 201 });
  } catch (error) {
    console.error("Newsletter subscription error:", error);
    return NextResponse.json(
      { error: "Failed to subscribe to newsletter" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/newsletter
 * Get all newsletter subscribers (admin only)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const active = searchParams.get("active");

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (active === "true") {
      where.isActive = true;
    } else if (active === "false") {
      where.isActive = false;
    }

    const [subscribers, totalCount] = await Promise.all([
      prisma.newsletter.findMany({
        where,
        orderBy: { subscribedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.newsletter.count({ where }),
    ]);

    return NextResponse.json({
      subscribers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("Get newsletter subscribers error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscribers" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/newsletter
 * Unsubscribe from newsletter (public with email parameter)
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const subscription = await prisma.newsletter.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Email not found" },
        { status: 404 }
      );
    }

    await prisma.newsletter.update({
      where: { email: email.toLowerCase() },
      data: {
        isActive: false,
        unsubscribedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Successfully unsubscribed from newsletter",
    });
  } catch (error) {
    console.error("Newsletter unsubscribe error:", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
