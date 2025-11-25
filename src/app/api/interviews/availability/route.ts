import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

// Helper function to get authenticated user
async function getAuthenticatedUser(req: NextRequest) {
  // Try to get user from headers first (for cross-domain requests)
  const userEmail = req.headers.get('X-User-Email');
  const userRole = req.headers.get('X-User-Role');
  const userId = req.headers.get('X-User-Id');

  if (userEmail && userId && userRole) {
    // Get user from headers (cross-domain request from frontend)
    return await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });
  } else {
    // Fall back to session-based auth (same-domain request)
    const session = await getServerSession(authOptions);
    if (session?.user) {
      return {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
      };
    }
  }

  return null;
}

// POST /api/interviews/availability - Create interview with availability slots
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      applicationId,
      type,
      duration,
      availabilitySlots, // Array of { startTime, endTime }
      round, // Interview round name from template or manual input
      roundNumber, // Round number for tracking (1, 2, 3, etc.)
      roundName, // Round name for clarity
    } = await req.json();

    // Validate required fields
    if (!applicationId || !type || !duration || !availabilitySlots || availabilitySlots.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get application to verify it exists and get candidate/employer IDs
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: {
          select: {
            id: true,
            userId: true,
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
              select: {
                id: true,
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Verify the employer owns this job
    if (application.job.employer.userId !== user.id) {
      return NextResponse.json(
        { error: "You don't have permission to schedule interviews for this application" },
        { status: 403 }
      );
    }

    // Check if there's a SCHEDULED interview with [PENDING_RESCHEDULE] marker for this application
    const pendingRescheduleInterview = await prisma.interview.findFirst({
      where: {
        applicationId,
        status: "SCHEDULED",
        notes: {
          contains: "[PENDING_RESCHEDULE]",
        },
      },
    });

    let interview;
    let isReschedule = false;

    if (pendingRescheduleInterview) {
      // This is a reschedule flow
      isReschedule = true;

      // Extract reschedule reason from notes BEFORE updating
      const rescheduleReason = pendingRescheduleInterview.notes
        ?.split("[PENDING_RESCHEDULE]")[1]
        ?.trim() || "Employer requested reschedule";

      // Get the original notes (before the [PENDING_RESCHEDULE] marker)
      const originalNotes = pendingRescheduleInterview.notes
        ?.split("[PENDING_RESCHEDULE]")[0]
        ?.trim() || "";

      // Mark old interview as RESCHEDULED and update notes
      await prisma.interview.update({
        where: { id: pendingRescheduleInterview.id },
        data: {
          status: "RESCHEDULED",
          notes: originalNotes
            ? `${originalNotes}\n\n[Rescheduled from previous interview] ${rescheduleReason}`
            : `[Rescheduled from previous interview] ${rescheduleReason}`,
        },
      });

      // Create new interview with rescheduledFromId
      interview = await prisma.interview.create({
        data: {
          applicationId,
          candidateId: application.candidate.id,
          employerId: application.job.employer.id,
          duration,
          type,
          status: "AWAITING_CANDIDATE",
          round: round || roundName || null,
          roundNumber: roundNumber || null,
          roundName: roundName || round || null,
          rescheduledFromId: pendingRescheduleInterview.id,
          notes: `[Rescheduled from previous interview] ${rescheduleReason}`,
          availabilitySlots: {
            create: availabilitySlots.map((slot: { startTime: string; endTime: string }) => ({
              startTime: new Date(slot.startTime),
              endTime: new Date(slot.endTime),
            })),
          },
        },
        include: {
          availabilitySlots: true,
        },
      });
    } else {
      // Normal flow - create new interview
      interview = await prisma.interview.create({
        data: {
          applicationId,
          candidateId: application.candidate.id,
          employerId: application.job.employer.id,
          duration,
          type,
          status: "AWAITING_CANDIDATE",
          round: round || roundName || null,
          roundNumber: roundNumber || null,
          roundName: roundName || round || null,
          availabilitySlots: {
            create: availabilitySlots.map((slot: { startTime: string; endTime: string }) => ({
              startTime: new Date(slot.startTime),
              endTime: new Date(slot.endTime),
            })),
          },
        },
        include: {
          availabilitySlots: true,
        },
      });
    }

    // Send notification/email to candidate about available time slots
    try {
      const candidateName = application.candidate.user.name;
      const candidateEmail = application.candidate.user.email;
      const jobTitle = application.job.title;
      const companyName = application.job.employer?.companyName || "the company";
      const roundInfo = roundName || round || "Interview";

      // Format availability slots for email
      const slotsHtml = availabilitySlots.map((slot: any, index: number) => {
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
          <h2 style="color: #3b82f6;">🎉 Interview Invitation</h2>
          <p>Hi ${candidateName},</p>
          <p>Great news! <strong>${companyName}</strong> would like to schedule an interview with you for the <strong>${jobTitle}</strong> position.</p>

          <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Interview Details:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>Round:</strong> ${roundInfo}</li>
              <li><strong>Duration:</strong> ${duration} minutes</li>
              <li><strong>Type:</strong> ${type}</li>
            </ul>
          </div>

          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>📅 Available Time Slots:</strong></p>
            <p style="margin: 0 0 10px 0; font-size: 14px;">Please select your preferred times from the options below:</p>
            <ul style="margin: 0; padding-left: 20px;">
              ${slotsHtml}
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/candidate/interviews/select/${interview.id}" style="background-color: #3b82f6; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">SELECT YOUR PREFERRED TIMES</a>
          </div>

          <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>💡 Next Steps:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              <li>Review the available time slots above</li>
              <li>Click the button to select your preferred times (you can select multiple)</li>
              <li>The employer will confirm the final interview time</li>
              <li>You'll receive a confirmation email with meeting details</li>
            </ul>
          </div>

          <p>We look forward to speaking with you!</p>
          <p style="font-size: 12px; color: #6b7280;">If you have any questions, please visit your dashboard or contact the hiring team.</p>
          <p>Best regards,<br>${companyName} Hiring Team</p>
        </div>
      `;

      await sendEmail({
        to: candidateEmail,
        subject: isReschedule
          ? `Interview Rescheduled: ${jobTitle} at ${companyName}`
          : `Interview Invitation: ${jobTitle} at ${companyName}`,
        html: emailHtml,
      });

      console.log(`✅ Interview availability email sent to ${candidateEmail} for ${jobTitle}`);
    } catch (emailError) {
      console.error("Failed to send availability notification:", emailError);
      // Don't fail the interview creation if email fails
    }

    return NextResponse.json({ success: true, interview });
  } catch (error) {
    console.error("Create interview availability error:", error);
    return NextResponse.json(
      { error: "Failed to save availability" },
      { status: 500 }
    );
  }
}
