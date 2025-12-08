import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/employer/applications/[id]
 * Get detailed information about a specific application
 *
 * Simple endpoint matching the pattern of /api/jobs/[id]/applications
 * - Only accessible by employers
 * - Validates employer owns the job this application is for
 * - Returns full application details with candidate info
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('🚨🚨🚨 [EMPLOYER/APPLICATION] GET request received!');

  try {
    const { id: applicationId } = await params;
    console.log('🔍 [EMPLOYER/APPLICATION] Application ID:', applicationId);

    // Get current user
    let user = null;
    try {
      user = await getCurrentUser();
      console.log('🔍 [EMPLOYER/APPLICATION] Current user:', user ? { id: user.id, email: user.email, role: user.role } : 'Not authenticated');
    } catch (error) {
      console.log('⚠️ [EMPLOYER/APPLICATION] No user session');
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!user) {
      console.log('❌ [EMPLOYER/APPLICATION] User not found');
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Only employers can view applications
    if (user.role !== UserRole.EMPLOYER) {
      console.log('❌ [EMPLOYER/APPLICATION] User is not an employer, role:', user.role);
      return NextResponse.json(
        { error: "Only employers can view application details" },
        { status: 403 }
      );
    }

    // Get employer profile
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        companyName: true,
      },
    });

    if (!employer) {
      console.log('❌ [EMPLOYER/APPLICATION] Employer profile not found for userId:', user.id);
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    console.log('✅ [EMPLOYER/APPLICATION] Employer found:', employer.companyName, 'ID:', employer.id);

    // Fetch application with full details including offer
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            employerId: true,
          },
        },
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
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
        },
        testResults: {
          orderBy: {
            completedAt: "desc",
          },
        },
        // Include offer data for button state management
        offer: {
          select: {
            id: true,
            status: true,
            position: true,
            salary: true,
            createdAt: true,
            expiresAt: true,
            respondedAt: true,
            declineReason: true,
          },
        },
      },
    });

    if (!application) {
      console.log('❌ [EMPLOYER/APPLICATION] Application not found:', applicationId);
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    console.log('✅ [EMPLOYER/APPLICATION] Application found for job:', application.job.title);
    console.log('📦 [EMPLOYER/APPLICATION] Job employerId:', application.job.employerId);
    console.log('📦 [EMPLOYER/APPLICATION] Current employer.id:', employer.id);

    // Check if employer owns the job this application is for
    if (application.job.employerId !== employer.id) {
      console.log('❌ [EMPLOYER/APPLICATION] Ownership check failed!');
      console.log('   Job employerId:', application.job.employerId);
      console.log('   Current employer.id:', employer.id);
      return NextResponse.json(
        { error: "You don't have permission to view this application" },
        { status: 403 }
      );
    }

    console.log('✅ [EMPLOYER/APPLICATION] Ownership verified! Returning application data...');

    return NextResponse.json({ application });
  } catch (error) {
    console.error('[EMPLOYER/APPLICATION] Error:', error);
    return NextResponse.json(
      {
        error: "Failed to fetch application",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
