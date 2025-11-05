import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
}

// Initialize Stripe with your secret key
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-10-29.clover",
  typescript: true,
});

/**
 * Stripe configuration and constants
 */
export const STRIPE_CONFIG = {
  // Currency
  currency: "usd",

  // Placement fee structure (50% upfront, 50% after 30 days)
  placementFee: {
    upfrontPercentage: 0.5, // 50%
    remainingPercentage: 0.5, // 50%
    remainingDueDays: 30, // Days until second payment due
  },

  // Webhook configuration
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
};

/**
 * Calculate placement fee amounts
 * @param baseFee - Base placement fee amount in cents
 * @returns Object with upfront and remaining amounts
 */
export function calculatePlacementFeeAmounts(baseFee: number) {
  const upfrontAmount = Math.round(baseFee * STRIPE_CONFIG.placementFee.upfrontPercentage);
  const remainingAmount = baseFee - upfrontAmount;

  return {
    upfrontAmount,
    remainingAmount,
    totalAmount: baseFee,
  };
}

/**
 * Calculate placement fee from salary
 * Typical placement fee is 15-25% of first year salary
 * @param annualSalary - Annual salary in cents
 * @param feePercentage - Fee percentage (default 20%)
 * @returns Placement fee in cents
 */
export function calculatePlacementFee(annualSalary: number, feePercentage: number = 20): number {
  return Math.round(annualSalary * (feePercentage / 100));
}

/**
 * Format amount from cents to dollar string
 * @param amountInCents - Amount in cents
 * @returns Formatted string like "$1,234.56"
 */
export function formatCurrency(amountInCents: number): string {
  const dollars = amountInCents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: STRIPE_CONFIG.currency.toUpperCase(),
  }).format(dollars);
}
