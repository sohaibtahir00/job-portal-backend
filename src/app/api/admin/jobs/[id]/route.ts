import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * PATCH /api/admin/jobs/[id]
 * Update job details (admin only)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole("ADMIN");

    const { id } = params;
    const updates = await req.json();

    // Check if job exists
    const existingJob = await prisma.job.findUnique({
      where: { id },
    });

    if (!existingJob) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Update job
    const job = await prisma.job.update({
      where: { id },
      data: updates,
      include: {
        employer: {
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
    });

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (error: any) {
    console.error("Update job error:", error);
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to update job" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/jobs/[id]
 * Delete a job (admin only)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole("ADMIN");

    const { id } = params;

    // Check if job exists
    const existingJob = await prisma.job.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            applications: true,
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

    // Check if job has applications
    if (existingJob._count.applications > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete job with existing applications",
          applicationsCount: existingJob._count.applications,
        },
        { status: 400 }
      );
    }

    // Delete job
    await prisma.job.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Job deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete job error:", error);
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to delete job" },
      { status: 500 }
    );
  }
}
