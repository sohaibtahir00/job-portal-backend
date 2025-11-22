import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { generateInterviewCalendarInvite, generateInterviewCancellationInvite } from "@/lib/calendar";

// GET /api/interviews/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const interview = await prisma.interview.findUnique({
      where: { id: params.id },
      include: {
        application: {
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
        availabilitySlots: {
          orderBy: {
            startTime: "asc",
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
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    return NextResponse.json({ interview });
  } catch (error) {
    console.error("Get interview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch interview" },
      { status: 500 }
    );
  }
}

// PATCH /api/interviews/[id] - Update interview
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updates = await req.json();

    // Update interview
    const interview = await prisma.interview.update({
      where: { id: params.id },
      data: updates,
      include: {
        application: {
          include: {
            job: {
              select: {
                title: true,
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

    // If interview status is being changed to COMPLETED, update application status to INTERVIEWED
    if (updates.status === "COMPLETED") {
      await prisma.application.update({
        where: { id: interview.applicationId },
        data: { status: "INTERVIEWED" },
      });
    }

    // Send feedback email to candidate if feedback was provided
    if (updates.feedback && interview.application?.candidate?.user?.email) {
      try {
        await sendEmail({
          to: interview.application.candidate.user.email,
          subject: `Interview Feedback: ${interview.application.job.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">💬 Interview Feedback</h2>
              <p>Hi ${interview.application.candidate.user.name},</p>
              <p>Thank you for interviewing for the position of <strong>${interview.application.job.title}</strong>. We wanted to share some feedback from your interview.</p>

              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Feedback:</strong></p>
                <p style="margin: 0; white-space: pre-wrap;">${updates.feedback}</p>
              </div>

              <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;">We appreciate your time and effort during the interview process. Please use this feedback to help you in your professional development.</p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL}/candidate/applications" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Your Applications</a>
              </div>

              <p>Best regards,<br>The Job Portal Team</p>
            </div>
          `,
        });
      } catch (feedbackEmailError) {
        console.error("Failed to send feedback email:", feedbackEmailError);
        // Don't fail the update if email fails
      }
    }

    // Send email notification to candidate about interview update with updated calendar invite
    try {
      if (interview.scheduledAt && !updates.feedback) {
        const interviewDate = new Date(interview.scheduledAt);
        const formattedDate = interviewDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const formattedTime = interviewDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        // Generate updated calendar invite
        const calendarInvite = generateInterviewCalendarInvite({
          candidateName: interview.application.candidate.user.name,
          candidateEmail: interview.application.candidate.user.email,
          employerName: 'Hiring Team',
          jobTitle: interview.application.job.title,
          startTime: interviewDate,
          duration: interview.duration,
          type: interview.type,
          location: interview.location || undefined,
          meetingLink: interview.meetingLink || undefined,
          notes: interview.notes || undefined,
        });

        await sendEmail({
          to: interview.application.candidate.user.email,
          subject: `Interview Updated: ${interview.application.job.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #f59e0b;">🔄 Interview Details Updated</h2>
              <p>Hi ${interview.application.candidate.user.name},</p>
              <p>The interview details for <strong>${interview.application.job.title}</strong> have been updated.</p>

              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Updated Interview Details:</strong></p>
                <ul style="margin: 0; padding-left: 20px;">
                  <li><strong>Date:</strong> ${formattedDate}</li>
                  <li><strong>Time:</strong> ${formattedTime}</li>
                  <li><strong>Duration:</strong> ${interview.duration} minutes</li>
                  <li><strong>Type:</strong> ${interview.type}</li>
                  ${interview.location ? `<li><strong>Location:</strong> ${interview.location}</li>` : ''}
                  ${interview.meetingLink ? `<li><strong>Meeting Link:</strong> <a href="${interview.meetingLink}" style="color: #3b82f6;">${interview.meetingLink}</a></li>` : ''}
                </ul>
              </div>

              ${interview.notes ? `
                <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0;"><strong>Notes:</strong></p>
                  <p style="margin: 0;">${interview.notes}</p>
                </div>
              ` : ''}

              <div style="background-color: #e0f2fe; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>📎 Updated Calendar Invite Attached</strong><br>
                An updated calendar invite (.ics file) is attached. Click it to update this event in your calendar.</p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL}/candidate/interviews" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Interview Details</a>
              </div>

              <p>Please make note of the updated details.</p>
              <p>Best regards,<br>The Job Portal Team</p>
            </div>
          `,
          attachments: [
            {
              filename: 'interview-updated.ics',
              content: calendarInvite,
            },
          ],
        });
      }
    } catch (emailError) {
      console.error("Failed to send interview update email:", emailError);
      // Don't fail the update if email fails
    }

    return NextResponse.json({ success: true, interview });
  } catch (error) {
    console.error("Update interview error:", error);
    return NextResponse.json(
      { error: "Failed to update interview" },
      { status: 500 }
    );
  }
}

// DELETE /api/interviews/[id] - Cancel interview
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // First get interview details before cancelling
    const interview = await prisma.interview.findUnique({
      where: { id: params.id },
      include: {
        application: {
          include: {
            job: {
              select: {
                title: true,
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

    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Cancel the interview
    await prisma.interview.update({
      where: { id: params.id },
      data: { status: "CANCELLED" },
    });

    // Send cancellation email to candidate with cancellation calendar invite
    try {
      if (interview.scheduledAt) {
        const interviewDate = new Date(interview.scheduledAt);
        const formattedDate = interviewDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const formattedTime = interviewDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        // Generate cancellation calendar invite
        const cancellationInvite = generateInterviewCancellationInvite({
          candidateName: interview.application.candidate.user.name,
          candidateEmail: interview.application.candidate.user.email,
          employerName: 'Hiring Team',
          jobTitle: interview.application.job.title,
          originalStartTime: interviewDate,
          duration: interview.duration,
        });

        await sendEmail({
          to: interview.application.candidate.user.email,
          subject: `Interview Cancelled: ${interview.application.job.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">❌ Interview Cancelled</h2>
              <p>Hi ${interview.application.candidate.user.name},</p>
              <p>We regret to inform you that your interview for <strong>${interview.application.job.title}</strong> has been cancelled.</p>

              <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Cancelled Interview Details:</strong></p>
                <ul style="margin: 0; padding-left: 20px;">
                  <li><strong>Date:</strong> ${formattedDate}</li>
                  <li><strong>Time:</strong> ${formattedTime}</li>
                  <li><strong>Position:</strong> ${interview.application.job.title}</li>
                </ul>
              </div>

              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;">The employer may reschedule or provide additional information. You will receive a new notification if the interview is rescheduled.</p>
              </div>

              <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>📎 Cancellation Calendar Invite Attached</strong><br>
                A cancellation invite (.ics file) is attached to remove this event from your calendar.</p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL}/candidate/applications" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Your Applications</a>
              </div>

              <p>If you have any questions, please contact the employer directly.</p>
              <p>Best regards,<br>The Job Portal Team</p>
            </div>
          `,
          attachments: [
            {
              filename: 'interview-cancelled.ics',
              content: cancellationInvite,
            },
          ],
        });
      }
    } catch (emailError) {
      console.error("Failed to send interview cancellation email:", emailError);
      // Don't fail the cancellation if email fails
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel interview error:", error);
    return NextResponse.json(
      { error: "Failed to cancel interview" },
      { status: 500 }
    );
  }
}
