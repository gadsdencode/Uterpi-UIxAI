/**
 * Setup Admin User Script
 * Creates an admin user with full access override
 * Run with: npx tsx server/setup-admin.ts
 */

import { db } from './db';
import { users } from '@shared/schema';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

async function setupAdminUser() {
  const adminEmail = 'admin@uterpi.com';
  const adminUsername = 'admin';
  const adminPassword = 'abc3abcabcabc';

  console.log('🔧 Setting up admin user...');

  try {
    // Check if admin user already exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    if (existingUser.length > 0) {
      console.log('✅ Admin user already exists, updating with admin override...');
      
      // Update existing user with admin privileges
      await db.update(users)
        .set({
          accessOverride: true,
          overrideReason: 'Admin account for CTO interview',
          overrideGrantedAt: new Date(),
          subscriptionTier: 'pro', // Set to pro tier to ensure full features
          subscriptionStatus: 'active',
          messages_used_this_month: 0,
          ai_credits_balance: 999999, // Give unlimited credits
          updatedAt: new Date()
        })
        .where(eq(users.id, existingUser[0].id));

      console.log('✅ Admin user updated successfully!');
    } else {
      console.log('📝 Creating new admin user...');
      
      // Hash the password
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      
      // Create new admin user
      const newUser = await db.insert(users).values({
        email: adminEmail,
        username: adminUsername,
        password: passwordHash,
        emailVerified: true,
        accessOverride: true,
        overrideReason: 'Admin account for CTO interview',
        overrideGrantedAt: new Date(),
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
        messages_used_this_month: 0,
        ai_credits_balance: 999999,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();

      console.log('✅ Admin user created successfully!');
      console.log('User ID:', newUser[0].id);
    }

    console.log('\n📋 Admin User Details:');
    console.log('Email:', adminEmail);
    console.log('Username:', adminUsername);
    console.log('Password:', adminPassword);
    console.log('Access Override: Enabled');
    console.log('AI Credits: Unlimited');
    console.log('\n✨ Admin user is ready for use!');

  } catch (error) {
    console.error('❌ Error setting up admin user:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the setup
setupAdminUser();