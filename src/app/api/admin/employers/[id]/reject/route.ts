import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ApprovalStatus } from "@prisma/client";

/**
 * POST /api/admin/employers/[id]/reject
 * Reject an employer registration
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { reason } = body;

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: "Rejection reason is required" },
        { status: 400 }
      );
    }

    // Find the employer
    const employer = await prisma.employer.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true, name: true },
        },
      },
    });

    if (!employer) {
      return NextResponse.json({ error: "Employer not found" }, { status: 404 });
    }

    if (employer.approvalStatus === ApprovalStatus.REJECTED) {
      return NextResponse.json(
        { error: "Employer is already rejected" },
        { status: 400 }
      );
    }

    // Update employer approval status
    const updatedEmployer = await prisma.employer.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        rejectionReason: reason,
        rejectedAt: new Date(),
        approvedAt: null, // Clear any previous approval
        approvedBy: null,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    // Create notification for the employer
    await prisma.notification.create({
      data: {
        userId: employer.userId,
        type: "EMPLOYER_REJECTED",
        title: "Account Application Update",
        message: `Your employer account application for ${employer.companyName} was not approved. Reason: ${reason}`,
        data: {
          employerId: employer.id,
          rejectedBy: user.id,
          reason,
        },
      },
    });

    // TODO: Send rejection email notification
    // await sendRejectionEmail(employer.user.email, employer.companyName, reason);

    return NextResponse.json({
      success: true,
      message: "Employer rejected successfully",
      employer: {
        id: updatedEmployer.id,
        companyName: updatedEmployer.companyName,
        approvalStatus: updatedEmployer.approvalStatus,
        rejectionReason: updatedEmployer.rejectionReason,
        rejectedAt: updatedEmployer.rejectedAt,
        user: updatedEmployer.user,
      },
    });
  } catch (error) {
    console.error("Reject employer error:", error);
    return NextResponse.json(
      { error: "Failed to reject employer" },
      { status: 500 }
    );
  }
}
