const { Pool } = require('pg');
require('dotenv').config();

async function runFreemiumMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔄 Running freemium message allowance migration...');
    
    // Update users without tier to freemium
    const result1 = await pool.query(`
      UPDATE users 
      SET 
        subscription_tier = 'freemium',
        subscription_status = 'freemium',
        updated_at = NOW()
      WHERE subscription_tier IS NULL OR subscription_tier = ''
    `);
    console.log('✅ Updated users to freemium tier:', result1.rowCount);
    
    // Reset message usage for freemium users
    const result2 = await pool.query(`
      UPDATE users 
      SET 
        messages_used_this_month = 0,
        messages_reset_at = NOW(),
        updated_at = NOW()
      WHERE subscription_tier = 'freemium'
    `);
    console.log('✅ Reset message usage for freemium users:', result2.rowCount);
    
    // Verify the migration
    const result3 = await pool.query(`
      SELECT 
        subscription_tier,
        COUNT(*) as user_count,
        AVG(messages_used_this_month) as avg_messages_used
      FROM users 
      WHERE subscription_tier = 'freemium'
      GROUP BY subscription_tier
    `);
    console.log('📊 Migration verification:', result3.rows);
    
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runFreemiumMigration();
