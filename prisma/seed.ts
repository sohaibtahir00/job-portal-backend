/**
 * Prisma Seed Script
 * Creates initial admin user for the platform
 * Run with: npx prisma db seed
 */

import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Admin user credentials
  const adminEmail = 'admin@jobportal.com';
  const adminPassword = 'Admin@123';
  const adminName = 'Admin User';

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log('✅ Admin user already exists');
    console.log(`📧 Email: ${adminEmail}`);

    // Update to admin role if not already
    if (existingAdmin.role !== UserRole.ADMIN) {
      await prisma.user.update({
        where: { email: adminEmail },
        data: { role: UserRole.ADMIN },
      });
      console.log('✅ Updated existing user to ADMIN role\n');
    }
  } else {
    // Create admin user
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: adminName,
        role: UserRole.ADMIN,
        status: 'ACTIVE',
      },
    });

    console.log('✅ Admin user created successfully!');
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}\n`);
  }

  console.log('🎉 Database seed completed!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
