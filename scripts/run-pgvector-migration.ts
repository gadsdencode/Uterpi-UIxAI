/**
 * Run PGVector Migration Script
 * Executes the 0015_enable_pgvector_and_storage.sql migration
 * 
 * Usage: npx tsx scripts/run-pgvector-migration.ts
 */

import { config } from "dotenv";
config();

import { readFileSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";

/**
 * Parse SQL file into individual statements, properly handling:
 * - DO $$ ... END $$; blocks (PL/pgSQL)
 * - Regular statements ending with ;
 * - Single-line comments (--)
 * - Multi-line comments
 */
function parseSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];
    const remaining = sql.substring(i);

    // Check for dollar quote start/end ($$, $tag$, etc.)
    if (char === "$") {
      const dollarMatch = remaining.match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (dollarMatch) {
        const tag = dollarMatch[1];
        if (!inDollarQuote) {
          // Starting a dollar-quoted block
          inDollarQuote = true;
          dollarTag = tag;
          current += tag;
          i += tag.length;
          continue;
        } else if (tag === dollarTag) {
          // Ending the dollar-quoted block
          inDollarQuote = false;
          current += tag;
          i += tag.length;
          dollarTag = "";
          continue;
        }
      }
    }

    // If inside dollar quote, just accumulate
    if (inDollarQuote) {
      current += char;
      i++;
      continue;
    }

    // Check for single-line comment
    if (char === "-" && sql[i + 1] === "-") {
      // Skip to end of line
      const endOfLine = sql.indexOf("\n", i);
      if (endOfLine === -1) {
        i = sql.length;
      } else {
        i = endOfLine + 1;
      }
      continue;
    }

    // Check for multi-line comment
    if (char === "/" && sql[i + 1] === "*") {
      const endComment = sql.indexOf("*/", i + 2);
      if (endComment === -1) {
        i = sql.length;
      } else {
        i = endComment + 2;
      }
      continue;
    }

    // Check for statement terminator
    if (char === ";") {
      current += char;
      const trimmed = current.trim();
      if (trimmed.length > 1) {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    current += char;
    i++;
  }

  // Add any remaining content
  const trimmed = current.trim();
  if (trimmed.length > 0 && trimmed !== ";") {
    statements.push(trimmed.endsWith(";") ? trimmed : trimmed + ";");
  }

  return statements;
}

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable not set");
    process.exit(1);
  }

  console.log("🔄 Connecting to database...");
  const sql = neon(databaseUrl);

  // Read migration file
  const migrationPath = join(process.cwd(), "migrations", "0015_enable_pgvector_and_storage.sql");
  const migrationSql = readFileSync(migrationPath, "utf-8");

  console.log("📄 Running migration: 0015_enable_pgvector_and_storage.sql\n");

  // Parse SQL into proper statements
  const statements = parseSqlStatements(migrationSql);
  
  console.log(`📊 Found ${statements.length} SQL statements to execute\n`);

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let idx = 0; idx < statements.length; idx++) {
    const statement = statements[idx];
    
    try {
      await sql(statement);
      successCount++;
      
      // Log what was executed (truncated, first line only)
      const firstLine = statement.split("\n")[0].substring(0, 60);
      console.log(`  ✅ [${idx + 1}/${statements.length}] ${firstLine}...`);
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      
      // Some errors are expected (e.g., "already exists", "does not exist")
      if (errorMsg.includes("already exists") || 
          errorMsg.includes("does not exist") ||
          errorMsg.includes("duplicate") ||
          errorMsg.includes("cannot cast type") ||
          errorMsg.includes("column") && errorMsg.includes("does not exist")) {
        skippedCount++;
        const firstLine = statement.split("\n")[0].substring(0, 50);
        console.log(`  ⏭️  [${idx + 1}/${statements.length}] Skipped: ${firstLine}...`);
        console.log(`      Reason: ${errorMsg.substring(0, 80)}`);
      } else {
        errorCount++;
        console.error(`  ❌ [${idx + 1}/${statements.length}] Error: ${errorMsg}`);
        console.error(`     Statement preview: ${statement.substring(0, 150).replace(/\n/g, " ")}...`);
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`📊 Migration Summary:`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Skipped (already applied): ${skippedCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log("=".repeat(50));

  if (errorCount === 0) {
    console.log("\n✅ Migration completed successfully!");
  } else {
    console.log("\n⚠️  Migration completed with some errors. Review above.");
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

runMigration().catch(error => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});

