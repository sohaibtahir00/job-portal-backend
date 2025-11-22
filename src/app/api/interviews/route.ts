import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { generateInterviewCalendarInvite } from "@/lib/calendar";

// GET /api/interviews - Get user's interviews
export async function GET(req: NextRequest) {
  try {
    // Use getCurrentUser which properly handles cross-domain auth headers
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const applicationId = searchParams.get("applicationId");

    // Get the Employer or Candidate record
    let employerId = null;
    let candidateId = null;

    if (user.role === "EMPLOYER") {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!employer) {
        return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
      }
      employerId = employer.id;
    } else if (user.role === "CANDIDATE") {
      const candidate = await prisma.candidate.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!candidate) {
        return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 });
      }
      candidateId = candidate.id;
    }

    // Build where clause
    const whereClause: any = {
      ...(candidateId ? { candidateId } : { employerId }),
    };

    if (status && status !== "all") {
      whereClause.status = status.toUpperCase();
    }

    if (applicationId) {
      whereClause.applicationId = applicationId;
    }

    const interviews = await prisma.interview.findMany({
      where: whereClause,
      include: {
        application: {
          include: {
            job: {
              select: {
                id: true,
                title: true,
                location: true,
                type: true,
                employer: {
                  select: {
                    companyName: true,
                  },
                },
              },
            },
            candidate: {
              select: {
                id: true,
                location: true,
                skills: true,
                experience: true,
                testScore: true,
                testTier: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                  },
                },
                workExperiences: {
                  orderBy: {
                    startDate: 'desc',
                  },
                  take: 1,
                  select: {
                    jobTitle: true,
                    companyName: true,
                    isCurrent: true,
                  },
                },
              },
            },
          },
        },
        interviewer: {
          select: {
            id: true,
            name: true,
            email: true,
            title: true,
          },
        },
        review: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ interviews });
  } catch (error) {
    console.error("Get interviews error:", error);
    return NextResponse.json(
      { error: "Failed to fetch interviews" },
      { status: 500 }
    );
  }
}

// POST /api/interviews - Schedule new interview
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      applicationId,
      scheduledAt,
      duration,
      type,
      location,
      meetingLink,
      notes,
    } = await req.json();

    // First, get the application to retrieve candidateId and employerId
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          select: {
            employerId: true,
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const interview = await prisma.interview.create({
      data: {
        applicationId,
        candidateId: application.candidateId,
        employerId: application.job.employerId,
        scheduledAt: new Date(scheduledAt),
        duration,
        type,
        location,
        meetingLink,
        notes,
        status: "SCHEDULED",
      },
      include: {
        application: {
          include: {
            job: {
              select: {
                title: true,
              },
            },
            candidate: {
              select: {
                id: true,
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

    // Send email notification to candidate with calendar invite
    try {
      const interviewDate = new Date(scheduledAt);
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

      // Generate calendar invite
      const calendarInvite = generateInterviewCalendarInvite({
        candidateName: interview.application.candidate.user.name,
        candidateEmail: interview.application.candidate.user.email,
        employerName: 'Hiring Team', // You may want to get actual employer name from the job
        jobTitle: interview.application.job.title,
        startTime: interviewDate,
        duration: duration,
        type: type,
        location: location,
        meetingLink: meetingLink,
        notes: notes,
      });

      await sendEmail({
        to: interview.application.candidate.user.email,
        subject: `Interview Scheduled: ${interview.application.job.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">📅 Interview Scheduled</h2>
            <p>Hi ${interview.application.candidate.user.name},</p>
            <p>You have been scheduled for an interview for the position of <strong>${interview.application.job.title}</strong>.</p>

            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Interview Details:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Date:</strong> ${formattedDate}</li>
                <li><strong>Time:</strong> ${formattedTime}</li>
                <li><strong>Duration:</strong> ${duration} minutes</li>
                <li><strong>Type:</strong> ${type}</li>
                ${location ? `<li><strong>Location:</strong> ${location}</li>` : ''}
                ${meetingLink ? `<li><strong>Meeting Link:</strong> <a href="${meetingLink}" style="color: #3b82f6;">${meetingLink}</a></li>` : ''}
              </ul>
            </div>

            ${notes ? `
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Notes from Employer:</strong></p>
                <p style="margin: 0;">${notes}</p>
              </div>
            ` : ''}

            <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Preparation Tips:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Review the job description and requirements</li>
                <li>Research the company and prepare questions</li>
                <li>Test your equipment if it's a video interview</li>
                <li>Arrive 5-10 minutes early</li>
              </ul>
            </div>

            <div style="background-color: #e0f2fe; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0;">
              <p style="margin: 0;"><strong>📎 Calendar Invite Attached</strong><br>
              A calendar invite (.ics file) is attached to this email. Click it to add this interview to your calendar app (Outlook, Google Calendar, Apple Calendar, etc.).</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/candidate/interviews" style="background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Interview Details</a>
            </div>

            <p>Good luck with your interview!</p>
            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `,
        attachments: [
          {
            filename: 'interview.ics',
            content: calendarInvite,
          },
        ],
      });
    } catch (emailError) {
      console.error("Failed to send interview notification email:", emailError);
      // Don't fail the interview creation if email fails
    }

    return NextResponse.json({ success: true, interview });
  } catch (error) {
    console.error("Schedule interview error:", error);
    return NextResponse.json(
      { error: "Failed to schedule interview" },
      { status: 500 }
    );
  }
}
