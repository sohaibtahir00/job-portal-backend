import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { OfferStatus, ApplicationStatus } from "@prisma/client";
import { calculatePlacementFee } from "@/lib/placement-fee";

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

    // TODO: Send email notifications to both candidate and employer

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
