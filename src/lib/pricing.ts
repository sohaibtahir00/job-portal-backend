/**
 * Pricing utility for calculating placement fees based on salary tiers
 *
 * Tiered Pricing Structure:
 * - Junior/Mid-Level ($80k-$130k): 15%
 * - Senior ($130k-$170k): 18%
 * - Lead/Staff ($170k+): 20%
 */

export type PricingTier = 'JUNIOR_MID' | 'SENIOR' | 'LEAD_STAFF';

export interface PricingResult {
  tier: PricingTier;
  tierName: string;
  percentage: number;
  salary: number;
  placementFee: number; // Fee in dollars
  placementFeeCents: number; // Fee in cents for Stripe
  salaryRange: string;
}

const PRICING_TIERS = {
  JUNIOR_MID: {
    name: 'Junior/Mid-Level',
    percentage: 15,
    minSalary: 80000,
    maxSalary: 130000,
    range: '$80k-$130k',
  },
  SENIOR: {
    name: 'Senior',
    percentage: 18,
    minSalary: 130000,
    maxSalary: 170000,
    range: '$130k-$170k',
  },
  LEAD_STAFF: {
    name: 'Lead/Staff',
    percentage: 20,
    minSalary: 170000,
    maxSalary: Infinity,
    range: '$170k+',
  },
} as const;

/**
 * Calculate placement fee based on salary
 * @param salary - Annual salary in dollars
 * @returns PricingResult with tier, percentage, and calculated fee
 */
export function calculatePlacementFee(salary: number): PricingResult {
  if (salary < 0) {
    throw new Error('Salary must be a positive number');
  }

  // Default to JUNIOR_MID for very low salaries
  if (salary < PRICING_TIERS.JUNIOR_MID.minSalary) {
    const tier = PRICING_TIERS.JUNIOR_MID;
    const placementFee = salary * (tier.percentage / 100);

    return {
      tier: 'JUNIOR_MID',
      tierName: tier.name,
      percentage: tier.percentage,
      salary,
      placementFee,
      placementFeeCents: Math.round(placementFee * 100),
      salaryRange: tier.range,
    };
  }

  // Determine tier based on salary
  let selectedTier: typeof PRICING_TIERS.JUNIOR_MID;
  let tierKey: PricingTier;

  if (salary >= PRICING_TIERS.LEAD_STAFF.minSalary) {
    selectedTier = PRICING_TIERS.LEAD_STAFF;
    tierKey = 'LEAD_STAFF';
  } else if (salary >= PRICING_TIERS.SENIOR.minSalary) {
    selectedTier = PRICING_TIERS.SENIOR;
    tierKey = 'SENIOR';
  } else {
    selectedTier = PRICING_TIERS.JUNIOR_MID;
    tierKey = 'JUNIOR_MID';
  }

  const placementFee = salary * (selectedTier.percentage / 100);

  return {
    tier: tierKey,
    tierName: selectedTier.name,
    percentage: selectedTier.percentage,
    salary,
    placementFee,
    placementFeeCents: Math.round(placementFee * 100),
    salaryRange: selectedTier.range,
  };
}

/**
 * Calculate placement fee for a salary range (uses midpoint)
 * @param salaryMin - Minimum salary in dollars
 * @param salaryMax - Maximum salary in dollars
 * @returns PricingResult based on midpoint of range
 */
export function calculatePlacementFeeForRange(
  salaryMin: number,
  salaryMax: number
): PricingResult {
  if (salaryMin < 0 || salaryMax < 0) {
    throw new Error('Salaries must be positive numbers');
  }

  if (salaryMin > salaryMax) {
    throw new Error('Minimum salary cannot be greater than maximum salary');
  }

  const midpointSalary = (salaryMin + salaryMax) / 2;
  return calculatePlacementFee(midpointSalary);
}

/**
 * Get all pricing tiers information
 * @returns Array of all pricing tiers
 */
export function getAllPricingTiers() {
  return [
    {
      tier: 'JUNIOR_MID' as PricingTier,
      name: PRICING_TIERS.JUNIOR_MID.name,
      percentage: PRICING_TIERS.JUNIOR_MID.percentage,
      range: PRICING_TIERS.JUNIOR_MID.range,
      minSalary: PRICING_TIERS.JUNIOR_MID.minSalary,
      maxSalary: PRICING_TIERS.JUNIOR_MID.maxSalary,
    },
    {
      tier: 'SENIOR' as PricingTier,
      name: PRICING_TIERS.SENIOR.name,
      percentage: PRICING_TIERS.SENIOR.percentage,
      range: PRICING_TIERS.SENIOR.range,
      minSalary: PRICING_TIERS.SENIOR.minSalary,
      maxSalary: PRICING_TIERS.SENIOR.maxSalary,
    },
    {
      tier: 'LEAD_STAFF' as PricingTier,
      name: PRICING_TIERS.LEAD_STAFF.name,
      percentage: PRICING_TIERS.LEAD_STAFF.percentage,
      range: PRICING_TIERS.LEAD_STAFF.range,
      minSalary: PRICING_TIERS.LEAD_STAFF.minSalary,
      maxSalary: PRICING_TIERS.LEAD_STAFF.maxSalary,
    },
  ];
}

/**
 * Calculate split payments (50% upfront, 50% after 30 days)
 * @param placementFeeCents - Total placement fee in cents
 * @returns Object with upfront and remaining amounts in cents
 */
export function calculateSplitPayment(placementFeeCents: number) {
  const upfrontAmount = Math.round(placementFeeCents / 2);
  const remainingAmount = placementFeeCents - upfrontAmount;

  return {
    upfrontAmount,
    remainingAmount,
    total: placementFeeCents,
  };
}
