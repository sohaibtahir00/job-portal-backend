-- Manual Migration: Add Google Calendar Integration
-- Generated: 2025-01-20
-- Description: Adds google_calendar_integrations table for Google Calendar OAuth integration

-- Create google_calendar_integrations table
CREATE TABLE IF NOT EXISTS "google_calendar_integrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employerId" TEXT NOT NULL UNIQUE,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "showBusyTimes" BOOLEAN NOT NULL DEFAULT true,
    "blockSlots" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_integrations_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create index on employerId
CREATE INDEX IF NOT EXISTS "google_calendar_integrations_employerId_idx" ON "google_calendar_integrations"("employerId");

-- Verify migration
SELECT 'Migration completed successfully!' as status;
