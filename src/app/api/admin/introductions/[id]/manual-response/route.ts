import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { CandidateResponse, IntroductionStatus } from "@prisma/client";
import {
  sendIntroductionAcceptedEmail,
  sendIntroductionDeclinedEmail,
  EMAIL_CONFIG,
} from "@/lib/email";

/**
 * POST /api/admin/introductions/[id]/manual-response
 * Admin manually sets the candidate response (for phone/verbal confirmations)
 * Triggers appropriate emails
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { response, note } = body;

    // Validate response value
    if (!response || !["ACCEPT", "DECLINE"].includes(response)) {
      return NextResponse.json(
        { error: "Invalid response. Must be 'ACCEPT' or 'DECLINE'" },
        { status: 400 }
      );
    }

    // Get the introduction with related data
    const introduction = await prisma.candidateIntroduction.findUnique({
      where: { id },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        employer: {
          include: {
            user: {
              select: {
                id: true,
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
    });

    if (!introduction) {
      return NextResponse.json(
        { error: "Introduction not found" },
        { status: 404 }
      );
    }

    const now = new Date();
    const jobTitle = introduction.job?.title || "Open Position";

    // Build update data
    const updateData: any = {
      candidateResponse: response === "ACCEPT" ? CandidateResponse.ACCEPTED : CandidateResponse.DECLINED,
      candidateRespondedAt: now,
      updatedAt: now,
    };

    // Set status based on response
    if (response === "ACCEPT") {
      updateData.status = IntroductionStatus.INTRODUCED;
      updateData.introducedAt = now;
    } else {
      updateData.status = IntroductionStatus.CANDIDATE_DECLINED;
    }

    // Append admin note if provided
    if (note) {
      const timestamp = now.toISOString();
      const noteEntry = `[${timestamp}] ADMIN: Manual ${response.toLowerCase()} - ${note}`;
      updateData.adminNotes = introduction.adminNotes
        ? `${introduction.adminNotes}\n${noteEntry}`
        : noteEntry;
    }

    // Clear response token since it's no longer needed
    updateData.responseToken = null;
    updateData.responseTokenExpiry = null;

    // Update introduction
    await prisma.candidateIntroduction.update({
      where: { id },
      data: updateData,
    });

    // Send appropriate email to employer
    if (response === "ACCEPT") {
      // Send acceptance email with contact info
      const candidateProfileUrl = `${EMAIL_CONFIG.appUrl}/employer/candidates/${introduction.candidate.id}`;

      const emailResult = await sendIntroductionAcceptedEmail({
        employerEmail: introduction.employer.user.email,
        employerName: introduction.employer.user.name,
        candidateName: introduction.candidate.user.name,
        candidateEmail: introduction.candidate.user.email,
        candidatePhone: introduction.candidate.phone || undefined,
        candidateLinkedIn: introduction.candidate.linkedIn || undefined,
        jobTitle,
        candidateProfileUrl,
      });

      if (!emailResult.success) {
        console.error(`[Admin Manual Response] Failed to send acceptance email:`, emailResult.error);
      }

      console.log(
        `[Admin Manual Response] Manually accepted introduction ${id}. Employer notified.`
      );
    } else {
      // Send decline email
      const searchUrl = `${EMAIL_CONFIG.appUrl}/employer/candidates`;

      const emailResult = await sendIntroductionDeclinedEmail({
        employerEmail: introduction.employer.user.email,
        employerName: introduction.employer.user.name,
        candidateFirstName: introduction.candidate.user.name.split(" ")[0],
        jobTitle,
        searchUrl,
      });

      if (!emailResult.success) {
        console.error(`[Admin Manual Response] Failed to send decline email:`, emailResult.error);
      }

      console.log(
        `[Admin Manual Response] Manually declined introduction ${id}. Employer notified.`
      );
    }

    return NextResponse.json({
      success: true,
      message: `Introduction manually ${response === "ACCEPT" ? "accepted" : "declined"}`,
      newStatus: updateData.status,
      candidateResponse: updateData.candidateResponse,
    });
  } catch (error) {
    console.error("[Admin Manual Response] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to process manual response",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
