#!/usr/bin/env node

/**
 * Comprehensive Freemium System Fix Runner
 * 
 * This script runs the comprehensive database migration to fix all
 * subscription tier and message allowance issues.
 * 
 * Usage: node run-comprehensive-fix.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection configuration
const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT) || 5432,
  database: process.env.DATABASE_NAME || 'uterpi',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || '',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

async function runComprehensiveFix() {
  console.log('🔧 Starting comprehensive freemium system fix...');
  
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '0010_comprehensive_freemium_fix.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Executing migration...');
    
    // Execute the migration
    const result = await client.query(migrationSQL);
    
    console.log('✅ Migration executed successfully');
    console.log('📊 Results:');
    
    // The migration includes verification queries, so we'll see the results
    if (Array.isArray(result)) {
      result.forEach((queryResult, index) => {
        if (queryResult.rows && queryResult.rows.length > 0) {
          console.log(`\n--- Query ${index + 1} Results ---`);
          console.table(queryResult.rows);
        }
      });
    } else if (result.rows && result.rows.length > 0) {
      console.log('\n--- Results ---');
      console.table(result.rows);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    
    // Provide helpful error messages
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Database connection refused. Please check:');
      console.error('   - Database server is running');
      console.error('   - Connection parameters are correct');
      console.error('   - Environment variables are set properly');
    } else if (error.code === '42P01') {
      console.error('💡 Table does not exist. Please ensure:');
      console.error('   - Previous migrations have been run');
      console.error('   - Database schema is up to date');
    } else if (error.code === '23505') {
      console.error('💡 Unique constraint violation. This may be expected if:');
      console.error('   - Migration has already been partially run');
      console.error('   - Data already exists in the expected state');
    }
    
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Additional verification function
async function verifyFix() {
  console.log('\n🔍 Running additional verification...');
  
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    
    // Check for users without proper subscription tiers
    const invalidTiersResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE subscription_tier IS NULL 
         OR subscription_tier = '' 
         OR subscription_tier NOT IN ('freemium', 'pro', 'team', 'enterprise')
    `);
    
    const invalidTiers = parseInt(invalidTiersResult.rows[0].count);
    
    if (invalidTiers > 0) {
      console.warn(`⚠️  Found ${invalidTiers} users with invalid subscription tiers`);
    } else {
      console.log('✅ All users have valid subscription tiers');
    }
    
    // Check for users without reset dates
    const noResetDateResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE messages_reset_at IS NULL
    `);
    
    const noResetDate = parseInt(noResetDateResult.rows[0].count);
    
    if (noResetDate > 0) {
      console.warn(`⚠️  Found ${noResetDate} users without reset dates`);
    } else {
      console.log('✅ All users have reset dates set');
    }
    
    // Check subscription features
    const featuresResult = await client.query(`
      SELECT tier_name, monthly_message_allowance 
      FROM subscription_features 
      WHERE tier_name = 'freemium'
    `);
    
    if (featuresResult.rows.length === 0) {
      console.error('❌ Freemium tier not found in subscription_features');
    } else {
      const freemiumFeatures = featuresResult.rows[0];
      if (freemiumFeatures.monthly_message_allowance === 10) {
        console.log('✅ Freemium tier properly configured with 10 message allowance');
      } else {
        console.warn(`⚠️  Freemium tier has ${freemiumFeatures.monthly_message_allowance} message allowance (expected 10)`);
      }
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await client.end();
  }
}

// Main execution
async function main() {
  try {
    await runComprehensiveFix();
    await verifyFix();
    
    console.log('\n🎉 Comprehensive fix completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Update your application to use the new subscription-middleware-fixed.ts');
    console.log('2. Set up the monthly reset cron job using cron-monthly-reset.ts');
    console.log('3. Test the freemium messaging system');
    console.log('4. Monitor logs for any remaining issues');
    
  } catch (error) {
    console.error('❌ Process failed:', error);
    process.exit(1);
  }
}

// Run only if this file is executed directly
if (require.main === module) {
  main();
}
