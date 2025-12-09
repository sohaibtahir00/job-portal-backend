import { prisma } from "@/lib/prisma";
import { sendCheckInEmail } from "@/lib/email";
import { generateIntroductionToken, generateTokenExpiry } from "@/lib/tokens";
import { IntroductionStatus } from "@prisma/client";

/**
 * Check-in schedule configuration
 * Defines when check-in emails are sent after introduction
 */
export const CHECK_IN_SCHEDULE = [
  { number: 1, daysAfter: 30 },
  { number: 2, daysAfter: 60 },
  { number: 3, daysAfter: 90 },
  { number: 4, daysAfter: 180 },
  { number: 5, daysAfter: 365 },
];

/**
 * Result of the check-in scheduler run
 */
export interface CheckInSchedulerResult {
  created: number;
  sent: number;
  errors: string[];
  introductionsProcessed: number;
}

/**
 * Run the check-in scheduler
 * This job should run daily (via cron, Vercel cron, or similar)
 *
 * It does two things:
 * 1. Creates check-in records for introductions that need them
 * 2. Sends emails for check-ins that are due today
 */
export async function runCheckInScheduler(): Promise<CheckInSchedulerResult> {
  const result: CheckInSchedulerResult = {
    created: 0,
    sent: 0,
    errors: [],
    introductionsProcessed: 0,
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  console.log(`[Check-in Scheduler] Starting run at ${now.toISOString()}`);

  try {
    // Step 1: Find all INTRODUCED status introductions that need check-in records created
    const introducedIntroductions = await prisma.candidateIntroduction.findMany({
      where: {
        status: IntroductionStatus.INTRODUCED,
        introducedAt: { not: null },
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
          select: {
            companyName: true,
          },
        },
        job: {
          select: {
            title: true,
          },
        },
        checkIns: true,
      },
    });

    console.log(`[Check-in Scheduler] Found ${introducedIntroductions.length} introduced introductions`);
    result.introductionsProcessed = introducedIntroductions.length;

    // Step 2: For each introduction, ensure check-in records exist for all 5 milestones
    for (const intro of introducedIntroductions) {
      if (!intro.introducedAt) continue;

      const existingCheckInNumbers = new Set(intro.checkIns.map((c) => c.checkInNumber));

      for (const schedule of CHECK_IN_SCHEDULE) {
        // Skip if this check-in already exists
        if (existingCheckInNumbers.has(schedule.number)) continue;

        // Calculate scheduled date
        const scheduledFor = new Date(intro.introducedAt);
        scheduledFor.setDate(scheduledFor.getDate() + schedule.daysAfter);

        // Only create if scheduled date is in the future or today
        // (no point creating past check-ins)
        if (scheduledFor >= todayStart) {
          try {
            await prisma.candidateCheckIn.create({
              data: {
                introductionId: intro.id,
                checkInNumber: schedule.number,
                scheduledFor,
              },
            });
            result.created++;
            console.log(
              `[Check-in Scheduler] Created check-in #${schedule.number} for introduction ${intro.id}, scheduled for ${scheduledFor.toISOString()}`
            );
          } catch (error) {
            const errorMsg = `Failed to create check-in #${schedule.number} for introduction ${intro.id}: ${error}`;
            console.error(`[Check-in Scheduler] ${errorMsg}`);
            result.errors.push(errorMsg);
          }
        }
      }
    }

    // Step 3: Send emails for check-ins that are due today (scheduledFor <= today and sentAt is null)
    const dueCheckIns = await prisma.candidateCheckIn.findMany({
      where: {
        scheduledFor: {
          lte: todayEnd,
        },
        sentAt: null,
      },
      include: {
        introduction: {
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
              },
            },
            job: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    });

    console.log(`[Check-in Scheduler] Found ${dueCheckIns.length} check-ins due to be sent`);

    for (const checkIn of dueCheckIns) {
      const intro = checkIn.introduction;

      // Skip if introduction is no longer in INTRODUCED status
      // (e.g., already marked as HIRED or CLOSED_NO_HIRE)
      if (intro.status !== IntroductionStatus.INTRODUCED) {
        console.log(
          `[Check-in Scheduler] Skipping check-in ${checkIn.id} - introduction status is ${intro.status}`
        );
        continue;
      }

      // Skip if no introducedAt date (shouldn't happen, but safety check)
      if (!intro.introducedAt) {
        console.log(`[Check-in Scheduler] Skipping check-in ${checkIn.id} - no introducedAt date`);
        continue;
      }

      try {
        // Generate response token
        const responseToken = generateIntroductionToken();
        const responseTokenExpiry = generateTokenExpiry(14); // 14 days to respond

        // Send the email
        const emailResult = await sendCheckInEmail({
          candidateEmail: intro.candidate.user.email,
          candidateName: intro.candidate.user.name,
          employerCompanyName: intro.employer.companyName,
          jobTitle: intro.job?.title || "the position",
          checkInNumber: checkIn.checkInNumber,
          responseToken,
          introductionDate: intro.introducedAt,
        });

        if (emailResult.success) {
          // Update check-in record with sent timestamp and token
          await prisma.candidateCheckIn.update({
            where: { id: checkIn.id },
            data: {
              sentAt: now,
              responseToken,
              responseTokenExpiry,
            },
          });

          result.sent++;
          console.log(
            `[Check-in Scheduler] Sent check-in #${checkIn.checkInNumber} email for introduction ${intro.id} to ${intro.candidate.user.email}`
          );
        } else {
          const errorMsg = `Failed to send check-in email for ${checkIn.id}: ${emailResult.error}`;
          console.error(`[Check-in Scheduler] ${errorMsg}`);
          result.errors.push(errorMsg);
        }
      } catch (error) {
        const errorMsg = `Error processing check-in ${checkIn.id}: ${error}`;
        console.error(`[Check-in Scheduler] ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    console.log(
      `[Check-in Scheduler] Completed. Created: ${result.created}, Sent: ${result.sent}, Errors: ${result.errors.length}`
    );

    return result;
  } catch (error) {
    const errorMsg = `Fatal error in check-in scheduler: ${error}`;
    console.error(`[Check-in Scheduler] ${errorMsg}`);
    result.errors.push(errorMsg);
    return result;
  }
}

/**
 * Create check-ins for a specific introduction
 * Used when an introduction is first made to immediately schedule check-ins
 */
export async function createCheckInsForIntroduction(introductionId: string): Promise<number> {
  const introduction = await prisma.candidateIntroduction.findUnique({
    where: { id: introductionId },
  });

  if (!introduction || !introduction.introducedAt) {
    console.log(`[Check-in Scheduler] Cannot create check-ins: introduction ${introductionId} not found or not introduced`);
    return 0;
  }

  let created = 0;

  for (const schedule of CHECK_IN_SCHEDULE) {
    const scheduledFor = new Date(introduction.introducedAt);
    scheduledFor.setDate(scheduledFor.getDate() + schedule.daysAfter);

    try {
      await prisma.candidateCheckIn.create({
        data: {
          introductionId,
          checkInNumber: schedule.number,
          scheduledFor,
        },
      });
      created++;
      console.log(
        `[Check-in Scheduler] Created check-in #${schedule.number} for introduction ${introductionId}`
      );
    } catch (error) {
      // Likely duplicate, skip
      console.log(
        `[Check-in Scheduler] Check-in #${schedule.number} already exists for introduction ${introductionId}`
      );
    }
  }

  return created;
}
