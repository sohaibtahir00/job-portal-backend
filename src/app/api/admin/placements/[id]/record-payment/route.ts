import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PaymentStatus, InvoiceStatus, InvoiceType } from "@prisma/client";
import { formatCurrency } from "@/lib/stripe";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/admin/placements/[id]/record-payment
 * Record a payment for a placement (admin only)
 *
 * Body:
 * - paymentType: "upfront" | "remaining" | "full"
 * - amount: number (in cents)
 * - paymentMethod: "bank_transfer" | "wire" | "check" | "stripe" | "other"
 * - transactionId?: string
 * - notes?: string
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { paymentType, amount, paymentMethod, transactionId, notes } = body;

    // Validate payment type
    if (!["upfront", "remaining", "full"].includes(paymentType)) {
      return NextResponse.json(
        { error: "Invalid payment type. Must be 'upfront', 'remaining', or 'full'" },
        { status: 400 }
      );
    }

    // Validate payment method
    const validMethods = ["bank_transfer", "wire", "check", "stripe", "other"];
    if (!validMethods.includes(paymentMethod)) {
      return NextResponse.json(
        { error: "Invalid payment method" },
        { status: 400 }
      );
    }

    // Get the placement
    const placement = await prisma.placement.findUnique({
      where: { id },
      include: {
        employer: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        candidate: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
        invoices: true,
      },
    });

    if (!placement) {
      return NextResponse.json({ error: "Placement not found" }, { status: 404 });
    }

    const now = new Date();
    let updateData: any = {};
    let newPaymentStatus: PaymentStatus = placement.paymentStatus;
    let invoiceType: InvoiceType | null = null;
    let invoiceAmount = 0;

    // Handle different payment types
    if (paymentType === "upfront") {
      if (placement.upfrontPaidAt) {
        return NextResponse.json(
          { error: "Upfront payment already recorded" },
          { status: 400 }
        );
      }

      updateData = {
        upfrontPaidAt: now,
        upfrontPaymentMethod: paymentMethod,
        upfrontTransactionId: transactionId || null,
      };

      newPaymentStatus = PaymentStatus.UPFRONT_PAID;
      invoiceType = InvoiceType.UPFRONT_PAYMENT;
      invoiceAmount = amount || placement.upfrontAmount || 0;

    } else if (paymentType === "remaining") {
      if (!placement.upfrontPaidAt) {
        return NextResponse.json(
          { error: "Upfront payment must be recorded first" },
          { status: 400 }
        );
      }

      if (placement.remainingPaidAt) {
        return NextResponse.json(
          { error: "Remaining payment already recorded" },
          { status: 400 }
        );
      }

      updateData = {
        remainingPaidAt: now,
        remainingPaymentMethod: paymentMethod,
        remainingTransactionId: transactionId || null,
      };

      newPaymentStatus = PaymentStatus.FULLY_PAID;
      invoiceType = InvoiceType.REMAINING_PAYMENT;
      invoiceAmount = amount || placement.remainingAmount || 0;

    } else if (paymentType === "full") {
      if (placement.paymentStatus === PaymentStatus.FULLY_PAID) {
        return NextResponse.json(
          { error: "Placement is already fully paid" },
          { status: 400 }
        );
      }

      updateData = {
        upfrontPaidAt: placement.upfrontPaidAt || now,
        remainingPaidAt: now,
        upfrontPaymentMethod: placement.upfrontPaymentMethod || paymentMethod,
        remainingPaymentMethod: paymentMethod,
        upfrontTransactionId: placement.upfrontTransactionId || transactionId || null,
        remainingTransactionId: transactionId || null,
      };

      newPaymentStatus = PaymentStatus.FULLY_PAID;
      invoiceType = InvoiceType.FULL_PAYMENT;
      invoiceAmount = amount || placement.placementFee || 0;
    }

    // Update payment status
    updateData.paymentStatus = newPaymentStatus;

    // Add notes if provided
    if (notes) {
      updateData.notes = placement.notes
        ? `${placement.notes}\n\n[${now.toISOString()}] Payment recorded: ${notes}`
        : `[${now.toISOString()}] Payment recorded: ${notes}`;
    }

    // Update the placement
    const updatedPlacement = await prisma.placement.update({
      where: { id },
      data: updateData,
    });

    // Create or update invoice record
    if (invoiceType) {
      const invoiceNumber = `INV-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${id.slice(-6).toUpperCase()}`;

      await prisma.invoice.create({
        data: {
          placementId: id,
          invoiceType,
          status: InvoiceStatus.PAID,
          invoiceNumber: `${invoiceNumber}-${paymentType.toUpperCase()}`,
          amount: invoiceAmount,
          dueDate: now,
          paidAt: now,
          paymentMethod,
          transactionId: transactionId || null,
          recipientEmail: placement.employer?.user.email || "",
          recipientName: placement.employer?.user.name || "",
          companyName: placement.companyName,
          subject: `Payment received - ${placement.jobTitle}`,
          feePercentage: placement.feePercentage,
          upfrontPercentage: placement.upfrontPercentage,
          remainingPercentage: placement.remainingPercentage,
          notes,
        },
      });
    }

    // Update employer's total spent
    if (placement.employer) {
      await prisma.employer.update({
        where: { id: placement.employerId! },
        data: {
          totalSpent: {
            increment: invoiceAmount,
          },
        },
      });
    }

    // Send confirmation email to employer
    if (placement.employer?.user.email) {
      try {
        await sendEmail({
          to: placement.employer.user.email,
          subject: `Payment Received - ${placement.jobTitle}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #059669;">Payment Received</h2>
              <p>Hi ${placement.employer.user.name},</p>
              <p>We've received your ${paymentType} payment for the placement of <strong>${placement.candidate.user.name}</strong> as <strong>${placement.jobTitle}</strong>.</p>

              <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Payment Details:</strong></p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>Amount: ${formatCurrency(invoiceAmount)}</li>
                  <li>Payment Type: ${paymentType.charAt(0).toUpperCase() + paymentType.slice(1)}</li>
                  <li>Method: ${paymentMethod.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</li>
                  ${transactionId ? `<li>Transaction ID: ${transactionId}</li>` : ""}
                  <li>Date: ${now.toLocaleDateString()}</li>
                </ul>
              </div>

              ${newPaymentStatus === PaymentStatus.FULLY_PAID
                ? `<p style="color: #059669; font-weight: bold;">✅ This placement is now fully paid. Thank you!</p>`
                : `<p>Remaining balance: ${formatCurrency((placement.placementFee || 0) - invoiceAmount)}</p>`
              }

              <p>Thank you for your business!</p>
              <p>Best regards,<br>The Job Portal Team</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("Failed to send payment confirmation email:", emailError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${paymentType} payment recorded successfully`,
      placement: {
        id: updatedPlacement.id,
        paymentStatus: updatedPlacement.paymentStatus,
        upfrontPaidAt: updatedPlacement.upfrontPaidAt,
        remainingPaidAt: updatedPlacement.remainingPaidAt,
      },
      payment: {
        type: paymentType,
        amount: invoiceAmount,
        amountFormatted: formatCurrency(invoiceAmount),
        method: paymentMethod,
        transactionId,
        recordedAt: now,
      },
    });
  } catch (error) {
    console.error("Record payment error:", error);
    return NextResponse.json(
      { error: "Failed to record payment" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/placements/[id]/record-payment
 * Get payment status for a placement
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    const placement = await prisma.placement.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: { createdAt: "desc" },
        },
        employer: {
          select: {
            companyName: true,
            user: {
              select: { name: true, email: true },
            },
          },
        },
        candidate: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!placement) {
      return NextResponse.json({ error: "Placement not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      placement: {
        id: placement.id,
        jobTitle: placement.jobTitle,
        companyName: placement.companyName,
        candidate: placement.candidate.user.name,
        salary: placement.salary,
        salaryFormatted: formatCurrency(placement.salary || 0),
        placementFee: placement.placementFee,
        placementFeeFormatted: formatCurrency(placement.placementFee || 0),
        feePercentage: placement.feePercentage,
      },
      payment: {
        status: placement.paymentStatus,
        upfront: {
          amount: placement.upfrontAmount,
          amountFormatted: formatCurrency(placement.upfrontAmount || 0),
          percentage: placement.upfrontPercentage,
          paidAt: placement.upfrontPaidAt,
          method: placement.upfrontPaymentMethod,
          transactionId: placement.upfrontTransactionId,
        },
        remaining: {
          amount: placement.remainingAmount,
          amountFormatted: formatCurrency(placement.remainingAmount || 0),
          percentage: placement.remainingPercentage,
          paidAt: placement.remainingPaidAt,
          method: placement.remainingPaymentMethod,
          transactionId: placement.remainingTransactionId,
          dueDate: placement.guaranteeEndDate,
        },
      },
      invoices: placement.invoices,
    });
  } catch (error) {
    console.error("Get payment status error:", error);
    return NextResponse.json(
      { error: "Failed to get payment status" },
      { status: 500 }
    );
  }
}
