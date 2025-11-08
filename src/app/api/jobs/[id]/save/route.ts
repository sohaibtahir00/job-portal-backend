import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * POST /api/jobs/[id]/save
 * Save a job for later (bookmark)
 *
 * Requires CANDIDATE role
 *
 * Request body (optional):
 * {
 *   "notes": "string" (optional notes about why saving this job)
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require candidate role
    await requireRole(UserRole.CANDIDATE);

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
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    const jobId = params.id;

    // Verify job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Parse request body for optional notes
    let notes: string | undefined;
    try {
      const body = await request.json();
      notes = body.notes;
    } catch {
      // Body is optional, ignore parsing errors
    }

    // Check if already saved
    const existingSave = await prisma.savedJob.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: candidate.id,
          jobId,
        },
      },
    });

    if (existingSave) {
      return NextResponse.json(
        {
          message: "Job already saved",
          savedJob: existingSave,
        },
        { status: 200 }
      );
    }

    // Create saved job
    const savedJob = await prisma.savedJob.create({
      data: {
        candidateId: candidate.id,
        jobId,
        notes,
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            description: true,
            location: true,
            type: true,
            salaryMin: true,
            salaryMax: true,
            employer: {
              select: {
                companyName: true,
                companyLogo: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: "Job saved successfully",
        savedJob,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Save job error:", error);

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
      {
        error: "Failed to save job",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs/[id]/save
 * Unsave a job (remove bookmark)
 *
 * Requires CANDIDATE role
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require candidate role
    await requireRole(UserRole.CANDIDATE);

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
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    const jobId = params.id;

    // Check if saved
    const savedJob = await prisma.savedJob.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: candidate.id,
          jobId,
        },
      },
    });

    if (!savedJob) {
      return NextResponse.json(
        { error: "Job is not saved" },
        { status: 404 }
      );
    }

    // Delete saved job
    await prisma.savedJob.delete({
      where: {
        id: savedJob.id,
      },
    });

    return NextResponse.json(
      {
        message: "Job unsaved successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Unsave job error:", error);

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
      {
        error: "Failed to unsave job",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
