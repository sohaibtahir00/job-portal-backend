import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { platform } = await request.json();

    if (!platform || (platform !== "ZOOM" && platform !== "GOOGLE_MEET")) {
      return NextResponse.json(
        { error: "Invalid platform" },
        { status: 400 }
      );
    }

    // Get employer ID from user
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

    // Get integration
    const integration = await prisma.videoIntegration.findUnique({
      where: { employerId: employer.id },
    });

    if (!integration || integration.platform !== platform) {
      return NextResponse.json(
        { error: `${platform} not connected` },
        { status: 400 }
      );
    }

    let meetingLink = "";

    if (platform === "ZOOM") {
      // Create Zoom meeting
      const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: "Interview",
          type: 2, // Scheduled meeting
          duration: 60,
          settings: {
            host_video: true,
            participant_video: true,
            join_before_host: true,
            waiting_room: false,
          },
        }),
      });

      const meetingData = await response.json();

      if (!response.ok) {
        console.error("Zoom API error:", meetingData);
        return NextResponse.json(
          { error: "Failed to create Zoom meeting" },
          { status: 500 }
        );
      }

      meetingLink = meetingData.join_url;
    } else if (platform === "GOOGLE_MEET") {
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
            summary: "Interview",
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

      if (!response.ok) {
        console.error("Google Calendar API error:", eventData);
        return NextResponse.json(
          { error: "Failed to create Google Meet" },
          { status: 500 }
        );
      }

      meetingLink =
        eventData.conferenceData?.entryPoints?.find(
          (ep: any) => ep.entryPointType === "video"
        )?.uri || "";
    }

    if (!meetingLink) {
      return NextResponse.json(
        { error: "Failed to generate meeting link" },
        { status: 500 }
      );
    }

    // Update interview with video link
    await prisma.interview.update({
      where: { id: params.id },
      data: {
        videoLink: meetingLink,
        meetingLink: meetingLink,
        videoPlatform: platform,
      },
    });

    return NextResponse.json({ videoLink: meetingLink });
  } catch (error) {
    console.error("Generate link error:", error);
    return NextResponse.json(
      { error: "Failed to generate link" },
      { status: 500 }
    );
  }
}
