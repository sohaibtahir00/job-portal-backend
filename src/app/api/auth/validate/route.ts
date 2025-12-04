import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/auth/validate
 * Validates user credentials and returns user data
 * Used by frontend NextAuth to authenticate users
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Find user by email with accounts to check OAuth status
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
      include: {
        accounts: true, // Check if user has OAuth accounts
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "No user found with this email" },
        { status: 401 }
      );
    }

    // Check if user is active
    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Your account is not active. Please contact support." },
        { status: 403 }
      );
    }

    // Verify password
    const isPasswordValid = await compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    // Check email verification for non-OAuth users
    // OAuth users (Google) are considered verified by their provider
    const isOAuthUser = user.accounts && user.accounts.length > 0;
    if (!isOAuthUser && !user.emailVerified) {
      return NextResponse.json(
        { error: "EMAIL_NOT_VERIFIED" },
        { status: 403 }
      );
    }

    // Return user object (password excluded)
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
      status: user.status,
    });
  } catch (error) {
    console.error("Validation error:", error);
    return NextResponse.json(
      { error: "An error occurred during authentication" },
      { status: 500 }
    );
  }
}
