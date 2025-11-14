import { ExperienceLevel } from "@prisma/client";

/**
 * Calculate placement fee percentage based on job experience level
 *
 * Fee structure:
 * - Entry Level & Mid Level: 15%
 * - Senior Level: 18%
 * - Executive: 20%
 *
 * @param experienceLevel - The experience level required for the job
 * @returns Fee percentage as a decimal (e.g., 0.15 for 15%)
 */
export function calculateFeePercentage(experienceLevel: ExperienceLevel): number {
  switch (experienceLevel) {
    case "ENTRY_LEVEL":
    case "MID_LEVEL":
      return 0.15; // 15%
    case "SENIOR_LEVEL":
      return 0.18; // 18%
    case "EXECUTIVE":
      return 0.20; // 20%
    default:
      return 0.18; // Default fallback to 18%
  }
}

/**
 * Calculate placement fee amount based on salary and experience level
 *
 * @param salary - Annual salary in cents
 * @param experienceLevel - The experience level required for the job
 * @returns Object containing fee details
 */
export function calculatePlacementFee(salary: number, experienceLevel: ExperienceLevel) {
  const feePercentage = calculateFeePercentage(experienceLevel);
  const placementFee = Math.round(salary * feePercentage);
  const upfrontAmount = Math.round(placementFee * 0.5); // 50% upfront
  const remainingAmount = placementFee - upfrontAmount; // Remaining 50%

  return {
    feePercentage: feePercentage * 100, // Convert to percentage (15, 18, 20)
    placementFee,
    upfrontAmount,
    remainingAmount,
  };
}
