/**
 * Run the subscription tiers migration
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting subscription tiers migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '0005_subscription_tiers_credits.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the migration
    console.log('🔍 Verifying migration...');
    
    // Check if new columns exist
    const userColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('messages_used_this_month', 'messages_reset_at', 'ai_credits_balance')
    `);
    
    console.log('📊 New user columns:', userColumns.rows.map(r => r.column_name));
    
    // Check if new tables exist
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('teams', 'ai_credits_transactions', 'subscription_features')
    `);
    
    console.log('📋 New tables:', tables.rows.map(r => r.table_name));
    
    // Check subscription features
    const features = await client.query(`
      SELECT tier_name, monthly_message_allowance, monthly_ai_credits 
      FROM subscription_features 
      ORDER BY tier_name
    `);
    
    console.log('🎯 Subscription features:');
    features.rows.forEach(row => {
      console.log(`  - ${row.tier_name}: ${row.monthly_message_allowance} messages, ${row.monthly_ai_credits} credits`);
    });
    
    // Check user counts by tier
    const userCounts = await client.query(`
      SELECT subscription_tier, COUNT(*) as count 
      FROM users 
      GROUP BY subscription_tier 
      ORDER BY count DESC
    `);
    
    console.log('👥 Users by tier:');
    userCounts.rows.forEach(row => {
      console.log(`  - ${row.subscription_tier}: ${row.count} users`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
