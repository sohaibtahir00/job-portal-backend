import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole, JobStatus, JobType, ExperienceLevel } from "@prisma/client";

/**
 * GET /api/jobs
 * List all active jobs with filters and pagination
 * Public route - no authentication required
 * If authenticated as candidate, includes applied/saved status and match score
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    // Filters
    const location = searchParams.get("location");
    const remote = searchParams.get("remote");
    const type = searchParams.get("type") as JobType | null;
    const experienceLevel = searchParams.get("experienceLevel") as ExperienceLevel | null;
    const search = searchParams.get("search"); // Search in title or description
    const employerId = searchParams.get("employerId");
    const status = searchParams.get("status") as JobStatus | null;
    const exclusiveOnly = searchParams.get("exclusiveOnly") === "true"; // Filter for exclusive jobs only

    // Build where clause
    const where: any = {};

    // Default to only show ACTIVE jobs for public listings
    // Unless status is explicitly provided (for employer's own job listings)
    if (status) {
      where.status = status;
    } else if (!employerId) {
      where.status = JobStatus.ACTIVE;
    }

    if (location) {
      where.location = {
        contains: location,
        mode: "insensitive",
      };
    }

    if (remote !== null) {
      where.remote = remote === "true";
    }

    if (type && Object.values(JobType).includes(type)) {
      where.type = type;
    }

    if (experienceLevel && Object.values(ExperienceLevel).includes(experienceLevel)) {
      where.experienceLevel = experienceLevel;
    }

    if (employerId) {
      where.employerId = employerId;
    }

    // Search in title, description, or requirements
    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          requirements: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    // Filter for exclusive jobs only (isClaimed = true)
    if (exclusiveOnly) {
      where.isClaimed = true;
    }

    // Check if user is authenticated as candidate
    let candidate = null;
    try {
      const user = await getCurrentUser();
      if (user) {
        candidate = await prisma.candidate.findUnique({
          where: { userId: user.id },
          select: {
            id: true,
            skills: true,
            preferredJobType: true,
            location: true,
            experienceLevel: true,
            hasTakenTest: true,
          },
        });
      }
    } catch {
      // User not authenticated or not a candidate, continue as public
    }

    // Get total count for pagination
    const totalCount = await prisma.job.count({ where });

    // Fetch jobs with employer details
    const jobs = await prisma.job.findMany({
      where,
      include: {
        employer: {
          select: {
            id: true,
            companyName: true,
            companyLogo: true,
            companyWebsite: true,
            location: true,
            industry: true,
            verified: true,
          },
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    // If authenticated as candidate, add applied/saved status and match score
    let enhancedJobs = jobs;
    if (candidate) {
      const jobIds = jobs.map(j => j.id);

      // Get applications for these jobs
      const applications = await prisma.application.findMany({
        where: {
          candidateId: candidate.id,
          jobId: { in: jobIds },
        },
        select: {
          jobId: true,
          status: true,
          appliedAt: true,
        },
      });
      const applicationMap = new Map(applications.map(a => [a.jobId, a]));

      // Get saved jobs
      const savedJobs = await prisma.savedJob.findMany({
        where: {
          candidateId: candidate.id,
          jobId: { in: jobIds },
        },
        select: {
          jobId: true,
          savedAt: true,
        },
      });
      const savedJobsSet = new Set(savedJobs.map(sj => sj.jobId));

      // Calculate match score for each job
      enhancedJobs = jobs.map((job: any) => {
        const application = applicationMap.get(job.id);
        const isSaved = savedJobsSet.has(job.id);

        // Calculate match score (0-100)
        let matchScore = 0;
        let matchFactors = [];

        // Skills match (40 points)
        if (candidate.skills && candidate.skills.length > 0 && job.skills && job.skills.length > 0) {
          const candidateSkills = candidate.skills.map((s: string) => s.toLowerCase());
          const jobSkills = job.skills.map((s: string) => s.toLowerCase());
          const matchingSkills = candidateSkills.filter((s: string) => jobSkills.some((js: string) => js.includes(s) || s.includes(js)));
          const skillMatchPercentage = matchingSkills.length / jobSkills.length;
          const skillPoints = Math.round(skillMatchPercentage * 40);
          matchScore += skillPoints;
          if (skillPoints > 20) matchFactors.push(`${matchingSkills.length} matching skills`);
        }

        // Job type match (20 points)
        if (candidate.preferredJobType && candidate.preferredJobType === job.type) {
          matchScore += 20;
          matchFactors.push('Preferred job type');
        }

        // Location match (20 points)
        if (candidate.location && job.location) {
          const candidateLoc = candidate.location.toLowerCase();
          const jobLoc = job.location.toLowerCase();
          if (jobLoc.includes(candidateLoc) || candidateLoc.includes(jobLoc)) {
            matchScore += 20;
            matchFactors.push('Location match');
          }
        }

        // Remote preference (10 points)
        if (job.remote) {
          matchScore += 10;
          matchFactors.push('Remote position');
        }

        // Skills assessment bonus (10 points)
        if (candidate.hasTakenTest && job.isClaimed) {
          matchScore += 10;
          matchFactors.push('Exclusive access');
        }

        return {
          ...job,
          // Candidate-specific fields
          hasApplied: !!application,
          isSaved,
          applicationStatus: application?.status || null,
          appliedAt: application?.appliedAt || null,
          matchScore: Math.min(matchScore, 100),
          matchFactors,
        };
      });
    }

    return NextResponse.json({
      jobs: enhancedJobs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext,
        hasPrev,
      },
      candidateInfo: candidate ? {
        hasCompletedAssessment: candidate.hasTakenTest,
      } : null,
    });
  } catch (error) {
    console.error("Jobs listing error:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/jobs
 * Create a new job posting
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

    // Get employer profile
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found. Please complete your profile first." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      title,
      description,
      requirements,
      responsibilities,
      type,
      location,
      remote = false,
      salaryMin,
      salaryMax,
      experienceLevel,
      skills = [],
      niceToHaveSkills = [],
      techStack = [],
      benefits,
      deadline,
      slots = 1,
      // New comprehensive fields
      nicheCategory,
      remoteType,
      keyResponsibilities = [],
      equityOffered = false,
      specificBenefits = [],
      // Skills Assessment (CRITICAL)
      requiresAssessment = false,
      minSkillsScore,
      requiredTier,
      customAssessmentQuestions,
      // Interview Process
      interviewRounds,
      interviewProcess,
      hiringTimeline,
      startDateNeeded,
      // Application Settings
      maxApplicants,
      screeningQuestions,
    } = body;

    // Validate required fields
    if (!title || !description || !requirements || !responsibilities || !type || !location || !experienceLevel) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          required: ["title", "description", "requirements", "responsibilities", "type", "location", "experienceLevel"]
        },
        { status: 400 }
      );
    }

    // Validate job type
    if (!Object.values(JobType).includes(type)) {
      return NextResponse.json(
        { error: "Invalid job type", validTypes: Object.values(JobType) },
        { status: 400 }
      );
    }

    // Validate experience level
    if (!Object.values(ExperienceLevel).includes(experienceLevel)) {
      return NextResponse.json(
        { error: "Invalid experience level", validLevels: Object.values(ExperienceLevel) },
        { status: 400 }
      );
    }

    // Validate salary range
    if (salaryMin && salaryMax && salaryMin > salaryMax) {
      return NextResponse.json(
        { error: "Minimum salary cannot be greater than maximum salary" },
        { status: 400 }
      );
    }

    // Validate deadline is in the future
    if (deadline && new Date(deadline) < new Date()) {
      return NextResponse.json(
        { error: "Deadline must be in the future" },
        { status: 400 }
      );
    }

    // Create the job - starts as DRAFT
    const job = await prisma.job.create({
      data: {
        employerId: employer.id,
        title,
        description,
        requirements,
        responsibilities,
        type,
        location,
        remote,
        salaryMin,
        salaryMax,
        experienceLevel,
        skills,
        niceToHaveSkills,
        techStack,
        benefits,
        deadline: deadline ? new Date(deadline) : null,
        slots,
        // New comprehensive fields
        nicheCategory,
        remoteType,
        keyResponsibilities,
        equityOffered,
        specificBenefits,
        // Skills Assessment
        requiresAssessment,
        minSkillsScore,
        requiredTier,
        customAssessmentQuestions,
        // Interview Process
        interviewRounds,
        interviewProcess,
        hiringTimeline,
        startDateNeeded: startDateNeeded ? new Date(startDateNeeded) : null,
        // Application Settings
        maxApplicants,
        screeningQuestions,
        status: JobStatus.DRAFT, // Always starts as DRAFT
      },
      include: {
        employer: {
          select: {
            id: true,
            companyName: true,
            companyLogo: true,
            verified: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: "Job created successfully as DRAFT. You can publish it later.",
        job,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Job creation error:", error);

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
      { error: "Failed to create job" },
      { status: 500 }
    );
  }
}
