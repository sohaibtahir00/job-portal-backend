import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Get frontend URL - prioritize FRONTEND_URL, then NEXT_PUBLIC_FRONTEND_URL, then production fallback
function getFrontendUrl(): string {
  return process.env.FRONTEND_URL
    || process.env.NEXT_PUBLIC_FRONTEND_URL
    || "https://aimltalenthub.com";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const frontendUrl = getFrontendUrl();

    if (!token) {
      // Redirect to error page with message
      return NextResponse.redirect(
        `${frontendUrl}/login?error=invalid_token&message=Invalid verification link`
      );
    }

    // Find the verification token
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verificationToken) {
      return NextResponse.redirect(
        `${frontendUrl}/login?error=invalid_token&message=Invalid or expired verification link`
      );
    }

    // Check if token is already used
    if (verificationToken.used) {
      return NextResponse.redirect(
        `${frontendUrl}/login?error=token_used&message=This verification link has already been used`
      );
    }

    // Check if token is expired
    if (verificationToken.expiresAt < new Date()) {
      return NextResponse.redirect(
        `${frontendUrl}/login?error=token_expired&message=Verification link has expired. Please request a new one.`
      );
    }

    // Mark token as used and update user email verification
    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { used: true },
      }),
      prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerified: new Date() },
      }),
    ]);

    // Redirect to login page with success message (user needs to login first)
    return NextResponse.redirect(
      `${frontendUrl}/login?verified=true`
    );
  } catch (error) {
    console.error("Email verification error:", error);
    const frontendUrl = getFrontendUrl();
    return NextResponse.redirect(
      `${frontendUrl}/login?error=verification_failed&message=An error occurred during verification`
    );
  }
}
