import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/auth/oauth/check
 * Check if a user exists by email (for OAuth flow)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        image: true,
        onboardingCompleted: true,
      },
    });

    if (user) {
      // Check if user is active
      if (user.status !== "ACTIVE") {
        return NextResponse.json(
          {
            exists: true,
            error: "Your account is not active. Please contact support.",
            user: null
          },
          { status: 403 }
        );
      }

      return NextResponse.json({
        exists: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.image,
          onboardingCompleted: user.onboardingCompleted,
        },
      });
    }

    return NextResponse.json({
      exists: false,
      user: null,
    });
  } catch (error) {
    console.error("OAuth check error:", error);
    return NextResponse.json(
      { error: "An error occurred while checking user" },
      { status: 500 }
    );
  }
}
