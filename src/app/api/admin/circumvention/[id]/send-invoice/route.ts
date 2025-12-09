import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";
import { FlagStatus } from "@prisma/client";

/**
 * POST /api/admin/circumvention/[id]/send-invoice
 * Generate and send invoice email to employer for circumvention fee
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { id } = await params;
    const body = await request.json();
    const { invoiceAmount, customMessage, dueDate } = body;

    // Get flag with all related data
    const flag = await prisma.circumventionFlag.findUnique({
      where: { id },
      include: {
        introduction: {
          include: {
            candidate: {
              include: {
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            employer: {
              select: {
                id: true,
                companyName: true,
                contactName: true,
                contactEmail: true,
                user: {
                  select: {
                    email: true,
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
        },
      },
    });

    if (!flag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    // Determine invoice amount
    const finalInvoiceAmount = invoiceAmount
      ? parseFloat(invoiceAmount)
      : flag.estimatedFeeOwed
        ? Number(flag.estimatedFeeOwed)
        : null;

    if (!finalInvoiceAmount || finalInvoiceAmount <= 0) {
      return NextResponse.json(
        { error: "Invoice amount is required and must be greater than 0" },
        { status: 400 }
      );
    }

    // Get employer email
    const employerEmail =
      flag.introduction.employer.contactEmail ||
      flag.introduction.employer.user.email;

    if (!employerEmail) {
      return NextResponse.json(
        { error: "No employer email found" },
        { status: 400 }
      );
    }

    // Calculate due date (default 30 days)
    const invoiceDueDate = dueDate
      ? new Date(dueDate)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Format currency
    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(finalInvoiceAmount);

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${flag.id.slice(-4).toUpperCase()}`;

    // Send invoice email
    const candidateName = flag.introduction.candidate.user.name;
    const companyName = flag.introduction.employer.companyName;
    const contactName =
      flag.introduction.employer.contactName || "Hiring Manager";
    const jobTitle = flag.introduction.job?.title || "the position";
    const introductionDate = flag.introduction.introducedAt
      ? new Date(flag.introduction.introducedAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "N/A";

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .invoice-box { background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border: 2px solid #E5E7EB; }
            .invoice-header { border-bottom: 2px solid #4F46E5; padding-bottom: 15px; margin-bottom: 20px; }
            .invoice-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #E5E7EB; }
            .invoice-total { background: #4F46E5; color: white; padding: 15px; border-radius: 6px; margin-top: 20px; }
            .button { display: inline-block; background: #4F46E5; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
            .terms { background: #FEF3C7; border: 1px solid #F59E0B; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Placement Fee Invoice</h1>
              <p>Invoice #${invoiceNumber}</p>
            </div>
            <div class="content">
              <p>Dear ${contactName},</p>

              <p>Congratulations on your successful hire! We're pleased that our introduction led to a placement at ${companyName}.</p>

              <p>Per the SkillProof Service Agreement, a placement fee is due when a candidate we introduce is hired within the 12-month protection period.</p>

              <div class="invoice-box">
                <div class="invoice-header">
                  <h3 style="margin: 0;">INVOICE</h3>
                  <p style="margin: 5px 0 0; color: #6B7280;">Invoice #${invoiceNumber}</p>
                </div>

                <div class="invoice-row">
                  <span><strong>Candidate:</strong></span>
                  <span>${candidateName}</span>
                </div>

                <div class="invoice-row">
                  <span><strong>Position:</strong></span>
                  <span>${jobTitle}</span>
                </div>

                <div class="invoice-row">
                  <span><strong>Introduction Date:</strong></span>
                  <span>${introductionDate}</span>
                </div>

                <div class="invoice-row">
                  <span><strong>Invoice Date:</strong></span>
                  <span>${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                </div>

                <div class="invoice-row">
                  <span><strong>Due Date:</strong></span>
                  <span>${invoiceDueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                </div>

                <div class="invoice-total">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 18px;"><strong>Amount Due:</strong></span>
                    <span style="font-size: 24px;"><strong>${formattedAmount}</strong></span>
                  </div>
                </div>
              </div>

              ${customMessage ? `<p><strong>Note from SkillProof:</strong> ${customMessage}</p>` : ""}

              <div class="terms">
                <strong>Payment Terms:</strong><br>
                • Payment is due within 30 days of invoice date<br>
                • Late payments may incur additional fees per the Service Agreement<br>
                • For questions or payment arrangements, please contact us
              </div>

              <p><strong>Payment Options:</strong></p>
              <ul>
                <li>Bank Transfer (details will be provided upon request)</li>
                <li>Credit Card (contact us to arrange)</li>
                <li>Check payable to "SkillProof"</li>
              </ul>

              <div style="text-align: center;">
                <a href="mailto:billing@getskillproof.com?subject=Invoice ${invoiceNumber}" class="button">
                  Contact Billing
                </a>
              </div>

              <p>Thank you for using SkillProof to find great talent!</p>

              <p>Best regards,<br>The SkillProof Team</p>
            </div>
            <div class="footer">
              <p>SkillProof | Connecting Talent with Opportunity</p>
              <p>Questions? Contact billing@getskillproof.com</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailResult = await sendEmail({
      to: employerEmail,
      subject: `Invoice ${invoiceNumber}: Placement Fee for ${candidateName} - ${formattedAmount}`,
      html,
      text: `Invoice ${invoiceNumber} for placement of ${candidateName} at ${companyName}. Amount due: ${formattedAmount}. Due date: ${invoiceDueDate.toLocaleDateString()}. Please contact billing@getskillproof.com for payment options.`,
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: `Failed to send invoice email: ${emailResult.error}` },
        { status: 500 }
      );
    }

    // Update flag with invoice details
    await prisma.circumventionFlag.update({
      where: { id },
      data: {
        status: FlagStatus.INVOICE_SENT,
        invoiceSentAt: new Date(),
        invoiceAmount: finalInvoiceAmount,
      },
    });

    // Also send a copy to admin
    const adminEmail = process.env.ADMIN_EMAIL || "admin@getskillproof.com";
    await sendEmail({
      to: adminEmail,
      subject: `[COPY] Invoice ${invoiceNumber} sent to ${companyName} - ${formattedAmount}`,
      html: `<p>Invoice sent to ${employerEmail}</p>${html}`,
      text: `Invoice ${invoiceNumber} sent to ${employerEmail} for ${formattedAmount}`,
    });

    console.log(
      `[Circumvention Invoice] Sent invoice ${invoiceNumber} to ${employerEmail} for ${formattedAmount}`
    );

    return NextResponse.json({
      success: true,
      invoice: {
        number: invoiceNumber,
        amount: formattedAmount,
        amountRaw: finalInvoiceAmount,
        sentTo: employerEmail,
        dueDate: invoiceDueDate.toISOString(),
      },
    });
  } catch (error) {
    console.error("[Circumvention Invoice] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to send invoice",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
