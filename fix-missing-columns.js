import { Pool } from '@neondatabase/serverless';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function runMigration() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('Connecting to database...');
    
    // Read the migration file
    const migrationSQL = fs.readFileSync('migrations/0007_add_missing_columns_only.sql', 'utf8');
    
    console.log('Running migration...');
    await pool.query(migrationSQL);
    
    console.log('Migration completed successfully!');
    
    // Verify the columns were added
    console.log('Verifying columns...');
    
    const usersColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('team_id', 'ai_credits_balance', 'messages_used_this_month')
    `);
    
    const subscriptionsColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' 
      AND column_name = 'team_id'
    `);
    
    console.log('Users table columns:', usersColumns.rows.map(r => r.column_name));
    console.log('Subscriptions table columns:', subscriptionsColumns.rows.map(r => r.column_name));
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
