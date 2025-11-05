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

    // Check if job is already claimed
    if (job.employer.userId !== null) {
      return NextResponse.json(
        {
          error: "Job is already claimed",
          claimedBy: job.employer.companyName,
        },
        { status: 400 }
      );
    }

    // Verify the employer claiming the job matches company details
    // This is a security measure to ensure employers only claim their own company's jobs
    const body = await request.json();
    const { verificationCode } = body;

    // In a real implementation, you might want to:
    // 1. Send a verification email to the company domain
    // 2. Require the employer to provide proof of employment
    // 3. Use a verification code or token system
    // For now, we'll use a simple verification code system

    if (!verificationCode) {
      return NextResponse.json(
        {
          error: "Verification code required",
          message: "Please provide a verification code to claim this job. Contact support if you need assistance.",
        },
        { status: 400 }
      );
    }

    // In production, you would validate the verification code here
    // For this example, we'll accept any non-empty code
    // TODO: Implement proper verification code validation

    // Transfer ownership of the job to the claiming employer
    const claimedJob = await prisma.job.update({
      where: { id },
      data: {
        employerId: employer.id,
        // Optionally reset status to DRAFT so employer can review before publishing
        status: JobStatus.DRAFT,
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

    // Create a notification or audit log entry
    // In a production system, you'd want to track this action
    // TODO: Implement audit logging for job claims

    return NextResponse.json({
      message: "Job claimed successfully. Please review and publish when ready.",
      job: claimedJob,
      notice: "The job status has been set to DRAFT. You can update it and set to ACTIVE when ready.",
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
