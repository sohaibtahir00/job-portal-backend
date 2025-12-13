import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/candidates/work-experience
 * Get all work experiences for the current candidate
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

    const workExperiences = await prisma.workExperience.findMany({
      where: { candidateId: candidate.id },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json({ workExperiences });
  } catch (error) {
    console.error("Work experience fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch work experiences" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/candidates/work-experience
 * Create a new work experience entry
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
    const {
      companyName,
      jobTitle,
      startDate,
      endDate,
      isCurrent,
      description,
      location,
    } = body;

    // Validation
    if (!companyName || !jobTitle || !startDate) {
      return NextResponse.json(
        { error: "Company name, job title, and start date are required" },
        { status: 400 }
      );
    }

    const workExperience = await prisma.workExperience.create({
      data: {
        candidateId: candidate.id,
        companyName,
        jobTitle,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        isCurrent: isCurrent || false,
        description,
        location,
      },
    });

    return NextResponse.json(
      {
        message: "Work experience created successfully",
        workExperience,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Work experience creation error:", error);
    return NextResponse.json(
      { error: "Failed to create work experience" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/candidates/work-experience
 * Delete all work experience entries for the current candidate
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

    // Delete all work experiences for this candidate
    const result = await prisma.workExperience.deleteMany({
      where: { candidateId: candidate.id },
    });

    return NextResponse.json({
      message: "All work experiences deleted successfully",
      count: result.count,
    });
  } catch (error) {
    console.error("Work experience deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete work experiences" },
      { status: 500 }
    );
  }
}
