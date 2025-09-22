/**
 * Grandfather Users Migration
 * Migrates existing users to the new subscription tier system while preserving their benefits
 */

import { db } from './db';
import { users, subscriptionPlans, subscriptions, aiCreditsTransactions, subscriptionFeatures } from '@shared/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';

interface MigrationResult {
  success: boolean;
  usersProcessed: number;
  errors: string[];
  details: {
    freeToFree: number;
    nomadAIProToPro: number;
    friendsFamilyToPro: number;
    enterpriseToEnterprise: number;
    failed: number;
  };
}

/**
 * Main migration function to grandfather existing users
 */
export async function grandfatherExistingUsers(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    usersProcessed: 0,
    errors: [],
    details: {
      freeToFree: 0,
      nomadAIProToPro: 0,
      friendsFamilyToPro: 0,
      enterpriseToEnterprise: 0,
      failed: 0
    }
  };

  try {
    console.log('🔄 Starting grandfather migration for existing users...');
    
    // Begin transaction
    await db.transaction(async (tx) => {
      // Step 1: Get all existing users
      const allUsers = await tx.select().from(users);
      console.log(`📊 Found ${allUsers.length} total users to process`);

      for (const user of allUsers) {
        try {
          const currentTier = user.subscriptionTier || 'free';
          let newTier = 'free';
          let grantCredits = 0;
          let shouldGrandfather = false;

          // Determine new tier based on current subscription
          switch (currentTier.toLowerCase()) {
            case 'free':
              // Free users migrate to freemium tier
              newTier = 'freemium';
              grantCredits = 0; // Freemium gets 10 messages, no credits
              result.details.freeToFree++;
              break;

            case 'nomadai pro':
            case 'premium':
            case 'basic':
              // NomadAI Pro ($5/month) users get grandfathered to Pro tier ($19 value)
              newTier = 'pro';
              grantCredits = 1000; // Pro tier credits
              shouldGrandfather = true;
              result.details.nomadAIProToPro++;
              console.log(`✨ Grandfathering user ${user.email} from NomadAI Pro to Pro tier`);
              break;

            case 'friends & family':
            case 'friends_family':
              // Friends & Family get grandfathered to Pro tier with special flag
              newTier = 'pro';
              grantCredits = 1000; // Pro tier credits
              shouldGrandfather = true;
              result.details.friendsFamilyToPro++;
              console.log(`🎁 Grandfathering Friends & Family user ${user.email} to Pro tier`);
              break;

            case 'enterprise':
              // Enterprise users get upgraded to new Enterprise tier
              newTier = 'enterprise';
              grantCredits = 999999; // Effectively unlimited
              shouldGrandfather = true;
              result.details.enterpriseToEnterprise++;
              console.log(`🏢 Migrating Enterprise user ${user.email} to new Enterprise tier`);
              break;

            default:
              console.warn(`⚠️ Unknown tier '${currentTier}' for user ${user.email}, defaulting to free`);
              newTier = 'free';
              grantCredits = 100;
              result.details.freeToFree++;
          }

          // Update user record
          await tx.update(users)
            .set({
              subscriptionTier: newTier,
              ai_credits_balance: grantCredits,
              ai_credits_used_this_month: 0,
              credits_reset_at: new Date(),
              is_grandfathered: shouldGrandfather,
              grandfathered_from_tier: shouldGrandfather ? currentTier : null,
              grandfathered_at: shouldGrandfather ? new Date() : null,
              updatedAt: new Date()
            })
            .where(eq(users.id, user.id));

          // Create initial credits transaction
          await tx.insert(aiCreditsTransactions).values({
            userId: user.id,
            transactionType: shouldGrandfather ? 'bonus' : 'monthly_reset',
            amount: grantCredits,
            balanceAfter: grantCredits,
            description: shouldGrandfather 
              ? `Grandfathered from ${currentTier} to ${newTier} tier with bonus credits`
              : `Initial credits allocation for ${newTier} tier`,
            metadata: {
              migration: 'grandfather_users',
              previousTier: currentTier,
              newTier: newTier,
              isGrandfathered: shouldGrandfather
            }
          });

          // Update subscription record if exists
          if (user.stripeCustomerId) {
            const userSubscriptions = await tx.select()
              .from(subscriptions)
              .where(eq(subscriptions.userId, user.id))
              .limit(1);

            if (userSubscriptions.length > 0) {
              const subscription = userSubscriptions[0];
              
              // For grandfathered paid users, maintain their original price
              if (shouldGrandfather && subscription.status === 'active') {
                // Add metadata to track grandfathered pricing
                await tx.update(subscriptions)
                  .set({
                    metadata: {
                      ...subscription.metadata,
                      isGrandfathered: true,
                      originalTier: currentTier,
                      originalPrice: currentTier === 'nomadai pro' ? '5.00' : 
                                   currentTier === 'enterprise' ? '25.00' : '0.00',
                      grandfatheredAt: new Date().toISOString()
                    },
                    updatedAt: new Date()
                  })
                  .where(eq(subscriptions.id, subscription.id));
              }
            }
          }

          result.usersProcessed++;

        } catch (userError) {
          console.error(`❌ Error processing user ${user.email}:`, userError);
          result.errors.push(`Failed to process user ${user.email}: ${userError}`);
          result.details.failed++;
        }
      }

      // Step 2: Create special pricing entries for grandfathered users
      // This allows them to keep their original pricing
      console.log('💰 Creating special pricing rules for grandfathered users...');
      
      // Create a special "Grandfathered Pro" plan for $5/month users
      const existingGrandfatheredPlan = await tx.select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.name, 'Grandfathered Pro'))
        .limit(1);

      if (existingGrandfatheredPlan.length === 0) {
        await tx.insert(subscriptionPlans).values({
          name: 'Grandfathered Pro',
          description: 'Special pricing for early adopters - Pro features at original price',
          price: '5.00', // Original NomadAI Pro price
          interval: 'month',
          features: [
            'All Pro tier features',
            'Unlimited Chat & AI Providers',
            '1,000 AI Credits/month',
            'Full-Codebase Context',
            'Git Integration', 
            '10 AI Code Reviews/month',
            'Grandfathered pricing - Thank you for being an early supporter!'
          ],
          stripePriceId: 'price_grandfathered_pro', // Use existing Stripe price ID if possible
          stripeProductId: 'prod_grandfathered',
          isActive: false, // Not available for new signups
          sortOrder: 999 // Hidden from regular pricing page
        });
      }

      console.log('✅ Grandfather migration completed successfully!');
      result.success = true;
    });

  } catch (error) {
    console.error('❌ Grandfather migration failed:', error);
    result.errors.push(`Migration failed: ${error}`);
    result.success = false;
  }

  // Print summary
  console.log('\n📊 Migration Summary:');
  console.log(`Total users processed: ${result.usersProcessed}`);
  console.log(`Free → Free: ${result.details.freeToFree}`);
  console.log(`NomadAI Pro → Pro (grandfathered): ${result.details.nomadAIProToPro}`);
  console.log(`Friends & Family → Pro (grandfathered): ${result.details.friendsFamilyToPro}`);
  console.log(`Enterprise → Enterprise: ${result.details.enterpriseToEnterprise}`);
  console.log(`Failed: ${result.details.failed}`);
  
  if (result.errors.length > 0) {
    console.log('\n⚠️ Errors encountered:');
    result.errors.forEach(err => console.log(`  - ${err}`));
  }

  return result;
}

/**
 * Verify grandfather status for a user
 */
export async function verifyGrandfatherStatus(userId: number): Promise<{
  isGrandfathered: boolean;
  originalTier?: string;
  currentTier?: string;
  specialPricing?: boolean;
}> {
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  
  if (!user[0]) {
    return { isGrandfathered: false };
  }

  const userData = user[0];
  
  return {
    isGrandfathered: userData.is_grandfathered || false,
    originalTier: userData.grandfathered_from_tier || undefined,
    currentTier: userData.subscriptionTier || undefined,
    specialPricing: userData.is_grandfathered && 
                   (userData.grandfathered_from_tier === 'nomadai pro' || 
                    userData.grandfathered_from_tier === 'friends_family')
  };
}

// Run migration if this file is executed directly
if (require.main === module) {
  grandfatherExistingUsers()
    .then(result => {
      console.log('\n✨ Migration completed!');
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error during migration:', error);
      process.exit(1);
    });
}
