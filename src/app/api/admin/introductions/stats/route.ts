import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { IntroductionStatus } from "@prisma/client";

/**
 * GET /api/admin/introductions/stats
 * Get statistics for candidate introductions
 *
 * Returns:
 * - Total count
 * - Count by status
 * - Count of introductions expiring in next 30 days
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      console.log("[Admin Introductions Stats] Unauthorized access attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Get counts by status
    const [
      total,
      profileViewed,
      requested,
      introduced,
      interviewing,
      offerExtended,
      hired,
      declined,
      closedNoHire,
      expired,
      expiringSoon,
    ] = await Promise.all([
      // Total count
      prisma.candidateIntroduction.count(),

      // Profile viewed only
      prisma.candidateIntroduction.count({
        where: { status: IntroductionStatus.PROFILE_VIEWED },
      }),

      // Intro requested
      prisma.candidateIntroduction.count({
        where: { status: IntroductionStatus.INTRO_REQUESTED },
      }),

      // Introduced
      prisma.candidateIntroduction.count({
        where: { status: IntroductionStatus.INTRODUCED },
      }),

      // Interviewing
      prisma.candidateIntroduction.count({
        where: { status: IntroductionStatus.INTERVIEWING },
      }),

      // Offer extended
      prisma.candidateIntroduction.count({
        where: { status: IntroductionStatus.OFFER_EXTENDED },
      }),

      // Hired
      prisma.candidateIntroduction.count({
        where: { status: IntroductionStatus.HIRED },
      }),

      // Candidate declined
      prisma.candidateIntroduction.count({
        where: { status: IntroductionStatus.CANDIDATE_DECLINED },
      }),

      // Closed no hire
      prisma.candidateIntroduction.count({
        where: { status: IntroductionStatus.CLOSED_NO_HIRE },
      }),

      // Expired
      prisma.candidateIntroduction.count({
        where: { status: IntroductionStatus.EXPIRED },
      }),

      // Expiring in next 30 days (active ones)
      prisma.candidateIntroduction.count({
        where: {
          protectionEndsAt: {
            gt: now,
            lte: thirtyDaysFromNow,
          },
          status: {
            notIn: [IntroductionStatus.EXPIRED, IntroductionStatus.CLOSED_NO_HIRE],
          },
        },
      }),
    ]);

    // Calculate active (not expired, declined, or closed)
    const active = total - declined - closedNoHire - expired;

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentIntroductions = await prisma.candidateIntroduction.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
    });

    const recentRequests = await prisma.candidateIntroduction.count({
      where: {
        introRequestedAt: { gte: sevenDaysAgo },
      },
    });

    return NextResponse.json({
      stats: {
        total,
        active,
        byStatus: {
          profileViewed,
          requested,
          introduced,
          interviewing,
          offerExtended,
          hired,
          declined,
          closedNoHire,
          expired,
        },
        expiringSoon,
        recentActivity: {
          introductions: recentIntroductions,
          requests: recentRequests,
        },
      },
    });
  } catch (error) {
    console.error("[Admin Introductions Stats] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch introduction statistics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
