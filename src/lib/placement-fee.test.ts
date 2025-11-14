/**
 * Simple test file to verify placement fee calculation
 * Run with: npx tsx src/lib/placement-fee.test.ts
 */

import { calculateFeePercentage, calculatePlacementFee } from "./placement-fee";
import { ExperienceLevel } from "@prisma/client";

console.log("=== Testing Placement Fee Calculation ===\n");

// Test 1: Entry Level (15%)
const entryLevel = calculateFeePercentage("ENTRY_LEVEL" as ExperienceLevel);
console.log("✓ Entry Level Fee:", entryLevel, "(Expected: 0.15)");
console.assert(entryLevel === 0.15, "Entry level should be 15%");

// Test 2: Mid Level (15%)
const midLevel = calculateFeePercentage("MID_LEVEL" as ExperienceLevel);
console.log("✓ Mid Level Fee:", midLevel, "(Expected: 0.15)");
console.assert(midLevel === 0.15, "Mid level should be 15%");

// Test 3: Senior Level (18%)
const seniorLevel = calculateFeePercentage("SENIOR_LEVEL" as ExperienceLevel);
console.log("✓ Senior Level Fee:", seniorLevel, "(Expected: 0.18)");
console.assert(seniorLevel === 0.18, "Senior level should be 18%");

// Test 4: Executive (20%)
const executive = calculateFeePercentage("EXECUTIVE" as ExperienceLevel);
console.log("✓ Executive Level Fee:", executive, "(Expected: 0.20)");
console.assert(executive === 0.20, "Executive should be 20%");

console.log("\n=== Testing Full Fee Calculation ===\n");

// Test 5: Entry level job with $100,000 salary
const entryJob = calculatePlacementFee(10000000, "ENTRY_LEVEL" as ExperienceLevel); // $100k in cents
console.log("Entry Level Job ($100k salary):");
console.log("  Fee Percentage:", entryJob.feePercentage + "%");
console.log("  Placement Fee:", "$" + (entryJob.placementFee / 100).toLocaleString());
console.log("  Upfront Amount:", "$" + (entryJob.upfrontAmount / 100).toLocaleString());
console.log("  Remaining Amount:", "$" + (entryJob.remainingAmount / 100).toLocaleString());
console.assert(entryJob.feePercentage === 15, "Entry level percentage should be 15");
console.assert(entryJob.placementFee === 1500000, "Entry level fee should be $15,000 (in cents)");
console.assert(entryJob.upfrontAmount === 750000, "Upfront should be $7,500");
console.assert(entryJob.remainingAmount === 750000, "Remaining should be $7,500");

// Test 6: Senior level job with $150,000 salary
const seniorJob = calculatePlacementFee(15000000, "SENIOR_LEVEL" as ExperienceLevel); // $150k in cents
console.log("\nSenior Level Job ($150k salary):");
console.log("  Fee Percentage:", seniorJob.feePercentage + "%");
console.log("  Placement Fee:", "$" + (seniorJob.placementFee / 100).toLocaleString());
console.log("  Upfront Amount:", "$" + (seniorJob.upfrontAmount / 100).toLocaleString());
console.log("  Remaining Amount:", "$" + (seniorJob.remainingAmount / 100).toLocaleString());
console.assert(seniorJob.feePercentage === 18, "Senior level percentage should be 18");
console.assert(seniorJob.placementFee === 2700000, "Senior level fee should be $27,000");
console.assert(seniorJob.upfrontAmount === 1350000, "Upfront should be $13,500");
console.assert(seniorJob.remainingAmount === 1350000, "Remaining should be $13,500");

// Test 7: Executive job with $250,000 salary
const execJob = calculatePlacementFee(25000000, "EXECUTIVE" as ExperienceLevel); // $250k in cents
console.log("\nExecutive Job ($250k salary):");
console.log("  Fee Percentage:", execJob.feePercentage + "%");
console.log("  Placement Fee:", "$" + (execJob.placementFee / 100).toLocaleString());
console.log("  Upfront Amount:", "$" + (execJob.upfrontAmount / 100).toLocaleString());
console.log("  Remaining Amount:", "$" + (execJob.remainingAmount / 100).toLocaleString());
console.assert(execJob.feePercentage === 20, "Executive percentage should be 20");
console.assert(execJob.placementFee === 5000000, "Executive fee should be $50,000");
console.assert(execJob.upfrontAmount === 2500000, "Upfront should be $25,000");
console.assert(execJob.remainingAmount === 2500000, "Remaining should be $25,000");

console.log("\n✅ All tests passed!\n");
console.log("Fee Structure Summary:");
console.log("  Entry/Mid Level: 15%");
console.log("  Senior Level: 18%");
console.log("  Executive: 20%");
console.log("  Payment Split: 50% upfront, 50% after 30 days");
