import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { OfferStatus } from "@prisma/client";
import { sendEmail } from "@/lib/email";

// GET /api/offers/[id] - Get offer by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            location: true,
            type: true,
            description: true,
            requirements: true,
          },
        },
        employer: {
          select: {
            companyName: true,
            companyLogo: true,
            companyWebsite: true,
            location: true,
          },
        },
        candidate: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        application: {
          select: {
            id: true,
            status: true,
            appliedAt: true,
            coverLetter: true,
          },
        },
      },
    });

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    // Check authorization
    if (user.role === "CANDIDATE") {
      const candidate = await prisma.candidate.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!candidate || offer.candidateId !== candidate.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    } else if (user.role === "EMPLOYER") {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!employer || offer.employerId !== employer.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Invalid user role" }, { status: 403 });
    }

    return NextResponse.json({ offer }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching offer:", error);
    return NextResponse.json(
      { error: "Failed to fetch offer", details: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/offers/[id] - Update offer (Employer only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: { id: true, companyName: true },
    });

    if (!employer) {
      return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    }

    const { id } = params;
    const body = await request.json();

    // Verify offer exists and employer owns it
    const existingOffer = await prisma.offer.findUnique({
      where: { id },
    });

    if (!existingOffer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    if (existingOffer.employerId !== employer.id) {
      return NextResponse.json(
        { error: "You do not have permission to update this offer" },
        { status: 403 }
      );
    }

    // Cannot update offer if it's already accepted/declined
    if (["ACCEPTED", "DECLINED"].includes(existingOffer.status)) {
      return NextResponse.json(
        { error: `Cannot update offer with status: ${existingOffer.status}` },
        { status: 400 }
      );
    }

    // Update the offer
    const {
      position,
      salary,
      equity,
      signingBonus,
      benefits,
      startDate,
      offerLetter,
      customMessage,
      expiresAt,
      status,
    } = body;

    const updateData: any = {};

    if (position !== undefined) updateData.position = position;
    if (salary !== undefined) updateData.salary = parseInt(salary);
    if (equity !== undefined) updateData.equity = equity ? parseFloat(equity) : null;
    if (signingBonus !== undefined)
      updateData.signingBonus = signingBonus ? parseInt(signingBonus) : null;
    if (benefits !== undefined) updateData.benefits = benefits;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (offerLetter !== undefined) updateData.offerLetter = offerLetter;
    if (customMessage !== undefined) updateData.customMessage = customMessage;
    if (expiresAt !== undefined) updateData.expiresAt = new Date(expiresAt);
    if (status !== undefined) updateData.status = status;

    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: updateData,
      include: {
        job: {
          select: {
            id: true,
            title: true,
          },
        },
        candidate: {
          select: {
            id: true,
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

    // Send email notification to candidate about offer update
    try {
      const changedFields: string[] = [];
      if (salary !== undefined) changedFields.push(`Salary: $${(parseInt(salary) / 100).toLocaleString()}`);
      if (equity !== undefined) changedFields.push(`Equity: ${equity}%`);
      if (signingBonus !== undefined) changedFields.push(`Signing Bonus: $${(parseInt(signingBonus) / 100).toLocaleString()}`);
      if (startDate !== undefined) changedFields.push(`Start Date: ${new Date(startDate).toLocaleDateString()}`);
      if (expiresAt !== undefined) changedFields.push(`Expiration Date: ${new Date(expiresAt).toLocaleDateString()}`);

      await sendEmail({
        to: updatedOffer.candidate.user.email,
        subject: `Offer Updated: ${updatedOffer.position} at ${employer.companyName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">Offer Updated</h2>
            <p>Hi ${updatedOffer.candidate.user.name},</p>
            <p><strong>${employer.companyName}</strong> has updated your job offer for the position of <strong>${updatedOffer.position}</strong>.</p>

            ${changedFields.length > 0 ? `<div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Updated Fields:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                ${changedFields.map(field => `<li>${field}</li>`).join('')}
              </ul>
            </div>` : ''}

            ${customMessage ? `<div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;"><p style="margin: 0 0 10px 0;"><strong>Message from ${employer.companyName}:</strong></p><p style="margin: 0;">${customMessage}</p></div>` : ''}

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/candidate/offers" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Updated Offer</a>
            </div>

            <p>Log in to your account to review the updated offer details.</p>
            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send offer update email:", emailError);
      // Don't fail the update if email fails
    }

    return NextResponse.json(
      {
        message: "Offer updated successfully",
        offer: updatedOffer,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error updating offer:", error);
    return NextResponse.json(
      { error: "Failed to update offer", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/offers/[id] - Withdraw offer (Employer only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!employer) {
      return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    }

    const { id } = params;

    // Verify offer exists and employer owns it
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        application: true,
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
      },
    });

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    if (offer.employerId !== employer.id) {
      return NextResponse.json(
        { error: "You do not have permission to withdraw this offer" },
        { status: 403 }
      );
    }

    // Cannot withdraw offer if it's already accepted
    if (offer.status === OfferStatus.ACCEPTED) {
      return NextResponse.json(
        { error: "Cannot withdraw an accepted offer" },
        { status: 400 }
      );
    }

    // Update offer status to WITHDRAWN
    await prisma.offer.update({
      where: { id },
      data: {
        status: OfferStatus.WITHDRAWN,
      },
    });

    // Update application status back to INTERVIEWED
    await prisma.application.update({
      where: { id: offer.applicationId },
      data: {
        status: "INTERVIEWED",
      },
    });

    // Send email notification to candidate and employer
    try {
      // Email to candidate
      await sendEmail({
        to: offer.candidate.user.email,
        subject: `Offer Withdrawn: ${offer.position} at ${offer.employer.companyName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Offer Withdrawn</h2>
            <p>Hi ${offer.candidate.user.name},</p>
            <p>We regret to inform you that <strong>${offer.employer.companyName}</strong> has withdrawn their job offer for the position of <strong>${offer.position}</strong>.</p>

            <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Withdrawn Offer Details:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Position:</strong> ${offer.position}</li>
                <li><strong>Company:</strong> ${offer.employer.companyName}</li>
                <li><strong>Withdrawn on:</strong> ${new Date().toLocaleDateString()}</li>
              </ul>
            </div>

            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
              <p style="margin: 0;">Don't worry! There are many other great opportunities waiting for you on our platform.</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/candidate/jobs" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Browse Other Jobs</a>
            </div>

            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `,
      });

      // Email to employer confirming withdrawal
      await sendEmail({
        to: offer.employer.user.email,
        subject: `Offer Withdrawn: ${offer.position} - ${offer.candidate.user.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">Offer Withdrawn Successfully</h2>
            <p>Hi ${offer.employer.companyName} Team,</p>
            <p>Your job offer for <strong>${offer.candidate.user.name}</strong> for the position of <strong>${offer.position}</strong> has been successfully withdrawn.</p>

            <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Withdrawal Details:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Candidate:</strong> ${offer.candidate.user.name}</li>
                <li><strong>Position:</strong> ${offer.position}</li>
                <li><strong>Withdrawn on:</strong> ${new Date().toLocaleDateString()}</li>
              </ul>
            </div>

            <p>The candidate has been notified of this withdrawal.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/employer/applicants" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Applicants</a>
            </div>

            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send offer withdrawal emails:", emailError);
      // Don't fail the withdrawal if email fails
    }

    return NextResponse.json(
      { message: "Offer withdrawn successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error withdrawing offer:", error);
    return NextResponse.json(
      { error: "Failed to withdraw offer", details: error.message },
      { status: 500 }
    );
  }
}
