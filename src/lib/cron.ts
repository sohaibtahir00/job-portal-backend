/**
 * Cron Job Utilities
 *
 * Provides authentication and helpers for scheduled background tasks
 */

import { NextRequest } from "next/server";

/**
 * Verify cron job authentication token
 * Protects cron endpoints from unauthorized access
 */
export function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no secret is set, allow access (development mode)
  if (!cronSecret) {
    console.warn("WARNING: CRON_SECRET not set. Cron endpoints are unprotected.");
    return true;
  }

  // Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    return token === cronSecret;
  }

  // Check x-cron-secret header (alternative method)
  const cronSecretHeader = request.headers.get("x-cron-secret");
  if (cronSecretHeader) {
    return cronSecretHeader === cronSecret;
  }

  // Check query parameter (for simple cron services)
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get("secret");
  if (secretParam) {
    return secretParam === cronSecret;
  }

  return false;
}

/**
 * Create cron authentication error response
 */
export function createCronAuthError() {
  return {
    error: "Unauthorized",
    message: "Invalid or missing cron authentication token",
    status: 401,
  };
}

/**
 * Log cron job execution
 */
export function logCronJob(
  jobName: string,
  result: { success: boolean; processed?: number; errors?: number; message?: string }
) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    job: jobName,
    ...result,
  };

  console.log("[CRON]", JSON.stringify(logEntry));
  return logEntry;
}

/**
 * Calculate next run time for display
 */
export function getNextRunTime(intervalMinutes: number): string {
  const next = new Date(Date.now() + intervalMinutes * 60 * 1000);
  return next.toISOString();
}

/**
 * Check if it's a good time to run heavy operations
 * (avoid peak hours if specified)
 */
export function isOffPeakHours(): boolean {
  const now = new Date();
  const hour = now.getHours();

  // Off-peak: 1 AM - 6 AM (adjust as needed)
  return hour >= 1 && hour < 6;
}

/**
 * Batch process items with error handling
 */
export async function batchProcess<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  options: {
    batchSize?: number;
    delayMs?: number;
  } = {}
): Promise<{ processed: number; errors: number; errorDetails: any[] }> {
  const { batchSize = 10, delayMs = 100 } = options;

  let processed = 0;
  let errors = 0;
  const errorDetails: any[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map((item) => processor(item))
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        processed++;
      } else {
        errors++;
        errorDetails.push({
          item: batch[index],
          error: result.reason instanceof Error ? result.reason.message : result.reason,
        });
      }
    });

    // Delay between batches to avoid overwhelming the system
    if (i + batchSize < items.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { processed, errors, errorDetails };
}

/**
 * Format duration for logging
 */
export function formatDuration(startTime: number): string {
  const duration = Date.now() - startTime;
  if (duration < 1000) {
    return `${duration}ms`;
  }
  return `${(duration / 1000).toFixed(2)}s`;
}

export default {
  verifyCronAuth,
  createCronAuthError,
  logCronJob,
  getNextRunTime,
  isOffPeakHours,
  batchProcess,
  formatDuration,
};
