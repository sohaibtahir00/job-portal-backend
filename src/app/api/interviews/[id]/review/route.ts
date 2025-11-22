import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST - Create or update review
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!employer) {
      return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    }

    const interviewId = params.id;
    const body = await req.json();

    const {
      overallRating,
      technicalSkills,
      communication,
      cultureFit,
      problemSolving,
      notes,
    } = body;

    // Verify interview belongs to this employer
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: { application: { include: { job: true } } },
    });

    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    if (interview.application.job.employerId !== employer.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Upsert review (create or update)
    const review = await prisma.interviewReview.upsert({
      where: { interviewId },
      create: {
        interviewId,
        employerId: employer.id,
        overallRating,
        technicalSkills,
        communication,
        cultureFit,
        problemSolving,
        notes,
      },
      update: {
        overallRating,
        technicalSkills,
        communication,
        cultureFit,
        problemSolving,
        notes,
      },
    });

    return NextResponse.json({ success: true, review });
  } catch (error) {
    console.error("Error saving interview review:", error);
    return NextResponse.json(
      { error: "Failed to save review" },
      { status: 500 }
    );
  }
}

// GET - Fetch existing review
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!employer) {
      return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    }

    const interviewId = params.id;

    // Verify interview belongs to this employer
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        application: { include: { job: true } },
        review: true,
      },
    });

    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    if (interview.application.job.employerId !== employer.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ review: interview.review || null });
  } catch (error) {
    console.error("Error fetching interview review:", error);
    return NextResponse.json(
      { error: "Failed to fetch review" },
      { status: 500 }
    );
  }
}
