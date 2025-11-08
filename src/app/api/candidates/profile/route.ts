import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole, JobType } from "@prisma/client";
import { calculateProfileCompletion, getProfileCompletionStatus } from "@/lib/profile-completion";

/**
 * GET /api/candidates/profile
 * Get the current candidate's profile
 * Requires CANDIDATE or ADMIN role
 */
export async function GET() {
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

    // Get candidate profile
    const candidate = await prisma.candidate.findUnique({
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
                employer: {
                  select: {
                    companyName: true,
                    companyLogo: true,
                  },
                },
              },
            },
          },
          orderBy: {
            appliedAt: "desc",
          },
          take: 10, // Last 10 applications
        },
        testResults: {
          orderBy: {
            completedAt: "desc",
          },
          take: 5, // Last 5 test results
        },
        placements: {
          orderBy: {
            startDate: "desc",
          },
        },
        workExperiences: {
          orderBy: {
            startDate: "desc",
          },
        },
        educationEntries: {
          orderBy: {
            graduationYear: "desc",
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found. Please create your profile first." },
        { status: 404 }
      );
    }

    // Calculate profile completion
    const completionStatus = getProfileCompletionStatus(candidate);

    return NextResponse.json({
      candidate,
      profileCompletion: completionStatus,
    });
  } catch (error) {
    console.error("Candidate profile fetch error:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });

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
      {
        error: "Failed to fetch candidate profile",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/candidates/profile
 * Create a candidate profile (after signup)
 * Requires CANDIDATE or ADMIN role
 */
export async function POST(request: NextRequest) {
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

    // Check if profile already exists
    const existingProfile = await prisma.candidate.findUnique({
      where: { userId: user.id },
    });

    if (existingProfile) {
      return NextResponse.json(
        { error: "Candidate profile already exists. Use PATCH to update." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      phone,
      resume,
      portfolio,
      linkedIn,
      github,
      bio,
      skills = [],
      experience,
      education,
      location,
      preferredJobType,
      expectedSalary,
      availability = true,
    } = body;

    // Validate job type if provided
    if (preferredJobType && !Object.values(JobType).includes(preferredJobType)) {
      return NextResponse.json(
        { error: "Invalid job type", validTypes: Object.values(JobType) },
        { status: 400 }
      );
    }

    // Create candidate profile
    const candidate = await prisma.candidate.create({
      data: {
        userId: user.id,
        phone,
        resume,
        portfolio,
        linkedIn,
        github,
        bio,
        skills,
        experience,
        education,
        location,
        preferredJobType,
        expectedSalary,
        availability,
      },
    });

    // Calculate profile completion
    const completionPercentage = calculateProfileCompletion(candidate);
    const completionStatus = getProfileCompletionStatus(candidate);

    return NextResponse.json(
      {
        message: "Candidate profile created successfully",
        candidate,
        profileCompletion: completionStatus,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Candidate profile creation error:", error);

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
      { error: "Failed to create candidate profile" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/candidates/profile
 * Update candidate profile
 * Requires CANDIDATE or ADMIN role
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
    const {
      phone,
      resume,
      portfolio,
      personalWebsite,
      linkedIn,
      github,
      bio,
      skills,
      experience,
      education,
      location,
      preferredJobType,
      expectedSalary,
      availability,
      desiredRoles,
      nicheCategory,
      remotePreference,
      startDateAvailability,
      openToContract,
      willingToRelocate,
    } = body;

    // Validate job type if provided
    if (preferredJobType && !Object.values(JobType).includes(preferredJobType)) {
      return NextResponse.json(
        { error: "Invalid job type", validTypes: Object.values(JobType) },
        { status: 400 }
      );
    }

    // Build update data (only include provided fields)
    const updateData: any = {};

    if (phone !== undefined) updateData.phone = phone;
    if (resume !== undefined) updateData.resume = resume;
    if (portfolio !== undefined) updateData.portfolio = portfolio;
    if (personalWebsite !== undefined) updateData.personalWebsite = personalWebsite;
    if (linkedIn !== undefined) updateData.linkedIn = linkedIn;
    if (github !== undefined) updateData.github = github;
    if (bio !== undefined) updateData.bio = bio;
    if (skills !== undefined) updateData.skills = skills;
    if (experience !== undefined) updateData.experience = experience;
    if (education !== undefined) updateData.education = education;
    if (location !== undefined) updateData.location = location;
    if (preferredJobType !== undefined) updateData.preferredJobType = preferredJobType;
    if (expectedSalary !== undefined) updateData.expectedSalary = expectedSalary;
    if (availability !== undefined) updateData.availability = availability;
    if (desiredRoles !== undefined) updateData.desiredRoles = desiredRoles;
    if (nicheCategory !== undefined) updateData.nicheCategory = nicheCategory;
    if (remotePreference !== undefined) updateData.remotePreference = remotePreference;
    if (startDateAvailability !== undefined) updateData.startDateAvailability = startDateAvailability ? new Date(startDateAvailability) : null;
    if (openToContract !== undefined) updateData.openToContract = openToContract;
    if (willingToRelocate !== undefined) updateData.willingToRelocate = willingToRelocate;

    // Update candidate profile
    const updatedCandidate = await prisma.candidate.update({
      where: { userId: user.id },
      data: updateData,
    });

    // Calculate profile completion
    const completionStatus = getProfileCompletionStatus(updatedCandidate);

    return NextResponse.json({
      message: "Candidate profile updated successfully",
      candidate: updatedCandidate,
      profileCompletion: completionStatus,
    });
  } catch (error) {
    console.error("Candidate profile update error:", error);

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
      { error: "Failed to update candidate profile" },
      { status: 500 }
    );
  }
}
