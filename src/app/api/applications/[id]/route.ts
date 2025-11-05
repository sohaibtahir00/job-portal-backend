import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/applications/[id]
 * Get detailed information about a specific application
 * Access control:
 * - Candidates can view their own applications
 * - Employers can view applications for their jobs
 * - Admins can view all applications
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAnyRole([UserRole.CANDIDATE, UserRole.EMPLOYER, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const { id } = params;

    // Fetch application with full details
    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        job: {
          include: {
            employer: {
              select: {
                id: true,
                userId: true,
                companyName: true,
                companyLogo: true,
                companyWebsite: true,
                companySize: true,
                industry: true,
                location: true,
                verified: true,
              },
            },
          },
        },
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        testResults: {
          orderBy: {
            completedAt: "desc",
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

    // Check access permissions
    if (user.role === UserRole.CANDIDATE) {
      // Candidates can only view their own applications
      const candidate = await prisma.candidate.findUnique({
        where: { userId: user.id },
      });

      if (!candidate || application.candidateId !== candidate.id) {
        return NextResponse.json(
          { error: "Forbidden. You can only view your own applications." },
          { status: 403 }
        );
      }
    } else if (user.role === UserRole.EMPLOYER) {
      // Employers can only view applications for their jobs
      if (application.job.employer.userId !== user.id) {
        return NextResponse.json(
          { error: "Forbidden. You can only view applications for your jobs." },
          { status: 403 }
        );
      }
    }
    // Admins can view all applications (no additional check)

    return NextResponse.json({ application });
  } catch (error) {
    console.error("Application fetch error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to fetch application" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/applications/[id]
 * Withdraw an application
 * Only candidates can withdraw their own applications
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAnyRole([UserRole.CANDIDATE, UserRole.ADMIN]);

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
        candidate: {
          select: {
            userId: true,
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

    // Check ownership (unless admin)
    if (user.role !== UserRole.ADMIN && application.candidate.userId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden. You can only withdraw your own applications." },
        { status: 403 }
      );
    }

    // Don't allow withdrawal if already accepted or rejected
    if (["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(application.status)) {
      return NextResponse.json(
        {
          error: `Cannot withdraw application with status: ${application.status}`,
          status: application.status,
        },
        { status: 400 }
      );
    }

    // Update status to WITHDRAWN instead of deleting
    const updatedApplication = await prisma.application.update({
      where: { id },
      data: {
        status: "WITHDRAWN",
      },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: "Application withdrawn successfully",
      application: updatedApplication,
    });
  } catch (error) {
    console.error("Application withdrawal error:", error);

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
      { error: "Failed to withdraw application" },
      { status: 500 }
    );
  }
}
