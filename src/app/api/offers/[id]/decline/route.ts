import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { OfferStatus, ApplicationStatus } from "@prisma/client";
import { sendEmail } from "@/lib/email";

// POST /api/offers/[id]/decline - Decline an offer (Candidate only)
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
      select: {
        id: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 });
    }

    const { id } = params;
    const body = await request.json();
    const { declineReason } = body;

    // Verify offer exists and belongs to candidate
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        application: true,
        job: {
          select: {
            id: true,
            title: true,
          },
        },
        employer: {
          select: {
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
        { error: "You do not have permission to decline this offer" },
        { status: 403 }
      );
    }

    // Check if offer is still pending
    if (offer.status !== OfferStatus.PENDING) {
      return NextResponse.json(
        { error: `Cannot decline offer with status: ${offer.status}` },
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

    // Update offer status to DECLINED
    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: {
        status: OfferStatus.DECLINED,
        respondedAt: new Date(),
        declineReason: declineReason || null,
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

    // Update application status to REJECTED (candidate declined offer)
    await prisma.application.update({
      where: { id: offer.applicationId },
      data: {
        status: ApplicationStatus.REJECTED,
      },
    });

    // Send email notification to employer and candidate
    try {
      // Email to employer
      await sendEmail({
        to: offer.employer.user.email,
        subject: `Offer Declined: ${candidate.user.name} declined your offer`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Offer Declined</h2>
            <p>Hi ${offer.employer.companyName} Team,</p>
            <p><strong>${candidate.user.name}</strong> has declined your job offer for the position of <strong>${offer.position}</strong>.</p>

            <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Offer Details:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Candidate:</strong> ${candidate.user.name}</li>
                <li><strong>Position:</strong> ${offer.position}</li>
                <li><strong>Salary:</strong> $${(offer.salary / 100).toLocaleString()}</li>
                <li><strong>Declined on:</strong> ${new Date().toLocaleDateString()}</li>
              </ul>
            </div>

            ${declineReason ? `<div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;"><p style="margin: 0 0 10px 0;"><strong>Reason provided by candidate:</strong></p><p style="margin: 0;">${declineReason}</p></div>` : ""}

            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Next Steps:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Review other qualified candidates for this position</li>
                <li>Consider adjusting the offer if the candidate is still interested</li>
                <li>Post a new job opening if needed</li>
              </ul>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/employer/applicants" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Other Candidates</a>
            </div>

            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `,
      });

      // Email to candidate confirming decline
      await sendEmail({
        to: candidate.user.email,
        subject: `Offer Declined: ${offer.position} at ${offer.employer.companyName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">Offer Declined</h2>
            <p>Hi ${candidate.user.name},</p>
            <p>You've successfully declined the job offer for <strong>${offer.position}</strong> at <strong>${offer.employer.companyName}</strong>.</p>

            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
              <p style="margin: 0;">The employer has been notified of your decision${declineReason ? " and your reason has been shared with them" : ""}.</p>
            </div>

            <p>We hope you find the right opportunity soon. Keep exploring other job openings on our platform!</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/candidate/jobs" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Browse Jobs</a>
            </div>

            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send offer decline emails:", emailError);
      // Don't fail the decline if email fails
    }

    return NextResponse.json(
      {
        message: "Offer declined successfully",
        offer: updatedOffer,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error declining offer:", error);
    return NextResponse.json(
      { error: "Failed to decline offer", details: error.message },
      { status: 500 }
    );
  }
}
