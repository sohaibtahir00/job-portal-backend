import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * TEMPORARY DEBUG ENDPOINT
 * GET /api/debug/employer-jobs
 * Shows detailed employer and job data for debugging ownership issues
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    console.log("🔍 [DEBUG] Looking up employer for userId:", user.id);

    // Get employer with all jobs
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        jobs: {
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            employerId: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    console.log("📦 [DEBUG] Employer found:", employer ? "YES" : "NO");

    if (!employer) {
      // Try to find employer by email as fallback
      const employerByEmail = await prisma.employer.findFirst({
        where: {
          user: {
            email: user.email,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          },
          jobs: {
            select: {
              id: true,
              title: true,
              status: true,
              createdAt: true,
              employerId: true,
            },
          },
        },
      });

      console.log("📦 [DEBUG] Employer found by email:", employerByEmail ? "YES" : "NO");

      return NextResponse.json({
        message: "Employer profile not found by userId",
        searchedUserId: user.id,
        currentUser: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        employerByEmail: employerByEmail ? {
          id: employerByEmail.id,
          userId: employerByEmail.userId,
          companyName: employerByEmail.companyName,
          user: employerByEmail.user,
          jobCount: employerByEmail.jobs.length,
          jobs: employerByEmail.jobs,
        } : null,
        issue: "User exists but no employer profile linked to this userId",
        possibleFix: employerByEmail ? "Update employer.userId to match current user.id" : "Create employer profile for this user",
      }, { status: 404 });
    }

    // Check if requested jobId exists
    const { searchParams } = new URL(request.url);
    const testJobId = searchParams.get("testJobId");
    let jobCheck = null;

    if (testJobId) {
      const job = await prisma.job.findUnique({
        where: { id: testJobId },
        include: {
          employer: {
            select: {
              id: true,
              userId: true,
              companyName: true,
            },
          },
        },
      });

      jobCheck = {
        jobExists: !!job,
        jobData: job ? {
          id: job.id,
          title: job.title,
          employerId: job.employerId,
          employer: job.employer,
        } : null,
        ownershipCheck: {
          requestedJobId: testJobId,
          currentEmployerId: employer.id,
          jobBelongsToEmployer: job?.employerId === employer.id,
          jobEmployerUserId: job?.employer.userId,
          currentUserId: user.id,
          userIdMatch: job?.employer.userId === user.id,
        },
      };
    }

    return NextResponse.json({
      message: "Employer debug data",
      currentUser: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      employer: {
        id: employer.id,
        userId: employer.userId,
        companyName: employer.companyName,
        jobCount: employer.jobs.length,
      },
      userIdMatch: employer.userId === user.id,
      jobs: employer.jobs,
      jobIds: employer.jobs.map(j => j.id),
      jobCheck,
    });
  } catch (error) {
    console.error("[DEBUG] Error:", error);
    return NextResponse.json(
      {
        error: "Debug endpoint failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
