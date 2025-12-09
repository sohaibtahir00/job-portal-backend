import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole, IntroductionStatus } from "@prisma/client";

// Protection period duration in months
const PROTECTION_PERIOD_MONTHS = 12;

/**
 * Helper function to check if employer has signed service agreement
 */
async function checkServiceAgreement(employerId: string): Promise<boolean> {
  const agreement = await prisma.serviceAgreement.findUnique({
    where: { employerId },
  });
  return !!agreement;
}

/**
 * GET /api/employer/introductions
 * List all introductions for current employer
 * Query params: status?, page?, limit?
 */
export async function GET(request: NextRequest) {
  console.log('👥 [INTRODUCTIONS] GET list request received');

  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (user.role !== UserRole.EMPLOYER) {
      return NextResponse.json(
        { error: "Employer role required" },
        { status: 403 }
      );
    }

    // Find employer record
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    // Check service agreement
    const hasSigned = await checkServiceAgreement(employer.id);
    if (!hasSigned) {
      return NextResponse.json(
        { error: "Service agreement must be signed to access introductions" },
        { status: 403 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") as IntroductionStatus | null;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      employerId: employer.id,
    };

    if (statusFilter && Object.values(IntroductionStatus).includes(statusFilter)) {
      where.status = statusFilter;
    }

    // Fetch introductions with candidate info
    const [introductions, totalCount] = await Promise.all([
      prisma.candidateIntroduction.findMany({
        where,
        include: {
          candidate: {
            include: {
              user: {
                select: {
                  name: true,
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
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.candidateIntroduction.count({ where }),
    ]);

    // Format response
    const formattedIntroductions = introductions.map((intro) => ({
      id: intro.id,
      candidateId: intro.candidateId,
      candidateName: intro.candidate.user.name,
      candidateEmail: intro.candidate.user.email,
      candidateCurrentRole: intro.candidate.currentRole,
      candidateLocation: intro.candidate.location,
      job: intro.job ? { id: intro.job.id, title: intro.job.title } : null,
      status: intro.status,
      profileViewedAt: intro.profileViewedAt,
      introRequestedAt: intro.introRequestedAt,
      candidateRespondedAt: intro.candidateRespondedAt,
      candidateResponse: intro.candidateResponse,
      introducedAt: intro.introducedAt,
      protectionStartsAt: intro.protectionStartsAt,
      protectionEndsAt: intro.protectionEndsAt,
      profileViews: intro.profileViews,
      resumeDownloads: intro.resumeDownloads,
      createdAt: intro.createdAt,
      updatedAt: intro.updatedAt,
    }));

    console.log('✅ [INTRODUCTIONS] Returning', formattedIntroductions.length, 'introductions');

    return NextResponse.json({
      introductions: formattedIntroductions,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });

  } catch (error) {
    console.error('❌ [INTRODUCTIONS] Error:', error);
    return NextResponse.json(
      { error: "Failed to fetch introductions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/employer/introductions
 * Log a profile view (log-view endpoint)
 * Request body: { candidateId: string, jobId?: string }
 */
export async function POST(request: NextRequest) {
  console.log('👁️ [INTRODUCTIONS] POST log-view request received');

  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (user.role !== UserRole.EMPLOYER) {
      return NextResponse.json(
        { error: "Employer role required" },
        { status: 403 }
      );
    }

    // Find employer record
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    // Check service agreement
    const hasSigned = await checkServiceAgreement(employer.id);
    if (!hasSigned) {
      return NextResponse.json(
        { error: "Service agreement must be signed to view candidate profiles" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { candidateId, jobId } = body;

    if (!candidateId || typeof candidateId !== 'string') {
      return NextResponse.json(
        { error: "Candidate ID is required" },
        { status: 400 }
      );
    }

    // Verify candidate exists
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Verify job exists if provided
    if (jobId) {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
      });
      if (!job) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }
    }

    const now = new Date();
    const protectionEndDate = new Date(now);
    protectionEndDate.setMonth(protectionEndDate.getMonth() + PROTECTION_PERIOD_MONTHS);

    // Check if introduction already exists
    const existingIntro = await prisma.candidateIntroduction.findUnique({
      where: {
        employerId_candidateId: {
          employerId: employer.id,
          candidateId,
        },
      },
    });

    let introduction;
    let isNewIntroduction = false;

    if (existingIntro) {
      // Update existing record - increment view count
      introduction = await prisma.candidateIntroduction.update({
        where: { id: existingIntro.id },
        data: {
          profileViews: { increment: 1 },
          // Update jobId if provided and not already set
          ...(jobId && !existingIntro.jobId ? { jobId } : {}),
        },
      });
      console.log('✅ [INTRODUCTIONS] Updated existing introduction, views:', introduction.profileViews);
    } else {
      // Create new introduction record
      introduction = await prisma.candidateIntroduction.create({
        data: {
          employerId: employer.id,
          candidateId,
          jobId: jobId || null,
          profileViewedAt: now,
          protectionStartsAt: now,
          protectionEndsAt: protectionEndDate,
          profileViews: 1,
          status: IntroductionStatus.PROFILE_VIEWED,
        },
      });
      isNewIntroduction = true;
      console.log('✅ [INTRODUCTIONS] Created new introduction for candidate:', candidateId);
    }

    return NextResponse.json({
      introductionId: introduction.id,
      isNewIntroduction,
      protectionEndsAt: introduction.protectionEndsAt,
    });

  } catch (error) {
    console.error('❌ [INTRODUCTIONS] Error:', error);
    return NextResponse.json(
      { error: "Failed to log profile view" },
      { status: 500 }
    );
  }
}
