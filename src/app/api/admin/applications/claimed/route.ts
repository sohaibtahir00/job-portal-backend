import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ClaimStatus, ApplicationStatus } from "@prisma/client";

/**
 * GET /api/admin/applications/claimed
 * Get all claimed applications for the admin pipeline view
 *
 * Query params:
 * - status: filter by application status
 * - claimStatus: filter by claim status (CLAIMED, CONVERTED, RELEASED)
 * - myOnly: if "true", only show applications claimed by current admin
 * - search: search by candidate name, job title, or company
 * - page: pagination
 * - limit: items per page
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const claimStatus = searchParams.get("claimStatus");
    const myOnly = searchParams.get("myOnly") === "true";
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      claimStatus: {
        not: ClaimStatus.UNCLAIMED,
      },
    };

    if (claimStatus) {
      where.claimStatus = claimStatus as ClaimStatus;
    }

    if (myOnly) {
      where.claimedBy = user.id;
    }

    if (status) {
      where.status = status as ApplicationStatus;
    }

    if (search) {
      where.OR = [
        { candidate: { user: { name: { contains: search, mode: "insensitive" } } } },
        { job: { title: { contains: search, mode: "insensitive" } } },
        { job: { company: { contains: search, mode: "insensitive" } } },
      ];
    }

    // Get claimed applications with full details
    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: {
          candidate: {
            include: {
              user: {
                select: { name: true, email: true, image: true },
              },
            },
          },
          job: {
            select: {
              id: true,
              title: true,
              company: true,
              location: true,
              type: true,
              salaryMin: true,
              salaryMax: true,
              employer: {
                select: {
                  companyName: true,
                },
              },
            },
          },
          interviews: {
            orderBy: { scheduledAt: "desc" },
            take: 1,
          },
          offer: {
            select: {
              id: true,
              status: true,
              salary: true,
              createdAt: true,
            },
          },
        },
        orderBy: [
          { claimStatus: "asc" }, // CLAIMED first
          { claimedAt: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.application.count({ where }),
    ]);

    // Group by status for pipeline view
    const statusGroups = {
      pending: applications.filter(a => a.status === ApplicationStatus.PENDING),
      reviewed: applications.filter(a => a.status === ApplicationStatus.REVIEWED),
      shortlisted: applications.filter(a => a.status === ApplicationStatus.SHORTLISTED),
      interviewScheduled: applications.filter(a => a.status === ApplicationStatus.INTERVIEW_SCHEDULED),
      interviewed: applications.filter(a => a.status === ApplicationStatus.INTERVIEWED),
      offered: applications.filter(a => a.status === ApplicationStatus.OFFERED),
      accepted: applications.filter(a => a.status === ApplicationStatus.ACCEPTED),
    };

    // Get summary stats
    const stats = await prisma.application.groupBy({
      by: ["claimStatus"],
      where: {
        claimStatus: { not: ClaimStatus.UNCLAIMED },
      },
      _count: true,
    });

    const summary = {
      claimed: stats.find(s => s.claimStatus === ClaimStatus.CLAIMED)?._count || 0,
      converted: stats.find(s => s.claimStatus === ClaimStatus.CONVERTED)?._count || 0,
      released: stats.find(s => s.claimStatus === ClaimStatus.RELEASED)?._count || 0,
      total,
    };

    // Format applications for response
    const formattedApplications = applications.map(app => ({
      id: app.id,
      status: app.status,
      claimStatus: app.claimStatus,
      claimedAt: app.claimedAt,
      claimedBy: app.claimedBy,
      claimNotes: app.claimNotes,
      appliedAt: app.appliedAt,
      candidate: {
        id: app.candidateId,
        name: app.candidate.user.name,
        email: app.candidate.user.email,
        image: app.candidate.user.image,
        title: app.candidate.title,
        location: app.candidate.location,
      },
      job: {
        id: app.job.id,
        title: app.job.title,
        company: app.job.company || app.job.employer?.companyName,
        location: app.job.location,
        type: app.job.type,
        salaryMin: app.job.salaryMin,
        salaryMax: app.job.salaryMax,
      },
      latestInterview: app.interviews[0] || null,
      offer: app.offer,
    }));

    return NextResponse.json({
      success: true,
      applications: formattedApplications,
      statusGroups: {
        pending: statusGroups.pending.length,
        reviewed: statusGroups.reviewed.length,
        shortlisted: statusGroups.shortlisted.length,
        interviewScheduled: statusGroups.interviewScheduled.length,
        interviewed: statusGroups.interviewed.length,
        offered: statusGroups.offered.length,
        accepted: statusGroups.accepted.length,
      },
      summary,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get claimed applications error:", error);
    return NextResponse.json(
      { error: "Failed to fetch claimed applications" },
      { status: 500 }
    );
  }
}
