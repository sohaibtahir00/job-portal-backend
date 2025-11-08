import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole, JobStatus } from "@prisma/client";

/**
 * POST /api/jobs/[id]/claim
 * Employer claims an aggregated job posting
 * This endpoint allows employers to claim job postings that were aggregated from external sources
 * and associate them with their employer profile
 *
 * Requires EMPLOYER role
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require employer role
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
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found. Please complete your profile first." },
        { status: 404 }
      );
    }

    const { id } = params;

    // Check if job exists
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        employer: {
          select: {
            id: true,
            userId: true,
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

    // Check if job is already claimed (using new isClaimed field)
    if (job.isClaimed || job.employer.userId !== null) {
      return NextResponse.json(
        {
          error: "Job is already claimed",
          claimedBy: job.employer.companyName,
          claimedAt: job.claimedAt,
        },
        { status: 400 }
      );
    }

    // Get claim form data from request body
    const body = await request.json();
    const {
      phone,
      roleLevel,
      salaryMin,
      salaryMax,
      startDateNeeded,
      candidatesNeeded,
    } = body;

    // Validate required fields
    if (!phone || !roleLevel) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          message: "Phone number and role level are required to claim this job.",
        },
        { status: 400 }
      );
    }

    // Transfer ownership of the job to the claiming employer
    const claimedJob = await prisma.job.update({
      where: { id },
      data: {
        employerId: employer.id,
        // Set claim tracking fields
        isClaimed: true,
        claimedAt: new Date(),
        claimedBy: employer.id,
        // Update job details from claim form
        experienceLevel: roleLevel,
        salaryMin: salaryMin ? parseInt(salaryMin) : job.salaryMin,
        salaryMax: salaryMax ? parseInt(salaryMax) : job.salaryMax,
        startDateNeeded: startDateNeeded ? new Date(startDateNeeded) : null,
        // Keep status as ACTIVE so candidates can continue applying
        status: JobStatus.ACTIVE,
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
        _count: {
          select: {
            applications: true,
          },
        },
      },
    });

    // Update employer's claim statistics
    await prisma.employer.update({
      where: { id: employer.id },
      data: {
        claimedJobsCount: { increment: 1 },
        lastClaimDate: new Date(),
      },
    });

    // Store claim metadata (phone, candidates needed) in a separate table or as JSON
    // For now, we'll return it in the response
    const claimMetadata = {
      phone,
      candidatesNeeded: candidatesNeeded || 10,
      claimedBy: employer.id,
      claimedAt: new Date(),
    };

    // Create a notification or audit log entry
    // In a production system, you'd want to track this action
    // TODO: Implement audit logging for job claims

    // Get skills-verified applicants count
    const applications = await prisma.application.findMany({
      where: { jobId: id },
      include: {
        candidate: {
          select: {
            hasTakenTest: true,
            testScore: true,
          },
        },
      },
    });

    const skillsVerifiedCount = applications.filter(
      (app) => app.candidate.hasTakenTest && app.candidate.testScore !== null
    ).length;

    return NextResponse.json({
      message: "Job claimed successfully! We'll call you within 24 hours to discuss qualified candidates.",
      job: claimedJob,
      claimMetadata,
      stats: {
        totalApplicants: claimedJob._count.applications,
        skillsVerifiedApplicants: skillsVerifiedCount,
      },
      nextSteps: [
        "Our team will call you within 24 hours",
        `We'll show you the top ${candidatesNeeded || 10} qualified candidates immediately`,
        "You'll see their Skills Score Cards and full profiles",
      ],
    });
  } catch (error) {
    console.error("Job claim error:", error);

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
      { error: "Failed to claim job" },
      { status: 500 }
    );
  }
}
