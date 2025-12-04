import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { randomBytes } from "crypto";

/**
 * POST /api/auth/oauth/create
 * Create a new user from OAuth (Google/LinkedIn)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, image, role, provider, providerId } = body;

    // Validate required fields
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!role || !["CANDIDATE", "EMPLOYER"].includes(role.toUpperCase())) {
      return NextResponse.json(
        { error: "Valid role (CANDIDATE or EMPLOYER) is required" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error: "An account with this email already exists. Please log in instead.",
          exists: true
        },
        { status: 409 }
      );
    }

    // Normalize role to uppercase
    const normalizedRole = role.toUpperCase() as UserRole;

    // Generate a random password for OAuth users (they won't use it)
    const randomPassword = randomBytes(32).toString("hex");

    // Create user with role-specific profile
    const user = await prisma.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        password: randomPassword, // OAuth users don't use password
        image: image || null,
        role: normalizedRole,
        status: "ACTIVE",
        emailVerified: new Date(), // OAuth emails are pre-verified
        isActive: true,
        // Create role-specific profile
        ...(normalizedRole === UserRole.CANDIDATE && {
          candidate: {
            create: {
              skills: [],
              availability: true,
            },
          },
        }),
        ...(normalizedRole === UserRole.EMPLOYER && {
          employer: {
            create: {
              companyName: name || "My Company",
            },
          },
        }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        image: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        image: user.image,
      },
    });
  } catch (error: any) {
    console.error("OAuth create user error:", error);

    // Handle unique constraint violation
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create user account" },
      { status: 500 }
    );
  }
}
