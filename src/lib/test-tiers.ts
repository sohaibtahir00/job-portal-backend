/**
 * Skills Testing Tier Calculation Utility
 *
 * Calculates candidate tier based on test scores and percentiles
 */

export enum TestTier {
  ELITE = "ELITE",
  ADVANCED = "ADVANCED",
  INTERMEDIATE = "INTERMEDIATE",
  BEGINNER = "BEGINNER",
}

export interface TierThresholds {
  score: number;      // Minimum score (0-100)
  percentile: number; // Minimum percentile (0-100)
}

/**
 * Tier thresholds configuration
 * Candidates must meet BOTH score AND percentile requirements
 */
export const TIER_THRESHOLDS: Record<TestTier, TierThresholds> = {
  [TestTier.ELITE]: {
    score: 90,
    percentile: 95,
  },
  [TestTier.ADVANCED]: {
    score: 75,
    percentile: 80,
  },
  [TestTier.INTERMEDIATE]: {
    score: 60,
    percentile: 60,
  },
  [TestTier.BEGINNER]: {
    score: 0,
    percentile: 0,
  },
};

/**
 * Calculate tier based on test score and percentile
 *
 * @param score - Test score (0-100)
 * @param percentile - Percentile rank (0-100)
 * @returns TestTier enum value
 *
 * @example
 * calculateTier(92, 96) // Returns TestTier.ELITE
 * calculateTier(78, 82) // Returns TestTier.ADVANCED
 * calculateTier(65, 70) // Returns TestTier.INTERMEDIATE
 * calculateTier(45, 50) // Returns TestTier.BEGINNER
 */
export function calculateTier(score: number, percentile: number): TestTier {
  // Validate inputs
  if (typeof score !== "number" || score < 0 || score > 100) {
    throw new Error("Score must be a number between 0 and 100");
  }

  if (typeof percentile !== "number" || percentile < 0 || percentile > 100) {
    throw new Error("Percentile must be a number between 0 and 100");
  }

  // Check tiers in descending order (highest first)
  if (
    score >= TIER_THRESHOLDS[TestTier.ELITE].score &&
    percentile >= TIER_THRESHOLDS[TestTier.ELITE].percentile
  ) {
    return TestTier.ELITE;
  }

  if (
    score >= TIER_THRESHOLDS[TestTier.ADVANCED].score &&
    percentile >= TIER_THRESHOLDS[TestTier.ADVANCED].percentile
  ) {
    return TestTier.ADVANCED;
  }

  if (
    score >= TIER_THRESHOLDS[TestTier.INTERMEDIATE].score &&
    percentile >= TIER_THRESHOLDS[TestTier.INTERMEDIATE].percentile
  ) {
    return TestTier.INTERMEDIATE;
  }

  return TestTier.BEGINNER;
}

/**
 * Get tier description for display
 */
export function getTierDescription(tier: TestTier): string {
  const descriptions: Record<TestTier, string> = {
    [TestTier.ELITE]: "Top 5% of test takers. Exceptional skills and expertise.",
    [TestTier.ADVANCED]: "Top 20% of test takers. Strong skills and solid experience.",
    [TestTier.INTERMEDIATE]: "Top 40% of test takers. Good foundational skills.",
    [TestTier.BEGINNER]: "Entry level skills. Room for growth and development.",
  };

  return descriptions[tier];
}

/**
 * Get tier color for UI display
 */
export function getTierColor(tier: TestTier): string {
  const colors: Record<TestTier, string> = {
    [TestTier.ELITE]: "#7C3AED", // Purple
    [TestTier.ADVANCED]: "#059669", // Green
    [TestTier.INTERMEDIATE]: "#F59E0B", // Amber
    [TestTier.BEGINNER]: "#6B7280", // Gray
  };

  return colors[tier];
}

/**
 * Get tier emoji for display
 */
export function getTierEmoji(tier: TestTier): string {
  const emojis: Record<TestTier, string> = {
    [TestTier.ELITE]: "🏆",
    [TestTier.ADVANCED]: "⭐",
    [TestTier.INTERMEDIATE]: "📊",
    [TestTier.BEGINNER]: "🌱",
  };

  return emojis[tier];
}

/**
 * Get tier badge HTML for emails
 */
export function getTierBadgeHTML(tier: TestTier): string {
  const color = getTierColor(tier);
  const emoji = getTierEmoji(tier);

  return `
    <span style="
      display: inline-block;
      padding: 6px 12px;
      background: ${color}15;
      color: ${color};
      border: 1px solid ${color};
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
    ">
      ${emoji} ${tier}
    </span>
  `;
}

/**
 * Calculate percentile from score and distribution
 * If actual percentile is not provided by testing platform
 *
 * @param score - Candidate's score
 * @param allScores - Array of all scores in the distribution
 * @returns Percentile (0-100)
 */
export function calculatePercentileFromScores(
  score: number,
  allScores: number[]
): number {
  if (allScores.length === 0) {
    throw new Error("Cannot calculate percentile with empty score array");
  }

  // Count how many scores are below this score
  const belowCount = allScores.filter((s) => s < score).length;

  // Calculate percentile
  const percentile = (belowCount / allScores.length) * 100;

  return Math.round(percentile * 10) / 10; // Round to 1 decimal place
}

/**
 * Get next tier requirements for a candidate
 */
export function getNextTierRequirements(
  currentScore: number,
  currentPercentile: number
): {
  nextTier: TestTier | null;
  scoreGap: number;
  percentileGap: number;
  message: string;
} | null {
  const currentTier = calculateTier(currentScore, currentPercentile);

  // If already ELITE, no next tier
  if (currentTier === TestTier.ELITE) {
    return null;
  }

  // Determine next tier
  const tierOrder = [
    TestTier.BEGINNER,
    TestTier.INTERMEDIATE,
    TestTier.ADVANCED,
    TestTier.ELITE,
  ];

  const currentIndex = tierOrder.indexOf(currentTier);
  const nextTier = tierOrder[currentIndex + 1];

  if (!nextTier) {
    return null;
  }

  const nextThreshold = TIER_THRESHOLDS[nextTier];
  const scoreGap = Math.max(0, nextThreshold.score - currentScore);
  const percentileGap = Math.max(0, nextThreshold.percentile - currentPercentile);

  let message = `To reach ${nextTier} tier, you need`;
  const requirements = [];

  if (scoreGap > 0) {
    requirements.push(`+${scoreGap} points in score`);
  }

  if (percentileGap > 0) {
    requirements.push(`+${percentileGap} percentile points`);
  }

  if (requirements.length === 0) {
    message = `You're eligible for ${nextTier} tier! Your scores meet the requirements.`;
  } else {
    message += `: ${requirements.join(" and ")}.`;
  }

  return {
    nextTier,
    scoreGap,
    percentileGap,
    message,
  };
}

/**
 * Validate test result data
 */
export function validateTestResult(data: {
  score?: number;
  percentile?: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (data.score === undefined || data.score === null) {
    errors.push("Score is required");
  } else if (typeof data.score !== "number" || data.score < 0 || data.score > 100) {
    errors.push("Score must be a number between 0 and 100");
  }

  if (data.percentile === undefined || data.percentile === null) {
    errors.push("Percentile is required");
  } else if (
    typeof data.percentile !== "number" ||
    data.percentile < 0 ||
    data.percentile > 100
  ) {
    errors.push("Percentile must be a number between 0 and 100");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  TestTier,
  TIER_THRESHOLDS,
  calculateTier,
  getTierDescription,
  getTierColor,
  getTierEmoji,
  getTierBadgeHTML,
  calculatePercentileFromScores,
  getNextTierRequirements,
  validateTestResult,
};
