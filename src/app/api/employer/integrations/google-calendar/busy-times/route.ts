import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { google } from "googleapis";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    // Use header-based authentication for cross-domain support
    const user = await getCurrentUser();
    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "Missing date parameters" },
        { status: 400 }
      );
    }

    // Get employer
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      include: { googleCalendar: true },
    });

    if (!employer?.googleCalendar) {
      return NextResponse.json(
        { error: "Google Calendar not connected" },
        { status: 404 }
      );
    }

    const calendar = employer.googleCalendar;

    // Check if token expired and refresh if needed
    if (new Date() > calendar.expiresAt) {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        refresh_token: calendar.refreshToken,
      });

      try {
        const { credentials } = await oauth2Client.refreshAccessToken();

        // Update tokens in database
        await prisma.googleCalendarIntegration.update({
          where: { id: calendar.id },
          data: {
            accessToken: credentials.access_token!,
            expiresAt: new Date(credentials.expiry_date!),
          },
        });

        // Update local calendar object
        calendar.accessToken = credentials.access_token!;
      } catch (refreshError) {
        console.error("Token refresh error:", refreshError);
        return NextResponse.json(
          { error: "Token expired, please reconnect" },
          { status: 401 }
        );
      }
    }

    // Initialize Google Calendar API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: calendar.accessToken,
      refresh_token: calendar.refreshToken,
    });

    const calendarAPI = google.calendar({ version: "v3", auth: oauth2Client });

    // Fetch events
    const response = await calendarAPI.events.list({
      calendarId: calendar.calendarId,
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const busyTimes =
      response.data.items?.map((event) => ({
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        title: event.summary,
      })) || [];

    return NextResponse.json({ busyTimes });
  } catch (error) {
    console.error("Fetch busy times error:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}
