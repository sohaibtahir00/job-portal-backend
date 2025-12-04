import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, validateEmail, validatePassword } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { sendEmailVerificationEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, role } = body;

    // Validate required fields
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      );
    }

    // Validate email format
    if (!validateEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid password", details: passwordValidation.errors },
        { status: 400 }
      );
    }

    // Validate role (default to CANDIDATE if not provided)
    const userRole = role || UserRole.CANDIDATE;
    if (!Object.values(UserRole).includes(userRole)) {
      return NextResponse.json(
        { error: "Invalid role specified" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      );
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create the user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: userRole,
        status: "ACTIVE",
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    // Create role-specific profile
    if (userRole === UserRole.CANDIDATE) {
      await prisma.candidate.create({
        data: {
          userId: user.id,
          availability: true,
        },
      });
    } else if (userRole === UserRole.EMPLOYER) {
      // For employer registration, you might want to require company name
      // This is a basic example
      await prisma.employer.create({
        data: {
          userId: user.id,
          companyName: name, // You may want to accept this separately
          verified: false,
        },
      });
    }

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Save verification token
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expiresAt,
      },
    });

    // Send verification email
    await sendEmailVerificationEmail({
      email: user.email,
      name: user.name,
      verificationToken,
    });

    return NextResponse.json(
      {
        message: "User registered successfully. Please check your email to verify your account.",
        user,
        requiresVerification: true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "An error occurred during registration" },
      { status: 500 }
    );
  }
}
