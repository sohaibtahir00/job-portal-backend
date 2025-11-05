import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * POST /api/applications/[id]/notes
 * Add or update employer notes for an application
 * Requires EMPLOYER or ADMIN role
 * Employers can only add notes to applications for their jobs
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const { id } = params;

    // Get application
    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        job: {
          include: {
            employer: {
              select: {
                userId: true,
                companyName: true,
              },
            },
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Check permissions (unless admin)
    if (user.role !== UserRole.ADMIN && application.job.employer.userId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden. You can only add notes to applications for your jobs." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { notes } = body;

    // Validate notes
    if (!notes || typeof notes !== "string" || notes.trim().length === 0) {
      return NextResponse.json(
        { error: "Notes are required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Validate notes length
    if (notes.length > 5000) {
      return NextResponse.json(
        {
          error: "Notes are too long. Maximum 5000 characters.",
          length: notes.length,
        },
        { status: 400 }
      );
    }

    // Update application with notes
    const updatedApplication = await prisma.application.update({
      where: { id },
      data: {
        notes,
      },
      select: {
        id: true,
        notes: true,
        updatedAt: true,
        job: {
          select: {
            id: true,
            title: true,
          },
        },
        candidate: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      message: "Notes added successfully",
      application: updatedApplication,
    });
  } catch (error) {
    console.error("Application notes update error:", error);

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
      { error: "Failed to add notes" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/applications/[id]/notes
 * Get notes for an application
 * Requires EMPLOYER or ADMIN role
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const { id } = params;

    // Get application
    const application = await prisma.application.findUnique({
      where: { id },
      select: {
        id: true,
        notes: true,
        updatedAt: true,
        job: {
          select: {
            id: true,
            title: true,
            employer: {
              select: {
                userId: true,
                companyName: true,
              },
            },
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Check permissions (unless admin)
    if (user.role !== UserRole.ADMIN && application.job.employer.userId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden. You can only view notes for applications for your jobs." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      applicationId: application.id,
      notes: application.notes,
      updatedAt: application.updatedAt,
    });
  } catch (error) {
    console.error("Application notes fetch error:", error);

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
      { error: "Failed to fetch notes" },
      { status: 500 }
    );
  }
}
