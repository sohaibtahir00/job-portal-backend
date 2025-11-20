import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import prisma from "@/lib/prisma";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BACKEND_URL}/api/employer/integrations/google-calendar/callback`
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // This is employerId

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.FRONTEND_URL}/employer/settings?error=missing_params`
      );
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      return NextResponse.redirect(
        `${process.env.FRONTEND_URL}/employer/settings?error=invalid_tokens`
      );
    }

    // Store tokens
    await prisma.googleCalendarIntegration.upsert({
      where: { employerId: state },
      create: {
        employerId: state,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date),
        email: data.email || "",
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt: new Date(tokens.expiry_date),
        email: data.email || "",
      },
    });

    return NextResponse.redirect(
      `${process.env.FRONTEND_URL}/employer/settings?success=calendar_connected`
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      `${process.env.FRONTEND_URL}/employer/settings?error=oauth_failed`
    );
  }
}
