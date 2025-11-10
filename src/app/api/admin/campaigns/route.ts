import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/admin/campaigns
 * Get all marketing campaigns (admin only)
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    const [campaigns, totalCount] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.campaign.count({ where }),
    ]);

    return NextResponse.json({
      campaigns,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    console.error("Get campaigns error:", error);
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/campaigns
 * Create a new campaign (admin only)
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole("ADMIN");

    const {
      name,
      description,
      type,
      startDate,
      endDate,
      budget,
      targetAudience,
      status,
    } = await req.json();

    if (!name || !type || !startDate) {
      return NextResponse.json(
        { error: "Name, type, and start date are required" },
        { status: 400 }
      );
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        description: description || "",
        type,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        budget: budget || 0,
        spent: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        targetAudience: targetAudience || {},
        status: status || "DRAFT",
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error: any) {
    console.error("Create campaign error:", error);
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}
