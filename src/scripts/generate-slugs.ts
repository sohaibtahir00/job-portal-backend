/**
 * Migration script to generate slugs for existing employers
 * Run with: npx tsx src/scripts/generate-slugs.ts
 */

import { PrismaClient } from '@prisma/client';
import { generateSlug, generateUniqueSlug } from '../lib/slug';

const prisma = new PrismaClient();

async function generateSlugsForEmployers() {
  console.log('Starting slug generation for employers...');

  // Get all employers without slugs
  const employers = await prisma.employer.findMany({
    where: {
      slug: null,
    },
    select: {
      id: true,
      companyName: true,
    },
  });

  console.log(`Found ${employers.length} employers without slugs`);

  // Get all existing slugs
  const existingSlugsResult = await prisma.employer.findMany({
    where: {
      slug: {
        not: null,
      },
    },
    select: {
      slug: true,
    },
  });

  const existingSlugs = existingSlugsResult.map((e) => e.slug!);

  let updated = 0;
  let errors = 0;

  for (const employer of employers) {
    try {
      const baseSlug = generateSlug(employer.companyName);
      const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);

      await prisma.employer.update({
        where: { id: employer.id },
        data: { slug: uniqueSlug },
      });

      // Add to existing slugs to prevent duplicates
      existingSlugs.push(uniqueSlug);

      console.log(`✓ ${employer.companyName} → ${uniqueSlug}`);
      updated++;
    } catch (error) {
      console.error(`✗ Failed to update ${employer.companyName}:`, error);
      errors++;
    }
  }

  console.log(`\nSlug generation complete:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Errors: ${errors}`);
}

// Run the script
generateSlugsForEmployers()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
