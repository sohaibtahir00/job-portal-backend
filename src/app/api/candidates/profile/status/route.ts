import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * PATCH /api/candidates/profile/status
 * Update candidate availability status
 * Requires CANDIDATE or ADMIN role
 *
 * This endpoint allows candidates to update their availability status
 * (actively looking for work, not available, etc.)
 */
export async function PATCH(request: NextRequest) {
  try {
    // Require candidate or admin role
    await requireAnyRole([UserRole.CANDIDATE, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if profile exists
    const existingProfile = await prisma.candidate.findUnique({
      where: { userId: user.id },
    });

    if (!existingProfile) {
      return NextResponse.json(
        { error: "Candidate profile not found. Please create your profile first." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { availability } = body;

    // Validate availability is a boolean
    if (typeof availability !== "boolean") {
      return NextResponse.json(
        {
          error: "Invalid availability value. Must be true or false.",
          provided: typeof availability,
        },
        { status: 400 }
      );
    }

    // Update candidate availability
    const updatedCandidate = await prisma.candidate.update({
      where: { userId: user.id },
      data: {
        availability,
      },
      select: {
        id: true,
        availability: true,
        updatedAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: `Availability status updated to ${availability ? "available" : "not available"}`,
      candidate: updatedCandidate,
    });
  } catch (error) {
    console.error("Candidate status update error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions. Candidate role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to update candidate status" },
      { status: 500 }
    );
  }
}
