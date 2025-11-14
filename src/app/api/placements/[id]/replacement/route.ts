import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PlacementStatus, UserRole } from "@prisma/client";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/placements/[id]/replacement - Request replacement (Employer)
 * PATCH /api/placements/[id]/replacement - Approve/Reject replacement (Admin)
 */

// POST - Request replacement (Employer only)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== UserRole.EMPLOYER) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!employer) {
      return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    }

    const { id } = params;
    const body = await request.json();
    const { lastDayWorked, reason } = body;

    if (!lastDayWorked || !reason) {
      return NextResponse.json(
        { error: "Missing required fields: lastDayWorked, reason" },
        { status: 400 }
      );
    }

    // Fetch placement with full details
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
      },
    });

    if (!placement) {
      return NextResponse.json({ error: "Placement not found" }, { status: 404 });
    }

    if (placement.employerId !== employer.id) {
      return NextResponse.json(
        { error: "You do not have permission to request replacement for this placement" },
        { status: 403 }
      );
    }

    // Check if within guarantee period
    if (!placement.guaranteeEndDate || new Date() > placement.guaranteeEndDate) {
      return NextResponse.json(
        { error: "Guarantee period has expired. Replacement not available." },
        { status: 400 }
      );
    }

    // Check if already requested
    if (placement.replacementRequested) {
      return NextResponse.json(
        { error: "Replacement has already been requested for this placement" },
        { status: 400 }
      );
    }

    // Calculate days worked
    const lastDay = new Date(lastDayWorked);
    const startDay = new Date(placement.startDate);
    const daysWorked = Math.ceil(
      (lastDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Update placement
    const updatedPlacement = await prisma.placement.update({
      where: { id },
      data: {
        replacementRequested: true,
        replacementRequestedAt: new Date(),
        replacementLastDayWorked: lastDay,
        replacementDaysWorked: daysWorked,
        replacementReason: reason,
        status: PlacementStatus.REPLACEMENT_REQUESTED,
      },
    });

    // Send email to admin
    try {
      // Get admin users
      const admins = await prisma.user.findMany({
        where: { role: UserRole.ADMIN },
        select: { email: true },
      });

      for (const admin of admins) {
        await sendEmail({
          to: admin.email,
          subject: `Replacement Requested: ${placement.candidate.user.name} - ${placement.jobTitle}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #f59e0b;">🔄 Replacement Request Submitted</h2>
              <p>Hi Admin,</p>
              <p>A replacement has been requested for the following placement:</p>

              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Placement Details:</strong></p>
                <ul style="margin: 0; padding-left: 20px;">
                  <li><strong>Employer:</strong> ${placement.employer.companyName}</li>
                  <li><strong>Candidate:</strong> ${placement.candidate.user.name}</li>
                  <li><strong>Position:</strong> ${placement.jobTitle}</li>
                  <li><strong>Start Date:</strong> ${new Date(placement.startDate).toLocaleDateString()}</li>
                  <li><strong>Last Day Worked:</strong> ${lastDay.toLocaleDateString()}</li>
                  <li><strong>Days Worked:</strong> ${daysWorked} days</li>
                </ul>
              </div>

              <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Reason for Replacement:</strong></p>
                <p style="margin: 0;">${reason}</p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL}/admin/placements/${id}" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Request</a>
              </div>

              <p>Please review and approve or reject this replacement request.</p>
              <p>Best regards,<br>The Job Portal Team</p>
            </div>
          `,
        });
      }
    } catch (emailError) {
      console.error("Failed to send replacement request email:", emailError);
    }

    // Send confirmation email to employer
    try {
      await sendEmail({
        to: placement.employer.user.email,
        subject: `Replacement Request Submitted - ${placement.candidate.user.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">✅ Replacement Request Submitted</h2>
            <p>Hi ${placement.employer.companyName} Team,</p>
            <p>Your replacement request has been submitted successfully and is under review by our team.</p>

            <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Request Details:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Candidate:</strong> ${placement.candidate.user.name}</li>
                <li><strong>Position:</strong> ${placement.jobTitle}</li>
                <li><strong>Days Worked:</strong> ${daysWorked} days</li>
              </ul>
            </div>

            <p><strong>Next Steps:</strong></p>
            <ul>
              <li>Our team will review your request within 1-2 business days</li>
              <li>We will determine the refund amount (if applicable) based on days worked</li>
              <li>Once approved, we will begin finding a replacement candidate</li>
            </ul>

            <p>You will receive an email once your request has been reviewed.</p>
            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
    }

    return NextResponse.json(
      {
        message: "Replacement request submitted successfully",
        placement: updatedPlacement,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error requesting replacement:", error);
    return NextResponse.json(
      { error: "Failed to request replacement", details: error.message },
      { status: 500 }
    );
  }
}

// PATCH - Approve or reject replacement (Admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { action, notes } = body; // action: "approve" or "reject"

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

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
      },
    });

    if (!placement) {
      return NextResponse.json({ error: "Placement not found" }, { status: 404 });
    }

    if (!placement.replacementRequested) {
      return NextResponse.json(
        { error: "No replacement request found for this placement" },
        { status: 400 }
      );
    }

    const now = new Date();
    const daysWorked = placement.replacementDaysWorked || 0;

    // Calculate refund amount based on days worked
    let refundAmount = 0;
    if (action === "approve" && placement.placementFee) {
      if (daysWorked <= 30) {
        refundAmount = placement.placementFee; // 100% refund
      } else if (daysWorked <= 60) {
        refundAmount = Math.round(placement.placementFee * 0.5); // 50% refund
      }
      // 61-90 days: 0% refund (free replacement only)
    }

    const updateData: any = {
      replacementApproved: action === "approve",
      replacementReviewedAt: now,
      replacementReviewedBy: user.id,
      replacementNotes: notes || null,
      refundAmount,
    };

    if (action === "approve") {
      updateData.status = PlacementStatus.SEEKING_REPLACEMENT;
    } else {
      updateData.status = PlacementStatus.ACTIVE;
      updateData.replacementRequested = false;
    }

    const updatedPlacement = await prisma.placement.update({
      where: { id },
      data: updateData,
    });

    // Send email to employer
    try {
      const emailSubject = action === "approve"
        ? `Replacement Approved: ${placement.candidate.user.name}`
        : `Replacement Request Declined: ${placement.candidate.user.name}`;

      const emailHtml = action === "approve"
        ? `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">✅ Replacement Request Approved</h2>
            <p>Hi ${placement.employer.companyName} Team,</p>
            <p>Your replacement request has been approved!</p>

            <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Refund Information:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Days Worked:</strong> ${daysWorked} days</li>
                <li><strong>Refund Amount:</strong> $${(refundAmount / 100).toLocaleString()}</li>
                <li><strong>Refund Type:</strong> ${daysWorked <= 30 ? "100% Full Refund" : daysWorked <= 60 ? "50% Partial Refund" : "No Refund (Free Replacement Only)"}</li>
              </ul>
            </div>

            <p><strong>Next Steps:</strong></p>
            <ul>
              <li>We will begin searching for a replacement candidate immediately</li>
              <li>${refundAmount > 0 ? "Your refund will be processed within 5-7 business days" : "You will receive a replacement placement at no additional cost"}</li>
              <li>You will be notified when a suitable replacement is found</li>
            </ul>

            <p>Thank you for your patience.</p>
            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `
        : `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Replacement Request Declined</h2>
            <p>Hi ${placement.employer.companyName} Team,</p>
            <p>After reviewing your replacement request, we are unable to approve it at this time.</p>

            ${notes ? `
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Reason:</strong></p>
              <p style="margin: 0;">${notes}</p>
            </div>
            ` : ""}

            <p>If you have any questions or would like to discuss this decision, please contact our support team.</p>
            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `;

      await sendEmail({
        to: placement.employer.user.email,
        subject: emailSubject,
        html: emailHtml,
      });
    } catch (emailError) {
      console.error("Failed to send replacement decision email:", emailError);
    }

    return NextResponse.json(
      {
        message: `Replacement request ${action}ed successfully`,
        placement: updatedPlacement,
        refundAmount: action === "approve" ? refundAmount / 100 : 0,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error processing replacement decision:", error);
    return NextResponse.json(
      { error: "Failed to process replacement decision", details: error.message },
      { status: 500 }
    );
  }
}
