import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole, ApplicationStatus } from "@prisma/client";

// Module load check
console.log('✅ [BULK ROUTE] Module loaded at /api/applications/bulk/route.ts');

/**
 * POST /api/applications/bulk
 * Bulk update application statuses for employer
 * Requires EMPLOYER role (or ADMIN for override)
 *
 * This endpoint allows employers to update multiple application statuses at once
 */
export async function POST(request: NextRequest) {
  console.log('🚨 [BULK ROUTE] POST handler called! URL:', request.url);

  try {
    // Get current user
    let user = null;
    try {
      user = await getCurrentUser();
      console.log('🔍 [Bulk Update] Current user:', user ? { id: user.id, email: user.email, role: user.role } : 'Not authenticated');
    } catch (error) {
      console.log('⚠️ [Bulk Update] No user session');
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!user) {
      console.log('❌ [Bulk Update] User not found');
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Only employers can perform bulk updates
    if (user.role !== UserRole.EMPLOYER) {
      console.log('❌ [Bulk Update] User is not an employer, role:', user.role);
      return NextResponse.json(
        { error: "Only employers can perform bulk updates" },
        { status: 403 }
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

    console.log("🔍 [Bulk Update] Request received:", {
      applicationIds,
      newStatus,
      employerId: employer.id,
    });

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
    console.log("🏢 [Bulk Update] Employer's job IDs:", jobIds);

    const applicationsToUpdate = await prisma.application.findMany({
      where: {
        id: { in: applicationIds },
        jobId: { in: jobIds },
      },
      select: {
        id: true,
        jobId: true,
        status: true,
      },
    });

    console.log("📋 [Bulk Update] Applications found:", applicationsToUpdate);
    console.log("📊 [Bulk Update] Requested:", applicationIds.length, "Found:", applicationsToUpdate.length);

    if (applicationsToUpdate.length !== applicationIds.length) {
      console.error("❌ [Bulk Update] Authorization failed - mismatch in counts");
      console.error("❌ [Bulk Update] Missing application IDs:",
        applicationIds.filter(id => !applicationsToUpdate.some(app => app.id === id))
      );

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
