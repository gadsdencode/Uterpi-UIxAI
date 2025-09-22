import dotenv from 'dotenv';
import { migrateFriendsFamilySubscription } from './friends-family-migration';

// Load environment variables
dotenv.config();

/**
 * Execute the Friends & Family subscription migration
 * This script safely migrates all existing users to the Friends & Family plan
 */
async function runMigration() {
  console.log('🚀 Starting Friends & Family Subscription Migration');
  console.log('===================================================');
  console.log('This migration will:');
  console.log('1. Create a "Friends & Family" subscription plan (if not exists)');
  console.log('2. Grant all existing users active Friends & Family subscriptions');
  console.log('3. Set subscription expiry to 1 year from now');
  console.log('4. Enable full access to all AI features for testing\n');

  try {
    // Check if we have database connection
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    console.log('✓ Database URL configured');
    console.log('✓ Starting migration process...\n');

    const result = await migrateFriendsFamilySubscription();

    console.log('\n📋 MIGRATION RESULTS:');
    console.log('=====================');
    console.log(`✅ Success: ${result.success}`);
    console.log(`📦 Plan created: ${result.planCreated}`);
    console.log(`🆔 Plan ID: ${result.planId}`);
    console.log(`👤 Users updated: ${result.usersUpdated}`);
    console.log(`📋 Subscriptions created: ${result.subscriptionsCreated}`);

    if (result.details.length > 0) {
      console.log('\n📝 DETAILS:');
      result.details.forEach(detail => console.log(`  ${detail}`));
    }

    if (result.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      result.errors.forEach(error => console.error(`  ${error}`));
    }

    if (result.success) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('All existing users now have active Friends & Family subscriptions.');
      console.log('They can now access all premium AI features for testing.');
    } else {
      console.error('\n❌ Migration failed with errors. Please review the details above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Migration failed with exception:');
    console.error(error);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration();
}

export { runMigration }; 