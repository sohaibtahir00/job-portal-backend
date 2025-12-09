import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { IntroductionStatus, CandidateResponse } from "@prisma/client";

/**
 * GET /api/admin/introductions/[id]
 * Get detailed information about a specific introduction
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const introduction = await prisma.candidateIntroduction.findUnique({
      where: { id },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        employer: {
          select: {
            id: true,
            companyName: true,
            logo: true,
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
            location: true,
            type: true,
          },
        },
      },
    });

    if (!introduction) {
      return NextResponse.json(
        { error: "Introduction not found" },
        { status: 404 }
      );
    }

    // Build timeline events
    const timeline: Array<{
      date: Date;
      event: string;
      type: "view" | "request" | "response" | "status" | "system";
    }> = [];

    // Profile first viewed
    timeline.push({
      date: introduction.profileViewedAt,
      event: "Profile first viewed",
      type: "view",
    });

    // Introduction requested
    if (introduction.introRequestedAt) {
      timeline.push({
        date: introduction.introRequestedAt,
        event: "Introduction requested",
        type: "request",
      });
    }

    // Candidate responded
    if (introduction.candidateRespondedAt) {
      const responseText =
        introduction.candidateResponse === CandidateResponse.ACCEPTED
          ? "Candidate accepted introduction"
          : introduction.candidateResponse === CandidateResponse.DECLINED
          ? "Candidate declined introduction"
          : "Candidate has questions";
      timeline.push({
        date: introduction.candidateRespondedAt,
        event: responseText,
        type: "response",
      });
    }

    // Introduced
    if (introduction.introducedAt) {
      timeline.push({
        date: introduction.introducedAt,
        event: "Introduction completed - contact info shared",
        type: "status",
      });
    }

    // Sort timeline by date
    timeline.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Format response
    const response = {
      introduction: {
        id: introduction.id,
        status: introduction.status,
        candidateResponse: introduction.candidateResponse,
        profileViewedAt: introduction.profileViewedAt,
        introRequestedAt: introduction.introRequestedAt,
        candidateRespondedAt: introduction.candidateRespondedAt,
        introducedAt: introduction.introducedAt,
        protectionStartsAt: introduction.protectionStartsAt,
        protectionEndsAt: introduction.protectionEndsAt,
        profileViews: introduction.profileViews,
        resumeDownloads: introduction.resumeDownloads,
        createdAt: introduction.createdAt,
        updatedAt: introduction.updatedAt,
        candidate: {
          id: introduction.candidate.id,
          name: introduction.candidate.user.name,
          email: introduction.candidate.user.email,
          image: introduction.candidate.user.image,
          userId: introduction.candidate.user.id,
          location: introduction.candidate.location,
          currentRole: introduction.candidate.currentRole,
        },
        employer: {
          id: introduction.employer.id,
          companyName: introduction.employer.companyName,
          logo: introduction.employer.logo,
          contactName: introduction.employer.user.name,
          contactEmail: introduction.employer.user.email,
          userId: introduction.employer.user.id,
        },
        job: introduction.job
          ? {
              id: introduction.job.id,
              title: introduction.job.title,
              location: introduction.job.location,
              type: introduction.job.type,
            }
          : null,
        timeline,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Admin Introduction Detail] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch introduction",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/introductions/[id]
 * Update an introduction (status, notes)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, notes } = body;

    // Validate introduction exists
    const introduction = await prisma.candidateIntroduction.findUnique({
      where: { id },
    });

    if (!introduction) {
      return NextResponse.json(
        { error: "Introduction not found" },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: any = {};

    if (status && Object.values(IntroductionStatus).includes(status)) {
      updateData.status = status;

      // Set additional timestamps based on status change
      if (status === IntroductionStatus.INTRODUCED && !introduction.introducedAt) {
        updateData.introducedAt = new Date();
      }
    }

    // Update introduction
    const updatedIntroduction = await prisma.candidateIntroduction.update({
      where: { id },
      data: updateData,
      include: {
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        employer: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    console.log(
      `[Admin Introduction] Updated introduction ${id}: status=${status}`
    );

    return NextResponse.json({
      success: true,
      introduction: {
        id: updatedIntroduction.id,
        status: updatedIntroduction.status,
        candidateName: updatedIntroduction.candidate.user.name,
        employerName: updatedIntroduction.employer.companyName,
      },
    });
  } catch (error) {
    console.error("[Admin Introduction Update] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to update introduction",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
