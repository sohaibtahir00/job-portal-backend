import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole, IntroductionStatus } from "@prisma/client";
import {
  getEmployerAccessLevel,
  CandidateAccessLevel,
  IntroductionStatusInfo,
} from "@/lib/candidate-access";

// Protection period duration in months
const PROTECTION_PERIOD_MONTHS = 12;

/**
 * GET /api/employer/candidates/[id]
 * Get detailed candidate profile for employers with access level gating
 *
 * ACCESS LEVELS:
 * - NO_AGREEMENT: Returns 403 - employer must sign service agreement first
 * - AGREEMENT_SIGNED: Full profile visible EXCEPT contact info (email, phone, linkedIn, github, portfolio, resume)
 * - FULL_ACCESS: Complete profile including all contact information
 *
 * This endpoint allows employers to view candidate details
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

    // Check access level for this employer
    const accessInfo = await getEmployerAccessLevel(employer.id, candidateId);
    const accessLevel = accessInfo.accessLevel;
    const introductionStatus = accessInfo.introductionStatus;
    const introductionId = accessInfo.introductionId;
    const protectionEndsAt = accessInfo.protectionEndsAt;

    console.log('🔒 [EMPLOYER/CANDIDATES] Access level:', accessLevel, 'Intro status:', introductionStatus);

    // If no agreement signed, return 403
    if (accessLevel === "NO_AGREEMENT") {
      return NextResponse.json(
        {
          error: "Please sign the service agreement to view candidate profiles",
          _accessLevel: "NO_AGREEMENT",
          _requiresAgreement: true,
        },
        { status: 403 }
      );
    }

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

    // Log profile view (create or update introduction record)
    await logProfileView(employer.id, candidateId);

    // Determine if contact info should be visible
    const canViewContactInfo = accessLevel === "FULL_ACCESS";

    // Build response with gating
    const response: any = {
      candidate: {
        id: candidate.id,
        userId: candidate.userId,
        // User info - full name is visible since agreement is signed
        user: {
          id: candidate.user.id,
          name: candidate.user.name,
          // Email is gated
          email: canViewContactInfo ? candidate.user.email : null,
          image: candidate.user.image,
        },
        // Profile info - all visible
        bio: candidate.bio,
        photo: candidate.photo,
        location: candidate.location,
        currentRole: candidate.currentRole,
        experience: candidate.experience,
        skills: candidate.skills,
        availability: candidate.availability,
        preferredJobType: candidate.preferredJobType,
        expectedSalary: candidate.expectedSalary,
        // Test info - visible
        hasTakenTest: candidate.hasTakenTest,
        testScore: candidate.testScore,
        testPercentile: candidate.testPercentile,
        testTier: candidate.testTier,
        lastTestDate: candidate.lastTestDate,
        // Contact info - gated
        phone: canViewContactInfo ? candidate.phone : null,
        linkedIn: canViewContactInfo ? candidate.linkedIn : null,
        github: canViewContactInfo ? candidate.github : null,
        portfolio: canViewContactInfo ? candidate.portfolio : null,
        personalWebsite: canViewContactInfo ? candidate.personalWebsite : null,
        resume: canViewContactInfo ? candidate.resume : null,
        // Work and education - visible
        workExperiences: candidate.workExperiences,
        educationEntries: candidate.educationEntries,
        // Applications to employer's jobs - visible
        applications: candidate.applications,
        // Timestamps
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
        // Access level metadata
        _accessLevel: accessLevel,
        _introductionStatus: introductionStatus,
        _introductionId: introductionId,
        _protectionEndsAt: protectionEndsAt,
        _contactGated: !canViewContactInfo,
      },
      employer: {
        id: employer.id,
        companyName: employer.companyName,
      },
    };

    // Get full introduction details if exists
    if (introductionId) {
      const intro = await prisma.candidateIntroduction.findUnique({
        where: { id: introductionId },
        select: {
          introRequestedAt: true,
          candidateResponse: true,
          candidateRespondedAt: true,
          introducedAt: true,
        },
      });
      if (intro) {
        response.candidate._introRequestedAt = intro.introRequestedAt;
        response.candidate._candidateResponse = intro.candidateResponse;
        response.candidate._candidateRespondedAt = intro.candidateRespondedAt;
        response.candidate._introducedAt = intro.introducedAt;
      }
    }

    console.log('✅ [EMPLOYER/CANDIDATES] Returning profile with access level:', accessLevel);

    return NextResponse.json(response);
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

/**
 * Log a profile view (internal function)
 * Creates or updates the CandidateIntroduction record
 */
async function logProfileView(employerId: string, candidateId: string): Promise<void> {
  try {
    const now = new Date();
    const protectionEndDate = new Date(now);
    protectionEndDate.setMonth(protectionEndDate.getMonth() + PROTECTION_PERIOD_MONTHS);

    // Check if introduction already exists
    const existingIntro = await prisma.candidateIntroduction.findUnique({
      where: {
        employerId_candidateId: {
          employerId,
          candidateId,
        },
      },
    });

    if (existingIntro) {
      // Update existing record - increment view count
      await prisma.candidateIntroduction.update({
        where: { id: existingIntro.id },
        data: {
          profileViews: { increment: 1 },
        },
      });
      console.log('📊 [EMPLOYER/CANDIDATES] Updated profile view count');
    } else {
      // Create new introduction record
      await prisma.candidateIntroduction.create({
        data: {
          employerId,
          candidateId,
          profileViewedAt: now,
          protectionStartsAt: now,
          protectionEndsAt: protectionEndDate,
          profileViews: 1,
          status: IntroductionStatus.PROFILE_VIEWED,
        },
      });
      console.log('📊 [EMPLOYER/CANDIDATES] Created new introduction record');
    }
  } catch (error) {
    // Log error but don't fail the request
    console.error('❌ [EMPLOYER/CANDIDATES] Error logging profile view:', error);
  }
}
