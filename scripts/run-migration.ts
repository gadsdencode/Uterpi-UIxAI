// scripts/run-migration.ts
// Run the projects migration directly against the database

import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔄 Connecting to database...');
  
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool });

  try {
    console.log('📦 Creating projects table...');
    
    // Create projects table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "name" TEXT NOT NULL,
        "description" TEXT,
        "instructions" TEXT,
        "is_default" BOOLEAN DEFAULT FALSE,
        "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ Projects table created');

    // Create index for user_id
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "idx_projects_user_id" ON "projects"("user_id")
    `);
    console.log('✅ Created index on projects.user_id');

    // Add project_id to files
    console.log('📦 Adding project_id to files table...');
    await db.execute(sql`
      ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "project_id" INTEGER REFERENCES "projects"("id")
    `);
    console.log('✅ Added project_id to files');

    // Create index for files.project_id
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "idx_files_project_id" ON "files"("project_id")
    `);
    
    // Add project_id to conversations
    console.log('📦 Adding project_id to conversations table...');
    await db.execute(sql`
      ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "project_id" INTEGER REFERENCES "projects"("id")
    `);
    console.log('✅ Added project_id to conversations');

    // Create index for conversations.project_id
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "idx_conversations_project_id" ON "conversations"("project_id")
    `);

    // Composite indexes
    console.log('📦 Creating composite indexes...');
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "idx_files_user_project" ON "files"("user_id", "project_id")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "idx_conversations_user_project" ON "conversations"("user_id", "project_id")
    `);
    console.log('✅ Created composite indexes');

    console.log('\n🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
