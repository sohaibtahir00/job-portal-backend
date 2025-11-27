import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole, JobStatus } from "@prisma/client";
import {
  calculateJobMatch,
  CandidateForMatching,
  JobForMatching,
  sortJobsByMatch,
  filterJobsByMinScore,
} from "@/lib/job-matcher";

/**
 * GET /api/candidates/recommendations
 * Get job recommendations for the logged-in candidate
 * Query params: ?limit=10&minScore=50&niche=AI_ML&remoteOnly=true
 */
export async function GET(request: NextRequest) {
  try {
    // Require candidate role
    await requireRole(UserRole.CANDIDATE);

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get candidate profile
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        skills: true,
        nicheCategory: true,
        experience: true,
        expectedSalary: true,
        location: true,
        remotePreference: true,
        willingToRelocate: true,
        preferredJobType: true,
        desiredRoles: true,
      },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const minScore = parseInt(searchParams.get("minScore") || "30");
    const nicheFilter = searchParams.get("niche");
    const remoteOnly = searchParams.get("remoteOnly") === "true";

    // Build job query
    const jobWhere: any = {
      status: JobStatus.ACTIVE,
    };

    if (nicheFilter) {
      jobWhere.nicheCategory = nicheFilter;
    }

    if (remoteOnly) {
      jobWhere.OR = [
        { remote: true },
        { remoteType: "REMOTE" },
      ];
    }

    // Fetch active jobs
    const jobs = await prisma.job.findMany({
      where: jobWhere,
      select: {
        id: true,
        title: true,
        description: true,
        skills: true,
        nicheCategory: true,
        experienceLevel: true,
        salaryMin: true,
        salaryMax: true,
        location: true,
        remote: true,
        remoteType: true,
        type: true,
        createdAt: true,
        employer: {
          select: {
            id: true,
            slug: true,
            companyName: true,
            companyLogo: true,
            industry: true,
            verified: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100, // Process up to 100 jobs for recommendations
    });

    // Prepare candidate for matching
    const candidateForMatching: CandidateForMatching = {
      id: candidate.id,
      skills: candidate.skills || [],
      nicheCategory: candidate.nicheCategory,
      experience: candidate.experience,
      expectedSalary: candidate.expectedSalary,
      location: candidate.location,
      remotePreference: candidate.remotePreference,
      willingToRelocate: candidate.willingToRelocate,
      preferredJobType: candidate.preferredJobType,
      desiredRoles: candidate.desiredRoles || [],
    };

    // Calculate match scores for all jobs
    const jobsWithScores = jobs.map((job) => {
      const jobForMatching: JobForMatching = {
        id: job.id,
        title: job.title,
        skills: job.skills || [],
        nicheCategory: job.nicheCategory,
        experienceLevel: job.experienceLevel,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        location: job.location,
        remote: job.remote,
        remoteType: job.remoteType,
        type: job.type,
      };

      const matchScore = calculateJobMatch(candidateForMatching, jobForMatching);

      return {
        job: {
          id: job.id,
          title: job.title,
          description: job.description?.substring(0, 200) + (job.description && job.description.length > 200 ? "..." : ""),
          location: job.location,
          remote: job.remote,
          remoteType: job.remoteType,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          nicheCategory: job.nicheCategory,
          experienceLevel: job.experienceLevel,
          type: job.type,
          skills: job.skills?.slice(0, 5) || [],
          createdAt: job.createdAt,
          employer: job.employer,
        },
        matchScore: matchScore.overall,
        matchBreakdown: matchScore.breakdown,
        reasons: matchScore.reasons,
        matchingSkills: matchScore.matchingSkills,
        missingSkills: matchScore.missingSkills.slice(0, 3), // Limit missing skills shown
      };
    });

    // Filter by minimum score and sort
    const filteredJobs = jobsWithScores
      .filter((j) => j.matchScore >= minScore)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);

    // Count high-match jobs for navigation badge
    const highMatchCount = jobsWithScores.filter((j) => j.matchScore >= 70).length;

    return NextResponse.json({
      recommendations: filteredJobs,
      totalMatched: jobsWithScores.filter((j) => j.matchScore >= minScore).length,
      highMatchCount,
      candidateProfile: {
        hasSkills: (candidate.skills?.length || 0) > 0,
        hasLocation: !!candidate.location,
        hasExperience: candidate.experience !== null,
        hasSalaryExpectation: candidate.expectedSalary !== null,
        hasNiche: !!candidate.nicheCategory,
        profileComplete:
          (candidate.skills?.length || 0) > 0 &&
          !!candidate.location &&
          candidate.experience !== null,
      },
    });
  } catch (error) {
    console.error("Recommendations error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Candidate role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to get recommendations" },
      { status: 500 }
    );
  }
}
