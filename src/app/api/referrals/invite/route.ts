import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/referrals/invite
 * Send a referral invitation email
 *
 * Body:
 * - email: string (required) - Email address to invite
 * - name: string (optional) - Name of person being invited
 *
 * Requirements:
 * - Authenticated user with CANDIDATE role
 *
 * Response:
 * - 200: { success: true, message: string }
 * - 400: Invalid email or already referred
 * - 401: Not authenticated
 * - 403: Not a candidate
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
  try {
    // Require candidate role
    await requireRole(UserRole.CANDIDATE);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { email, name } = body;

    // Validate email
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    // Get candidate profile
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        referralCode: true,
      },
    });

    if (!candidate || !candidate.referralCode) {
      return NextResponse.json(
        { error: "Candidate profile or referral code not found" },
        { status: 404 }
      );
    }

    // Check if this email was already referred
    const existingReferral = await prisma.referral.findFirst({
      where: {
        referrerId: user.id,
        email: email.toLowerCase(),
      },
    });

    if (existingReferral) {
      return NextResponse.json(
        { error: "You have already sent an invitation to this email" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "This email is already registered on our platform" },
        { status: 400 }
      );
    }

    // Create referral record
    const referral = await prisma.referral.create({
      data: {
        referrerId: user.id,
        email: email.toLowerCase(),
        name: name || null,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    });

    // Build referral link
    const referralLink = `${process.env.NEXTAUTH_URL}/signup?ref=${candidate.referralCode}`;

    // Send invitation email
    try {
      await sendEmail({
        to: email,
        subject: `${user.name} invited you to join our Job Portal`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Join Our Job Portal</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">You're Invited!</h1>
              </div>

              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
                <p style="font-size: 16px;">Hi ${name || "there"},</p>

                <p style="font-size: 16px;">
                  <strong>${user.name}</strong> has invited you to join our premium job portal platform!
                </p>

                <p style="font-size: 16px;">
                  Our platform connects talented professionals like you with top employers. Here's what you'll get:
                </p>

                <ul style="font-size: 15px; color: #555;">
                  <li>Access to exclusive job opportunities</li>
                  <li>Skills assessment and tier ranking</li>
                  <li>Direct connections with hiring managers</li>
                  <li>Earn rewards by referring others</li>
                </ul>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${referralLink}"
                     style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
                    Join Now
                  </a>
                </div>

                <p style="font-size: 14px; color: #666;">
                  Or copy and paste this link into your browser:<br>
                  <a href="${referralLink}" style="color: #667eea; word-break: break-all;">${referralLink}</a>
                </p>

                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

                <p style="font-size: 13px; color: #888; text-align: center;">
                  This invitation expires in 90 days.<br>
                  If you didn't expect this email, you can safely ignore it.
                </p>
              </div>
            </body>
          </html>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send referral email:", emailError);
      // Delete the referral record if email fails
      await prisma.referral.delete({ where: { id: referral.id } });

      return NextResponse.json(
        { error: "Failed to send invitation email. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Invitation sent successfully to ${email}`,
      referral: {
        id: referral.id,
        email: referral.email,
        name: referral.name,
        createdAt: referral.createdAt,
        expiresAt: referral.expiresAt,
      },
    });
  } catch (error) {
    console.error("Send referral invite error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Candidate role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to send referral invitation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
