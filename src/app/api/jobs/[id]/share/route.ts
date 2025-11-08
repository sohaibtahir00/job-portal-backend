import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/jobs/[id]/share
 * Track job share event (analytics)
 *
 * Public endpoint (no authentication required)
 * Tracks when users share jobs on social media or other platforms
 *
 * Request body:
 * {
 *   "platform": "string" (e.g., "linkedin", "twitter", "email", "copy_link")
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;

    // Verify job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { platform } = body;

    // Validate platform
    if (!platform || typeof platform !== "string") {
      return NextResponse.json(
        { error: "Platform is required" },
        { status: 400 }
      );
    }

    // Get user ID if authenticated
    let userId: string | null = null;
    try {
      const user = await getCurrentUser();
      userId = user?.id || null;
    } catch {
      // User not authenticated, continue with anonymous share
    }

    // Get IP address from request headers
    const forwarded = request.headers.get("x-forwarded-for");
    const ipAddress = forwarded
      ? forwarded.split(",")[0].trim()
      : request.headers.get("x-real-ip") || null;

    // Create share tracking record
    const jobShare = await prisma.jobShare.create({
      data: {
        jobId,
        platform: platform.toLowerCase(),
        sharedBy: userId,
        ipAddress,
      },
    });

    return NextResponse.json(
      {
        message: "Job share tracked successfully",
        share: {
          id: jobShare.id,
          jobId: jobShare.jobId,
          platform: jobShare.platform,
          sharedAt: jobShare.sharedAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Job share tracking error:", error);

    return NextResponse.json(
      {
        error: "Failed to track job share",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/jobs/[id]/share
 * Get share statistics for a job
 *
 * Public endpoint (no authentication required)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;

    // Verify job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get total share count
    const totalShares = await prisma.jobShare.count({
      where: { jobId },
    });

    // Get shares by platform
    const sharesByPlatform = await prisma.jobShare.groupBy({
      by: ["platform"],
      where: { jobId },
      _count: {
        platform: true,
      },
      orderBy: {
        _count: {
          platform: "desc",
        },
      },
    });

    // Get recent shares (last 10)
    const recentShares = await prisma.jobShare.findMany({
      where: { jobId },
      orderBy: { sharedAt: "desc" },
      take: 10,
      select: {
        id: true,
        platform: true,
        sharedAt: true,
      },
    });

    return NextResponse.json({
      jobId,
      jobTitle: job.title,
      totalShares,
      sharesByPlatform: sharesByPlatform.map((item) => ({
        platform: item.platform,
        count: item._count.platform,
      })),
      recentShares,
    });
  } catch (error) {
    console.error("Get job share stats error:", error);

    return NextResponse.json(
      {
        error: "Failed to get job share statistics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
