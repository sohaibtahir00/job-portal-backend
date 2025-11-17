import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole, JobStatus, JobType, ExperienceLevel } from "@prisma/client";

/**
 * GET /api/jobs/[id]
 * Get a single job with full details and employer information
 * Public route - no authentication required
 * If authenticated as candidate, includes applied/saved status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        employer: {
          select: {
            id: true,
            companyName: true,
            companyLogo: true,
            companyWebsite: true,
            companySize: true,
            industry: true,
            description: true,
            location: true,
            verified: true,
          },
        },
        _count: {
          select: {
            applications: true,
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

    // Increment view count
    await prisma.job.update({
      where: { id },
      data: {
        views: {
          increment: 1,
        },
      },
    });

    // Check if user is authenticated as candidate
    let candidateInfo = null;
    try {
      const user = await getCurrentUser();
      if (user) {
        const candidate = await prisma.candidate.findUnique({
          where: { userId: user.id },
          select: {
            id: true,
            phone: true,
            resume: true,
            bio: true,
            skills: true,
          },
        });

        if (candidate) {
          // Check if candidate has applied
          const application = await prisma.application.findFirst({
            where: {
              jobId: id,
              candidateId: candidate.id,
            },
            select: {
              id: true,
              status: true,
              appliedAt: true,
              coverLetter: true,
            },
          });

          // Check if candidate has saved this job
          const savedJob = await prisma.savedJob.findUnique({
            where: {
              candidateId_jobId: {
                candidateId: candidate.id,
                jobId: id,
              },
            },
            select: {
              savedAt: true,
            },
          });

          // Check profile completion
          const profileComplete = !!(
            candidate.phone &&
            candidate.resume &&
            candidate.bio &&
            candidate.skills &&
            candidate.skills.length > 0
          );

          candidateInfo = {
            hasApplied: !!application,
            isSaved: !!savedJob,
            application: application || null,
            profileComplete,
          };
        }
      }
    } catch {
      // User not authenticated or not a candidate, continue as public
    }

    return NextResponse.json({
      job,
      candidateInfo,
    });
  } catch (error) {
    console.error("Job fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch job" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/jobs/[id]
 * Update an existing job
 * Requires EMPLOYER or ADMIN role
 * Employers can only update their own jobs
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Check if job exists
    const existingJob = await prisma.job.findUnique({
      where: { id },
      include: {
        employer: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!existingJob) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check ownership (unless admin)
    if (user.role !== UserRole.ADMIN && existingJob.employer.userId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden. You can only update your own jobs." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      title,
      description,
      requirements,
      responsibilities,
      type,
      status,
      location,
      remote,
      salaryMin,
      salaryMax,
      experienceLevel,
      skills,
      niceToHaveSkills,
      techStack,
      benefits,
      deadline,
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
      startDateNeeded,
      // Application Settings
      maxApplicants,
      screeningQuestions,
    } = body;

    // Validate job type if provided
    if (type && !Object.values(JobType).includes(type)) {
      return NextResponse.json(
        { error: "Invalid job type", validTypes: Object.values(JobType) },
        { status: 400 }
      );
    }

    // Validate experience level if provided
    if (experienceLevel && !Object.values(ExperienceLevel).includes(experienceLevel)) {
      return NextResponse.json(
        { error: "Invalid experience level", validLevels: Object.values(ExperienceLevel) },
        { status: 400 }
      );
    }

    // Validate job status if provided
    if (status && !Object.values(JobStatus).includes(status)) {
      return NextResponse.json(
        { error: "Invalid job status", validStatuses: Object.values(JobStatus) },
        { status: 400 }
      );
    }

    // Validate salary range if both are provided
    if (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) {
      return NextResponse.json(
        { error: "Minimum salary cannot be greater than maximum salary" },
        { status: 400 }
      );
    }

    // Validate deadline if provided
    if (deadline && new Date(deadline) < new Date()) {
      return NextResponse.json(
        { error: "Deadline must be in the future" },
        { status: 400 }
      );
    }

    // Build update data object (only include provided fields)
    const updateData: any = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (requirements !== undefined) updateData.requirements = requirements;
    if (responsibilities !== undefined) updateData.responsibilities = responsibilities;
    if (type !== undefined) updateData.type = type;
    if (status !== undefined) updateData.status = status;
    if (location !== undefined) updateData.location = location;
    if (remote !== undefined) updateData.remote = remote;
    if (salaryMin !== undefined) updateData.salaryMin = salaryMin;
    if (salaryMax !== undefined) updateData.salaryMax = salaryMax;
    if (experienceLevel !== undefined) updateData.experienceLevel = experienceLevel;
    if (skills !== undefined) updateData.skills = skills;
    if (niceToHaveSkills !== undefined) updateData.niceToHaveSkills = niceToHaveSkills;
    if (techStack !== undefined) updateData.techStack = techStack;
    if (benefits !== undefined) updateData.benefits = benefits;
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (slots !== undefined) updateData.slots = slots;

    // New comprehensive fields
    if (nicheCategory !== undefined) updateData.nicheCategory = nicheCategory;
    if (remoteType !== undefined) updateData.remoteType = remoteType;
    if (keyResponsibilities !== undefined) updateData.keyResponsibilities = keyResponsibilities;
    if (equityOffered !== undefined) updateData.equityOffered = equityOffered;
    if (specificBenefits !== undefined) updateData.specificBenefits = specificBenefits;

    // Skills Assessment
    if (requiresAssessment !== undefined) updateData.requiresAssessment = requiresAssessment;
    if (minSkillsScore !== undefined) updateData.minSkillsScore = minSkillsScore;
    if (requiredTier !== undefined) updateData.requiredTier = requiredTier;
    if (customAssessmentQuestions !== undefined) updateData.customAssessmentQuestions = customAssessmentQuestions;

    // Interview Process
    if (interviewRounds !== undefined) updateData.interviewRounds = interviewRounds;
    if (interviewProcess !== undefined) updateData.interviewProcess = interviewProcess;
    if (hiringTimeline !== undefined) updateData.hiringTimeline = hiringTimeline;
    if (startDateNeeded !== undefined) updateData.startDateNeeded = startDateNeeded ? new Date(startDateNeeded) : null;

    // Application Settings
    if (maxApplicants !== undefined) updateData.maxApplicants = maxApplicants;
    if (screeningQuestions !== undefined) updateData.screeningQuestions = screeningQuestions;

    // Update the job
    const updatedJob = await prisma.job.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({
      message: "Job updated successfully",
      job: updatedJob,
    });
  } catch (error) {
    console.error("Job update error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to update job" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs/[id]
 * Soft delete a job (set status to CLOSED)
 * Requires EMPLOYER or ADMIN role
 * Employers can only delete their own jobs
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Check if job exists
    const existingJob = await prisma.job.findUnique({
      where: { id },
      include: {
        employer: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!existingJob) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check ownership (unless admin)
    if (user.role !== UserRole.ADMIN && existingJob.employer.userId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden. You can only delete your own jobs." },
        { status: 403 }
      );
    }

    // Check if there are any active applications
    const applicationCount = await prisma.application.count({
      where: {
        jobId: id,
        status: {
          in: ["PENDING", "REVIEWED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEWED"],
        },
      },
    });

    if (applicationCount > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete job with active applications. Please close it instead.",
          activeApplications: applicationCount,
        },
        { status: 400 }
      );
    }

    // Soft delete - set status to CLOSED instead of actually deleting
    const deletedJob = await prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.CLOSED,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    return NextResponse.json({
      message: "Job closed successfully",
      job: deletedJob,
    });
  } catch (error) {
    console.error("Job deletion error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to delete job" },
      { status: 500 }
    );
  }
}
