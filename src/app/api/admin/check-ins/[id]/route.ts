import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { RiskLevel } from "@prisma/client";

/**
 * GET /api/admin/check-ins/[id]
 * Get a specific check-in with full details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { id } = await params;

    const checkIn = await prisma.candidateCheckIn.findUnique({
      where: { id },
      include: {
        introduction: {
          include: {
            candidate: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
            employer: {
              select: {
                id: true,
                companyName: true,
                user: {
                  select: {
                    email: true,
                  },
                },
              },
            },
            job: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    if (!checkIn) {
      return NextResponse.json({ error: "Check-in not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      checkIn: {
        id: checkIn.id,
        checkInNumber: checkIn.checkInNumber,
        scheduledFor: checkIn.scheduledFor,
        sentAt: checkIn.sentAt,
        responseToken: checkIn.responseToken,
        responseTokenExpiry: checkIn.responseTokenExpiry,
        respondedAt: checkIn.respondedAt,
        responseType: checkIn.responseType,
        responseRaw: checkIn.responseRaw,
        responseParsed: checkIn.responseParsed,
        riskLevel: checkIn.riskLevel,
        riskReason: checkIn.riskReason,
        flaggedForReview: checkIn.flaggedForReview,
        reviewedAt: checkIn.reviewedAt,
        reviewedBy: checkIn.reviewedBy,
        reviewNotes: checkIn.reviewNotes,
        createdAt: checkIn.createdAt,
        updatedAt: checkIn.updatedAt,
        introduction: {
          id: checkIn.introduction.id,
          introducedAt: checkIn.introduction.introducedAt,
          status: checkIn.introduction.status,
        },
        candidate: {
          id: checkIn.introduction.candidate.user.id,
          name: checkIn.introduction.candidate.user.name,
          email: checkIn.introduction.candidate.user.email,
        },
        employer: {
          id: checkIn.introduction.employer.id,
          companyName: checkIn.introduction.employer.companyName,
          email: checkIn.introduction.employer.user.email,
        },
        job: checkIn.introduction.job
          ? {
              id: checkIn.introduction.job.id,
              title: checkIn.introduction.job.title,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[Admin Check-in GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch check-in" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/check-ins/[id]
 * Update a specific check-in
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { id } = await params;
    const body = await request.json();
    const {
      reviewNotes,
      markReviewed,
      flaggedForReview,
      riskLevel,
      responseType,
    } = body;

    // Check if check-in exists
    const existing = await prisma.candidateCheckIn.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Check-in not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (reviewNotes !== undefined) {
      updateData.reviewNotes = reviewNotes;
    }

    if (markReviewed) {
      updateData.reviewedAt = new Date();
      updateData.reviewedBy = authResult.id;
    }

    if (flaggedForReview !== undefined) {
      updateData.flaggedForReview = flaggedForReview;
    }

    if (riskLevel !== undefined) {
      updateData.riskLevel = riskLevel;
    }

    if (responseType !== undefined) {
      updateData.responseType = responseType;
      // If marking as no_response, set respondedAt
      if (responseType === "no_response" && !existing.respondedAt) {
        updateData.respondedAt = new Date();
        updateData.riskLevel = RiskLevel.LOW;
        updateData.riskReason = "Marked as no response by admin";
      }
    }

    const checkIn = await prisma.candidateCheckIn.update({
      where: { id },
      data: updateData,
      include: {
        introduction: {
          include: {
            candidate: {
              include: {
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            employer: {
              select: {
                companyName: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      checkIn: {
        id: checkIn.id,
        riskLevel: checkIn.riskLevel,
        flaggedForReview: checkIn.flaggedForReview,
        reviewedAt: checkIn.reviewedAt,
        reviewNotes: checkIn.reviewNotes,
        responseType: checkIn.responseType,
        candidateName: checkIn.introduction.candidate.user.name,
        employerCompanyName: checkIn.introduction.employer.companyName,
      },
    });
  } catch (error) {
    console.error("[Admin Check-in PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update check-in" },
      { status: 500 }
    );
  }
}
