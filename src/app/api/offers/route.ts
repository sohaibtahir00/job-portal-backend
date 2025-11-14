import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ApplicationStatus, OfferStatus } from "@prisma/client";
import { sendEmail } from "@/lib/email";

// GET /api/offers - Get all offers (filtered by user role)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as OfferStatus | null;

    // Candidates see offers made to them
    if (user.role === "CANDIDATE") {
      const candidate = await prisma.candidate.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!candidate) {
        return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 });
      }

      const where: any = { candidateId: candidate.id };
      if (status) {
        where.status = status;
      }

      const offers = await prisma.offer.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              location: true,
              type: true,
            },
          },
          employer: {
            select: {
              companyName: true,
              companyLogo: true,
            },
          },
          application: {
            select: {
              id: true,
              status: true,
              appliedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ offers }, { status: 200 });
    }

    // Employers see offers they've made
    if (user.role === "EMPLOYER") {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!employer) {
        return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
      }

      const where: any = { employerId: employer.id };
      if (status) {
        where.status = status;
      }

      const offers = await prisma.offer.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              title: true,
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
                  email: true,
                },
              },
            },
          },
          application: {
            select: {
              id: true,
              status: true,
              appliedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ offers }, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid user role" }, { status: 403 });
  } catch (error: any) {
    console.error("Error fetching offers:", error);
    return NextResponse.json(
      { error: "Failed to fetch offers", details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/offers - Create a new offer (Employer only)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: { id: true, companyName: true },
    });

    if (!employer) {
      return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      applicationId,
      position,
      salary,
      equity,
      signingBonus,
      benefits,
      startDate,
      offerLetter,
      customMessage,
      expiresAt,
    } = body;

    // Validate required fields
    if (!applicationId || !position || !salary || !startDate || !expiresAt) {
      return NextResponse.json(
        { error: "Missing required fields: applicationId, position, salary, startDate, expiresAt" },
        { status: 400 }
      );
    }

    // Verify application exists and employer owns it
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          select: {
            id: true,
            employerId: true,
            title: true,
          },
        },
        candidate: {
          select: {
            id: true,
          },
        },
        interviews: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (application.job.employerId !== employer.id) {
      return NextResponse.json(
        { error: "You do not have permission to make an offer for this application" },
        { status: 403 }
      );
    }

    // Check if application status allows making an offer OR has completed interview
    const hasCompletedInterview = application.interviews.some((i) => i.status === "COMPLETED");
    const validStatuses = ["INTERVIEWED", "SHORTLISTED", "INTERVIEW_SCHEDULED"];

    if (!validStatuses.includes(application.status) && !hasCompletedInterview) {
      return NextResponse.json(
        {
          error: `Cannot make offer for application with status: ${application.status}. Application must be SHORTLISTED, have a completed interview, or be in interview process.`,
        },
        { status: 400 }
      );
    }

    // Check if offer already exists for this application
    const existingOffer = await prisma.offer.findUnique({
      where: { applicationId },
    });

    if (existingOffer) {
      return NextResponse.json(
        { error: "An offer already exists for this application" },
        { status: 400 }
      );
    }

    // Create the offer
    const offer = await prisma.offer.create({
      data: {
        applicationId,
        jobId: application.job.id,
        candidateId: application.candidate.id,
        employerId: employer.id,
        position,
        salary: parseInt(salary),
        equity: equity ? parseFloat(equity) : null,
        signingBonus: signingBonus ? parseInt(signingBonus) : null,
        benefits: benefits || [],
        startDate: new Date(startDate),
        offerLetter,
        customMessage,
        expiresAt: new Date(expiresAt),
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
          },
        },
        candidate: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Update application status to OFFERED
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.OFFERED },
    });

    // Send email notification to candidate
    try {
      const daysUntilExpiry = Math.ceil(
        (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      await sendEmail({
        to: offer.candidate.user.email,
        subject: `Job Offer: ${position} at ${employer.companyName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">🎉 Congratulations! You've Received a Job Offer</h2>
            <p>Hi ${offer.candidate.user.name},</p>
            <p>Great news! <strong>${employer.companyName}</strong> has extended you a job offer for the position of <strong>${position}</strong>.</p>

            <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Offer Details:</strong></p>
              <ul style="margin: 0; padding-left: 20px;">
                <li><strong>Position:</strong> ${position}</li>
                <li><strong>Annual Salary:</strong> $${(salary / 100).toLocaleString()}</li>
                ${signingBonus ? `<li><strong>Signing Bonus:</strong> $${(signingBonus / 100).toLocaleString()}</li>` : ""}
                ${equity ? `<li><strong>Equity:</strong> ${equity}%</li>` : ""}
                ${benefits && benefits.length > 0 ? `<li><strong>Benefits:</strong> ${benefits.join(", ")}</li>` : ""}
                <li><strong>Start Date:</strong> ${new Date(startDate).toLocaleDateString()}</li>
              </ul>
            </div>

            ${customMessage ? `<div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;"><p style="margin: 0;"><strong>Message from ${employer.companyName}:</strong></p><p style="margin: 10px 0 0 0;">${customMessage}</p></div>` : ""}

            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e;">⏰ <strong>This offer expires in ${daysUntilExpiry} day(s)</strong> - Please respond by ${new Date(expiresAt).toLocaleDateString()}</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/candidate/offers" style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 0 10px;">View & Accept Offer</a>
            </div>

            <p>Log in to your account to review the complete offer details and accept or decline.</p>
            <p>Best regards,<br>The Job Portal Team</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send offer email to candidate:", emailError);
      // Don't fail the offer creation if email fails
    }

    return NextResponse.json(
      {
        message: "Offer created successfully",
        offer,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating offer:", error);
    return NextResponse.json(
      { error: "Failed to create offer", details: error.message },
      { status: 500 }
    );
  }
}
