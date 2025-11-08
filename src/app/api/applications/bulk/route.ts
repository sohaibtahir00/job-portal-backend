import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole, ApplicationStatus } from "@prisma/client";

/**
 * POST /api/applications/bulk
 * Bulk update application statuses
 * Requires EMPLOYER or ADMIN role
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(UserRole.EMPLOYER);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get employer profile
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      include: {
        jobs: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { applicationIds, newStatus } = body;

    // Validate
    if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
      return NextResponse.json(
        { error: "Application IDs array is required" },
        { status: 400 }
      );
    }

    if (!newStatus || !Object.values(ApplicationStatus).includes(newStatus)) {
      return NextResponse.json(
        { error: "Valid status is required" },
        { status: 400 }
      );
    }

    // Verify all applications belong to employer's jobs
    const jobIds = employer.jobs.map(j => j.id);
    const applicationsToUpdate = await prisma.application.findMany({
      where: {
        id: { in: applicationIds },
        jobId: { in: jobIds },
      },
    });

    if (applicationsToUpdate.length !== applicationIds.length) {
      return NextResponse.json(
        { error: "Some applications not found or not authorized" },
        { status: 403 }
      );
    }

    // Update all applications
    const result = await prisma.application.updateMany({
      where: {
        id: { in: applicationIds },
      },
      data: {
        status: newStatus,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({
      message: `Successfully updated ${result.count} application(s)`,
      count: result.count,
      newStatus,
    });
  } catch (error) {
    console.error("Bulk update error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Employer role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to update applications" },
      { status: 500 }
    );
  }
}
