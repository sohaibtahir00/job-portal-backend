import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole, ApplicationStatus } from "@prisma/client";

/**
 * GET /api/employer/applications
 * Get all applications for an employer across all their jobs
 *
 * Simple endpoint matching the pattern of /api/jobs/[id]/applications
 * - Works without complex query parameters
 * - Returns all applications for employer's jobs
 * - Supports optional filters: status, skillsFilter, sortBy
 */
export async function GET(request: NextRequest) {
  console.log('🚨🚨🚨 [EMPLOYER/APPLICATIONS] GET request received!');

  try {
    // Get current user
    let user = null;
    try {
      user = await getCurrentUser();
      console.log('🔍 [EMPLOYER/APPLICATIONS] Current user:', user ? { id: user.id, email: user.email, role: user.role } : 'Not authenticated');
    } catch (error) {
      console.log('⚠️ [EMPLOYER/APPLICATIONS] No user session');
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!user) {
      console.log('❌ [EMPLOYER/APPLICATIONS] User not found');
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Only employers can view applications
    if (user.role !== UserRole.EMPLOYER) {
      console.log('❌ [EMPLOYER/APPLICATIONS] User is not an employer, role:', user.role);
      return NextResponse.json(
        { error: "Only employers can view applications" },
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
            title: true,
          },
        },
      },
    });

    if (!employer) {
      console.log('❌ [EMPLOYER/APPLICATIONS] Employer profile not found for userId:', user.id);
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    console.log('✅ [EMPLOYER/APPLICATIONS] Employer found:', employer.companyName);
    console.log('✅ [EMPLOYER/APPLICATIONS] Employer has', employer.jobs.length, 'jobs');

    const jobIds = employer.jobs.map(j => j.id);
    console.log('📋 [EMPLOYER/APPLICATIONS] Job IDs:', jobIds);

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const skillsFilter = searchParams.get("skillsFilter");
    const sortBy = searchParams.get("sortBy") || "recent";
    const specificJobId = searchParams.get("jobId"); // Optional: filter by specific job

    console.log('🔍 [EMPLOYER/APPLICATIONS] Filters:', { statusFilter, skillsFilter, sortBy, specificJobId });

    // Build where clause
    let where: any = {
      jobId: { in: jobIds }, // All applications for employer's jobs
    };

    // If specific job requested, filter to that job only
    if (specificJobId && jobIds.includes(specificJobId)) {
      where.jobId = specificJobId;
      console.log('🎯 [EMPLOYER/APPLICATIONS] Filtering to specific job:', specificJobId);
    }

    // Status filter
    if (statusFilter && statusFilter !== "all") {
      // Handle combined "INTERVIEW" filter for both INTERVIEW_SCHEDULED and INTERVIEWED
      if (statusFilter === "INTERVIEW") {
        where.status = { in: ["INTERVIEW_SCHEDULED", "INTERVIEWED"] };
      } else {
        where.status = statusFilter as ApplicationStatus;
      }
    }

    // Skills filter
    if (skillsFilter && skillsFilter !== "all") {
      switch (skillsFilter) {
        case "verified":
          where.candidate = {
            hasTakenTest: true,
          };
          break;
        case "80+":
          where.candidate = {
            hasTakenTest: true,
            testScore: { gte: 80 },
          };
          break;
        case "60-79":
          where.candidate = {
            hasTakenTest: true,
            testScore: { gte: 60, lt: 80 },
          };
          break;
        case "<60":
          where.candidate = {
            hasTakenTest: true,
            testScore: { lt: 60 },
          };
          break;
      }
    }

    // Build orderBy
    let orderBy: any = {};
    switch (sortBy) {
      case "skillsScore":
        orderBy = { skillsScore: "desc" };
        break;
      case "applicationDate":
        orderBy = { appliedAt: "asc" };
        break;
      default: // "recent"
        orderBy = { appliedAt: "desc" };
    }

    console.log('🔍 [EMPLOYER/APPLICATIONS] Fetching applications with filters...');

    // Fetch applications
    const applications = await prisma.application.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            location: true,
            type: true,
            skills: true,
          },
        },
        candidate: {
          select: {
            id: true,
            experience: true,
            location: true,
            skills: true,
            availability: true,
            hasTakenTest: true,
            testScore: true,
            testPercentile: true,
            testTier: true,
            expectedSalary: true,
            resume: true,
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
              take: 1, // Get only the most recent work experience
              select: {
                jobTitle: true,
                companyName: true,
                isCurrent: true,
              },
            },
          },
        },
      },
      orderBy,
    });

    console.log('✅ [EMPLOYER/APPLICATIONS] Found', applications.length, 'applications');

    // Calculate stats
    const stats = {
      totalApplicants: applications.length,
      skillsVerifiedCount: applications.filter(a => a.candidate.hasTakenTest).length,
      skillsVerifiedPercentage: applications.length > 0
        ? Math.round((applications.filter(a => a.candidate.hasTakenTest).length / applications.length) * 100)
        : 0,
      averageSkillsScore: applications.length > 0
        ? Math.round(
            applications
              .filter(a => a.candidate.testScore !== null)
              .reduce((sum, a) => sum + (a.candidate.testScore || 0), 0) /
            applications.filter(a => a.candidate.testScore !== null).length || 0
          )
        : 0,
      statusBreakdown: {
        total: applications.length,
        pending: applications.filter(a => a.status === "PENDING").length,
        shortlisted: applications.filter(a => a.status === "SHORTLISTED").length,
        inInterview: applications.filter(a => a.status === "INTERVIEW_SCHEDULED" || a.status === "INTERVIEWED").length,
        offered: applications.filter(a => a.status === "OFFERED").length,
        accepted: applications.filter(a => a.status === "ACCEPTED").length,
        rejected: applications.filter(a => a.status === "REJECTED").length,
      },
    };

    console.log('📊 [EMPLOYER/APPLICATIONS] Stats:', stats);

    // Transform data to match frontend expectations
    const transformedApplications = applications.map(app => {
      // Get current job title and company from most recent work experience
      const mostRecentWork = app.candidate.workExperiences?.[0];
      const currentTitle = mostRecentWork?.isCurrent ? mostRecentWork.jobTitle : null;
      const currentCompany = mostRecentWork?.isCurrent ? mostRecentWork.companyName : null;

      return {
        id: app.id,
        status: app.status,
        appliedAt: app.appliedAt.toISOString(),
        reviewedAt: app.reviewedAt?.toISOString() || null,
        coverLetter: app.coverLetter,
        job: {
          id: app.job.id,
          title: app.job.title,
          location: app.job.location,
          type: app.job.type,
          skills: app.job.skills,
        },
        candidate: {
          id: app.candidate.id,
          experience: app.candidate.experience,
          location: app.candidate.location,
          skills: app.candidate.skills,
          availability: app.candidate.availability,
          hasTakenTest: app.candidate.hasTakenTest,
          testScore: app.candidate.testScore,
          testPercentile: app.candidate.testPercentile,
          testTier: app.candidate.testTier,
          currentTitle,
          currentCompany,
          expectedSalary: app.candidate.expectedSalary,
          resume: app.candidate.resume,
          user: {
            id: app.candidate.user.id,
            name: app.candidate.user.name || '',
            email: app.candidate.user.email,
            image: app.candidate.user.image,
          },
        },
        testResults: [], // TODO: Add if needed
      };
    });

    return NextResponse.json({
      applications: transformedApplications,
      stats,
      jobs: employer.jobs, // Include jobs list for filter dropdown
    });

  } catch (error) {
    console.error('[EMPLOYER/APPLICATIONS] Error:', error);
    return NextResponse.json(
      {
        error: "Failed to fetch applications",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
