-- AlterEnum
ALTER TYPE "PlacementStatus" ADD VALUE IF NOT EXISTS 'REPLACEMENT_REQUESTED';
ALTER TYPE "PlacementStatus" ADD VALUE IF NOT EXISTS 'SEEKING_REPLACEMENT';
ALTER TYPE "PlacementStatus" ADD VALUE IF NOT EXISTS 'REPLACED';

-- AlterTable
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "replacementRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "replacementRequestedAt" TIMESTAMP(3);
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "replacementReason" TEXT;
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "replacementLastDayWorked" TIMESTAMP(3);
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "replacementDaysWorked" INTEGER;
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "replacementApproved" BOOLEAN;
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "replacementReviewedAt" TIMESTAMP(3);
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "replacementReviewedBy" TEXT;
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "replacementNotes" TEXT;
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "refundAmount" INTEGER DEFAULT 0;
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "refundProcessed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "refundProcessedAt" TIMESTAMP(3);
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "refundStripeId" TEXT;
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "refundMethod" TEXT;
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "replacesPlacementId" TEXT;
ALTER TABLE "Placement" ADD COLUMN IF NOT EXISTS "replacedByPlacementId" TEXT;

-- Add foreign key constraints for replacement links
ALTER TABLE "Placement" DROP CONSTRAINT IF EXISTS "Placement_replacesPlacementId_fkey";
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_replacesPlacementId_fkey"
  FOREIGN KEY ("replacesPlacementId") REFERENCES "Placement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
