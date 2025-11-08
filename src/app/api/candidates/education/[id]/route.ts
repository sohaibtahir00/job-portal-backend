import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * PATCH /api/candidates/education/[id]
 * Update an education entry
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
    const existingEntry = await prisma.education.findUnique({
      where: { id: params.id },
    });

    if (!existingEntry || existingEntry.candidateId !== candidate.id) {
      return NextResponse.json(
        { error: "Education entry not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { schoolName, degree, fieldOfStudy, graduationYear, gpa, description } = body;

    const updateData: any = {};
    if (schoolName !== undefined) updateData.schoolName = schoolName;
    if (degree !== undefined) updateData.degree = degree;
    if (fieldOfStudy !== undefined) updateData.fieldOfStudy = fieldOfStudy;
    if (graduationYear !== undefined)
      updateData.graduationYear = parseInt(graduationYear);
    if (gpa !== undefined) updateData.gpa = gpa ? parseFloat(gpa) : null;
    if (description !== undefined) updateData.description = description;

    const education = await prisma.education.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({
      message: "Education entry updated successfully",
      education,
    });
  } catch (error) {
    console.error("Education update error:", error);
    return NextResponse.json(
      { error: "Failed to update education entry" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/candidates/education/[id]
 * Delete an education entry
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
    const existingEntry = await prisma.education.findUnique({
      where: { id: params.id },
    });

    if (!existingEntry || existingEntry.candidateId !== candidate.id) {
      return NextResponse.json(
        { error: "Education entry not found" },
        { status: 404 }
      );
    }

    await prisma.education.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      message: "Education entry deleted successfully",
    });
  } catch (error) {
    console.error("Education deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete education entry" },
      { status: 500 }
    );
  }
}
