import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole, JobStatus } from "@prisma/client";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";

/**
 * PATCH /api/admin/jobs/[id]/approve
 * Approve or reject a job posting
 *
 * Request Body:
 * - action: "approve" | "reject"
 * - reason?: string (required for rejection)
 *
 * Actions:
 * - approve: Changes status from PENDING_APPROVAL to ACTIVE
 * - reject: Changes status from PENDING_APPROVAL to DRAFT, sends email with reason
 *
 * Response:
 * - 200: { success: true, job, action }
 * - 403: Unauthorized
 * - 404: Job not found
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
    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'approve' or 'reject'." },
        { status: 400 }
      );
    }

    // Validate reason for rejection
    if (action === "reject" && !reason) {
      return NextResponse.json(
        { error: "Reason is required when rejecting a job." },
        { status: 400 }
      );
    }

    // Get job with employer details
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        employer: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check if job is pending approval
    if (job.status !== JobStatus.PENDING_APPROVAL) {
      return NextResponse.json(
        {
          error: `Cannot ${action} job with status ${job.status}. Only PENDING_APPROVAL jobs can be approved or rejected.`,
        },
        { status: 400 }
      );
    }

    let updatedJob;
    let emailSubject: string;
    let emailHtml: string;

    if (action === "approve") {
      // Approve job - set to ACTIVE
      updatedJob = await prisma.job.update({
        where: { id },
        data: {
          status: JobStatus.ACTIVE,
        },
      });

      // Send approval email
      emailSubject = `✅ Job Posting Approved: ${job.title}`;
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
                          ✅ Job Posting Approved
                        </h1>
                      </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px; background-color: #ffffff;">
                        <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                          Hi <strong>${job.employer.user.name}</strong>,
                        </p>

                        <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                          Great news! Your job posting has been approved and is now live on our platform.
                        </p>

                        <!-- Job Info Box -->
                        <div style="background: #D1FAE5; border-left: 4px solid #10B981; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                          <p style="margin: 0 0 10px; color: #065F46; font-weight: 600; font-size: 16px;">
                            ${job.title}
                          </p>
                          <p style="margin: 0; color: #047857; font-size: 14px;">
                            Location: ${job.location}<br>
                            Type: ${job.type}<br>
                            Status: <strong>ACTIVE</strong>
                          </p>
                        </div>

                        <div style="background-color: #DBEAFE; border: 1px solid #60A5FA; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                          <p style="margin: 0 0 10px; color: #1E40AF; font-weight: 600; font-size: 14px;">
                            📊 What happens next:
                          </p>
                          <ul style="margin: 0; padding-left: 20px; color: #1E3A8A; font-size: 14px;">
                            <li>Your job is now visible to all candidates</li>
                            <li>Candidates can start applying immediately</li>
                            <li>You'll receive email notifications for new applications</li>
                            <li>Track applications in your employer dashboard</li>
                          </ul>
                        </div>

                        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                          <tr>
                            <td style="border-radius: 6px; background: linear-gradient(135deg, #10B981 0%, #059669 100%);">
                              <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/jobs/${job.id}"
                                 style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                                View Job Posting
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
    } else {
      // Reject job - set back to DRAFT
      updatedJob = await prisma.job.update({
        where: { id },
        data: {
          status: JobStatus.DRAFT,
        },
      });

      // Send rejection email with reason
      emailSubject = `❌ Job Posting Requires Changes: ${job.title}`;
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
                          ❌ Job Posting Requires Changes
                        </h1>
                      </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px; background-color: #ffffff;">
                        <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                          Hi <strong>${job.employer.user.name}</strong>,
                        </p>

                        <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                          Your job posting has been reviewed and requires some changes before it can be published.
                        </p>

                        <!-- Job Info Box -->
                        <div style="background: #FEE2E2; border-left: 4px solid #EF4444; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                          <p style="margin: 0 0 10px; color: #991B1B; font-weight: 600; font-size: 16px;">
                            ${job.title}
                          </p>
                          <p style="margin: 0; color: #B91C1C; font-size: 14px;">
                            Status: <strong>DRAFT</strong> (Changes Required)
                          </p>
                        </div>

                        <!-- Reason Box -->
                        <div style="background-color: #FEF3C7; border: 1px solid #FCD34D; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                          <p style="margin: 0 0 10px; color: #92400E; font-weight: 600; font-size: 14px;">
                            📝 Feedback from our team:
                          </p>
                          <p style="margin: 0; color: #78350F; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
                            ${reason}
                          </p>
                        </div>

                        <div style="background-color: #DBEAFE; border: 1px solid #60A5FA; padding: 20px; margin: 0 0 30px; border-radius: 6px;">
                          <p style="margin: 0 0 10px; color: #1E40AF; font-weight: 600; font-size: 14px;">
                            🔧 Next steps:
                          </p>
                          <ul style="margin: 0; padding-left: 20px; color: #1E3A8A; font-size: 14px;">
                            <li>Review the feedback above</li>
                            <li>Edit your job posting to address the concerns</li>
                            <li>Resubmit for approval</li>
                            <li>We'll review it again within 24 hours</li>
                          </ul>
                        </div>

                        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                          <tr>
                            <td style="border-radius: 6px; background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);">
                              <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/jobs/${job.id}/edit"
                                 style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                                Edit Job Posting
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 10px; color: #666666; font-size: 12px; line-height: 1.6; text-align: center;">
                          Questions? Contact us at ${EMAIL_CONFIG.replyTo}
                        </p>
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
        to: job.employer.user.email,
        subject: emailSubject,
        html: emailHtml,
      });
    } catch (emailError) {
      console.error("Failed to send job approval/rejection email:", emailError);
      // Don't fail the request if email fails
    }

    // Log admin action
    console.log(
      `[ADMIN] ${session.user.email} ${action}ed job ${id} (${job.title})${action === "reject" ? ` - Reason: ${reason}` : ""}`
    );

    return NextResponse.json({
      success: true,
      action,
      job: {
        id: updatedJob.id,
        title: updatedJob.title,
        status: updatedJob.status,
        updatedAt: updatedJob.updatedAt,
      },
      message:
        action === "approve"
          ? "Job approved and is now active"
          : "Job rejected and returned to draft status",
    });
  } catch (error) {
    console.error("Admin job approval error:", error);
    return NextResponse.json(
      {
        error: "Failed to process approval action",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
