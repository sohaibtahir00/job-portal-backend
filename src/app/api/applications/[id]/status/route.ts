import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole, ApplicationStatus, NotificationType } from "@prisma/client";
import { sendApplicationStatusUpdateEmail } from "@/lib/email";

/**
 * PATCH /api/applications/[id]/status
 * Update application status
 * Requires EMPLOYER or ADMIN role
 * Employers can only update applications for their jobs
 */
export async function PATCH(
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
              },
            },
          },
        },
        candidate: {
          select: {
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

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Check permissions (unless admin)
    if (user.role !== UserRole.ADMIN && application.job.employer.userId !== user.id) {
      console.error("Authorization failed:", {
        userRole: user.role,
        userId: user.id,
        employerUserId: application.job.employer.userId,
        applicationId: id,
        jobId: application.job.id,
      });
      return NextResponse.json(
        {
          error: "Forbidden. You can only update applications for your jobs.",
          debug: {
            yourUserId: user.id,
            requiredUserId: application.job.employer.userId,
          }
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status, rejectionReason } = body;

    // Validate status
    if (!status || !Object.values(ApplicationStatus).includes(status)) {
      return NextResponse.json(
        {
          error: "Invalid status",
          validStatuses: Object.values(ApplicationStatus),
        },
        { status: 400 }
      );
    }

    // Validate status transitions
    const validTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
      PENDING: ["REVIEWED", "SHORTLISTED", "REJECTED"],
      REVIEWED: ["SHORTLISTED", "REJECTED"],
      SHORTLISTED: ["INTERVIEW_SCHEDULED", "REJECTED"],
      INTERVIEW_SCHEDULED: ["INTERVIEWED", "REJECTED"],
      INTERVIEWED: ["OFFERED", "REJECTED"],
      OFFERED: ["ACCEPTED", "REJECTED"],
      REJECTED: [], // Cannot change from rejected
      WITHDRAWN: [], // Cannot change from withdrawn
      ACCEPTED: [], // Cannot change from accepted
    };

    const allowedTransitions = validTransitions[application.status as ApplicationStatus] || [];

    if (!allowedTransitions.includes(status)) {
      return NextResponse.json(
        {
          error: `Cannot transition from ${application.status} to ${status}`,
          currentStatus: application.status,
          allowedTransitions,
        },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {
      status,
      reviewedAt: status === "REVIEWED" ? new Date() : application.reviewedAt,
    };

    // If rejecting, store rejection details
    if (status === "REJECTED") {
      updateData.rejectionReason = rejectionReason || null;
      updateData.rejectedBy = user.id;
      updateData.rejectedAt = new Date();
    }

    // Update application status
    const updatedApplication = await prisma.application.update({
      where: { id },
      data: updateData,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            employer: {
              select: {
                companyName: true,
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

    // Send notification email to candidate about status change
    await sendApplicationStatusUpdateEmail({
      email: updatedApplication.candidate.user.email,
      candidateName: updatedApplication.candidate.user.name,
      jobTitle: updatedApplication.job.title,
      companyName: updatedApplication.job.employer.companyName,
      status: status,
      applicationId: updatedApplication.id,
      message: status === "REJECTED" && rejectionReason ? rejectionReason : undefined,
    });

    // Get candidate userId for notification
    const candidateRecord = await prisma.candidate.findUnique({
      where: { id: updatedApplication.candidate.id },
      select: { userId: true },
    });

    // Create in-app notification for candidate
    if (candidateRecord) {
      const statusLabels: Record<string, string> = {
        REVIEWED: "Your application is being reviewed",
        SHORTLISTED: "You've been shortlisted",
        INTERVIEW_SCHEDULED: "Interview scheduled",
        INTERVIEWED: "Interview completed",
        OFFERED: "You've received an offer",
        REJECTED: "Application update",
      };

      await prisma.notification.create({
        data: {
          userId: candidateRecord.userId,
          type: NotificationType.APPLICATION_UPDATE,
          title: statusLabels[status] || "Application Update",
          message: `Your application for ${updatedApplication.job.title} at ${updatedApplication.job.employer.companyName} has been updated to: ${status.replace(/_/g, " ").toLowerCase()}`,
          link: `/candidate/applications`,
        },
      });
    }

    return NextResponse.json({
      message: `Application status updated to ${status}`,
      application: updatedApplication,
    });
  } catch (error) {
    console.error("Application status update error:", error);

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
      { error: "Failed to update application status" },
      { status: 500 }
    );
  }
}
