import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import crypto from "crypto";

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success (security best practice - don't reveal if email exists)
    if (!user) {
      return NextResponse.json({
        success: true,
        message: "If that email exists, we've sent a password reset link",
      });
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Create new token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Send email
    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Reset Your Password - SkillProof",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>Reset Your Password</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="color: white; margin: 0;">Password Reset Request</h1>
                </div>

                <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
                  <p>Hi ${user.name},</p>

                  <p>You requested to reset your password for your SkillProof account.</p>

                  <p>Click the button below to reset your password:</p>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                      Reset Password
                    </a>
                  </div>

                  <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
                  <p style="background: #e5e7eb; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 12px;">
                    ${resetUrl}
                  </p>

                  <p style="margin-top: 30px; color: #888; font-size: 13px;">
                    <strong>This link expires in 1 hour.</strong>
                  </p>

                  <p style="color: #888; font-size: 13px;">
                    If you didn't request this password reset, please ignore this email and your password will remain unchanged.
                  </p>
                </div>
              </div>
            </body>
          </html>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send reset email:", emailError);
      // Still return success to not reveal if email exists
    }

    return NextResponse.json({
      success: true,
      message: "If that email exists, we've sent a password reset link",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
