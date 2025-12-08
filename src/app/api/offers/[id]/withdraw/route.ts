import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { OfferStatus, ApplicationStatus } from "@prisma/client";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/offers/[id]/withdraw
 * Withdraw an offer (Employer only)
 *
 * Allows employers to withdraw a PENDING offer before the candidate responds.
 * This will:
 * 1. Update offer status to WITHDRAWN
 * 2. Update application status back to INTERVIEWED
 * 3. Send notification to candidate
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
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
    });

    if (!employer) {
      return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    }

    const { id } = await params;
    const body = await request.json();
    const { withdrawReason } = body;

    // Verify offer exists and belongs to employer
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
        candidate: {
          select: {
            id: true,
            userId: true,
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

    // Verify employer owns this offer
    if (offer.employerId !== employer.id) {
      return NextResponse.json(
        { error: "You don't have permission to withdraw this offer" },
        { status: 403 }
      );
    }

    // Can only withdraw PENDING offers
    if (offer.status !== OfferStatus.PENDING) {
      return NextResponse.json(
        { error: `Cannot withdraw offer with status: ${offer.status}. Only PENDING offers can be withdrawn.` },
        { status: 400 }
      );
    }

    // Update offer status to WITHDRAWN
    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: {
        status: OfferStatus.WITHDRAWN,
        withdrawnAt: new Date(),
        withdrawReason: withdrawReason || null,
      },
    });

    // Update application status back to INTERVIEWED
    await prisma.application.update({
      where: { id: offer.applicationId },
      data: {
        status: ApplicationStatus.INTERVIEWED,
      },
    });

    // Create notification for candidate
    await prisma.notification.create({
      data: {
        userId: offer.candidate.userId,
        type: "OFFER_UPDATE",
        title: "Offer Withdrawn",
        message: `The offer for ${offer.job.title} at ${employer.companyName} has been withdrawn.`,
        data: JSON.stringify({
          offerId: offer.id,
          jobId: offer.jobId,
          jobTitle: offer.job.title,
          companyName: employer.companyName,
        }),
      },
    });

    // Send email notification to candidate
    try {
      await sendEmail({
        to: offer.candidate.user.email,
        subject: `Offer Withdrawn - ${offer.job.title} at ${employer.companyName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Offer Withdrawn</h2>

            <p>Dear ${offer.candidate.user.name || "Candidate"},</p>

            <p>We regret to inform you that the job offer for <strong>${offer.job.title}</strong> at <strong>${employer.companyName}</strong> has been withdrawn.</p>

            ${withdrawReason ? `
              <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Reason:</strong></p>
                <p style="margin: 10px 0 0;">${withdrawReason}</p>
              </div>
            ` : ''}

            <p>If you have any questions, please feel free to reach out to the employer directly.</p>

            <p>We wish you the best in your job search.</p>

            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              This is an automated message from the Job Portal.
            </p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send withdrawal email:", emailError);
      // Don't fail the request if email fails
    }

    console.log(`[Offers] Offer ${id} withdrawn by employer ${employer.id}`);

    return NextResponse.json({
      success: true,
      message: "Offer withdrawn successfully",
      offer: {
        id: updatedOffer.id,
        status: updatedOffer.status,
        withdrawnAt: updatedOffer.withdrawnAt,
      },
    });
  } catch (error) {
    console.error("Withdraw offer error:", error);
    return NextResponse.json(
      { error: "Failed to withdraw offer" },
      { status: 500 }
    );
  }
}
