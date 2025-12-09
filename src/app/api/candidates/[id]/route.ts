import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole, IntroductionStatus } from "@prisma/client";
import {
  getEmployerAccessLevel,
  getGatedName,
  CandidateAccessLevel,
  IntroductionStatusInfo,
} from "@/lib/candidate-access";

// Protection period duration in months
const PROTECTION_PERIOD_MONTHS = 12;

/**
 * GET /api/candidates/[id]
 * Get candidate profile with access level-based gating
 *
 * ACCESS LEVELS:
 * - NO_AGREEMENT: Returns 403 - employer must sign service agreement first
 * - AGREEMENT_SIGNED: Full profile visible EXCEPT contact info (email, phone, linkedIn, github, portfolio, resume)
 * - FULL_ACCESS: Complete profile including all contact information
 *
 * This endpoint is used by employers to view candidate profiles.
 * Authentication is REQUIRED for employers.
 * Admins get full access without restrictions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('👤 [CANDIDATES/ID] GET request received');

  try {
    const { id: candidateId } = await params;

    // Get current user
    const user = await getCurrentUser();

    // Check if this is an admin user - admins get full access
    const isAdmin = user?.role === UserRole.ADMIN;

    // Check if this is an employer user
    const isEmployer = user?.role === UserRole.EMPLOYER;

    // For non-authenticated users or non-employer/admin users, return a minimal public view
    if (!user || (!isEmployer && !isAdmin)) {
      // Return very limited public profile (just for SEO/public pages)
      const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        select: {
          id: true,
          skills: true,
          experience: true,
          location: true,
          availability: true,
          testTier: true,
          currentRole: true,
          user: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!candidate) {
        return NextResponse.json(
          { error: "Candidate not found" },
          { status: 404 }
        );
      }

      const { firstName, lastInitial } = getGatedName(candidate.user.name);

      return NextResponse.json({
        candidate: {
          id: candidate.id,
          firstName,
          lastInitial,
          location: candidate.location,
          yearsExperience: candidate.experience,
          currentTitle: candidate.currentRole,
          skills: candidate.skills,
          skillsTier: candidate.testTier,
          availability: candidate.availability,
        },
        _accessLevel: "PUBLIC",
        _message: "Sign in as an employer to view full profile",
      });
    }

    // Get employer ID
    let employerId: string | null = null;
    if (isEmployer) {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      employerId = employer?.id || null;

      if (!employerId) {
        return NextResponse.json(
          { error: "Employer profile not found" },
          { status: 404 }
        );
      }
    }

    // Check access level for employers (admins skip this)
    let accessLevel: CandidateAccessLevel = "FULL_ACCESS";
    let introductionStatus: IntroductionStatusInfo = "NONE";
    let introductionId: string | null = null;
    let protectionEndsAt: Date | null = null;

    if (isEmployer && employerId) {
      const accessInfo = await getEmployerAccessLevel(employerId, candidateId);
      accessLevel = accessInfo.accessLevel;
      introductionStatus = accessInfo.introductionStatus;
      introductionId = accessInfo.introductionId;
      protectionEndsAt = accessInfo.protectionEndsAt;

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

      // Log the profile view (create or update introduction record)
      await logProfileView(employerId, candidateId);
    }

    // Fetch full candidate data
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
          orderBy: { startDate: "desc" },
        },
        educationEntries: {
          orderBy: { graduationYear: "desc" },
        },
        skillsAssessments: {
          orderBy: { completedAt: "desc" },
          take: 1,
        },
        placements: {
          where: { status: "COMPLETED" },
          select: {
            id: true,
            jobTitle: true,
            companyName: true,
            startDate: true,
            endDate: true,
          },
          orderBy: { startDate: "desc" },
        },
        _count: {
          select: {
            applications: true,
            placements: true,
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Parse name
    const nameParts = (candidate.user.name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "Unknown";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Build response based on access level
    const canViewContactInfo = accessLevel === "FULL_ACCESS" || isAdmin;

    const response: any = {
      id: candidate.id,
      firstName,
      lastName,
      profileImage: candidate.user.image || candidate.photo,
      location: candidate.location,
      yearsExperience: candidate.experience,
      currentTitle: candidate.currentRole,
      currentCompany: candidate.workExperiences[0]?.companyName || null,
      bio: candidate.bio,
      skills: candidate.skills,
      skillsScore: candidate.testScore,
      skillsTier: candidate.testTier,
      skillsPercentile: candidate.testPercentile,
      workExperience: candidate.workExperiences.map((we) => ({
        id: we.id,
        companyName: we.companyName,
        jobTitle: we.jobTitle,
        startDate: we.startDate,
        endDate: we.endDate,
        isCurrent: we.isCurrent,
        description: we.description,
        location: we.location,
      })),
      education: candidate.educationEntries.map((edu) => ({
        id: edu.id,
        schoolName: edu.schoolName,
        degree: edu.degree,
        fieldOfStudy: edu.fieldOfStudy,
        graduationYear: edu.graduationYear,
        gpa: edu.gpa,
        description: edu.description,
      })),
      availability: candidate.availability,
      preferredJobType: candidate.preferredJobType,
      expectedSalary: candidate.expectedSalary,
      placementHistory: candidate.placements,
      statistics: {
        applicationsCount: candidate._count.applications,
        placementsCount: candidate._count.placements,
      },
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    };

    // Add contact info based on access level
    if (canViewContactInfo) {
      // FULL ACCESS - include all contact information
      response.email = candidate.user.email;
      response.phone = candidate.phone;
      response.linkedIn = candidate.linkedIn;
      response.github = candidate.github;
      response.portfolio = candidate.portfolio;
      response.personalWebsite = candidate.personalWebsite;
      response.resume = candidate.resume;
      response._accessLevel = "FULL_ACCESS";
      response._introductionStatus = introductionStatus;
      response._contactGated = false;
    } else {
      // AGREEMENT_SIGNED - hide contact information
      response.email = null;
      response.phone = null;
      response.linkedIn = null;
      response.github = null;
      response.portfolio = null;
      response.personalWebsite = null;
      response.resume = null;
      response._accessLevel = "AGREEMENT_SIGNED";
      response._introductionStatus = introductionStatus;
      response._contactGated = true;
    }

    // Add introduction metadata
    response._introductionId = introductionId;
    response._protectionEndsAt = protectionEndsAt;

    console.log('✅ [CANDIDATES/ID] Returning profile for candidate:', candidateId, 'Access level:', accessLevel);

    return NextResponse.json({ candidate: response });

  } catch (error) {
    console.error("Candidate profile fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch candidate profile" },
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
      console.log('📊 [CANDIDATES/ID] Updated profile view count for introduction:', existingIntro.id);
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
      console.log('📊 [CANDIDATES/ID] Created new introduction record for candidate:', candidateId);
    }
  } catch (error) {
    // Log error but don't fail the request
    console.error('❌ [CANDIDATES/ID] Error logging profile view:', error);
  }
}
