import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentStatus } from "@prisma/client";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/cron/remaining-payment-due
 * Send reminder emails for placements where remaining payment is due (30+ days after upfront payment)
 * Should be called by a cron job (e.g., daily at 10 AM)
 *
 * Security: Requires CRON_SECRET header to prevent unauthorized access
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const cronSecret = request.headers.get("Authorization")?.replace("Bearer ", "");
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret && cronSecret !== expectedSecret) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid cron secret" },
        { status: 401 }
      );
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find placements where:
    // 1. Upfront payment was made 30+ days ago
    // 2. Remaining payment is still pending
    // 3. Placement is still active
    const placementsDue = await prisma.placement.findMany({
      where: {
        upfrontPaidAt: {
          not: null,
          lte: thirtyDaysAgo, // 30 or more days ago
        },
        remainingPaidAt: null, // Remaining not yet paid
        paymentStatus: "UPFRONT_PAID",
        status: {
          in: ["PENDING", "ACTIVE", "CONFIRMED"],
        },
      },
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
        candidate: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        job: {
          select: {
            title: true,
          },
        },
      },
      orderBy: {
        upfrontPaidAt: "asc",
      },
    });

    const results = [];

    // Process each placement
    for (const placement of placementsDue) {
      try {
        if (!placement.upfrontPaidAt) continue; // TypeScript safety

        const daysSinceUpfront = Math.floor(
          (now.getTime() - placement.upfrontPaidAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        const dueDate = new Date(placement.upfrontPaidAt);
        dueDate.setDate(dueDate.getDate() + 30);

        const isOverdue = now > dueDate;
        const daysOverdue = isOverdue
          ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        // Send reminder email to employer
        try {
          await sendEmail({
            to: placement.employer.user.email,
            subject: isOverdue
              ? `OVERDUE: Remaining Payment for ${placement.candidate.user.name} - ${placement.jobTitle}`
              : `Remaining Payment Due: ${placement.candidate.user.name} - ${placement.jobTitle}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: ${isOverdue ? "#dc2626" : "#f59e0b"};">${isOverdue ? "⚠️ Payment Overdue" : "💰 Remaining Payment Due"}</h2>
                <p>Hi ${placement.employer.companyName} Team,</p>
                <p>This is a ${isOverdue ? `<strong style="color: #dc2626;">OVERDUE</strong>` : ""} reminder that the remaining placement fee payment is now due.</p>

                <div style="background-color: ${isOverdue ? "#fee2e2" : "#fef3c7"}; border-left: 4px solid ${isOverdue ? "#dc2626" : "#f59e0b"}; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0;"><strong>Placement Details:</strong></p>
                  <ul style="margin: 0; padding-left: 20px;">
                    <li><strong>Candidate:</strong> ${placement.candidate.user.name}</li>
                    <li><strong>Position:</strong> ${placement.jobTitle}</li>
                    <li><strong>Start Date:</strong> ${new Date(placement.startDate).toLocaleDateString()}</li>
                  </ul>
                </div>

                <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0;"><strong>Payment Information:</strong></p>
                  <ul style="margin: 0; padding-left: 20px;">
                    <li><strong>Upfront Payment:</strong> $${(placement.upfrontAmount / 100).toLocaleString()} (Paid ${placement.upfrontPaidAt.toLocaleDateString()})</li>
                    <li><strong>Remaining Amount Due:</strong> $${(placement.remainingAmount / 100).toLocaleString()}</li>
                    <li><strong>Due Date:</strong> ${dueDate.toLocaleDateString()}</li>
                    ${isOverdue ? `<li style="color: #dc2626;"><strong>Days Overdue:</strong> ${daysOverdue} days</li>` : `<li><strong>Days Since Upfront:</strong> ${daysSinceUpfront} days</li>`}
                  </ul>
                </div>

                ${isOverdue ? `
                  <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0; color: #7f1d1d;"><strong>Action Required:</strong> This payment is now ${daysOverdue} day(s) overdue. Please process payment immediately to avoid service disruption.</p>
                  </div>
                ` : `
                  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0; color: #92400e;"><strong>Payment Terms:</strong> Remaining payment was due 30 days after upfront payment (${dueDate.toLocaleDateString()}).</p>
                  </div>
                `}

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${process.env.FRONTEND_URL}/employer/invoices" style="background-color: ${isOverdue ? "#dc2626" : "#059669"}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">Pay Now</a>
                  <a href="${process.env.FRONTEND_URL}/employer/placements/${placement.id}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Placement</a>
                </div>

                <p style="font-size: 14px; color: #6b7280;">If you have already processed this payment, please disregard this reminder. If you have any questions, please contact our support team.</p>

                <p>Best regards,<br>The Job Portal Team</p>
              </div>
            `,
          });

          results.push({
            placementId: placement.id,
            employer: placement.employer.companyName,
            candidate: placement.candidate.user.name,
            amount: placement.remainingAmount / 100,
            dueDate: dueDate.toISOString(),
            daysSinceUpfront,
            isOverdue,
            daysOverdue,
            status: "success",
          });
        } catch (emailError) {
          console.error(`Failed to send payment reminder email for placement ${placement.id}:`, emailError);
          results.push({
            placementId: placement.id,
            status: "email_failed",
            error: emailError instanceof Error ? emailError.message : "Unknown error",
          });
        }

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error: any) {
        console.error(`Error processing placement ${placement.id}:`, error);
        results.push({
          placementId: placement.id,
          status: "processing_error",
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const failureCount = results.filter((r) => r.status !== "success").length;

    return NextResponse.json(
      {
        message: `Processed ${placementsDue.length} placement(s) with payment due`,
        summary: {
          total: placementsDue.length,
          emailsSent: successCount,
          failures: failureCount,
        },
        results,
        processedAt: now.toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in remaining-payment-due cron job:", error);
    return NextResponse.json(
      {
        error: "Failed to process payment reminders",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
