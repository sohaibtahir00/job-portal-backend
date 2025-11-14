import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/admin/placements/bulk-payment
 * Record multiple payments at once (Admin only)
 *
 * Accepts JSON array of payment records:
 * [
 *   {
 *     placementId: "placement_id",
 *     paymentType: "UPFRONT" | "REMAINING",
 *     amount: 5000, // in cents
 *     paymentMethod: "bank_transfer" | "check" | "wire" | "stripe",
 *     transactionId: "optional_transaction_id",
 *     paidAt: "2025-01-15T10:30:00Z", // optional, defaults to now
 *     notes: "optional notes"
 *   }
 * ]
 *
 * Returns summary of successful and failed payments
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Forbidden - Admin role required" },
        { status: 403 }
      );
    }

    const payments = await request.json();

    // Validate input is array
    if (!Array.isArray(payments)) {
      return NextResponse.json(
        { error: "Request body must be an array of payment records" },
        { status: 400 }
      );
    }

    console.log(`[BULK PAYMENT] Processing ${payments.length} payment records...`);

    const results = {
      total: payments.length,
      successful: [] as any[],
      failed: [] as any[],
    };

    // Process each payment
    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];
      const index = i + 1;

      try {
        // Validate required fields
        if (!payment.placementId) {
          throw new Error("placementId is required");
        }

        if (!payment.paymentType || !["UPFRONT", "REMAINING"].includes(payment.paymentType)) {
          throw new Error("paymentType must be UPFRONT or REMAINING");
        }

        if (!payment.amount || payment.amount <= 0) {
          throw new Error("amount must be a positive number");
        }

        if (!payment.paymentMethod) {
          throw new Error("paymentMethod is required");
        }

        // Fetch placement
        const placement = await prisma.placement.findUnique({
          where: { id: payment.placementId },
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
        });

        if (!placement) {
          throw new Error(`Placement ${payment.placementId} not found`);
        }

        // Determine what to update based on payment type
        const paidAt = payment.paidAt ? new Date(payment.paidAt) : new Date();
        let updateData: any = {};
        let newPaymentStatus = placement.paymentStatus;

        if (payment.paymentType === "UPFRONT") {
          // Check if upfront already paid
          if (placement.upfrontPaidAt) {
            throw new Error("Upfront payment already recorded");
          }

          updateData = {
            upfrontPaidAt: paidAt,
            upfrontPaymentMethod: payment.paymentMethod,
            upfrontTransactionId: payment.transactionId || null,
          };

          // Update payment status
          if (placement.remainingPaidAt) {
            newPaymentStatus = "FULLY_PAID";
          } else {
            newPaymentStatus = "UPFRONT_PAID";
          }
        } else if (payment.paymentType === "REMAINING") {
          // Check if remaining already paid
          if (placement.remainingPaidAt) {
            throw new Error("Remaining payment already recorded");
          }

          // Check if upfront paid first
          if (!placement.upfrontPaidAt) {
            throw new Error("Upfront payment must be recorded before remaining payment");
          }

          updateData = {
            remainingPaidAt: paidAt,
            remainingPaymentMethod: payment.paymentMethod,
            remainingTransactionId: payment.transactionId || null,
          };

          newPaymentStatus = "FULLY_PAID";
        }

        updateData.paymentStatus = newPaymentStatus;

        // Add notes if provided
        if (payment.notes) {
          const existingNotes = placement.notes || "";
          const timestamp = new Date().toISOString();
          updateData.notes = `${existingNotes}\n[${timestamp}] Bulk Payment: ${payment.notes}`.trim();
        }

        // Update placement
        const updatedPlacement = await prisma.placement.update({
          where: { id: payment.placementId },
          data: updateData,
        });

        // Update employer's totalSpent
        await prisma.employer.update({
          where: { id: placement.employerId },
          data: {
            totalSpent: {
              increment: payment.amount,
            },
          },
        });

        // Send confirmation email to employer
        try {
          const paymentTypeLabel = payment.paymentType === "UPFRONT" ? "Upfront" : "Remaining";
          const amountFormatted = `$${(payment.amount / 100).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;

          await sendEmail({
            to: placement.employer.user.email,
            subject: `Payment Confirmed: ${paymentTypeLabel} Payment for ${placement.candidate.user.name}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #059669;">✅ Payment Confirmed</h2>
                <p>Hi ${placement.employer.user.name},</p>
                <p>We have successfully recorded your <strong>${paymentTypeLabel} Payment</strong> for the placement of <strong>${placement.candidate.user.name}</strong>.</p>

                <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0;"><strong>Payment Details:</strong></p>
                  <ul style="margin: 0; padding-left: 20px;">
                    <li><strong>Amount:</strong> ${amountFormatted}</li>
                    <li><strong>Payment Type:</strong> ${paymentTypeLabel}</li>
                    <li><strong>Payment Method:</strong> ${payment.paymentMethod}</li>
                    ${payment.transactionId ? `<li><strong>Transaction ID:</strong> ${payment.transactionId}</li>` : ''}
                    <li><strong>Date:</strong> ${paidAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</li>
                  </ul>
                </div>

                <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0;"><strong>Placement Details:</strong></p>
                  <ul style="margin: 0; padding-left: 20px;">
                    <li><strong>Candidate:</strong> ${placement.candidate.user.name}</li>
                    <li><strong>Position:</strong> ${placement.job.title}</li>
                    <li><strong>Payment Status:</strong> ${newPaymentStatus.replace(/_/g, ' ')}</li>
                  </ul>
                </div>

                ${newPaymentStatus === 'FULLY_PAID' ? `
                  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>🎉 All payments completed!</strong> Your placement is now fully paid.</p>
                  </div>
                ` : ''}

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${process.env.FRONTEND_URL}/employer/placements/${placement.id}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Placement Details</a>
                </div>

                <p>Thank you for your payment!</p>
                <p>Best regards,<br>The Job Portal Team</p>
              </div>
            `,
          });
        } catch (emailError) {
          console.error(`[BULK PAYMENT] Failed to send confirmation email for placement ${payment.placementId}:`, emailError);
          // Don't fail the payment if email fails
        }

        results.successful.push({
          index,
          placementId: payment.placementId,
          paymentType: payment.paymentType,
          amount: payment.amount,
          newPaymentStatus,
          message: "Payment recorded successfully",
        });

        console.log(`[BULK PAYMENT] ✅ Payment ${index}/${payments.length} successful: ${payment.placementId}`);
      } catch (error) {
        results.failed.push({
          index,
          placementId: payment.placementId || "unknown",
          paymentType: payment.paymentType || "unknown",
          error: error instanceof Error ? error.message : "Unknown error",
        });

        console.error(`[BULK PAYMENT] ❌ Payment ${index}/${payments.length} failed:`, error);
      }

      // Add small delay between payments to avoid overload
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const summary = {
      success: results.failed.length === 0,
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
      results,
    };

    console.log(`[BULK PAYMENT] Completed: ${results.successful.length}/${results.total} successful`);

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[BULK PAYMENT] Fatal error:", error);
    return NextResponse.json(
      {
        error: "Failed to process bulk payments",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
