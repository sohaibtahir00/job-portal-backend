import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const employerId = searchParams.get("state");

    if (!code || !employerId) {
      return NextResponse.redirect(
        `${process.env.FRONTEND_URL}/employer/settings?error=missing_params`
      );
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        code: code,
        grant_type: "authorization_code",
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return NextResponse.redirect(
        `${process.env.FRONTEND_URL}/employer/settings?error=oauth_failed`
      );
    }

    // Get user info
    const userResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const userData = await userResponse.json();

    // Save integration
    await prisma.videoIntegration.upsert({
      where: { employerId },
      create: {
        employerId,
        platform: "GOOGLE_MEET",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        email: userData.email,
      },
      update: {
        platform: "GOOGLE_MEET",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        email: userData.email,
      },
    });

    return NextResponse.redirect(
      `${process.env.FRONTEND_URL}/employer/settings?success=google_meet_connected`
    );
  } catch (error) {
    console.error("Google Meet OAuth error:", error);
    return NextResponse.redirect(
      `${process.env.FRONTEND_URL}/employer/settings?error=oauth_failed`
    );
  }
}
