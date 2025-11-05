import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { formatCurrency } from "@/lib/stripe";
import { EMAIL_CONFIG } from "@/lib/email";

/**
 * GET /api/placements/[id]/invoice
 * Generate invoice for a placement
 * Returns HTML invoice that can be printed or saved as PDF
 *
 * Access control:
 * - ADMIN: Can generate invoice for any placement
 * - EMPLOYER: Can generate invoice for their company's placements
 *
 * Query parameters:
 * - format: "html" (default) | "json"
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "html";

    // Get placement with full details
    const placement = await prisma.placement.findUnique({
      where: { id },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
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
        job: {
          select: {
            title: true,
            type: true,
            location: true,
          },
        },
      },
    });

    if (!placement) {
      return NextResponse.json(
        { error: "Placement not found" },
        { status: 404 }
      );
    }

    // Check access permissions
    let hasAccess = false;

    if (user.role === UserRole.ADMIN) {
      hasAccess = true;
    } else if (user.role === UserRole.EMPLOYER) {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });
      hasAccess = employer?.id === placement.employerId;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Forbidden. You don't have access to this placement's invoice." },
        { status: 403 }
      );
    }

    // Calculate invoice details
    const invoiceNumber = `INV-${placement.id.slice(0, 8).toUpperCase()}`;
    const invoiceDate = placement.upfrontPaidAt || placement.createdAt;

    const lineItems = [
      {
        description: `Upfront Placement Fee (50%) - ${placement.jobTitle}`,
        quantity: 1,
        unitPrice: placement.upfrontAmount || 0,
        amount: placement.upfrontAmount || 0,
        status: placement.upfrontPaidAt ? "Paid" : "Pending",
        paidDate: placement.upfrontPaidAt,
      },
      {
        description: `Remaining Placement Fee (50%) - ${placement.jobTitle}`,
        quantity: 1,
        unitPrice: placement.remainingAmount || 0,
        amount: placement.remainingAmount || 0,
        status: placement.remainingPaidAt ? "Paid" : "Pending",
        paidDate: placement.remainingPaidAt,
      },
    ];

    const subtotal = placement.placementFee || 0;
    const tax = 0; // Configure tax if needed
    const total = subtotal + tax;
    const totalPaid = (placement.upfrontPaidAt ? placement.upfrontAmount || 0 : 0) +
                      (placement.remainingPaidAt ? placement.remainingAmount || 0 : 0);
    const balance = total - totalPaid;

    // If format is JSON, return structured data
    if (format === "json") {
      return NextResponse.json({
        invoice: {
          number: invoiceNumber,
          date: invoiceDate,
          dueDate: placement.startDate,
          status: placement.paymentStatus,
          from: {
            name: EMAIL_CONFIG.appName,
            email: EMAIL_CONFIG.from,
            address: "123 Business St, Suite 100\nCity, State 12345", // Configure this
          },
          to: {
            name: placement.employer?.companyName || "Unknown Company",
            email: placement.employer?.user.email || "",
            address: placement.employer?.location || "",
          },
          placement: {
            id: placement.id,
            candidate: placement.candidate.user.name,
            jobTitle: placement.jobTitle,
            startDate: placement.startDate,
            salary: formatCurrency(placement.salary || 0),
            feePercentage: placement.feePercentage,
          },
          lineItems,
          subtotal: formatCurrency(subtotal),
          tax: formatCurrency(tax),
          total: formatCurrency(total),
          totalPaid: formatCurrency(totalPaid),
          balance: formatCurrency(balance),
        },
      });
    }

    // Generate HTML invoice
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Invoice ${invoiceNumber}</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            body {
              font-family: 'Helvetica', 'Arial', sans-serif;
              line-height: 1.6;
              color: #333;
              padding: 40px;
              background: #f5f5f5;
            }

            .invoice-container {
              max-width: 800px;
              margin: 0 auto;
              background: white;
              padding: 60px;
              box-shadow: 0 0 20px rgba(0,0,0,0.1);
            }

            .header {
              display: flex;
              justify-content: space-between;
              align-items: start;
              margin-bottom: 40px;
              padding-bottom: 20px;
              border-bottom: 2px solid #4F46E5;
            }

            .company-info h1 {
              color: #4F46E5;
              font-size: 28px;
              margin-bottom: 5px;
            }

            .invoice-info {
              text-align: right;
            }

            .invoice-info h2 {
              font-size: 32px;
              color: #333;
              margin-bottom: 10px;
            }

            .invoice-number {
              font-size: 14px;
              color: #666;
            }

            .parties {
              display: flex;
              justify-content: space-between;
              margin: 40px 0;
            }

            .party {
              flex: 1;
            }

            .party h3 {
              font-size: 12px;
              text-transform: uppercase;
              color: #666;
              margin-bottom: 10px;
            }

            .party-details {
              font-size: 14px;
            }

            .party-details strong {
              display: block;
              font-size: 16px;
              color: #333;
              margin-bottom: 5px;
            }

            .placement-details {
              background: #f9fafb;
              padding: 20px;
              border-radius: 8px;
              margin: 30px 0;
            }

            .placement-details h3 {
              color: #4F46E5;
              margin-bottom: 15px;
            }

            .placement-details table {
              width: 100%;
              font-size: 14px;
            }

            .placement-details td {
              padding: 5px 0;
            }

            .placement-details td:first-child {
              color: #666;
              width: 180px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin: 30px 0;
            }

            thead {
              background: #4F46E5;
              color: white;
            }

            th {
              padding: 12px;
              text-align: left;
              font-weight: 600;
              font-size: 12px;
              text-transform: uppercase;
            }

            th:last-child,
            td:last-child {
              text-align: right;
            }

            tbody tr {
              border-bottom: 1px solid #e5e7eb;
            }

            tbody tr:hover {
              background: #f9fafb;
            }

            td {
              padding: 15px 12px;
              font-size: 14px;
            }

            .status-badge {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
            }

            .status-paid {
              background: #D1FAE5;
              color: #065F46;
            }

            .status-pending {
              background: #FEF3C7;
              color: #92400E;
            }

            .totals {
              margin-left: auto;
              width: 300px;
              margin-top: 20px;
            }

            .totals-row {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              font-size: 14px;
            }

            .totals-row.subtotal {
              border-top: 1px solid #e5e7eb;
            }

            .totals-row.total {
              border-top: 2px solid #333;
              font-size: 18px;
              font-weight: 700;
              padding-top: 15px;
              margin-top: 5px;
            }

            .totals-row.balance {
              color: ${balance > 0 ? '#DC2626' : '#059669'};
              font-weight: 700;
            }

            .footer {
              margin-top: 60px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              font-size: 12px;
              color: #666;
              text-align: center;
            }

            .footer strong {
              display: block;
              color: #333;
              margin-bottom: 5px;
            }

            @media print {
              body {
                background: white;
                padding: 0;
              }

              .invoice-container {
                box-shadow: none;
                padding: 40px;
              }
            }
          </style>
        </head>
        <body>
          <div class="invoice-container">
            <!-- Header -->
            <div class="header">
              <div class="company-info">
                <h1>${EMAIL_CONFIG.appName}</h1>
                <p>Recruitment & Placement Services</p>
              </div>
              <div class="invoice-info">
                <h2>INVOICE</h2>
                <div class="invoice-number">${invoiceNumber}</div>
                <div class="invoice-number">Date: ${invoiceDate.toLocaleDateString()}</div>
              </div>
            </div>

            <!-- Parties -->
            <div class="parties">
              <div class="party">
                <h3>From</h3>
                <div class="party-details">
                  <strong>${EMAIL_CONFIG.appName}</strong>
                  123 Business St, Suite 100<br>
                  City, State 12345<br>
                  ${EMAIL_CONFIG.replyTo}
                </div>
              </div>
              <div class="party">
                <h3>Bill To</h3>
                <div class="party-details">
                  <strong>${placement.employer?.companyName || "Unknown Company"}</strong>
                  ${placement.employer?.location || ""}<br>
                  ${placement.employer?.user.email || ""}
                </div>
              </div>
            </div>

            <!-- Placement Details -->
            <div class="placement-details">
              <h3>Placement Details</h3>
              <table>
                <tr>
                  <td>Candidate:</td>
                  <td><strong>${placement.candidate.user.name}</strong></td>
                </tr>
                <tr>
                  <td>Position:</td>
                  <td><strong>${placement.jobTitle}</strong></td>
                </tr>
                <tr>
                  <td>Start Date:</td>
                  <td>${placement.startDate.toLocaleDateString()}</td>
                </tr>
                <tr>
                  <td>Annual Salary:</td>
                  <td>${formatCurrency(placement.salary || 0)}</td>
                </tr>
                <tr>
                  <td>Placement Fee:</td>
                  <td>${placement.feePercentage}% of annual salary</td>
                </tr>
                <tr>
                  <td>Guarantee Period:</td>
                  <td>${placement.guaranteePeriodDays} days (until ${placement.guaranteeEndDate?.toLocaleDateString()})</td>
                </tr>
              </table>
            </div>

            <!-- Line Items -->
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${lineItems.map(item => `
                  <tr>
                    <td>
                      ${item.description}
                      ${item.paidDate ? `<br><small style="color: #666;">Paid: ${item.paidDate.toLocaleDateString()}</small>` : ""}
                    </td>
                    <td>
                      <span class="status-badge status-${item.status.toLowerCase()}">
                        ${item.status}
                      </span>
                    </td>
                    <td>${formatCurrency(item.amount)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>

            <!-- Totals -->
            <div class="totals">
              <div class="totals-row subtotal">
                <span>Subtotal:</span>
                <span>${formatCurrency(subtotal)}</span>
              </div>
              ${tax > 0 ? `
              <div class="totals-row">
                <span>Tax:</span>
                <span>${formatCurrency(tax)}</span>
              </div>
              ` : ""}
              <div class="totals-row total">
                <span>Total:</span>
                <span>${formatCurrency(total)}</span>
              </div>
              <div class="totals-row">
                <span>Paid:</span>
                <span>${formatCurrency(totalPaid)}</span>
              </div>
              <div class="totals-row balance">
                <span>Balance Due:</span>
                <span>${formatCurrency(balance)}</span>
              </div>
            </div>

            <!-- Footer -->
            <div class="footer">
              <strong>Payment Terms:</strong>
              50% upfront payment due at placement start date<br>
              50% remaining payment due 30 days after start date<br><br>

              <strong>Guarantee:</strong>
              ${placement.guaranteePeriodDays}-day placement guarantee from start date<br><br>

              Thank you for your business!<br>
              Questions? Contact us at ${EMAIL_CONFIG.replyTo}
            </div>
          </div>
        </body>
      </html>
    `;

    // Return HTML
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="invoice-${invoiceNumber}.html"`,
      },
    });
  } catch (error) {
    console.error("Invoice generation error:", error);

    return NextResponse.json(
      {
        error: "Failed to generate invoice",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
