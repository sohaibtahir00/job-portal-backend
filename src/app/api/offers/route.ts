import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ApplicationStatus, OfferStatus } from "@prisma/client";

// GET /api/offers - Get all offers (filtered by user role)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as OfferStatus | null;

    // Candidates see offers made to them
    if (session.user.role === "CANDIDATE") {
      const candidate = await prisma.candidate.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });

      if (!candidate) {
        return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 });
      }

      const where: any = { candidateId: candidate.id };
      if (status) {
        where.status = status;
      }

      const offers = await prisma.offer.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              location: true,
              type: true,
            },
          },
          employer: {
            select: {
              companyName: true,
              companyLogo: true,
            },
          },
          application: {
            select: {
              id: true,
              status: true,
              appliedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ offers }, { status: 200 });
    }

    // Employers see offers they've made
    if (session.user.role === "EMPLOYER") {
      const employer = await prisma.employer.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });

      if (!employer) {
        return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
      }

      const where: any = { employerId: employer.id };
      if (status) {
        where.status = status;
      }

      const offers = await prisma.offer.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              location: true,
              type: true,
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
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ offers }, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid user role" }, { status: 403 });
  } catch (error: any) {
    console.error("Error fetching offers:", error);
    return NextResponse.json(
      { error: "Failed to fetch offers", details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/offers - Create a new offer (Employer only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employer = await prisma.employer.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!employer) {
      return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      applicationId,
      position,
      salary,
      equity,
      signingBonus,
      benefits,
      startDate,
      offerLetter,
      customMessage,
      expiresAt,
    } = body;

    // Validate required fields
    if (!applicationId || !position || !salary || !startDate || !expiresAt) {
      return NextResponse.json(
        { error: "Missing required fields: applicationId, position, salary, startDate, expiresAt" },
        { status: 400 }
      );
    }

    // Verify application exists and employer owns it
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          select: {
            id: true,
            employerId: true,
            title: true,
          },
        },
        candidate: {
          select: {
            id: true,
          },
        },
        interviews: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (application.job.employerId !== employer.id) {
      return NextResponse.json(
        { error: "You do not have permission to make an offer for this application" },
        { status: 403 }
      );
    }

    // Check if application status allows making an offer OR has completed interview
    const hasCompletedInterview = application.interviews.some((i) => i.status === "COMPLETED");
    const validStatuses = ["INTERVIEWED", "SHORTLISTED", "INTERVIEW_SCHEDULED"];

    if (!validStatuses.includes(application.status) && !hasCompletedInterview) {
      return NextResponse.json(
        {
          error: `Cannot make offer for application with status: ${application.status}. Application must be SHORTLISTED, have a completed interview, or be in interview process.`,
        },
        { status: 400 }
      );
    }

    // Check if offer already exists for this application
    const existingOffer = await prisma.offer.findUnique({
      where: { applicationId },
    });

    if (existingOffer) {
      return NextResponse.json(
        { error: "An offer already exists for this application" },
        { status: 400 }
      );
    }

    // Create the offer
    const offer = await prisma.offer.create({
      data: {
        applicationId,
        jobId: application.job.id,
        candidateId: application.candidate.id,
        employerId: employer.id,
        position,
        salary: parseInt(salary),
        equity: equity ? parseFloat(equity) : null,
        signingBonus: signingBonus ? parseInt(signingBonus) : null,
        benefits: benefits || [],
        startDate: new Date(startDate),
        offerLetter,
        customMessage,
        expiresAt: new Date(expiresAt),
      },
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

    // Update application status to OFFERED
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.OFFERED },
    });

    // TODO: Send email notification to candidate

    return NextResponse.json(
      {
        message: "Offer created successfully",
        offer,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating offer:", error);
    return NextResponse.json(
      { error: "Failed to create offer", details: error.message },
      { status: 500 }
    );
  }
}
