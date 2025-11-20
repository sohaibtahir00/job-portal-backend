import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

    // Create interview with AWAITING_CANDIDATE status
    const interview = await prisma.interview.create({
      data: {
        applicationId,
        candidateId: application.candidate.id,
        employerId: application.job.employer.id,
        duration,
        type,
        status: "AWAITING_CANDIDATE",
        round: round || roundName || null, // Save the round name (e.g., "Phone Screen", "Technical Interview")
        roundNumber: roundNumber || null, // Save round number for tracking
        roundName: roundName || round || null, // Save round name for clarity
        // scheduledAt is null until candidate selects and employer confirms
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

      console.log(`
=======================================================
📧 EMAIL NOTIFICATION - Interview Availability Sent
=======================================================
To: ${candidateEmail}
Candidate: ${candidateName}
Job: ${jobTitle}
Company: ${companyName}
Round: ${roundInfo}
Duration: ${duration} minutes

Available Time Slots:
${availabilitySlots.map((slot: any) => {
  const start = new Date(slot.startTime);
  const end = new Date(slot.endTime);
  return `  - ${start.toLocaleDateString()} ${start.toLocaleTimeString()} to ${end.toLocaleTimeString()}`;
}).join('\n')}

Email Content:
-------------------------------------------------------
Subject: Interview Availability: ${jobTitle} at ${companyName}

Hi ${candidateName},

Great news! ${companyName} would like to schedule an interview with you for the ${jobTitle} position.

Interview Details:
- Round: ${roundInfo}
- Duration: ${duration} minutes
- Type: ${type}

Available Time Slots (please select your preferred times):
${availabilitySlots.map((slot: any) => {
  const start = new Date(slot.startTime);
  const end = new Date(slot.endTime);
  return `  - ${start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} from ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} to ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}).join('\n')}

Please log in to your account to select your preferred time slots:
${process.env.FRONTEND_URL}/candidate/interviews

We look forward to speaking with you!

Best regards,
${companyName} Hiring Team
-------------------------------------------------------
=======================================================
      `);

      // TODO: Replace with actual email sending when email service is integrated
      // await sendEmail({
      //   to: candidateEmail,
      //   subject: \`Interview Availability: \${jobTitle} at \${companyName}\`,
      //   html: emailHtml
      // });
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
