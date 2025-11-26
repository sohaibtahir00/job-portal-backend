import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/employer/candidates/[id]
 * Get detailed candidate profile for employers
 *
 * This endpoint allows employers to view full candidate details
 * including their applications to the employer's jobs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('🔍 [EMPLOYER/CANDIDATES] GET request received');

  try {
    const { id: candidateId } = await params;
    console.log('🔍 [EMPLOYER/CANDIDATES] Candidate ID:', candidateId);

    // Get current user
    let user = null;
    try {
      user = await getCurrentUser();
      console.log('🔍 [EMPLOYER/CANDIDATES] Current user:', user ? { id: user.id, role: user.role } : 'Not authenticated');
    } catch (error) {
      console.log('⚠️ [EMPLOYER/CANDIDATES] No user session');
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Only employers can view this endpoint
    if (user.role !== UserRole.EMPLOYER) {
      return NextResponse.json(
        { error: "Only employers can view candidate details" },
        { status: 403 }
      );
    }

    // Get employer profile
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        companyName: true,
      },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    console.log('✅ [EMPLOYER/CANDIDATES] Employer:', employer.companyName);

    // Fetch candidate with full details
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        workExperiences: {
          orderBy: {
            startDate: "desc",
          },
        },
        educationEntries: {
          orderBy: {
            graduationYear: "desc",
          },
        },
        // Get applications only for this employer's jobs
        applications: {
          where: {
            job: {
              employerId: employer.id,
            },
          },
          include: {
            job: {
              select: {
                id: true,
                title: true,
                location: true,
                type: true,
                status: true,
              },
            },
            interviews: {
              orderBy: {
                scheduledAt: "desc",
              },
              select: {
                id: true,
                status: true,
                scheduledAt: true,
                duration: true,
                roundNumber: true,
                roundName: true,
              },
            },
          },
          orderBy: {
            appliedAt: "desc",
          },
        },
      },
    });

    if (!candidate) {
      console.log('❌ [EMPLOYER/CANDIDATES] Candidate not found:', candidateId);
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    console.log('✅ [EMPLOYER/CANDIDATES] Candidate found:', candidate.user?.name);
    console.log('📦 [EMPLOYER/CANDIDATES] Applications count:', candidate.applications.length);

    // Record profile view
    try {
      await prisma.profileView.create({
        data: {
          candidateId: candidate.id,
          employerId: employer.id,
          source: "search",
        },
      });
      console.log('✅ [EMPLOYER/CANDIDATES] Profile view recorded');
    } catch (viewErr) {
      // Don't block if profile view fails
      console.error('⚠️ [EMPLOYER/CANDIDATES] Failed to record profile view:', viewErr);
    }

    return NextResponse.json({
      candidate,
      employer: {
        id: employer.id,
        companyName: employer.companyName,
      },
    });
  } catch (error) {
    console.error('[EMPLOYER/CANDIDATES] Error:', error);
    return NextResponse.json(
      {
        error: "Failed to fetch candidate",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
