import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { generateInterviewCalendarInvite } from "@/lib/calendar";

/**
 * Cron Job: 1-Hour Interview Reminder
 *
 * Runs every 15 minutes and checks for interviews scheduled 1 hour from now
 * Sends final reminder email to candidates
 *
 * Setup in Railway or Vercel:
 * - Schedule: star-slash-15 * * * * (every 15 minutes)
 * - URL: https://your-backend.railway.app/api/cron/interview-reminder-1h
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

    // Calculate 1 hour from now window (55 min - 65 min)
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const windowStart = new Date(oneHourFromNow.getTime() - 5 * 60 * 1000); // 5 min before
    const windowEnd = new Date(oneHourFromNow.getTime() + 5 * 60 * 1000); // 5 min after

    console.log(`[1h Reminder Cron] Running at ${now.toISOString()}`);
    console.log(`[1h Reminder Cron] Looking for interviews between ${windowStart.toISOString()} and ${windowEnd.toISOString()}`);

    // Find interviews scheduled in the next 1 hour (±5 min window)
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

    console.log(`[1h Reminder Cron] Found ${upcomingInterviews.length} interviews to remind`);

    let successCount = 0;
    let errorCount = 0;

    // Send reminder emails
    for (const interview of upcomingInterviews) {
      try {
        const interviewDate = new Date(interview.scheduledAt);
        const formattedTime = interviewDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        // Calculate exact time until interview
        const timeUntil = interviewDate.getTime() - now.getTime();
        const minutesUntil = Math.round(timeUntil / (60 * 1000));

        // Generate calendar invite reminder
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
          subject: `Starting Soon: Interview in ${minutesUntil} Minutes - ${interview.application.job.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">🚨 Interview Starting Soon!</h2>
              <p>Hi ${interview.application.candidate.user.name},</p>
              <p><strong>Your interview is starting in approximately ${minutesUntil} minutes!</strong></p>
              <p>Position: <strong>${interview.application.job.title}</strong></p>

              <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>⏰ Interview Time: ${formattedTime}</strong></p>
                <p style="margin: 0 0 10px 0;"><strong>Duration:</strong> ${interview.duration} minutes</p>
                <p style="margin: 0;"><strong>Type:</strong> ${interview.type}</p>
              </div>

              ${interview.meetingLink ? `
                <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0;"><strong>Join the meeting:</strong></p>
                  <div style="text-align: center;">
                    <a href="${interview.meetingLink}" style="background-color: #3b82f6; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">JOIN NOW</a>
                  </div>
                  <p style="margin: 10px 0 0 0; font-size: 12px; color: #6b7280;">Meeting Link: <a href="${interview.meetingLink}" style="color: #3b82f6;">${interview.meetingLink}</a></p>
                </div>
              ` : interview.location ? `
                <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0;"><strong>📍 Location:</strong></p>
                  <p style="margin: 0; font-size: 16px;">${interview.location}</p>
                </div>
              ` : ''}

              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>⚡ Last-Minute Checklist:</strong></p>
                <ul style="margin: 0; padding-left: 20px;">
                  ${interview.type === 'VIDEO' || interview.type === 'PHONE' ? `
                    <li>Test your camera and microphone</li>
                    <li>Check your internet connection</li>
                    <li>Find a quiet, well-lit space</li>
                    <li>Close unnecessary tabs and applications</li>
                  ` : `
                    <li>Leave now to arrive 5-10 minutes early</li>
                    <li>Bring a copy of your resume</li>
                    <li>Have your ID ready if needed</li>
                  `}
                  <li>Take a deep breath and relax - you're prepared!</li>
                </ul>
              </div>

              ${interview.notes ? `
                <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0;"><strong>Notes from Employer:</strong></p>
                  <p style="margin: 0;">${interview.notes}</p>
                </div>
              ` : ''}

              <div style="background-color: #e0f2fe; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>📎 Calendar Invite Attached</strong><br>
                Quick calendar reminder attached in case you need it!</p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <p style="font-size: 18px; font-weight: bold; color: #059669; margin: 0;">Good luck! You've got this! 💪🌟</p>
              </div>

              <p style="font-size: 12px; color: #6b7280;">If you need to contact the employer or have any issues, please visit your dashboard.</p>
              <p>Best regards,<br>The Job Portal Team</p>
            </div>
          `,
          attachments: [
            {
              filename: 'interview-reminder.ics',
              content: calendarInvite,
            },
          ],
        });

        successCount++;
        console.log(`[1h Reminder Cron] Sent reminder to ${interview.application.candidate.user.email} for interview ${interview.id}`);

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (emailError) {
        errorCount++;
        console.error(`[1h Reminder Cron] Failed to send reminder for interview ${interview.id}:`, emailError);
      }
    }

    const summary = {
      success: true,
      timestamp: now.toISOString(),
      interviewsFound: upcomingInterviews.length,
      remindersSent: successCount,
      errors: errorCount,
    };

    console.log(`[1h Reminder Cron] Completed:`, summary);

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[1h Reminder Cron] Fatal error:", error);
    return NextResponse.json(
      {
        error: "Failed to process 1h interview reminders",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
