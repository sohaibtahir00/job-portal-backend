import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

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

    // Mark interview as pending reschedule by adding note
    // Don't change status, don't create new interview, don't send email yet
    // All of that happens when employer submits new availability
    await prisma.interview.update({
      where: { id: params.id },
      data: {
        notes: originalInterview.notes
          ? `${originalInterview.notes}\n\n[PENDING_RESCHEDULE] ${reason || "Employer requested reschedule"}`
          : `[PENDING_RESCHEDULE] ${reason || "Employer requested reschedule"}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Interview marked for reschedule. Please set new availability.",
      applicationId: originalInterview.applicationId,
    });
  } catch (error) {
    console.error("Reschedule interview error:", error);
    return NextResponse.json(
      { error: "Failed to reschedule interview" },
      { status: 500 }
    );
  }
}
