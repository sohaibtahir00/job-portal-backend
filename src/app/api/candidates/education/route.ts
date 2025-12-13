import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/candidates/education
 * Get all education entries for the current candidate
 */
export async function GET() {
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

    const educationEntries = await prisma.education.findMany({
      where: { candidateId: candidate.id },
      orderBy: { graduationYear: "desc" },
    });

    return NextResponse.json({ educationEntries });
  } catch (error) {
    console.error("Education fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch education entries" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/candidates/education
 * Create a new education entry
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { schoolName, degree, fieldOfStudy, graduationYear, gpa, description } = body;

    // Validation
    if (!schoolName || !degree || !fieldOfStudy || !graduationYear) {
      return NextResponse.json(
        {
          error:
            "School name, degree, field of study, and graduation year are required",
        },
        { status: 400 }
      );
    }

    const education = await prisma.education.create({
      data: {
        candidateId: candidate.id,
        schoolName,
        degree,
        fieldOfStudy,
        graduationYear: parseInt(graduationYear),
        gpa: gpa ? parseFloat(gpa) : null,
        description,
      },
    });

    return NextResponse.json(
      {
        message: "Education entry created successfully",
        education,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Education creation error:", error);
    return NextResponse.json(
      { error: "Failed to create education entry" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/candidates/education
 * Delete all education entries for the current candidate
 * Used when importing from resume to replace existing data
 */
export async function DELETE() {
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

    // Delete all education entries for this candidate
    const result = await prisma.education.deleteMany({
      where: { candidateId: candidate.id },
    });

    return NextResponse.json({
      message: "All education entries deleted successfully",
      count: result.count,
    });
  } catch (error) {
    console.error("Education deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete education entries" },
      { status: 500 }
    );
  }
}
