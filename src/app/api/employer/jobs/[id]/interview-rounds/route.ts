import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/employer/jobs/[id]/interview-rounds
 * Get all interview rounds for a specific job
 * Requires EMPLOYER or ADMIN role
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { id: jobId } = await params;

    // Verify job belongs to employer
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { employerId: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check if user owns this job (unless admin)
    if (user.role !== UserRole.ADMIN) {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });

      if (!employer || employer.id !== job.employerId) {
        return NextResponse.json(
          { error: "You don't have permission to access this job" },
          { status: 403 }
        );
      }
    }

    // Fetch interview rounds
    const rounds = await prisma.interviewRound.findMany({
      where: { jobId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ rounds });
  } catch (error) {
    console.error("Fetch interview rounds error:", error);

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
      { error: "Failed to fetch interview rounds" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/employer/jobs/[id]/interview-rounds
 * Create or replace all interview rounds for a job
 * Requires EMPLOYER or ADMIN role
 *
 * Body: { rounds: Array<{ name, description?, duration, order }> }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { id: jobId } = await params;
    const body = await request.json();
    const { rounds } = body;

    // Validate input
    if (!Array.isArray(rounds)) {
      return NextResponse.json(
        { error: "Rounds must be an array" },
        { status: 400 }
      );
    }

    // Verify job belongs to employer
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { employerId: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check if user owns this job (unless admin)
    if (user.role !== UserRole.ADMIN) {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });

      if (!employer || employer.id !== job.employerId) {
        return NextResponse.json(
          { error: "You don't have permission to modify this job" },
          { status: 403 }
        );
      }
    }

    // Delete existing rounds and create new ones in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete all existing rounds for this job
      await tx.interviewRound.deleteMany({
        where: { jobId },
      });

      // Create new rounds
      const createdRounds = await Promise.all(
        rounds.map((round: any) =>
          tx.interviewRound.create({
            data: {
              jobId,
              name: round.name,
              description: round.description || null,
              duration: round.duration,
              order: round.order,
            },
          })
        )
      );

      return createdRounds;
    });

    return NextResponse.json({
      message: "Interview rounds updated successfully",
      rounds: result,
    });
  } catch (error) {
    console.error("Create interview rounds error:", error);

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
      { error: "Failed to create interview rounds" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/employer/jobs/[id]/interview-rounds
 * Delete all interview rounds for a job
 * Requires EMPLOYER or ADMIN role
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { id: jobId } = await params;

    // Verify job belongs to employer
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { employerId: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check if user owns this job (unless admin)
    if (user.role !== UserRole.ADMIN) {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });

      if (!employer || employer.id !== job.employerId) {
        return NextResponse.json(
          { error: "You don't have permission to modify this job" },
          { status: 403 }
        );
      }
    }

    // Delete all rounds
    await prisma.interviewRound.deleteMany({
      where: { jobId },
    });

    return NextResponse.json({
      message: "Interview rounds deleted successfully",
    });
  } catch (error) {
    console.error("Delete interview rounds error:", error);

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
      { error: "Failed to delete interview rounds" },
      { status: 500 }
    );
  }
}
