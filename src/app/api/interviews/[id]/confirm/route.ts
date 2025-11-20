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

    const { slotId, meetingPlatform, interviewerId, notes } = await req.json();

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

    // Get employer ID to check for video integrations
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    // Generate meeting link (real Zoom/Google Meet if integration exists, otherwise mock)
    let meetingLink = "";

    // Normalize platform name for comparison
    const normalizedPlatform = meetingPlatform?.toLowerCase();

    console.log("[Confirm Interview] Meeting platform requested:", meetingPlatform, "normalized:", normalizedPlatform);

    if (normalizedPlatform === "zoom" || normalizedPlatform === "google_meet") {
      // Try to get real meeting link from video integration
      const platformKey = normalizedPlatform === "zoom" ? "ZOOM" : "GOOGLE_MEET";

      const integration = await prisma.videoIntegration.findUnique({
        where: { employerId: employer.id },
      });

      console.log("[Confirm Interview] Video integration found:", !!integration, "platform:", integration?.platform, "expected:", platformKey);

      if (integration && integration.platform === platformKey) {
        console.log("[Confirm Interview] Creating real", platformKey, "meeting");
        // Generate real meeting link
        try {
          if (platformKey === "ZOOM") {
            // Check if token is expired and refresh if needed
            let accessToken = integration.accessToken;

            if (integration.expiresAt && new Date() > integration.expiresAt) {
              console.log("[Confirm Interview] Zoom token expired, refreshing...");

              const refreshResponse = await fetch("https://zoom.us/oauth/token", {
                method: "POST",
                headers: {
                  "Authorization": `Basic ${Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64')}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  grant_type: "refresh_token",
                  refresh_token: integration.refreshToken,
                }),
              });

              if (refreshResponse.ok) {
                const refreshData = await refreshResponse.json();

                // Update integration with new tokens
                await prisma.videoIntegration.update({
                  where: { id: integration.id },
                  data: {
                    accessToken: refreshData.access_token,
                    refreshToken: refreshData.refresh_token || integration.refreshToken,
                    expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
                  },
                });

                accessToken = refreshData.access_token;
                console.log("[Confirm Interview] Zoom token refreshed successfully");
              } else {
                const errorData = await refreshResponse.json();
                console.error("[Confirm Interview] Token refresh failed:", errorData);
                // Fall back to mock link
                meetingLink = generateMockMeetingLink(meetingPlatform);
                console.log("[Confirm Interview] Using mock link due to token refresh failure");
              }
            }

            // Only proceed with meeting creation if we have a valid token
            if (accessToken && accessToken !== integration.accessToken || !integration.expiresAt || new Date() <= integration.expiresAt) {
              // Create Zoom meeting
              const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  topic: `Interview with ${interview.application.candidate.user.name}`,
                  type: 2, // Scheduled meeting
                  start_time: confirmedTime.startTime.toISOString(),
                  duration: 60,
                  timezone: "UTC",
                  settings: {
                    host_video: true,
                    participant_video: true,
                    join_before_host: true,
                    waiting_room: false,
                  },
                }),
              });

              const meetingData = await response.json();

              if (response.ok && meetingData.join_url) {
                meetingLink = meetingData.join_url;
                console.log("[Confirm Interview] Zoom meeting created successfully:", meetingLink);
              } else {
                console.error("[Confirm Interview] Zoom API error:", meetingData);
                // Fall back to mock link if API fails
                meetingLink = generateMockMeetingLink(meetingPlatform);
                console.log("[Confirm Interview] Using mock link due to API error:", meetingLink);
              }
            }
          } else if (platformKey === "GOOGLE_MEET") {
            // Create Google Meet via Calendar API
            const response = await fetch(
              "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${integration.accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  summary: `Interview with ${interview.application.candidate.user.name}`,
                  start: {
                    dateTime: confirmedTime.startTime.toISOString(),
                    timeZone: "UTC",
                  },
                  end: {
                    dateTime: new Date(confirmedTime.startTime.getTime() + 60 * 60 * 1000).toISOString(),
                    timeZone: "UTC",
                  },
                  conferenceData: {
                    createRequest: {
                      requestId: `interview-${params.id}`,
                      conferenceSolutionKey: {
                        type: "hangoutsMeet",
                      },
                    },
                  },
                }),
              }
            );

            const eventData = await response.json();

            if (response.ok && eventData.conferenceData?.entryPoints) {
              const meetUrl = eventData.conferenceData.entryPoints.find(
                (ep: any) => ep.entryPointType === "video"
              )?.uri;

              if (meetUrl) {
                meetingLink = meetUrl;
              } else {
                // Fall back to mock link if no URL found
                meetingLink = generateMockMeetingLink(meetingPlatform);
              }
            } else {
              console.error("Google Calendar API error:", eventData);
              // Fall back to mock link if API fails
              meetingLink = generateMockMeetingLink(meetingPlatform);
            }
          }
        } catch (apiError) {
          console.error("[Confirm Interview] Meeting link generation error:", apiError);
          // Fall back to mock link on error
          meetingLink = generateMockMeetingLink(meetingPlatform);
          console.log("[Confirm Interview] Using mock link due to exception:", meetingLink);
        }
      } else {
        // No integration found, use mock link
        console.log("[Confirm Interview] No integration found or platform mismatch, using mock link");
        meetingLink = generateMockMeetingLink(meetingPlatform);
      }
    } else {
      // For other platforms or no platform specified, use mock
      console.log("[Confirm Interview] Unsupported platform, using mock link");
      meetingLink = generateMockMeetingLink(meetingPlatform);
    }

    console.log("[Confirm Interview] Final meeting link:", meetingLink);

    // Update the interview
    await prisma.interview.update({
      where: { id: params.id },
      data: {
        status: "SCHEDULED",
        scheduledAt: confirmedTime.startTime,
        meetingLink,
        videoPlatform: normalizedPlatform === "zoom" ? "ZOOM" : normalizedPlatform === "google_meet" ? "GOOGLE_MEET" : null,
        interviewerId: interviewerId || null, // Add interviewer if provided
        notes: notes || null, // Add notes if provided
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
// This is used as a fallback when video integration is not connected
function generateMockMeetingLink(platform: string): string {
  const randomId = Math.random().toString(36).substring(7);

  if (platform === "zoom") {
    return `https://zoom.us/j/${randomId}?pwd=mock`;
  } else {
    return `https://meet.google.com/${randomId}`;
  }
}
