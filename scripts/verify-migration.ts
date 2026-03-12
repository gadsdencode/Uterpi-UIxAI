// scripts/verify-migration.ts
import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

async function verify() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool });

  try {
    const result = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_name = 'projects'`);
    console.log('✅ Projects table exists:', result.rows.length > 0);
    
    const columns = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'projects' ORDER BY ordinal_position`);
    console.log('Columns:', columns.rows.map((r: any) => r.column_name).join(', '));
    
    // Check files table has project_id
    const filesCol = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'files' AND column_name = 'project_id'`);
    console.log('✅ files.project_id exists:', filesCol.rows.length > 0);
    
    // Check conversations table has project_id
    const convCol = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'project_id'`);
    console.log('✅ conversations.project_id exists:', convCol.rows.length > 0);
  } finally {
    await pool.end();
  }
}

verify();

