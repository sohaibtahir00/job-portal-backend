import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";

/**
 * PATCH /api/admin/users/[id]/suspend
 * Suspend or unsuspend a user account
 *
 * Request Body:
 * - action: "suspend" | "unsuspend"
 * - reason?: string (required for suspension)
 *
 * Actions:
 * - suspend: Marks user as suspended with reason and timestamp
 * - unsuspend: Removes suspension from user account
 *
 * Effects of suspension:
 * - User cannot log in
 * - For candidates: Applications hidden, cannot apply to jobs
 * - For employers: Jobs hidden, cannot post new jobs
 *
 * Response:
 * - 200: { success: true, user, action }
 * - 403: Unauthorized or attempting to suspend admin
 * - 404: User not found
 * - 400: Invalid action or missing reason
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // Require ADMIN role
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const { id } = params;
    const body = await request.json();
    const { action, reason } = body;

    // Validate action
    if (!action || !["suspend", "unsuspend"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'suspend' or 'unsuspend'." },
        { status: 400 }
      );
    }

    // Validate reason for suspension
    if (action === "suspend" && !reason) {
      return NextResponse.json(
        { error: "Reason is required when suspending a user." },
        { status: 400 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        candidate: true,
        employer: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent suspending admin users
    if (user.role === UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Cannot suspend admin users." },
        { status: 403 }
      );
    }

    // Prevent admins from suspending themselves
    if (user.id === session.user.id) {
      return NextResponse.json(
        { error: "You cannot suspend your own account." },
        { status: 403 }
      );
    }

    let updatedUser;
    let emailSubject: string;
    let emailHtml: string;

    if (action === "suspend") {
      // Check if already suspended
      if (user.suspendedAt) {
        return NextResponse.json(
          { error: "User is already suspended." },
          { status: 400 }
        );
      }

      // Suspend user
      updatedUser = await prisma.user.update({
        where: { id },
        data: {
          suspendedAt: new Date(),
          suspensionReason: reason,
        },
      });

      // Send suspension email
      emailSubject = `⚠️ Your Account Has Been Suspended`;
      emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f5f5f5;">
              <tr>
                <td style="padding: 40px 20px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 40px 40px 60px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                          ⚠️ Account Suspended
                        </h1>
                      </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px; background-color: #ffffff;">
                        <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                          Hi <strong>${user.name}</strong>,
                        </p>

                        <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                          Your account has been suspended by our moderation team. You will not be able to access your account until the suspension is lifted.
                        </p>

                        <!-- Reason Box -->
                        <div style="background-color: #FEE2E2; border-left: 4px solid #EF4444; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                          <p style="margin: 0 0 10px; color: #991B1B; font-weight: 600; font-size: 14px;">
                            📋 Reason for suspension:
                          </p>
                          <p style="margin: 0; color: #B91C1C; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
                            ${reason}
                          </p>
                        </div>

                        <div style="background-color: #FEF3C7; border: 1px solid #FCD34D; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                          <p style="margin: 0 0 10px; color: #92400E; font-weight: 600; font-size: 14px;">
                            ⚠️ What this means:
                          </p>
                          <ul style="margin: 0; padding-left: 20px; color: #78350F; font-size: 14px;">
                            <li>You cannot log in to your account</li>
                            ${user.role === UserRole.CANDIDATE ? "<li>Your applications are hidden from employers</li>" : ""}
                            ${user.role === UserRole.CANDIDATE ? "<li>You cannot apply to new jobs</li>" : ""}
                            ${user.role === UserRole.EMPLOYER ? "<li>Your job postings are hidden</li>" : ""}
                            ${user.role === UserRole.EMPLOYER ? "<li>You cannot post new jobs</li>" : ""}
                            <li>All account features are disabled</li>
                          </ul>
                        </div>

                        <div style="background-color: #DBEAFE; border: 1px solid #60A5FA; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                          <p style="margin: 0 0 10px; color: #1E40AF; font-weight: 600; font-size: 14px;">
                            📞 What you can do:
                          </p>
                          <p style="margin: 0; color: #1E3A8A; font-size: 14px; line-height: 1.6;">
                            If you believe this suspension was made in error or would like to appeal, please contact our support team at <a href="mailto:${EMAIL_CONFIG.replyTo}" style="color: #1D4ED8;">${EMAIL_CONFIG.replyTo}</a>
                          </p>
                        </div>

                        <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.6; text-align: center;">
                          We appreciate your understanding.
                        </p>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                          © ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.
                        </p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;
    } else {
      // Unsuspend
      if (!user.suspendedAt) {
        return NextResponse.json(
          { error: "User is not currently suspended." },
          { status: 400 }
        );
      }

      // Unsuspend user
      updatedUser = await prisma.user.update({
        where: { id },
        data: {
          suspendedAt: null,
          suspensionReason: null,
        },
      });

      // Send unsuspension email
      emailSubject = `✅ Your Account Has Been Reinstated`;
      emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f5f5f5;">
              <tr>
                <td style="padding: 40px 20px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 40px 40px 60px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                          ✅ Account Reinstated
                        </h1>
                      </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px; background-color: #ffffff;">
                        <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                          Hi <strong>${user.name}</strong>,
                        </p>

                        <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                          Good news! The suspension on your account has been lifted. You now have full access to all features.
                        </p>

                        <div style="background: #D1FAE5; border-left: 4px solid #10B981; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                          <p style="margin: 0 0 10px; color: #065F46; font-weight: 600; font-size: 14px;">
                            ✅ You can now:
                          </p>
                          <ul style="margin: 0; padding-left: 20px; color: #047857; font-size: 14px;">
                            <li>Log in to your account</li>
                            ${user.role === UserRole.CANDIDATE ? "<li>Apply to jobs and view your applications</li>" : ""}
                            ${user.role === UserRole.EMPLOYER ? "<li>Post new jobs and manage applications</li>" : ""}
                            <li>Access all account features</li>
                          </ul>
                        </div>

                        <div style="background-color: #FEF3C7; border: 1px solid #FCD34D; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                          <p style="margin: 0; color: #78350F; font-size: 14px; line-height: 1.6;">
                            Please ensure you follow our community guidelines to avoid future suspensions.
                          </p>
                        </div>

                        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                          <tr>
                            <td style="border-radius: 6px; background: linear-gradient(135deg, #10B981 0%, #059669 100%);">
                              <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard"
                                 style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                                Go to Dashboard
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                          © ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.
                        </p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;
    }

    // Send email notification
    try {
      await sendEmail({
        to: user.email,
        subject: emailSubject,
        html: emailHtml,
      });
    } catch (emailError) {
      console.error("Failed to send suspension/unsuspension email:", emailError);
      // Don't fail the request if email fails
    }

    // Log admin action
    console.log(
      `[ADMIN] ${session.user.email} ${action}ed user ${id} (${user.email})${action === "suspend" ? ` - Reason: ${reason}` : ""}`
    );

    return NextResponse.json({
      success: true,
      action,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        suspendedAt: updatedUser.suspendedAt,
        suspensionReason: updatedUser.suspensionReason,
        isSuspended: !!updatedUser.suspendedAt,
      },
      message:
        action === "suspend"
          ? "User suspended successfully"
          : "User suspension lifted successfully",
    });
  } catch (error) {
    console.error("Admin user suspension error:", error);
    return NextResponse.json(
      {
        error: "Failed to process suspension action",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
