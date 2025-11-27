import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import {
  calculateJobMatch,
  CandidateForMatching,
  JobForMatching,
} from "@/lib/job-matcher";

/**
 * GET /api/jobs/[id]/match
 * Get match score for the current logged-in candidate for a specific job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Check if user is logged in
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required", matchScore: null },
        { status: 401 }
      );
    }

    // Only candidates can get match scores
    if (user.role !== UserRole.CANDIDATE) {
      return NextResponse.json(
        { error: "Candidate role required", matchScore: null },
        { status: 403 }
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
        { error: "Candidate profile not found", matchScore: null },
        { status: 404 }
      );
    }

    // Get job details
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        skills: true,
        nicheCategory: true,
        experienceLevel: true,
        salaryMin: true,
        salaryMax: true,
        location: true,
        remote: true,
        remoteType: true,
        type: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found", matchScore: null },
        { status: 404 }
      );
    }

    // Prepare data for matching
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

    // Calculate match score
    const matchResult = calculateJobMatch(candidateForMatching, jobForMatching);

    return NextResponse.json({
      matchScore: matchResult.overall,
      breakdown: matchResult.breakdown,
      reasons: matchResult.reasons,
      matchingSkills: matchResult.matchingSkills,
      missingSkills: matchResult.missingSkills,
      profileStatus: {
        hasSkills: (candidate.skills?.length || 0) > 0,
        hasLocation: !!candidate.location,
        hasExperience: candidate.experience !== null,
        hasSalaryExpectation: candidate.expectedSalary !== null,
        hasNiche: !!candidate.nicheCategory,
      },
    });
  } catch (error) {
    console.error("Job match error:", error);

    return NextResponse.json(
      { error: "Failed to calculate match score", matchScore: null },
      { status: 500 }
    );
  }
}
