import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole, ApplicationStatus, JobStatus } from "@prisma/client";
import { sendApplicationConfirmationEmail, sendNewApplicationNotificationEmail } from "@/lib/email";

/**
 * POST /api/applications
 * Submit a job application
 * Requires CANDIDATE or ADMIN role
 */
export async function POST(request: NextRequest) {
  // IMPORTANT: Check if this is a bulk request
  // Next.js routing sometimes catches /bulk requests here
  const url = new URL(request.url);
  if (url.pathname.endsWith('/bulk')) {
    console.log('⚠️ [POST /api/applications] Detected /bulk request, should not be handled here');
    // This is a bulk request - it should be handled by /api/applications/bulk/route.ts
    // But since it's hitting here, handle it inline to unblock the user

    try {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }

      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
        include: { jobs: { select: { id: true } } },
      });

      if (!employer) {
        return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
      }

      const body = await request.json();
      const { applicationIds, newStatus } = body;

      if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
        return NextResponse.json({ error: "Application IDs array is required" }, { status: 400 });
      }

      if (!newStatus || !Object.values(ApplicationStatus).includes(newStatus)) {
        return NextResponse.json({ error: "Valid status is required" }, { status: 400 });
      }

      const jobIds = employer.jobs.map(j => j.id);
      const applicationsToUpdate = await prisma.application.findMany({
        where: { id: { in: applicationIds }, jobId: { in: jobIds } },
      });

      if (applicationsToUpdate.length !== applicationIds.length) {
        return NextResponse.json({ error: "Some applications not found or not authorized" }, { status: 403 });
      }

      const result = await prisma.application.updateMany({
        where: { id: { in: applicationIds } },
        data: { status: newStatus, reviewedAt: new Date() },
      });

      return NextResponse.json({
        message: `Successfully updated ${result.count} application(s)`,
        count: result.count,
        newStatus,
      });
    } catch (err) {
      console.error('Bulk update error:', err);
      return NextResponse.json({ error: "Failed to update applications" }, { status: 500 });
    }
  }

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
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found. Please complete your profile first." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { jobId, coverLetter, availability, hearAboutUs } = body;

    // Validate required fields
    if (!jobId) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 }
      );
    }

    // Check if job exists and is active
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        employer: {
          select: {
            companyName: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check if job is accepting applications
    if (job.status !== JobStatus.ACTIVE) {
      return NextResponse.json(
        {
          error: "This job is not accepting applications",
          jobStatus: job.status,
        },
        { status: 400 }
      );
    }

    // Check if deadline has passed
    if (job.deadline && new Date(job.deadline) < new Date()) {
      return NextResponse.json(
        {
          error: "Application deadline has passed",
          deadline: job.deadline,
        },
        { status: 400 }
      );
    }

    // Check for duplicate application (unique constraint in schema)
    const existingApplication = await prisma.application.findUnique({
      where: {
        jobId_candidateId: {
          jobId,
          candidateId: candidate.id,
        },
      },
    });

    if (existingApplication) {
      return NextResponse.json(
        {
          error: "You have already applied to this job",
          applicationId: existingApplication.id,
          appliedAt: existingApplication.appliedAt,
          status: existingApplication.status,
        },
        { status: 409 } // 409 Conflict
      );
    }

    // Create application
    const application = await prisma.application.create({
      data: {
        jobId,
        candidateId: candidate.id,
        coverLetter,
        availability,
        hearAboutUs,
        status: ApplicationStatus.PENDING,
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            type: true,
            location: true,
            employer: {
              select: {
                companyName: true,
                companyLogo: true,
              },
            },
          },
        },
        candidate: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Send confirmation email to candidate
    await sendApplicationConfirmationEmail({
      email: application.candidate.user.email,
      candidateName: application.candidate.user.name,
      jobTitle: application.job.title,
      companyName: application.job.employer.companyName,
      applicationId: application.id,
    });

    // Get employer user details for notification
    const employer = await prisma.employer.findUnique({
      where: { id: job.employerId },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    // Send notification email to employer
    if (employer) {
      await sendNewApplicationNotificationEmail({
        email: employer.user.email,
        employerName: employer.user.name,
        candidateName: application.candidate.user.name,
        jobTitle: application.job.title,
        applicationId: application.id,
        candidateSkills: candidate.skills,
        candidateExperience: candidate.experience || undefined,
      });
    }

    return NextResponse.json(
      {
        message: "Application submitted successfully",
        application,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Application submission error:", error);

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
      { error: "Failed to submit application" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/applications
 * Get all applications for current user
 * - Candidates: Their own applications
 * - Employers: Applications for their jobs
 * - Admins: All applications
 * Requires authentication
 */
export async function GET(request: NextRequest) {
  console.log('🚨🚨🚨 [APPLICATIONS] GET request received! URL:', request.url);
  console.log('🚨🚨🚨 [APPLICATIONS] Query params:', request.nextUrl.searchParams.toString());
  console.log('🚨🚨🚨 [APPLICATIONS] All params:', Object.fromEntries(request.nextUrl.searchParams.entries()));

  try {
    await requireAnyRole([UserRole.CANDIDATE, UserRole.EMPLOYER, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // Filters
    const status = searchParams.get("status") as ApplicationStatus | null;
    const jobId = searchParams.get("jobId");
    const skillsFilter = searchParams.get("skillsFilter"); // all, verified, 80+, 60-79, <60
    const sortBy = searchParams.get("sortBy") || "recent"; // recent, skillsScore, bestMatch, applicationDate

    // Build where clause based on role
    let where: any = {};

    if (user.role === UserRole.CANDIDATE) {
      // Candidates see their own applications
      const candidate = await prisma.candidate.findUnique({
        where: { userId: user.id },
      });

      if (!candidate) {
        return NextResponse.json(
          { error: "Candidate profile not found" },
          { status: 404 }
        );
      }

      where.candidateId = candidate.id;
    } else if (user.role === UserRole.EMPLOYER) {
      // Employers see applications for their jobs
      console.log("🔍 [GET /api/applications] Looking for employer with userId:", user.id);
      console.log("🔍 [GET /api/applications] User data:", JSON.stringify({ id: user.id, email: user.email, role: user.role }, null, 2));

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

      console.log("📦 [GET /api/applications] Employer found:", employer ? "YES" : "NO");
      if (employer) {
        console.log("📦 [GET /api/applications] Employer data:", JSON.stringify({
          id: employer.id,
          userId: employer.userId,
          companyName: employer.companyName,
          jobCount: employer.jobs.length
        }, null, 2));
      }

      if (!employer) {
        console.log("❌ [GET /api/applications] No employer profile found for userId:", user.id);
        return NextResponse.json(
          { error: "Employer profile not found. Please complete your onboarding." },
          { status: 404 }
        );
      }

      const jobIds = employer.jobs.map(job => job.id);

      console.log("📋 [GET /api/applications] Employer ID:", employer.id);
      console.log("📋 [GET /api/applications] Employer's job IDs:", jobIds);
      console.log("📋 [GET /api/applications] Job details:", employer.jobs.map(j => ({ id: j.id, title: j.title })));
      console.log("🎯 [GET /api/applications] Requested jobId:", jobId);
      console.log("✅ [GET /api/applications] Job ownership check:", jobId ? (jobIds.includes(jobId) ? "PASS ✓" : "FAIL ✗") : "N/A (no specific job)");

      // If specific jobId requested, verify employer owns it
      if (jobId) {
        if (!jobIds.includes(jobId)) {
          console.log("❌ [GET /api/applications] 403 - Employer doesn't own this job");
          console.log("📊 [GET /api/applications] Available jobs:", jobIds);
          console.log("🔍 [GET /api/applications] Requested job:", jobId);
          console.log("🔍 [GET /api/applications] Comparison check:");
          jobIds.forEach((id, index) => {
            console.log(`   Job ${index + 1}: "${id}" === "${jobId}" ? ${id === jobId}`);
          });

          return NextResponse.json(
            {
              error: "Job not found or you don't have access to this job",
              debug: {
                requestedJobId: jobId,
                yourJobIds: jobIds,
                employerId: employer.id,
                userId: user.id
              }
            },
            { status: 403 }
          );
        }
        console.log("✅ [GET /api/applications] Ownership check passed! Filtering by jobId:", jobId);
        where.jobId = jobId;
      } else {
        // No specific job, show all employer's jobs
        console.log("✅ [GET /api/applications] No specific job requested, showing all employer jobs");
        where.jobId = { in: jobIds };
      }
    } else {
      // Admins see all applications (no additional filter)
      // Apply job filter if provided for admins
      if (jobId) {
        where.jobId = jobId;
      }
    }

    // Apply status filter if provided
    if (status && Object.values(ApplicationStatus).includes(status)) {
      where.status = status;
    }

    // Apply skills filter if provided
    if (skillsFilter && user.role === UserRole.EMPLOYER) {
      if (skillsFilter === "verified") {
        where.candidate = {
          hasTakenTest: true,
        };
      } else if (skillsFilter === "80+") {
        where.candidate = {
          hasTakenTest: true,
          testScore: { gte: 80 },
        };
      } else if (skillsFilter === "60-79") {
        where.candidate = {
          hasTakenTest: true,
          testScore: { gte: 60, lt: 80 },
        };
      } else if (skillsFilter === "<60") {
        where.candidate = {
          hasTakenTest: true,
          testScore: { lt: 60 },
        };
      }
    }

    // Get total count
    const totalCount = await prisma.application.count({ where });

    // Determine sort order - only use simple sorting to avoid null issues
    let orderBy: any = { appliedAt: "desc" }; // default: most recent
    if (sortBy === "applicationDate") {
      orderBy = { appliedAt: "asc" };
    }
    // Skip skillsScore sorting for now to avoid issues with null values
    // bestMatch would require complex calculation, default to recent for now

    // Fetch applications with simplified query
    const applications = await prisma.application.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            type: true,
            location: true,
            status: true,
            salaryMin: true,
            salaryMax: true,
            skills: true,
            employer: {
              select: {
                id: true,
                companyName: true,
                companyLogo: true,
              },
            },
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
            user: {
              select: {
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    // Calculate stats summary for employers
    let stats = null;
    if (user.role === UserRole.EMPLOYER) {
      const allApplications = await prisma.application.findMany({
        where: {
          jobId: { in: where.jobId?.in || [jobId] },
        },
        include: {
          candidate: {
            select: {
              hasTakenTest: true,
              testScore: true,
            },
          },
        },
      });

      const skillsVerified = allApplications.filter(app => app.candidate.hasTakenTest);
      const totalWithScores = skillsVerified.filter(app => app.candidate.testScore !== null);
      const avgScore = totalWithScores.length > 0
        ? totalWithScores.reduce((sum, app) => sum + (app.candidate.testScore || 0), 0) / totalWithScores.length
        : 0;

      const statusCounts = {
        total: allApplications.length,
        pending: allApplications.filter(a => a.status === ApplicationStatus.PENDING).length,
        reviewed: allApplications.filter(a => a.status === ApplicationStatus.REVIEWED).length,
        shortlisted: allApplications.filter(a => a.status === ApplicationStatus.SHORTLISTED).length,
        interviewScheduled: allApplications.filter(a => a.status === ApplicationStatus.INTERVIEW_SCHEDULED).length,
        interviewed: allApplications.filter(a => a.status === ApplicationStatus.INTERVIEWED).length,
        offered: allApplications.filter(a => a.status === ApplicationStatus.OFFERED).length,
        accepted: allApplications.filter(a => a.status === ApplicationStatus.ACCEPTED).length,
        rejected: allApplications.filter(a => a.status === ApplicationStatus.REJECTED).length,
      };

      stats = {
        totalApplicants: allApplications.length,
        skillsVerifiedCount: skillsVerified.length,
        skillsVerifiedPercentage: allApplications.length > 0
          ? Math.round((skillsVerified.length / allApplications.length) * 100)
          : 0,
        averageSkillsScore: Math.round(avgScore),
        statusBreakdown: statusCounts,
      };
    }

    return NextResponse.json({
      applications,
      stats,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext,
        hasPrev,
      },
    });
  } catch (error) {
    console.error("❌ [GET /api/applications] Applications fetch error:", error);
    console.error("❌ [GET /api/applications] Error details:", {
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
    }

    return NextResponse.json(
      {
        error: "Failed to fetch applications",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
