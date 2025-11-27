import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/interviews/[id]/request-reschedule - Candidate requests to reschedule an interview
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "CANDIDATE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reason } = await req.json();

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json(
        { error: "Reason is required" },
        { status: 400 }
      );
    }

    // Get candidate profile
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    // Verify the interview exists and belongs to this candidate
    const interview = await prisma.interview.findUnique({
      where: { id: params.id },
      include: {
        application: {
          include: {
            job: {
              include: {
                employer: {
                  select: {
                    userId: true,
                    id: true,
                    companyName: true,
                  },
                },
              },
            },
            candidate: {
              select: {
                id: true,
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 }
      );
    }

    // Verify this interview belongs to the candidate
    if (interview.application.candidate.userId !== user.id) {
      return NextResponse.json(
        { error: "You don't have permission to request reschedule for this interview" },
        { status: 403 }
      );
    }

    // Only allow reschedule requests for SCHEDULED interviews
    if (interview.status !== "SCHEDULED") {
      return NextResponse.json(
        { error: "Only scheduled interviews can be rescheduled" },
        { status: 400 }
      );
    }

    // Check if reschedule was already requested
    if (interview.notes?.includes("[RESCHEDULE_REQUESTED]")) {
      return NextResponse.json(
        { error: "Reschedule has already been requested for this interview" },
        { status: 400 }
      );
    }

    // Format the current date
    const requestDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Update interview notes with reschedule request
    const rescheduleNote = `[RESCHEDULE_REQUESTED]: ${reason.trim()} - Requested by candidate on ${requestDate}`;
    const updatedNotes = interview.notes
      ? `${rescheduleNote}\n\n${interview.notes}`
      : rescheduleNote;

    await prisma.interview.update({
      where: { id: params.id },
      data: {
        notes: updatedNotes,
      },
    });

    // Create notification for employer
    const candidateName = candidate.user.name || "A candidate";
    const jobTitle = interview.application.job.title;

    await prisma.notification.create({
      data: {
        userId: interview.application.job.employer.userId,
        type: "INTERVIEW_RESCHEDULE_REQUEST",
        title: "Reschedule Request",
        message: `${candidateName} has requested to reschedule the interview for ${jobTitle}. Reason: ${reason.trim()}`,
        link: `/employer/interviews`,
        isRead: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Reschedule request sent to employer",
    });
  } catch (error) {
    console.error("Request reschedule error:", error);
    return NextResponse.json(
      { error: "Failed to request reschedule" },
      { status: 500 }
    );
  }
}
