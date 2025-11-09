import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST /api/assessments - Submit assessment results
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { answers, duration, sectionScores } = await req.json();

    // Calculate overall score
    const totalScore = Math.round(
      sectionScores.reduce((sum: number, section: any) => sum + section.score, 0) /
        sectionScores.length
    );

    // Determine tier
    let tier = "Beginner";
    if (totalScore >= 90) tier = "Elite";
    else if (totalScore >= 80) tier = "Advanced";
    else if (totalScore >= 70) tier = "Proficient";
    else if (totalScore >= 60) tier = "Intermediate";

    // Save assessment result
    const assessment = await prisma.skillsAssessment.create({
      data: {
        candidateId: session.user.id,
        score: totalScore,
        tier,
        answers: JSON.stringify(answers),
        duration,
        sectionScores: JSON.stringify(sectionScores),
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      assessment: {
        id: assessment.id,
        score: totalScore,
        tier,
        sectionScores,
      },
    });
  } catch (error) {
    console.error("Assessment submission error:", error);
    return NextResponse.json(
      { error: "Failed to submit assessment" },
      { status: 500 }
    );
  }
}

// GET /api/assessments - Get user's assessment history
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const assessments = await prisma.skillsAssessment.findMany({
      where: { candidateId: session.user.id },
      orderBy: { completedAt: "desc" },
    });

    return NextResponse.json({ assessments });
  } catch (error) {
    console.error("Get assessments error:", error);
    return NextResponse.json(
      { error: "Failed to fetch assessments" },
      { status: 500 }
    );
  }
}
