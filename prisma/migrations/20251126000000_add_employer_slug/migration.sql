-- Add slug field to Employer table
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "slug" VARCHAR(255);

-- Create unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS "Employer_slug_key" ON "Employer"("slug");

-- Generate slugs for existing employers based on company name
UPDATE "Employer"
SET "slug" = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REPLACE(TRIM("companyName"), ' ', '-'),
      '[^a-zA-Z0-9-]', '', 'g'
    ),
    '-+', '-', 'g'
  )
) || '-' || SUBSTRING("id" FROM 1 FOR 8)
WHERE "slug" IS NULL AND "companyName" IS NOT NULL;
