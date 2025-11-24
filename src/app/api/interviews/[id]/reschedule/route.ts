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

    // Send email notification to candidate about reschedule
    try {
      const candidateName = originalInterview.application.candidate.user.name;
      const candidateEmail = originalInterview.application.candidate.user.email;
      const jobTitle = originalInterview.application.job.title;
      const companyName = originalInterview.application.job.employer?.companyName || "the company";
      const originalDate = originalInterview.scheduledAt;

      const formattedOriginalDate = originalDate
        ? new Date(originalDate).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : "Not yet scheduled";

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">📅 Interview Rescheduled</h2>
          <p>Hi ${candidateName},</p>
          <p>We need to reschedule your interview for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>.</p>

          ${reason ? `
            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Reason:</strong></p>
              <p style="margin: 0;">${reason}</p>
            </div>
          ` : ''}

          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Original Interview Details:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>Date & Time:</strong> ${formattedOriginalDate}</li>
              <li><strong>Status:</strong> <span style="color: #f59e0b; font-weight: bold;">Rescheduled</span></li>
            </ul>
          </div>

          <div style="background-color: #d1fae5; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>✅ What Happens Next:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              <li>The employer will provide new available time slots shortly</li>
              <li>You'll receive an email notification with the new options</li>
              <li>You can select your preferred times from those options</li>
              <li>Once confirmed, you'll receive a new calendar invite</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/candidate/interviews" style="background-color: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">VIEW YOUR INTERVIEWS</a>
          </div>

          <p>We apologize for any inconvenience and look forward to speaking with you soon.</p>
          <p style="font-size: 12px; color: #6b7280;">If you have any questions, please contact the hiring team through your dashboard.</p>
          <p>Best regards,<br>${companyName} Hiring Team</p>
        </div>
      `;

      await sendEmail({
        to: candidateEmail,
        subject: `Interview Rescheduled: ${jobTitle} at ${companyName}`,
        html: emailHtml,
      });

      console.log(`✅ Reschedule notification email sent to ${candidateEmail} for ${jobTitle}`);
    } catch (emailError) {
      console.error("Failed to send reschedule notification:", emailError);
      // Don't fail the reschedule if email fails
    }

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
