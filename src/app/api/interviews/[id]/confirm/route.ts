import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/interviews/[id]/confirm - Employer confirms interview time
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slotId, meetingPlatform, interviewerId } = await req.json();

    if (!slotId) {
      return NextResponse.json(
        { error: "Please select a time slot" },
        { status: 400 }
      );
    }

    // Verify the interview exists and belongs to this employer
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
        selectedSlots: {
          include: {
            availability: true,
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

    if (interview.application.job.employer.userId !== user.id) {
      return NextResponse.json(
        { error: "You don't have permission to confirm this interview" },
        { status: 403 }
      );
    }

    if (interview.status !== "AWAITING_CONFIRMATION") {
      return NextResponse.json(
        { error: "This interview is not awaiting confirmation" },
        { status: 400 }
      );
    }

    // Find the selected slot
    const selectedSlot = interview.selectedSlots.find(
      (s: any) => s.availabilityId === slotId
    );

    if (!selectedSlot) {
      return NextResponse.json(
        { error: "Selected slot not found" },
        { status: 404 }
      );
    }

    const confirmedTime = selectedSlot.availability;

    // Generate a mock meeting link (in production, you'd integrate with Zoom/Google Meet API)
    const meetingLink = generateMockMeetingLink(meetingPlatform);

    // Update the interview
    await prisma.interview.update({
      where: { id: params.id },
      data: {
        status: "SCHEDULED",
        scheduledAt: confirmedTime.startTime,
        meetingLink,
        interviewerId: interviewerId || null, // Add interviewer if provided
      },
    });

    // Mark the confirmed slot
    await prisma.interviewSlotSelection.update({
      where: { id: selectedSlot.id },
      data: { isConfirmed: true },
    });

    // Update the application status to INTERVIEW_SCHEDULED
    // This ensures the applicant appears in the "Interview Scheduled" filter
    await prisma.application.update({
      where: { id: interview.applicationId },
      data: { status: "INTERVIEW_SCHEDULED" },
    });

    // TODO: Send email/notification to candidate with meeting link
    // TODO: Create calendar invites for both parties

    return NextResponse.json({
      success: true,
      meetingLink,
      scheduledAt: confirmedTime.startTime,
    });
  } catch (error) {
    console.error("Confirm interview error:", error);
    return NextResponse.json(
      { error: "Failed to confirm interview" },
      { status: 500 }
    );
  }
}

// Helper function to generate mock meeting links
// In production, this would integrate with Zoom/Google Meet APIs
function generateMockMeetingLink(platform: string): string {
  const randomId = Math.random().toString(36).substring(7);

  if (platform === "zoom") {
    return `https://zoom.us/j/${randomId}?pwd=mock`;
  } else {
    return `https://meet.google.com/${randomId}`;
  }
}
