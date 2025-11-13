import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { OfferStatus } from "@prisma/client";

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
      select: { id: true },
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

    // TODO: Send email notification to candidate about offer update

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

    // TODO: Send email notification to candidate

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
