import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { OfferStatus, ApplicationStatus } from "@prisma/client";
import { calculatePlacementFee } from "@/lib/placement-fee";
import { sendEmail } from "@/lib/email";

// POST /api/offers/[id]/accept - Accept an offer (Candidate only)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "CANDIDATE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 });
    }

    const { id } = params;

    // Verify offer exists and belongs to candidate
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        application: true,
        job: {
          select: {
            id: true,
            title: true,
            experienceLevel: true,
          },
        },
        employer: {
          select: {
            id: true,
            companyName: true,
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

    if (offer.candidateId !== candidate.id) {
      return NextResponse.json(
        { error: "You do not have permission to accept this offer" },
        { status: 403 }
      );
    }

    // Check if offer is still pending
    if (offer.status !== OfferStatus.PENDING) {
      return NextResponse.json(
        { error: `Cannot accept offer with status: ${offer.status}` },
        { status: 400 }
      );
    }

    // Check if offer has expired
    if (new Date(offer.expiresAt) < new Date()) {
      // Update offer status to EXPIRED
      await prisma.offer.update({
        where: { id },
        data: {
          status: OfferStatus.EXPIRED,
        },
      });

      return NextResponse.json({ error: "This offer has expired" }, { status: 400 });
    }

    // Update offer status to ACCEPTED
    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: {
        status: OfferStatus.ACCEPTED,
        respondedAt: new Date(),
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
          },
        },
        employer: {
          select: {
            companyName: true,
          },
        },
      },
    });

    // Update application status to ACCEPTED
    await prisma.application.update({
      where: { id: offer.applicationId },
      data: {
        status: ApplicationStatus.ACCEPTED,
      },
    });

    // Create placement record when offer is accepted
    // Calculate placement fee dynamically based on experience level
    const { feePercentage, placementFee, upfrontAmount, remainingAmount } =
      calculatePlacementFee(offer.salary, offer.job.experienceLevel);

    const startDate = new Date(offer.startDate);
    const guaranteeEndDate = new Date(startDate);
    guaranteeEndDate.setDate(guaranteeEndDate.getDate() + 90); // Add 90 days

    await prisma.placement.create({
      data: {
        candidateId: candidate.id,
        employerId: offer.employerId,
        jobId: offer.jobId,
        jobTitle: offer.position,
        companyName: offer.employer.companyName,
        startDate,
        salary: offer.salary,
        status: "PENDING",
        feePercentage, // Dynamic fee: 15%, 18%, or 20%
        placementFee,
        upfrontAmount,
        remainingAmount,
        guaranteeEndDate,
      },
    });

    // Send email notifications to both candidate and employer
    try {
      // Email to candidate confirming acceptance
      await sendEmail({
        to: candidate.user.email,
        subject: `Offer Accepted: ${offer.position} at ${offer.employer.companyName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">✅ Offer Accepted Successfully!</h2>
            <p>Hi ${candidate.user.name},</p>
            <p>Congratulations! You've successfully accepted the job offer for <strong>${offer.position}</strong> at <strong>${offer.employer.companyName}</strong>.</p>

            <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Next Steps:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Your placement has been created and is now active</li>
                <li>Start Date: ${new Date(offer.startDate).toLocaleDateString()}</li>
                <li>The employer will reach out with onboarding details</li>
                <li>View your placement status in your dashboard</li>
              </ul>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/candidate/placements" style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View My Placements</a>
            </div>

            <p>We're excited for your new role! Best of luck!</p>
            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `,
      });

      // Email to employer confirming candidate accepted
      await sendEmail({
        to: offer.employer.user.email,
        subject: `Offer Accepted: ${candidate.user.name} accepted your offer`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">🎉 Candidate Accepted Your Offer!</h2>
            <p>Hi ${offer.employer.companyName} Team,</p>
            <p>Great news! <strong>${candidate.user.name}</strong> has accepted your job offer for the position of <strong>${offer.position}</strong>.</p>

            <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Offer Details:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Candidate:</strong> ${candidate.user.name}</li>
                <li><strong>Position:</strong> ${offer.position}</li>
                <li><strong>Salary:</strong> $${(offer.salary / 100).toLocaleString()}</li>
                <li><strong>Start Date:</strong> ${new Date(offer.startDate).toLocaleDateString()}</li>
                <li><strong>Placement Fee (${feePercentage}%):</strong> $${(placementFee / 100).toLocaleString()}</li>
              </ul>
            </div>

            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Next Steps:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li>A placement record has been automatically created</li>
                <li>Your invoice will be generated shortly</li>
                <li>Begin your onboarding process with ${candidate.user.name}</li>
                <li>Payment: 50% upfront ($${(upfrontAmount / 100).toLocaleString()}), 50% after 30 days ($${(remainingAmount / 100).toLocaleString()})</li>
              </ul>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/employer/placements" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Placement</a>
              <a href="${process.env.FRONTEND_URL}/employer/invoices" style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Invoice</a>
            </div>

            <p>Thank you for using our platform to find great talent!</p>
            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send offer acceptance emails:", emailError);
      // Don't fail the acceptance if email fails
    }

    return NextResponse.json(
      {
        message: "Offer accepted successfully! A placement has been created.",
        offer: updatedOffer,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error accepting offer:", error);
    return NextResponse.json(
      { error: "Failed to accept offer", details: error.message },
      { status: 500 }
    );
  }
}
