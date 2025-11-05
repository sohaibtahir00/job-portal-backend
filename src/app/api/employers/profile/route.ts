import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/employers/profile
 * Get the current employer's profile with related data
 * Requires EMPLOYER or ADMIN role
 */
export async function GET() {
  try {
    // Require employer or admin role
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get employer profile with related data
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      include: {
        jobs: {
          include: {
            _count: {
              select: {
                applications: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10, // Last 10 jobs
        },
        emailCampaigns: {
          orderBy: {
            createdAt: "desc",
          },
          take: 5, // Last 5 campaigns
        },
        _count: {
          select: {
            jobs: true,
            emailCampaigns: true,
          },
        },
      },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found. Please create your profile first." },
        { status: 404 }
      );
    }

    // Get application statistics
    const jobIds = employer.jobs.map(job => job.id);

    const applicationStats = await prisma.application.groupBy({
      by: ["status"],
      where: {
        jobId: { in: jobIds },
      },
      _count: true,
    });

    return NextResponse.json({
      employer,
      applicationStats,
    });
  } catch (error) {
    console.error("Employer profile fetch error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions. Employer role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to fetch employer profile" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/employers/profile
 * Create an employer profile (after signup)
 * Requires EMPLOYER or ADMIN role
 */
export async function POST(request: NextRequest) {
  try {
    // Require employer or admin role
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if profile already exists
    const existingProfile = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (existingProfile) {
      return NextResponse.json(
        { error: "Employer profile already exists. Use PATCH to update." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      companyName,
      companyLogo,
      companyWebsite,
      companySize,
      industry,
      description,
      location,
      phone,
    } = body;

    // Validate required fields
    if (!companyName) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      );
    }

    // Validate company website format if provided
    if (companyWebsite && !isValidUrl(companyWebsite)) {
      return NextResponse.json(
        { error: "Invalid company website URL" },
        { status: 400 }
      );
    }

    // Create employer profile
    const employer = await prisma.employer.create({
      data: {
        userId: user.id,
        companyName,
        companyLogo,
        companyWebsite,
        companySize,
        industry,
        description,
        location,
        phone,
        verified: false, // Requires admin verification
      },
    });

    return NextResponse.json(
      {
        message: "Employer profile created successfully",
        employer,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Employer profile creation error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions. Employer role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to create employer profile" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/employers/profile
 * Update employer profile
 * Requires EMPLOYER or ADMIN role
 */
export async function PATCH(request: NextRequest) {
  try {
    // Require employer or admin role
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if profile exists
    const existingProfile = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!existingProfile) {
      return NextResponse.json(
        { error: "Employer profile not found. Please create your profile first." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      companyName,
      companyLogo,
      companyWebsite,
      companySize,
      industry,
      description,
      location,
      phone,
    } = body;

    // Validate company website format if provided
    if (companyWebsite && !isValidUrl(companyWebsite)) {
      return NextResponse.json(
        { error: "Invalid company website URL" },
        { status: 400 }
      );
    }

    // Build update data (only include provided fields)
    const updateData: any = {};

    if (companyName !== undefined) updateData.companyName = companyName;
    if (companyLogo !== undefined) updateData.companyLogo = companyLogo;
    if (companyWebsite !== undefined) updateData.companyWebsite = companyWebsite;
    if (companySize !== undefined) updateData.companySize = companySize;
    if (industry !== undefined) updateData.industry = industry;
    if (description !== undefined) updateData.description = description;
    if (location !== undefined) updateData.location = location;
    if (phone !== undefined) updateData.phone = phone;

    // Update employer profile
    const updatedEmployer = await prisma.employer.update({
      where: { userId: user.id },
      data: updateData,
    });

    return NextResponse.json({
      message: "Employer profile updated successfully",
      employer: updatedEmployer,
    });
  } catch (error) {
    console.error("Employer profile update error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions. Employer role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to update employer profile" },
      { status: 500 }
    );
  }
}

/**
 * Helper function to validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
