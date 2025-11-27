import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { JobStatus, PlacementStatus, ApplicationStatus } from "@prisma/client";

/**
 * GET /api/companies/[slug]
 * Get single company details with stats and active jobs
 * Public route - no authentication required
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    if (!slug) {
      return NextResponse.json(
        { error: "Company slug is required" },
        { status: 400 }
      );
    }

    // Find company by slug or id
    const employer = await prisma.employer.findFirst({
      where: {
        OR: [{ slug: slug }, { id: slug }],
      },
      select: {
        id: true,
        slug: true,
        companyName: true,
        companyLogo: true,
        companyWebsite: true,
        industry: true,
        companySize: true,
        location: true,
        description: true,
        verified: true,
        createdAt: true,
      },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Get active jobs count
    const activeJobsCount = await prisma.job.count({
      where: {
        employerId: employer.id,
        status: JobStatus.ACTIVE,
      },
    });

    // Get total hires (completed/active placements)
    const totalHires = await prisma.placement.count({
      where: {
        employerId: employer.id,
        status: { in: [PlacementStatus.COMPLETED, PlacementStatus.ACTIVE, PlacementStatus.CONFIRMED] },
      },
    });

    // Calculate average time to hire (from application to placement)
    const placements = await prisma.placement.findMany({
      where: {
        employerId: employer.id,
        status: { in: [PlacementStatus.COMPLETED, PlacementStatus.ACTIVE, PlacementStatus.CONFIRMED] },
      },
      select: {
        startDate: true,
        createdAt: true,
      },
    });

    let avgTimeToHire = 0;
    if (placements.length > 0) {
      // Estimate time to hire based on placement creation to start date
      const times = placements.map((p) => {
        const created = new Date(p.createdAt);
        const started = new Date(p.startDate);
        return Math.floor((started.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      }).filter(t => t > 0 && t < 365); // Filter out unrealistic values

      if (times.length > 0) {
        avgTimeToHire = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      }
    }

    // Calculate response rate (applications with response vs total)
    const totalApplications = await prisma.application.count({
      where: {
        job: {
          employerId: employer.id,
        },
      },
    });

    const respondedApplications = await prisma.application.count({
      where: {
        job: {
          employerId: employer.id,
        },
        status: {
          not: ApplicationStatus.PENDING,
        },
      },
    });

    const responseRate = totalApplications > 0
      ? Math.round((respondedApplications / totalApplications) * 100)
      : 0;

    // Get active jobs (limit to 5 for display)
    const activeJobs = await prisma.job.findMany({
      where: {
        employerId: employer.id,
        status: JobStatus.ACTIVE,
      },
      select: {
        id: true,
        title: true,
        location: true,
        salaryMin: true,
        salaryMax: true,
        nicheCategory: true,
        remote: true,
        type: true,
        experienceLevel: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    });

    return NextResponse.json({
      company: {
        id: employer.id,
        slug: employer.slug,
        companyName: employer.companyName,
        companyLogo: employer.companyLogo,
        companyWebsite: employer.companyWebsite,
        industry: employer.industry,
        companySize: employer.companySize,
        location: employer.location,
        description: employer.description,
        verified: employer.verified,
        createdAt: employer.createdAt,
      },
      stats: {
        activeJobs: activeJobsCount,
        totalHires,
        avgTimeToHire: avgTimeToHire || 21, // Default to 21 days if no data
        responseRate: responseRate || 85, // Default to 85% if no data
      },
      activeJobs: activeJobs.map((job) => ({
        id: job.id,
        title: job.title,
        location: job.location,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        nicheCategory: job.nicheCategory,
        remote: job.remote,
        type: job.type,
        experienceLevel: job.experienceLevel,
        postedAt: job.createdAt,
      })),
    });
  } catch (error) {
    console.error("Company details error:", error);
    return NextResponse.json(
      { error: "Failed to fetch company details" },
      { status: 500 }
    );
  }
}
