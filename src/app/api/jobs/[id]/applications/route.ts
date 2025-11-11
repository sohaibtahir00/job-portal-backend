import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/jobs/[id]/applications
 * Get applications for a specific job
 *
 * Public endpoint - works like /api/jobs/[id]:
 * - If authenticated as EMPLOYER who owns the job -> returns applications
 * - If not authenticated or not owner -> returns 403
 * - No strict requireAnyRole check, handles auth gracefully
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('🚨🚨🚨 [JOBS/APPLICATIONS] GET request received!');

  try {
    const { id: jobId } = await params;
    console.log('🔍 [JOBS/APPLICATIONS] Job ID:', jobId);

    // Check if job exists first
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        employerId: true,
      },
    });

    if (!job) {
      console.log('❌ [JOBS/APPLICATIONS] Job not found:', jobId);
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    console.log('✅ [JOBS/APPLICATIONS] Job exists:', job.title);
    console.log('📦 [JOBS/APPLICATIONS] Job employerId:', job.employerId);

    // Get current user (gracefully, no error if not authenticated)
    let user = null;
    try {
      user = await getCurrentUser();
      console.log('🔍 [JOBS/APPLICATIONS] Current user:', user ? { id: user.id, email: user.email, role: user.role } : 'Not authenticated');
    } catch (error) {
      console.log('⚠️ [JOBS/APPLICATIONS] No user session');
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!user) {
      console.log('❌ [JOBS/APPLICATIONS] User not found');
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Only employers can view applications
    if (user.role !== UserRole.EMPLOYER) {
      console.log('❌ [JOBS/APPLICATIONS] User is not an employer, role:', user.role);
      return NextResponse.json(
        { error: "Only employers can view applications" },
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
      console.log('❌ [JOBS/APPLICATIONS] Employer profile not found for userId:', user.id);
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    console.log('✅ [JOBS/APPLICATIONS] Employer found:', employer.companyName, 'ID:', employer.id);

    // Check if employer owns this job
    if (job.employerId !== employer.id) {
      console.log('❌ [JOBS/APPLICATIONS] Ownership check failed!');
      console.log('   Job employerId:', job.employerId);
      console.log('   Current employer.id:', employer.id);
      return NextResponse.json(
        { error: "You don't have permission to view applications for this job" },
        { status: 403 }
      );
    }

    console.log('✅ [JOBS/APPLICATIONS] Ownership verified! Fetching applications...');

    // Fetch applications for this job
    const applications = await prisma.application.findMany({
      where: { jobId: jobId },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        appliedAt: 'desc',
      },
    });

    console.log('✅ [JOBS/APPLICATIONS] Found', applications.length, 'applications');

    // Transform data to match frontend expectations
    const transformedApplications = applications.map(app => ({
      id: app.id,
      name: app.candidate.user.name || app.candidate.user.email,
      email: app.candidate.user.email,
      phone: app.candidate.phone,
      location: app.candidate.location,
      appliedAt: app.appliedAt.toISOString(),
      skillsScore: app.skillsScore,
      testTier: app.candidate.testTier,
      experience: app.candidate.experience,
      status: app.status,
      coverLetter: app.coverLetter,
      candidate: {
        user: {
          name: app.candidate.user.name || '',
          email: app.candidate.user.email,
        },
        phone: app.candidate.phone,
        location: app.candidate.location,
        experience: app.candidate.experience,
        testScore: app.candidate.testScore,
        testTier: app.candidate.testTier,
      },
    }));

    return NextResponse.json({
      applications: transformedApplications,
      job: {
        id: job.id,
        title: job.title,
      },
    });

  } catch (error) {
    console.error('[JOBS/APPLICATIONS] Error:', error);
    return NextResponse.json(
      {
        error: "Failed to fetch applications",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
