import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

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
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
            job: {
              include: {
                employer: {
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
        },
        availabilitySlots: true,
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 }
      );
    }

    if (interview.application.candidate.user.id !== user.id) {
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

    // Send notification to employer that candidate has made selections
    try {
      const employerName = interview.application.job.employer.user.name;
      const employerEmail = interview.application.job.employer.user.email;
      const candidateName = interview.application.candidate.user.name;
      const jobTitle = interview.application.job.title;
      const companyName = interview.application.job.employer?.companyName || "Your company";

      // Get the selected slots details
      const selectedSlots = interview.availabilitySlots.filter((slot: any) =>
        slotIds.includes(slot.id)
      );

      const slotsHtml = selectedSlots.map((slot: any) => {
        const startTime = new Date(slot.startTime);
        const endTime = new Date(slot.endTime);

        const formattedDate = startTime.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const formattedStartTime = startTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const formattedEndTime = endTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        return `<li><strong>${formattedDate}</strong> from ${formattedStartTime} to ${formattedEndTime}</li>`;
      }).join('');

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">⏰ Candidate Selected Interview Times</h2>
          <p>Hi ${employerName},</p>
          <p><strong>${candidateName}</strong> has selected their preferred time slots for the <strong>${jobTitle}</strong> interview.</p>

          <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Candidate's Preferred Times:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              ${slotsHtml}
            </ul>
          </div>

          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>⚡ Action Required:</strong></p>
            <p style="margin: 0;">Please review the candidate's selections and confirm the final interview time.</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/employer/interviews/confirm/${params.id}" style="background-color: #3b82f6; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">CONFIRM INTERVIEW TIME</a>
          </div>

          <div style="background-color: #d1fae5; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>💡 Next Steps:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              <li>Choose one time slot from the candidate's selections</li>
              <li>Select a video platform (Zoom, Google Meet) if applicable</li>
              <li>Confirm the interview - the candidate will receive a calendar invite</li>
            </ul>
          </div>

          <p>Don't keep great candidates waiting! Confirm the interview time as soon as possible.</p>
          <p style="font-size: 12px; color: #6b7280;">You can also confirm through your <a href="${process.env.FRONTEND_URL}/employer/interviews" style="color: #3b82f6;">dashboard</a>.</p>
          <p>Best regards,<br>Job Portal Team</p>
        </div>
      `;

      await sendEmail({
        to: employerEmail,
        subject: `Action Required: ${candidateName} Selected Interview Times for ${jobTitle}`,
        html: emailHtml,
      });

      console.log(`✅ Slot selection notification email sent to ${employerEmail} for ${jobTitle}`);
    } catch (emailError) {
      console.error("Failed to send slot selection notification:", emailError);
      // Don't fail the selection if email fails
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Select slots error:", error);
    return NextResponse.json(
      { error: "Failed to submit selection" },
      { status: 500 }
    );
  }
}
