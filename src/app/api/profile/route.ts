import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/profile
 * Get the current user's profile with role-specific data
 */
export async function GET(request: NextRequest) {
  try {
    // Try to get user from headers first (for cross-domain requests)
    const userEmail = request.headers.get('X-User-Email');

    let user = null;

    if (userEmail) {
      // Get user from email header (cross-domain request from frontend)
      user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          image: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } else {
      // Fall back to session-based auth (same-domain request)
      await requireAuth();
      user = await getCurrentUser();
    }

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Fetch role-specific data
    let profileData = null;

    if (user.role === "CANDIDATE") {
      profileData = await prisma.candidate.findUnique({
        where: { userId: user.id },
        include: {
          applications: {
            include: {
              job: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  location: true,
                  status: true,
                },
              },
            },
            orderBy: {
              appliedAt: "desc",
            },
            take: 5, // Last 5 applications
          },
          placements: {
            orderBy: {
              startDate: "desc",
            },
            take: 5,
          },
        },
      });
    } else if (user.role === "EMPLOYER") {
      profileData = await prisma.employer.findUnique({
        where: { userId: user.id },
        include: {
          jobs: {
            orderBy: {
              createdAt: "desc",
            },
            take: 5, // Last 5 jobs posted
          },
        },
      });
    }

    return NextResponse.json({
      user,
      profile: profileData,
    });
  } catch (error) {
    console.error("Profile fetch error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/profile
 * Update the current user's profile
 */
export async function PATCH(request: NextRequest) {
  try {
    // Try to get user from headers first (for cross-domain requests)
    const userEmail = request.headers.get('X-User-Email');

    let user = null;

    if (userEmail) {
      // Get user from email header (cross-domain request from frontend)
      user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          image: true,
        },
      });
    } else {
      // Fall back to session-based auth (same-domain request)
      await requireAuth();
      user = await getCurrentUser();
    }

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, image } = body;

    // Update user basic info
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(name && { name }),
        ...(image && { image }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        image: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Profile update error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
