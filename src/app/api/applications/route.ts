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
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    // Filters
    const status = searchParams.get("status") as ApplicationStatus | null;
    const jobId = searchParams.get("jobId");

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

      const jobIds = employer.jobs.map(job => job.id);
      where.jobId = { in: jobIds };
    }
    // Admins see all applications (no additional filter)

    // Apply status filter if provided
    if (status && Object.values(ApplicationStatus).includes(status)) {
      where.status = status;
    }

    // Apply job filter if provided
    if (jobId) {
      where.jobId = jobId;
    }

    // Get total count
    const totalCount = await prisma.application.count({ where });

    // Fetch applications
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
            user: {
              select: {
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        testResults: {
          select: {
            id: true,
            testName: true,
            score: true,
            maxScore: true,
            status: true,
          },
        },
      },
      orderBy: {
        appliedAt: "desc",
      },
      skip,
      take: limit,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return NextResponse.json({
      applications,
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
    console.error("Applications fetch error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to fetch applications" },
      { status: 500 }
    );
  }
}
