import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/assessments/[id]
 * Get detailed assessment result including all answers
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const assessment = await prisma.skillsAssessment.findUnique({
      where: { id },
      include: {
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
      },
    });

    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }

    // Get candidate's other assessments for comparison
    const otherAssessments = await prisma.skillsAssessment.findMany({
      where: {
        candidateId: assessment.candidateId,
        id: { not: id },
      },
      select: {
        id: true,
        score: true,
        tier: true,
        completedAt: true,
      },
      orderBy: { completedAt: "desc" },
      take: 5,
    });

    // Get percentile rank
    const lowerScoreCount = await prisma.skillsAssessment.count({
      where: { score: { lt: assessment.score } },
    });
    const totalCount = await prisma.skillsAssessment.count();
    const percentile = totalCount > 0 ? Math.round((lowerScoreCount / totalCount) * 100) : 0;

    return NextResponse.json({
      success: true,
      assessment: {
        id: assessment.id,
        score: assessment.score,
        tier: assessment.tier,
        duration: assessment.duration,
        durationFormatted: formatDuration(assessment.duration),
        completedAt: assessment.completedAt,
        answers: JSON.parse(assessment.answers),
        sectionScores: JSON.parse(assessment.sectionScores),
        percentile,
        candidate: {
          id: assessment.candidate.id,
          name: assessment.candidate.user.name,
          email: assessment.candidate.user.email,
          image: assessment.candidate.user.image,
          headline: assessment.candidate.headline,
          skills: assessment.candidate.skills,
        },
        previousAssessments: otherAssessments,
      },
    });
  } catch (error) {
    console.error("Get assessment detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch assessment" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/assessments/[id]
 * Delete an assessment (admin only)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const assessment = await prisma.skillsAssessment.findUnique({
      where: { id },
    });

    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }

    await prisma.skillsAssessment.delete({
      where: { id },
    });

    // Update candidate's test fields if this was their latest assessment
    const latestAssessment = await prisma.skillsAssessment.findFirst({
      where: { candidateId: assessment.candidateId },
      orderBy: { completedAt: "desc" },
    });

    if (latestAssessment) {
      await prisma.candidate.update({
        where: { id: assessment.candidateId },
        data: {
          testScore: latestAssessment.score,
          testTier: latestAssessment.tier,
          lastTestDate: latestAssessment.completedAt,
        },
      });
    } else {
      // No assessments left, reset candidate test fields
      await prisma.candidate.update({
        where: { id: assessment.candidateId },
        data: {
          hasTakenTest: false,
          testScore: null,
          testTier: null,
          lastTestDate: null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Assessment deleted successfully",
    });
  } catch (error) {
    console.error("Delete assessment error:", error);
    return NextResponse.json(
      { error: "Failed to delete assessment" },
      { status: 500 }
    );
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
