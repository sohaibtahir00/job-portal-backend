import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ApprovalStatus } from "@prisma/client";

/**
 * POST /api/admin/employers/[id]/approve
 * Approve an employer registration
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
    const body = await req.json().catch(() => ({}));
    const { notes } = body;

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

    if (employer.approvalStatus === ApprovalStatus.APPROVED) {
      return NextResponse.json(
        { error: "Employer is already approved" },
        { status: 400 }
      );
    }

    // Update employer approval status
    const updatedEmployer = await prisma.employer.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: user.id,
        rejectionReason: null, // Clear any previous rejection reason
        rejectedAt: null,
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
        type: "EMPLOYER_APPROVED",
        title: "Account Approved",
        message: `Your employer account for ${employer.companyName} has been approved. You can now post jobs and start hiring!`,
        data: {
          employerId: employer.id,
          approvedBy: user.id,
          notes,
        },
      },
    });

    // TODO: Send approval email notification
    // await sendApprovalEmail(employer.user.email, employer.companyName);

    return NextResponse.json({
      success: true,
      message: "Employer approved successfully",
      employer: {
        id: updatedEmployer.id,
        companyName: updatedEmployer.companyName,
        approvalStatus: updatedEmployer.approvalStatus,
        approvedAt: updatedEmployer.approvedAt,
        user: updatedEmployer.user,
      },
    });
  } catch (error) {
    console.error("Approve employer error:", error);
    return NextResponse.json(
      { error: "Failed to approve employer" },
      { status: 500 }
    );
  }
}
