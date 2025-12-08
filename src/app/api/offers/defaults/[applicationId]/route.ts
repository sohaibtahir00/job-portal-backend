import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/offers/defaults/[applicationId]
 * Get pre-populated offer defaults from the job posting
 * This allows the offer form to be auto-filled with job data
 *
 * Returns:
 * - position: Job title
 * - salaryMin: Minimum salary in cents (converted from job's dollar amount)
 * - salaryMax: Maximum salary in cents (converted from job's dollar amount)
 * - suggestedSalary: Midpoint salary in cents for default
 * - equityOffered: Whether equity is offered
 * - benefits: Array of benefits from the job
 * - startDateNeeded: Suggested start date from job
 *
 * All values are editable in the offer form - these are just defaults
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!employer) {
      return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    }

    const { applicationId } = await params;

    // Get application with job details
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            employerId: true,
            salaryMin: true,
            salaryMax: true,
            isCompetitive: true,
            equityOffered: true,
            specificBenefits: true,
            benefits: true,
            startDateNeeded: true,
            location: true,
            type: true,
          },
        },
        candidate: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Verify employer owns this job
    if (application.job.employerId !== employer.id) {
      return NextResponse.json(
        { error: "You do not have permission to access this application" },
        { status: 403 }
      );
    }

    const job = application.job;

    // Convert salary from dollars to cents for the offer
    // Job stores in dollars, Offer stores in cents
    const salaryMinCents = job.salaryMin ? job.salaryMin * 100 : null;
    const salaryMaxCents = job.salaryMax ? job.salaryMax * 100 : null;

    // Calculate suggested salary (midpoint or max if only one is set)
    let suggestedSalaryCents: number | null = null;
    if (salaryMinCents && salaryMaxCents) {
      suggestedSalaryCents = Math.round((salaryMinCents + salaryMaxCents) / 2);
    } else if (salaryMaxCents) {
      suggestedSalaryCents = salaryMaxCents;
    } else if (salaryMinCents) {
      suggestedSalaryCents = salaryMinCents;
    }

    // Merge benefits from both fields (specificBenefits array and legacy benefits string)
    let allBenefits: string[] = [];
    if (job.specificBenefits && job.specificBenefits.length > 0) {
      allBenefits = [...job.specificBenefits];
    }
    if (job.benefits) {
      const legacyBenefits = job.benefits.split(",").map((b: string) => b.trim()).filter((b: string) => b);
      // Add legacy benefits that aren't already in specificBenefits
      legacyBenefits.forEach((b: string) => {
        if (!allBenefits.includes(b)) {
          allBenefits.push(b);
        }
      });
    }

    // Calculate default start date (30 days from now if not specified in job)
    const defaultStartDate = job.startDateNeeded
      ? new Date(job.startDateNeeded).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Calculate default expiration date (7 days from now)
    const defaultExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    return NextResponse.json({
      defaults: {
        // Position defaults to job title
        position: job.title,

        // Salary information (all in cents for the offer)
        salaryMin: salaryMinCents,
        salaryMax: salaryMaxCents,
        suggestedSalary: suggestedSalaryCents,
        isCompetitive: job.isCompetitive,

        // Equity (stored as boolean on job, offer form expects percentage)
        // If equityOffered is true, suggest a default of 0.5%
        equityOffered: job.equityOffered,
        suggestedEquity: job.equityOffered ? 0.5 : null,

        // Benefits from job posting
        benefits: allBenefits,

        // Dates
        startDate: defaultStartDate,
        expiresAt: defaultExpiresAt,

        // Job context for display
        jobTitle: job.title,
        jobLocation: job.location,
        jobType: job.type,
      },
      candidate: {
        id: application.candidate.id,
        name: application.candidate.user.name,
      },
      applicationId: application.id,
      jobId: job.id,
    });
  } catch (error: any) {
    console.error("Error fetching offer defaults:", error);
    return NextResponse.json(
      { error: "Failed to fetch offer defaults", details: error.message },
      { status: 500 }
    );
  }
}
