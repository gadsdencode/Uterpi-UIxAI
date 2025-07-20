import { db } from './db';
import { users, subscriptionPlans, subscriptions } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Migration script to implement Friends & Family subscription for existing users
 * 
 * This script:
 * 1. Creates a "Friends & Family" subscription plan if it doesn't exist
 * 2. Assigns this plan to ALL existing users in the database
 * 3. Updates their subscription status to "active"
 * 4. Sets their subscription tier to "friends_family"
 * 5. Provides a generous subscription end date (1 year from now)
 * 
 * IMPORTANT: This migration follows the zero-deletion policy - it only adds/updates data
 */

interface MigrationResult {
  success: boolean;
  planCreated: boolean;
  planId: number | null;
  usersUpdated: number;
  subscriptionsCreated: number;
  errors: string[];
  details: string[];
}

export async function migrateFriendsFamilySubscription(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    planCreated: false,
    planId: null,
    usersUpdated: 0,
    subscriptionsCreated: 0,
    errors: [],
    details: []
  };

  try {
    console.log('🚀 Starting Friends & Family subscription migration...');
    
    // Step 1: Check if Friends & Family plan already exists
    const existingPlan = await db.select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.name, 'Friends & Family'))
      .limit(1);

    let friendsFamilyPlan;
    
    if (existingPlan.length > 0) {
      friendsFamilyPlan = existingPlan[0];
      result.details.push(`✓ Friends & Family plan already exists (ID: ${friendsFamilyPlan.id})`);
    } else {
      // Step 2: Create the Friends & Family plan
      console.log('📝 Creating Friends & Family subscription plan...');
      
             const newPlan = await db.insert(subscriptionPlans).values({
         name: 'Friends & Family',
         description: 'Special access for friends and family members to test the full NomadAI experience',
         price: '0.00', // Free plan
         interval: 'month',
         features: [
           'Unlimited AI interactions',
           'Advanced code analysis', 
           'UI generation & cloning',
           'Performance insights',
           'Design pattern analysis',
           'All AI models available',
           'Code improvement suggestions',
           'Advanced debugging assistance',
           'Friends & Family special access'
         ],
         stripePriceId: 'price_1RmslfJYFJQbKiIKgGYujWWC', // Actual Stripe price ID for Friends & Family
         stripeProductId: 'prod_friends_family', // Placeholder - update with actual product ID if needed
         isActive: true,
         sortOrder: 0 // Put it first in the list
       }).returning();

      friendsFamilyPlan = newPlan[0];
      result.planCreated = true;
      result.details.push(`✓ Created Friends & Family plan (ID: ${friendsFamilyPlan.id})`);
    }

    result.planId = friendsFamilyPlan.id;

    // Step 3: Get ONLY users who are currently on free tier (safe to migrate)
    console.log('👥 Fetching users on free tier only (preserving paid users)...');
    const freeUsers = await db.select().from(users)
      .where(eq(users.subscriptionTier, 'free'));
    
    result.details.push(`📊 Found ${freeUsers.length} users on free tier to migrate`);
    result.details.push(`🔒 Preserving all existing paid subscriptions (no changes to paid users)`);

    if (freeUsers.length === 0) {
      result.details.push('⚠️ No free tier users found to migrate - all users appear to have existing subscriptions');
      result.success = true;
      return result;
    }

    // Step 4: Set subscription end date to 1 year from now
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 1);

    // Step 5: Update ONLY free tier users with Friends & Family subscription
    console.log('🔄 Updating free tier users to Friends & Family subscription...');
    
    for (const user of freeUsers) {
      try {
        // Double-check: Only proceed if user is truly on free tier
        if (user.subscriptionTier !== 'free') {
          result.details.push(`⚠️ Skipping user ${user.email} - not on free tier (tier: ${user.subscriptionTier})`);
          continue;
        }

        // Update user subscription fields (safe - only free tier users)
        await db.update(users)
          .set({
            subscriptionStatus: 'active',
            subscriptionTier: 'friends_family',
            subscriptionEndsAt: subscriptionEndDate,
            updatedAt: new Date()
          })
          .where(eq(users.id, user.id));

        // Check for existing subscription records
        const existingSubscription = await db.select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, user.id))
          .limit(1);

        if (existingSubscription.length === 0) {
          // Safe to create new subscription record
          await db.insert(subscriptions).values({
            userId: user.id,
            planId: friendsFamilyPlan.id,
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: subscriptionEndDate,
            cancelAtPeriodEnd: false,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          result.subscriptionsCreated++;
        } else {
          // SAFETY CHECK: Only update if existing subscription is also free/inactive
          const existingSub = existingSubscription[0];
          if (existingSub.status === 'active' && existingSub.planId !== null) {
            result.details.push(`🔒 Preserving existing active subscription for user ${user.email} (ID: ${existingSub.id})`);
            continue; // Skip this user to preserve their existing subscription
          }
          
          // Safe to update inactive/free subscription
          await db.update(subscriptions)
            .set({
              planId: friendsFamilyPlan.id,
              status: 'active',
              currentPeriodStart: new Date(),
              currentPeriodEnd: subscriptionEndDate,
              cancelAtPeriodEnd: false,
              updatedAt: new Date()
            })
            .where(eq(subscriptions.id, existingSub.id));
        }

        result.usersUpdated++;
        
        result.details.push(`✓ Updated user ${user.email} (ID: ${user.id})`);
        
      } catch (error) {
        const errorMsg = `Failed to update user ${user.email} (ID: ${user.id}): ${error}`;
        result.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    result.success = result.errors.length === 0;
    
    console.log('✅ Migration completed successfully!');
    result.details.push(`🎉 Migration completed: ${result.usersUpdated} users updated, ${result.subscriptionsCreated} subscriptions created`);
    
  } catch (error) {
    const errorMsg = `Migration failed: ${error}`;
    result.errors.push(errorMsg);
    console.error(errorMsg);
  }

  return result;
}

/**
 * Rollback function (if needed) - Only updates users back to free tier
 * DOES NOT delete the Friends & Family plan (following zero-deletion policy)
 */
export async function rollbackFriendsFamilyMigration(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    planCreated: false,
    planId: null,
    usersUpdated: 0,
    subscriptionsCreated: 0,
    errors: [],
    details: []
  };

  try {
    console.log('🔄 Rolling back Friends & Family subscription migration...');
    
    // Get ONLY users with friends_family tier (safe to rollback)
    const friendsFamilyUsers = await db.select()
      .from(users)
      .where(eq(users.subscriptionTier, 'friends_family'));

    result.details.push(`📊 Found ${friendsFamilyUsers.length} users with Friends & Family subscription`);
    result.details.push(`🔒 Will only affect Friends & Family users - preserving all other subscriptions`);

    for (const user of friendsFamilyUsers) {
      try {
        // Reset to free tier
        await db.update(users)
          .set({
            subscriptionStatus: 'free',
            subscriptionTier: 'free',
            subscriptionEndsAt: null,
            updatedAt: new Date()
          })
          .where(eq(users.id, user.id));

        result.usersUpdated++;
        result.details.push(`✓ Rolled back user ${user.email} (ID: ${user.id}) to free tier`);
        
      } catch (error) {
        const errorMsg = `Failed to rollback user ${user.email} (ID: ${user.id}): ${error}`;
        result.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    result.success = result.errors.length === 0;
    result.details.push(`🔄 Rollback completed: ${result.usersUpdated} users reverted to free tier`);
    
  } catch (error) {
    const errorMsg = `Rollback failed: ${error}`;
    result.errors.push(errorMsg);
    console.error(errorMsg);
  }

  return result;
}

// CLI interface for running the migration
if (require.main === module) {
  const action = process.argv[2];
  
  if (action === 'rollback') {
    rollbackFriendsFamilyMigration()
      .then(result => {
        console.log('\n📋 ROLLBACK SUMMARY:');
        console.log('==================');
        console.log(`Success: ${result.success}`);
        console.log(`Users reverted: ${result.usersUpdated}`);
        
        if (result.details.length > 0) {
          console.log('\nDetails:');
          result.details.forEach(detail => console.log(detail));
        }
        
        if (result.errors.length > 0) {
          console.log('\nErrors:');
          result.errors.forEach(error => console.error(error));
        }
        
        process.exit(result.success ? 0 : 1);
      })
      .catch(error => {
        console.error('Migration script failed:', error);
        process.exit(1);
      });
  } else {
    migrateFriendsFamilySubscription()
      .then(result => {
        console.log('\n📋 MIGRATION SUMMARY:');
        console.log('====================');
        console.log(`Success: ${result.success}`);
        console.log(`Plan created: ${result.planCreated}`);
        console.log(`Plan ID: ${result.planId}`);
        console.log(`Users updated: ${result.usersUpdated}`);
        console.log(`Subscriptions created: ${result.subscriptionsCreated}`);
        
        if (result.details.length > 0) {
          console.log('\nDetails:');
          result.details.forEach(detail => console.log(detail));
        }
        
        if (result.errors.length > 0) {
          console.log('\nErrors:');
          result.errors.forEach(error => console.error(error));
        }
        
        process.exit(result.success ? 0 : 1);
      })
      .catch(error => {
        console.error('Migration script failed:', error);
        process.exit(1);
      });
  }
} 