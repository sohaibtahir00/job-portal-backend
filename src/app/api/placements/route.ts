import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole, PlacementStatus, PaymentStatus, ApplicationStatus } from "@prisma/client";
import { calculatePlacementFeeAmounts } from "@/lib/stripe";
import { calculateFeePercentage } from "@/lib/placement-fee";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/placements
 * Create a new placement record when a candidate is hired
 * Requires EMPLOYER or ADMIN role
 *
 * Request body:
 * {
 *   "candidateId": "string",
 *   "jobId": "string" (optional),
 *   "jobTitle": "string",
 *   "companyName": "string" (optional, defaults to employer's company),
 *   "startDate": "ISO date string",
 *   "salary": number (in cents),
 *   "feePercentage": number (optional, auto-calculated from job experience level: 15% for Entry/Mid, 18% for Senior, 20% for Executive),
 *   "upfrontPercentage": number (optional, default 50 - percentage of total fee paid upfront),
 *   "remainingPercentage": number (optional, default 50 - percentage of total fee paid later),
 *   "guaranteePeriodDays": number (optional, default 90),
 *   "notes": "string" (optional)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Get user and check role in one call
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (![UserRole.EMPLOYER, UserRole.ADMIN].includes(user.role as UserRole)) {
      return NextResponse.json(
        { error: "Forbidden - Employer or Admin role required" },
        { status: 403 }
      );
    }

    // Get employer profile
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!employer && user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Employer profile not found. Please create your profile first." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      candidateId,
      jobId,
      jobTitle,
      companyName,
      startDate,
      salary,
      feePercentage = 18,
      upfrontPercentage = 50,
      remainingPercentage = 50,
      guaranteePeriodDays = 90,
      notes,
    } = body;

    // Validate required fields
    if (!candidateId || !jobTitle || !startDate || !salary) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          required: ["candidateId", "jobTitle", "startDate", "salary"],
        },
        { status: 400 }
      );
    }

    // Validate candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Validate job if provided
    let job = null;
    let dynamicFeePercentage = feePercentage;
    if (jobId) {
      job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          employer: true,
        },
      });

      if (!job) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      // Verify job belongs to this employer (unless admin)
      if (user.role !== UserRole.ADMIN && employer && job.employerId !== employer.id) {
        return NextResponse.json(
          { error: "Forbidden. You can only create placements for your own jobs." },
          { status: 403 }
        );
      }

      // Calculate fee percentage based on experience level if not explicitly provided
      if (feePercentage === 18) {
        // Only override default 18%, keep custom values
        dynamicFeePercentage = calculateFeePercentage(job.experienceLevel) * 100;
      }
    }

    // Validate salary
    if (typeof salary !== "number" || salary <= 0) {
      return NextResponse.json(
        { error: "Salary must be a positive number (in cents)" },
        { status: 400 }
      );
    }

    // Validate fee percentage
    if (typeof dynamicFeePercentage !== "number" || dynamicFeePercentage < 0 || dynamicFeePercentage > 100) {
      return NextResponse.json(
        { error: "Fee percentage must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Validate payment split percentages
    if (typeof upfrontPercentage !== "number" || upfrontPercentage < 0 || upfrontPercentage > 100) {
      return NextResponse.json(
        { error: "Upfront percentage must be between 0 and 100" },
        { status: 400 }
      );
    }

    if (typeof remainingPercentage !== "number" || remainingPercentage < 0 || remainingPercentage > 100) {
      return NextResponse.json(
        { error: "Remaining percentage must be between 0 and 100" },
        { status: 400 }
      );
    }

    if (Math.abs(upfrontPercentage + remainingPercentage - 100) > 0.01) {
      return NextResponse.json(
        { error: "Upfront and remaining percentages must add up to 100" },
        { status: 400 }
      );
    }

    // Calculate placement fee based on dynamic fee percentage (15-20% based on experience level)
    const placementFee = Math.round(salary * (dynamicFeePercentage / 100));

    // Calculate payment amounts using custom split
    const upfrontAmount = Math.round(placementFee * (upfrontPercentage / 100));
    const remainingAmount = placementFee - upfrontAmount; // Ensure exact total

    // Calculate guarantee end date
    const startDateObj = new Date(startDate);
    const guaranteeEndDate = new Date(startDateObj);
    guaranteeEndDate.setDate(guaranteeEndDate.getDate() + guaranteePeriodDays);

    // Get company name
    const finalCompanyName = companyName || employer?.companyName || job?.employer?.companyName || "Unknown Company";

    // Create placement
    const placement = await prisma.placement.create({
      data: {
        candidateId,
        employerId: employer?.id || job?.employerId,
        jobId,
        jobTitle,
        companyName: finalCompanyName,
        startDate: startDateObj,
        salary,
        feePercentage: dynamicFeePercentage,
        upfrontPercentage,
        remainingPercentage,
        placementFee,
        upfrontAmount,
        remainingAmount,
        guaranteePeriodDays,
        guaranteeEndDate,
        status: PlacementStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        notes,
      },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                id: true,
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
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        job: {
          select: {
            id: true,
            title: true,
            type: true,
          },
        },
      },
    });

    // If there's an associated job application, update it to ACCEPTED
    if (jobId) {
      await prisma.application.updateMany({
        where: {
          jobId,
          candidateId,
          status: {
            not: ApplicationStatus.ACCEPTED,
          },
        },
        data: {
          status: ApplicationStatus.ACCEPTED,
        },
      });
    }

    // Update candidate availability to false (they got placed)
    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        availability: false,
      },
    });

    // Send invoice email to employer
    try {
      const upfrontDueDate = startDateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      const remainingDueDate = new Date(startDateObj.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      const upfrontFormatted = `$${(upfrontAmount / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      const remainingFormatted = `$${(remainingAmount / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      const totalFormatted = `$${(placementFee / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      // Generate invoice number
      const invoiceCount = await prisma.invoice.count();
      const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(6, '0')}`;

      // Build email HTML
      const emailSubject = `Invoice for Placement: ${candidate.user.name} - ${jobTitle}`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">📄 New Placement Invoice</h2>
          <p><strong>Invoice #:</strong> ${invoiceNumber}</p>
          <p>Hi ${placement.employer.user.name},</p>
          <p>Congratulations on your new placement! Below are the invoice details for <strong>${candidate.user.name}</strong> at <strong>${finalCompanyName}</strong>.</p>

          <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Placement Details:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>Candidate:</strong> ${candidate.user.name}</li>
              <li><strong>Position:</strong> ${jobTitle}</li>
              <li><strong>Start Date:</strong> ${upfrontDueDate}</li>
              <li><strong>Guarantee Period:</strong> ${guaranteePeriodDays} days</li>
            </ul>
          </div>

          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>💰 Payment Schedule:</strong></p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;"><strong>Upfront Payment (${upfrontPercentage}%)</strong></td>
                <td style="padding: 8px; text-align: right;"><strong>${upfrontFormatted}</strong></td>
              </tr>
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">Due Date:</td>
                <td style="padding: 8px; text-align: right;">${upfrontDueDate}</td>
              </tr>
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;"><strong>Remaining Payment (${remainingPercentage}%)</strong></td>
                <td style="padding: 8px; text-align: right;"><strong>${remainingFormatted}</strong></td>
              </tr>
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">Due Date:</td>
                <td style="padding: 8px; text-align: right;">${remainingDueDate}</td>
              </tr>
              <tr style="background-color: #f0fdf4;">
                <td style="padding: 12px;"><strong>Total Placement Fee (${dynamicFeePercentage}%)</strong></td>
                <td style="padding: 12px; text-align: right;"><strong style="font-size: 18px;">${totalFormatted}</strong></td>
              </tr>
            </table>
          </div>

          <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>✅ ${guaranteePeriodDays}-Day Guarantee:</strong></p>
            <p style="margin: 0;">If the candidate leaves within ${guaranteePeriodDays} days of starting, you are eligible for a replacement or refund as per our guarantee policy.</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/employer/placements/${placement.id}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Placement</a>
            <a href="${process.env.FRONTEND_URL}/employer/invoices" style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Invoices</a>
          </div>

          <p>Thank you for using our placement services!</p>
          <p>Best regards,<br>The Job Portal Team</p>
        </div>
      `;

      // Create invoice record in database
      const invoice = await prisma.invoice.create({
        data: {
          placementId: placement.id,
          invoiceType: "FULL_PAYMENT",
          status: "SENT",
          invoiceNumber,
          amount: placementFee,
          dueDate: startDateObj,
          sentAt: new Date(),
          recipientEmail: placement.employer.user.email,
          recipientName: placement.employer.user.name,
          companyName: finalCompanyName,
          subject: emailSubject,
          htmlContent: emailHtml,
          feePercentage: dynamicFeePercentage,
          upfrontPercentage,
          remainingPercentage,
        },
      });

      // Send email
      await sendEmail({
        to: placement.employer.user.email,
        subject: emailSubject,
        html: emailHtml,
      });

      console.log(`[PLACEMENT] Invoice ${invoiceNumber} created and sent to ${placement.employer.user.email}`);
    } catch (emailError) {
      console.error(`[PLACEMENT] Failed to send invoice email:`, emailError);
      // Don't fail placement creation if email fails
    }

    return NextResponse.json(
      {
        message: "Placement created successfully",
        placement,
        paymentSchedule: {
          upfrontPayment: {
            amount: upfrontAmount,
            dueDate: startDateObj,
            status: "pending",
          },
          remainingPayment: {
            amount: remainingAmount,
            dueDate: new Date(startDateObj.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days later
            status: "pending",
          },
        },
        guaranteePeriod: {
          days: guaranteePeriodDays,
          endDate: guaranteeEndDate,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Placement creation error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions. Employer role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to create placement",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/placements
 * List all placements with filtering
 * Role-based access:
 * - ADMIN: See all placements
 * - EMPLOYER: See placements for their company
 * - CANDIDATE: See their own placements
 *
 * Query parameters:
 * - status: Filter by placement status
 * - paymentStatus: Filter by payment status
 * - candidateId: Filter by candidate
 * - employerId: Filter by employer
 * - page: Page number (default 1)
 * - limit: Items per page (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const paymentStatus = searchParams.get("paymentStatus");
    const candidateIdParam = searchParams.get("candidateId");
    const employerIdParam = searchParams.get("employerId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const skip = (page - 1) * limit;

    // Build where clause based on role
    const where: any = {};

    if (user.role === UserRole.CANDIDATE) {
      // Candidates can only see their own placements
      const candidate = await prisma.candidate.findUnique({
        where: { userId: user.id },
      });

      if (!candidate) {
        return NextResponse.json({ placements: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      }

      where.candidateId = candidate.id;
    } else if (user.role === UserRole.EMPLOYER) {
      // Employers can only see their company's placements
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });

      if (!employer) {
        return NextResponse.json({ placements: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      }

      where.employerId = employer.id;
    }
    // Admins can see all placements (no additional filter)

    // Apply filters
    if (status) {
      where.status = status;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (candidateIdParam && user.role === UserRole.ADMIN) {
      where.candidateId = candidateIdParam;
    }

    if (employerIdParam && user.role === UserRole.ADMIN) {
      where.employerId = employerIdParam;
    }

    // Get total count for pagination
    const total = await prisma.placement.count({ where });

    // Get placements
    const placements = await prisma.placement.findMany({
      where,
      include: {
        candidate: {
          include: {
            user: {
              select: {
                id: true,
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
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        job: {
          select: {
            id: true,
            title: true,
            type: true,
            location: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    return NextResponse.json({
      placements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Placements fetch error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch placements",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
