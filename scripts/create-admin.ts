/**
 * Quick script to create an admin user
 * Run from backend folder with: npx tsx scripts/create-admin.ts
 */

import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    console.log('🔧 Creating admin user...\n');

    const email = 'admin@jobportal.com';
    const password = 'Admin@123'; // Change this after first login
    const name = 'Admin User';

    // Check if admin already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      if (existing.role === UserRole.ADMIN) {
        console.log('✅ Admin user already exists!');
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 Password: ${password}`);
        console.log(`🔗 Login at: http://localhost:3000/login`);
        console.log(`🔗 Admin Dashboard: http://localhost:3000/admin\n`);
        return;
      } else {
        // Update existing user to admin
        await prisma.user.update({
          where: { email },
          data: { role: UserRole.ADMIN },
        });
        console.log('✅ Existing user updated to ADMIN role!');
        console.log(`📧 Email: ${email}`);
        console.log(`🔗 Login at: http://localhost:3000/login`);
        console.log(`🔗 Admin Dashboard: http://localhost:3000/admin\n`);
        return;
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: UserRole.ADMIN,
        status: 'ACTIVE',
      },
    });

    console.log('✅ Admin user created successfully!\n');
    console.log('📋 Login Credentials:');
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${password}`);
    console.log(`\n🔗 Login URL: http://localhost:3000/login`);
    console.log(`🔗 Admin Dashboard: http://localhost:3000/admin`);
    console.log(`\n⚠️  IMPORTANT: Change the password after first login!\n`);

  } catch (error) {
    console.error('❌ Error creating admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
