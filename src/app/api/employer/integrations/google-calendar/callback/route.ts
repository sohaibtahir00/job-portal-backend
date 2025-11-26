import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import prisma from "@/lib/prisma";

// Force dynamic rendering
export const dynamic = "force-dynamic";

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

    console.log("[OAuth Callback] Received callback with code:", !!code, "state:", !!state);

    if (!code || !state) {
      console.error("[OAuth Callback] Missing parameters - code:", !!code, "state:", !!state);
      return NextResponse.redirect(
        `${process.env.FRONTEND_URL}/employer/settings?error=missing_params`
      );
    }

    // Check environment variables
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error("[OAuth Callback] Missing Google credentials in environment variables");
      return NextResponse.redirect(
        `${process.env.FRONTEND_URL}/employer/settings?error=missing_credentials`
      );
    }

    console.log("[OAuth Callback] Exchanging code for tokens...");
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log("[OAuth Callback] Tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      hasExpiry: !!tokens.expiry_date,
    });

    // Set credentials immediately after getting tokens
    oauth2Client.setCredentials(tokens);

    // Get user email using the authenticated client
    console.log("[OAuth Callback] Fetching user info...");
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    console.log("[OAuth Callback] User info retrieved:", { email: data.email });

    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      return NextResponse.redirect(
        `${process.env.FRONTEND_URL}/employer/settings?error=invalid_tokens`
      );
    }

    console.log("[OAuth Callback] Storing tokens for employer:", state);
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

    console.log("[OAuth Callback] Successfully connected Google Calendar for:", data.email);
    return NextResponse.redirect(
      `${process.env.FRONTEND_URL}/employer/settings?success=calendar_connected`
    );
  } catch (error: any) {
    console.error("[OAuth Callback] Error:", error);
    console.error("[OAuth Callback] Error details:", {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    return NextResponse.redirect(
      `${process.env.FRONTEND_URL}/employer/settings?error=oauth_failed`
    );
  }
}
