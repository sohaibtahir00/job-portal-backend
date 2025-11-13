import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { OfferStatus, ApplicationStatus } from "@prisma/client";

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
      select: { id: true },
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

    // TODO: Send email notification to employer

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
