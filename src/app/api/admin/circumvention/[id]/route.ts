import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { FlagStatus, IntroductionStatus } from "@prisma/client";

/**
 * GET /api/admin/circumvention/[id]
 * Get full details for a specific circumvention flag
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

    const flag = await prisma.circumventionFlag.findUnique({
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
                contactName: true,
                contactEmail: true,
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
                salaryMin: true,
                salaryMax: true,
                description: true,
              },
            },
            checkIns: {
              orderBy: { checkInNumber: "asc" },
              select: {
                id: true,
                checkInNumber: true,
                scheduledFor: true,
                sentAt: true,
                respondedAt: true,
                responseType: true,
                responseParsed: true,
                riskLevel: true,
              },
            },
          },
        },
      },
    });

    if (!flag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    // Parse evidence
    let evidence: Record<string, unknown> = {};
    try {
      evidence = JSON.parse(flag.evidence);
    } catch {
      evidence = { raw: flag.evidence };
    }

    // Calculate protection expiry (1 year from introduction)
    const protectionExpiry = flag.introduction.introducedAt
      ? new Date(
          new Date(flag.introduction.introducedAt).getTime() +
            365 * 24 * 60 * 60 * 1000
        )
      : null;

    return NextResponse.json({
      success: true,
      flag: {
        id: flag.id,
        status: flag.status,
        detectedAt: flag.detectedAt,
        detectionMethod: flag.detectionMethod,
        evidence,
        estimatedSalary: flag.estimatedSalary?.toString() || null,
        estimatedFeeOwed: flag.estimatedFeeOwed?.toString() || null,
        feePercentage: flag.feePercentage?.toString() || null,
        resolvedAt: flag.resolvedAt,
        resolution: flag.resolution,
        resolutionNotes: flag.resolutionNotes,
        invoiceSentAt: flag.invoiceSentAt,
        invoiceAmount: flag.invoiceAmount?.toString() || null,
        invoicePaidAt: flag.invoicePaidAt,
        createdAt: flag.createdAt,
        updatedAt: flag.updatedAt,
        introduction: {
          id: flag.introduction.id,
          status: flag.introduction.status,
          requestedAt: flag.introduction.requestedAt,
          introducedAt: flag.introduction.introducedAt,
          protectionExpiry,
          checkIns: flag.introduction.checkIns,
        },
        candidate: {
          id: flag.introduction.candidate.user.id,
          name: flag.introduction.candidate.user.name,
          email: flag.introduction.candidate.user.email,
        },
        employer: {
          id: flag.introduction.employer.id,
          companyName: flag.introduction.employer.companyName,
          contactName: flag.introduction.employer.contactName,
          contactEmail:
            flag.introduction.employer.contactEmail ||
            flag.introduction.employer.user.email,
        },
        job: flag.introduction.job
          ? {
              id: flag.introduction.job.id,
              title: flag.introduction.job.title,
              salaryMin: flag.introduction.job.salaryMin?.toString() || null,
              salaryMax: flag.introduction.job.salaryMax?.toString() || null,
              description: flag.introduction.job.description,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[Admin Circumvention GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch circumvention flag" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/circumvention/[id]
 * Update a circumvention flag
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
      status,
      estimatedSalary,
      feePercentage,
      resolutionNotes,
      resolution,
    } = body;

    // Get current flag
    const currentFlag = await prisma.circumventionFlag.findUnique({
      where: { id },
    });

    if (!currentFlag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (status !== undefined) {
      updateData.status = status;

      // Set resolvedAt if moving to a resolved status
      const resolvedStatuses = [
        FlagStatus.PAID,
        FlagStatus.FALSE_POSITIVE,
        FlagStatus.WROTE_OFF,
      ];
      if (resolvedStatuses.includes(status) && !currentFlag.resolvedAt) {
        updateData.resolvedAt = new Date();
      }
    }

    if (estimatedSalary !== undefined) {
      updateData.estimatedSalary = estimatedSalary
        ? parseFloat(estimatedSalary)
        : null;
    }

    if (feePercentage !== undefined) {
      updateData.feePercentage = feePercentage
        ? parseFloat(feePercentage)
        : null;
    }

    // Recalculate estimated fee if salary or percentage changed
    const newSalary =
      updateData.estimatedSalary !== undefined
        ? updateData.estimatedSalary
        : currentFlag.estimatedSalary;
    const newPercentage =
      updateData.feePercentage !== undefined
        ? updateData.feePercentage
        : currentFlag.feePercentage;

    if (newSalary && newPercentage) {
      updateData.estimatedFeeOwed =
        (Number(newSalary) * Number(newPercentage)) / 100;
    }

    if (resolutionNotes !== undefined) {
      updateData.resolutionNotes = resolutionNotes;
    }

    if (resolution !== undefined) {
      updateData.resolution = resolution;
    }

    // Update flag
    const updatedFlag = await prisma.circumventionFlag.update({
      where: { id },
      data: updateData,
    });

    console.log(
      `[Admin Circumvention] Updated flag ${id}: ${JSON.stringify(updateData)}`
    );

    return NextResponse.json({
      success: true,
      flag: {
        id: updatedFlag.id,
        status: updatedFlag.status,
        estimatedSalary: updatedFlag.estimatedSalary?.toString() || null,
        estimatedFeeOwed: updatedFlag.estimatedFeeOwed?.toString() || null,
        feePercentage: updatedFlag.feePercentage?.toString() || null,
        resolvedAt: updatedFlag.resolvedAt,
        resolution: updatedFlag.resolution,
        resolutionNotes: updatedFlag.resolutionNotes,
      },
    });
  } catch (error) {
    console.error("[Admin Circumvention PATCH] Error:", error);
    return NextResponse.json(
      { error: "Failed to update circumvention flag" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/circumvention/[id]
 * Delete a circumvention flag (only if false positive)
 */
export async function DELETE(
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

    const flag = await prisma.circumventionFlag.findUnique({
      where: { id },
    });

    if (!flag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    // Only allow deletion of false positive flags
    if (flag.status !== FlagStatus.FALSE_POSITIVE) {
      return NextResponse.json(
        { error: "Only false positive flags can be deleted" },
        { status: 400 }
      );
    }

    await prisma.circumventionFlag.delete({
      where: { id },
    });

    console.log(`[Admin Circumvention] Deleted flag ${id}`);

    return NextResponse.json({
      success: true,
      message: "Flag deleted successfully",
    });
  } catch (error) {
    console.error("[Admin Circumvention DELETE] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete circumvention flag" },
      { status: 500 }
    );
  }
}
