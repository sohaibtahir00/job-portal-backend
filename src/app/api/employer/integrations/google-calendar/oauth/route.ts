import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { google } from "googleapis";
import prisma from "@/lib/prisma";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BACKEND_URL}/api/employer/integrations/google-calendar/callback`
);

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email", // Needed to get user's email
];

// GET: Initiate OAuth flow
export async function GET(req: NextRequest) {
  try {
    // Use header-based authentication for cross-domain support
    const user = await getCurrentUser();
    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get employer to use as state
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!employer) {
      return NextResponse.json({ error: "Employer not found" }, { status: 404 });
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
      state: employer.id, // Pass employerId to callback
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("OAuth initiation error:", error);
    return NextResponse.json(
      { error: "Failed to initiate OAuth" },
      { status: 500 }
    );
  }
}
