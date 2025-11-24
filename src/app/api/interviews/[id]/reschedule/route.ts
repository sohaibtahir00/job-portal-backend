import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/interviews/[id]/reschedule - Employer reschedules an interview
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { reason } = await req.json();

    // Verify the interview exists and belongs to this employer
    const originalInterview = await prisma.interview.findUnique({
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
                  },
                },
              },
            },
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
          },
        },
      },
    });

    if (!originalInterview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 }
      );
    }

    if (originalInterview.application.job.employer.userId !== user.id) {
      return NextResponse.json(
        { error: "You don't have permission to reschedule this interview" },
        { status: 403 }
      );
    }

    if (originalInterview.status !== "SCHEDULED") {
      return NextResponse.json(
        { error: "Only scheduled interviews can be rescheduled" },
        { status: 400 }
      );
    }

    // Update the original interview to RESCHEDULED status
    await prisma.interview.update({
      where: { id: params.id },
      data: {
        status: "RESCHEDULED",
        notes: originalInterview.notes
          ? `${originalInterview.notes}\n\n[Rescheduled] ${reason || "Employer requested reschedule"}`
          : `[Rescheduled] ${reason || "Employer requested reschedule"}`,
      },
    });

    // Create a new interview with AWAITING_CANDIDATE status
    // This starts the scheduling flow again
    const newInterview = await prisma.interview.create({
      data: {
        applicationId: originalInterview.applicationId,
        candidateId: originalInterview.candidateId,
        employerId: originalInterview.employerId,
        duration: originalInterview.duration,
        type: originalInterview.type,
        status: "PENDING_AVAILABILITY",
        round: originalInterview.round,
        roundNumber: originalInterview.roundNumber,
        roundName: originalInterview.roundName,
        interviewerId: originalInterview.interviewerId,
        notes: reason ? `[Rescheduled from previous interview] ${reason}` : "[Rescheduled from previous interview]",
      },
    });

    // Log notification (TODO: Send actual email to candidate)
    console.log(`
=======================================================
📧 EMAIL NOTIFICATION - Interview Rescheduled
=======================================================
To: ${originalInterview.application.candidate.user.email}
Candidate: ${originalInterview.application.candidate.user.name}
Job: ${originalInterview.application.job.title}
Reason: ${reason || "Employer requested reschedule"}

Original Interview Date: ${originalInterview.scheduledAt?.toLocaleString() || "N/A"}
Meeting Link: ${originalInterview.meetingLink || "N/A"}

Email Content:
-------------------------------------------------------
Subject: Interview Rescheduled: ${originalInterview.application.job.title}

Hi ${originalInterview.application.candidate.user.name},

We need to reschedule your interview for the ${originalInterview.application.job.title} position.

${reason ? `Reason: ${reason}` : ""}

The employer will provide new time slot options shortly. You'll receive a notification once new times are available.

We apologize for any inconvenience and look forward to speaking with you soon.

Best regards,
Hiring Team
-------------------------------------------------------
=======================================================
    `);

    // TODO: Send email notification to candidate about reschedule
    // TODO: Send notification to employer as confirmation

    return NextResponse.json({
      success: true,
      message: "Interview rescheduled successfully",
      originalInterviewId: params.id,
      newInterviewId: newInterview.id,
    });
  } catch (error) {
    console.error("Reschedule interview error:", error);
    return NextResponse.json(
      { error: "Failed to reschedule interview" },
      { status: 500 }
    );
  }
}
