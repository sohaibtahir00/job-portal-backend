import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/interviews/[id]/select-slots - Candidate selects time slots
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "CANDIDATE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slotIds } = await req.json();

    if (!slotIds || !Array.isArray(slotIds) || slotIds.length === 0) {
      return NextResponse.json(
        { error: "Please select at least one time slot" },
        { status: 400 }
      );
    }

    // Verify the interview exists and belongs to this candidate
    const interview = await prisma.interview.findUnique({
      where: { id: params.id },
      include: {
        application: {
          include: {
            candidate: {
              select: {
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

    if (interview.application.candidate.userId !== user.id) {
      return NextResponse.json(
        { error: "You don't have permission to select slots for this interview" },
        { status: 403 }
      );
    }

    if (interview.status !== "AWAITING_CANDIDATE") {
      return NextResponse.json(
        { error: "This interview is not awaiting candidate selection" },
        { status: 400 }
      );
    }

    // Delete any existing selections for this interview
    await prisma.interviewSlotSelection.deleteMany({
      where: { interviewId: params.id },
    });

    // Create new selections
    await prisma.interviewSlotSelection.createMany({
      data: slotIds.map((slotId: string) => ({
        interviewId: params.id,
        availabilityId: slotId,
      })),
    });

    // Update interview status to AWAITING_CONFIRMATION
    await prisma.interview.update({
      where: { id: params.id },
      data: {
        status: "AWAITING_CONFIRMATION",
      },
    });

    // TODO: Send notification to employer that candidate has made selections

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Select slots error:", error);
    return NextResponse.json(
      { error: "Failed to submit selection" },
      { status: 500 }
    );
  }
}
