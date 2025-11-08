import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * PATCH /api/candidates/work-experience/[id]
 * Update a work experience entry
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(UserRole.CANDIDATE);
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    const existingEntry = await prisma.workExperience.findUnique({
      where: { id: params.id },
    });

    if (!existingEntry || existingEntry.candidateId !== candidate.id) {
      return NextResponse.json(
        { error: "Work experience not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      companyName,
      jobTitle,
      startDate,
      endDate,
      isCurrent,
      description,
      location,
    } = body;

    const updateData: any = {};
    if (companyName !== undefined) updateData.companyName = companyName;
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined)
      updateData.endDate = endDate ? new Date(endDate) : null;
    if (isCurrent !== undefined) updateData.isCurrent = isCurrent;
    if (description !== undefined) updateData.description = description;
    if (location !== undefined) updateData.location = location;

    const workExperience = await prisma.workExperience.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({
      message: "Work experience updated successfully",
      workExperience,
    });
  } catch (error) {
    console.error("Work experience update error:", error);
    return NextResponse.json(
      { error: "Failed to update work experience" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/candidates/work-experience/[id]
 * Delete a work experience entry
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(UserRole.CANDIDATE);
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    const existingEntry = await prisma.workExperience.findUnique({
      where: { id: params.id },
    });

    if (!existingEntry || existingEntry.candidateId !== candidate.id) {
      return NextResponse.json(
        { error: "Work experience not found" },
        { status: 404 }
      );
    }

    await prisma.workExperience.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      message: "Work experience deleted successfully",
    });
  } catch (error) {
    console.error("Work experience deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete work experience" },
      { status: 500 }
    );
  }
}
