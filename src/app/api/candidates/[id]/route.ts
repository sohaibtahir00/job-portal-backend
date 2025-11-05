import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProfileCompletionStatus } from "@/lib/profile-completion";

/**
 * GET /api/candidates/[id]
 * Get public candidate profile (limited fields)
 * This endpoint is used by employers to view candidate profiles
 * Public route - no authentication required
 *
 * Only shows public information, not sensitive data like email, phone, etc.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Fetch candidate profile with limited fields
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: {
        id: true,
        // Public fields only
        bio: true,
        skills: true,
        experience: true,
        education: true,
        location: true,
        portfolio: true,
        linkedIn: true,
        github: true,
        availability: true,
        preferredJobType: true,
        createdAt: true,
        updatedAt: true,

        // Include user name and image (public info)
        user: {
          select: {
            name: true,
            image: true,
          },
        },

        // Include placement history (shows track record)
        placements: {
          where: {
            status: "COMPLETED", // Only show completed placements
          },
          select: {
            id: true,
            jobTitle: true,
            companyName: true,
            startDate: true,
            endDate: true,
          },
          orderBy: {
            startDate: "desc",
          },
        },

        // Include statistics
        _count: {
          select: {
            applications: true,
            placements: true,
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Calculate profile completion for display
    const completionStatus = getProfileCompletionStatus(candidate);

    return NextResponse.json({
      candidate,
      profileCompletion: completionStatus,
    });
  } catch (error) {
    console.error("Public candidate profile fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch candidate profile" },
      { status: 500 }
    );
  }
}
