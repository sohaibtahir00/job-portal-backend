import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { OfferStatus, ApplicationStatus } from "@prisma/client";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/cron/expire-offers
 * Automatically expire offers that have passed their expiration date
 * Should be called by a cron job (e.g., every hour)
 *
 * Security: Requires CRON_SECRET header to prevent unauthorized access
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const cronSecret = request.headers.get("Authorization")?.replace("Bearer ", "");
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret && cronSecret !== expectedSecret) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid cron secret" },
        { status: 401 }
      );
    }

    const now = new Date();

    // Find all pending offers that have expired
    const expiredOffers = await prisma.offer.findMany({
      where: {
        status: OfferStatus.PENDING,
        expiresAt: {
          lt: now, // Less than current time = expired
        },
      },
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
            title: true,
          },
        },
        application: {
          select: {
            id: true,
          },
        },
      },
    });

    const results = [];

    // Process each expired offer
    for (const offer of expiredOffers) {
      try {
        // Update offer status to EXPIRED
        await prisma.offer.update({
          where: { id: offer.id },
          data: {
            status: OfferStatus.EXPIRED,
            updatedAt: now,
          },
        });

        // Update application status to REJECTED
        await prisma.application.update({
          where: { id: offer.application.id },
          data: {
            status: ApplicationStatus.REJECTED,
          },
        });

        // Send expiration email to candidate
        try {
          await sendEmail({
            to: offer.candidate.user.email,
            subject: `Offer Expired: ${offer.position} at ${offer.employer.companyName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #dc2626;">Offer Expired</h2>
                <p>Hi ${offer.candidate.user.name},</p>
                <p>Unfortunately, the job offer for the position of <strong>${offer.position}</strong> at <strong>${offer.employer.companyName}</strong> has expired.</p>
                <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0; color: #7f1d1d;"><strong>Offer expired on:</strong> ${offer.expiresAt.toLocaleDateString()}</p>
                </div>
                <p>If you're still interested in this position, we recommend reaching out to the employer directly.</p>
                <p>Best regards,<br>The Job Portal Team</p>
              </div>
            `,
          });
        } catch (emailError) {
          console.error(`Failed to send expiration email to candidate ${offer.candidate.user.email}:`, emailError);
        }

        // Send expiration email to employer
        try {
          await sendEmail({
            to: offer.employer.user.email,
            subject: `Offer Expired: ${offer.candidate.user.name} for ${offer.position}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #dc2626;">Offer Expired Without Response</h2>
                <p>Hi ${offer.employer.companyName} Team,</p>
                <p>Your job offer to <strong>${offer.candidate.user.name}</strong> for the position of <strong>${offer.position}</strong> has expired without a response.</p>
                <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0;"><strong>Offer Details:</strong></p>
                  <ul style="margin: 0; padding-left: 20px;">
                    <li>Position: ${offer.position}</li>
                    <li>Salary: $${(offer.salary / 100).toLocaleString()}</li>
                    <li>Expired on: ${offer.expiresAt.toLocaleDateString()}</li>
                  </ul>
                </div>
                <p><strong>Next Steps:</strong></p>
                <ul>
                  <li>Consider extending the offer if you're still interested in this candidate</li>
                  <li>Review other qualified candidates for this position</li>
                  <li>Post a new job opening if needed</li>
                </ul>
                <p>Best regards,<br>The Job Portal Team</p>
              </div>
            `,
          });
        } catch (emailError) {
          console.error(`Failed to send expiration email to employer ${offer.employer.user.email}:`, emailError);
        }

        results.push({
          offerId: offer.id,
          position: offer.position,
          candidateName: offer.candidate.user.name,
          companyName: offer.employer.companyName,
          expiredAt: offer.expiresAt,
          status: "success",
        });
      } catch (error: any) {
        console.error(`Error processing expired offer ${offer.id}:`, error);
        results.push({
          offerId: offer.id,
          status: "error",
          error: error.message,
        });
      }
    }

    return NextResponse.json(
      {
        message: `Successfully processed ${results.length} expired offer(s)`,
        totalExpired: expiredOffers.length,
        results,
        processedAt: now.toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in expire-offers cron job:", error);
    return NextResponse.json(
      {
        error: "Failed to process expired offers",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
