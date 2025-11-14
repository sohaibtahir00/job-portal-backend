import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

/**
 * Cron Job: 24-Hour Interview Reminder
 *
 * Runs every hour and checks for interviews scheduled 24 hours from now
 * Sends reminder email to candidates
 *
 * Setup in Railway or Vercel:
 * - Schedule: 0 * * * * (every hour)
 * - URL: https://your-backend.railway.app/api/cron/interview-reminder-24h
 * - Header: Authorization: Bearer YOUR_CRON_SECRET
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const expectedSecret = process.env.CRON_SECRET;
    const cronSecret = request.headers.get("Authorization")?.replace("Bearer ", "");

    if (expectedSecret && cronSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Calculate 24 hours from now window (23.5 - 24.5 hours)
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const windowStart = new Date(twentyFourHoursFromNow.getTime() - 30 * 60 * 1000); // 30 min before
    const windowEnd = new Date(twentyFourHoursFromNow.getTime() + 30 * 60 * 1000); // 30 min after

    console.log(`[24h Reminder Cron] Running at ${now.toISOString()}`);
    console.log(`[24h Reminder Cron] Looking for interviews between ${windowStart.toISOString()} and ${windowEnd.toISOString()}`);

    // Find interviews scheduled in the next 24 hours (±30 min window)
    const upcomingInterviews = await prisma.interview.findMany({
      where: {
        scheduledAt: {
          gte: windowStart,
          lte: windowEnd,
        },
        status: {
          in: ["SCHEDULED", "CONFIRMED"],
        },
      },
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
      },
    });

    console.log(`[24h Reminder Cron] Found ${upcomingInterviews.length} interviews to remind`);

    let successCount = 0;
    let errorCount = 0;

    // Send reminder emails
    for (const interview of upcomingInterviews) {
      try {
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

        await sendEmail({
          to: interview.application.candidate.user.email,
          subject: `Reminder: Interview Tomorrow - ${interview.application.job.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #f59e0b;">⏰ Interview Reminder - 24 Hours</h2>
              <p>Hi ${interview.application.candidate.user.name},</p>
              <p>This is a friendly reminder that you have an interview scheduled for <strong>tomorrow</strong> for the position of <strong>${interview.application.job.title}</strong>.</p>

              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Interview Details:</strong></p>
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
                  <p style="margin: 0 0 10px 0;"><strong>Notes from Employer:</strong></p>
                  <p style="margin: 0;">${interview.notes}</p>
                </div>
              ` : ''}

              <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Final Preparation Tips:</strong></p>
                <ul style="margin: 0; padding-left: 20px;">
                  <li>Review your resume and the job description one more time</li>
                  <li>Prepare 2-3 questions to ask the interviewer</li>
                  <li>If it's a video interview, test your camera, microphone, and internet connection</li>
                  <li>Choose a quiet, well-lit location for the interview</li>
                  <li>Dress professionally and arrive 5-10 minutes early</li>
                  <li>Have a copy of your resume, portfolio, and any relevant documents ready</li>
                </ul>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL}/candidate/interviews" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Interview Details</a>
              </div>

              <p>Good luck with your interview tomorrow! You've got this! 💪</p>
              <p>Best regards,<br>The Job Portal Team</p>
            </div>
          `,
        });

        successCount++;
        console.log(`[24h Reminder Cron] Sent reminder to ${interview.application.candidate.user.email} for interview ${interview.id}`);

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (emailError) {
        errorCount++;
        console.error(`[24h Reminder Cron] Failed to send reminder for interview ${interview.id}:`, emailError);
      }
    }

    const summary = {
      success: true,
      timestamp: now.toISOString(),
      interviewsFound: upcomingInterviews.length,
      remindersSent: successCount,
      errors: errorCount,
    };

    console.log(`[24h Reminder Cron] Completed:`, summary);

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[24h Reminder Cron] Fatal error:", error);
    return NextResponse.json(
      {
        error: "Failed to process 24h interview reminders",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
