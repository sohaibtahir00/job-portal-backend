import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateIntroductionToken, generateTokenExpiry } from "@/lib/tokens";
import { sendIntroductionRequestEmail } from "@/lib/email";

/**
 * POST /api/admin/introductions/[id]/resend-email
 * Resend the candidate notification email
 * Regenerates token if expired
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

    // Get the introduction with related data
    const introduction = await prisma.candidateIntroduction.findUnique({
      where: { id },
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
        employer: {
          select: {
            companyName: true,
            description: true,
          },
        },
        job: {
          select: {
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

    // Check if we need a new token (expired or doesn't exist)
    const now = new Date();
    let responseToken = introduction.responseToken;
    let responseTokenExpiry = introduction.responseTokenExpiry;

    if (!responseToken || !responseTokenExpiry || responseTokenExpiry < now) {
      // Generate new token
      responseToken = generateIntroductionToken();
      responseTokenExpiry = generateTokenExpiry(7); // 7 days

      console.log(`[Admin Resend Email] Generating new token for introduction ${id}`);
    }

    // Update introduction with new token and increment resend count
    await prisma.candidateIntroduction.update({
      where: { id },
      data: {
        responseToken,
        responseTokenExpiry,
        lastEmailSentAt: now,
        emailResendCount: {
          increment: 1,
        },
      },
    });

    // Send the email
    const jobTitle = introduction.job?.title || "Open Position";
    const emailResult = await sendIntroductionRequestEmail({
      candidateEmail: introduction.candidate.user.email,
      candidateName: introduction.candidate.user.name,
      employerCompanyName: introduction.employer.companyName,
      employerDescription: introduction.employer.description || undefined,
      jobTitle,
      responseToken,
    });

    if (!emailResult.success) {
      console.error(`[Admin Resend Email] Failed to send email:`, emailResult.error);
      return NextResponse.json(
        { error: "Failed to send email", details: emailResult.error },
        { status: 500 }
      );
    }

    console.log(
      `[Admin Resend Email] Email resent to ${introduction.candidate.user.email} for introduction ${id}`
    );

    return NextResponse.json({
      success: true,
      message: "Email resent successfully",
      resendCount: introduction.emailResendCount + 1,
      tokenRegenerated: !introduction.responseToken ||
        !introduction.responseTokenExpiry ||
        introduction.responseTokenExpiry < now,
    });
  } catch (error) {
    console.error("[Admin Resend Email] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to resend email",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
