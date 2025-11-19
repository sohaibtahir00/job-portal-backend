import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const employerId = searchParams.get("state"); // Pass employerId as state

    if (!code || !employerId) {
      return NextResponse.redirect(
        `${process.env.FRONTEND_URL}/employer/settings?error=missing_params`
      );
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: process.env.ZOOM_REDIRECT_URI || "",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return NextResponse.redirect(
        `${process.env.FRONTEND_URL}/employer/settings?error=oauth_failed`
      );
    }

    // Get user info
    const userResponse = await fetch("https://api.zoom.us/v2/users/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();

    // Save integration
    await prisma.videoIntegration.upsert({
      where: { employerId },
      create: {
        employerId,
        platform: "ZOOM",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        email: userData.email,
      },
      update: {
        platform: "ZOOM",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        email: userData.email,
      },
    });

    return NextResponse.redirect(
      `${process.env.FRONTEND_URL}/employer/settings?success=zoom_connected`
    );
  } catch (error) {
    console.error("Zoom OAuth error:", error);
    return NextResponse.redirect(
      `${process.env.FRONTEND_URL}/employer/settings?error=oauth_failed`
    );
  }
}
