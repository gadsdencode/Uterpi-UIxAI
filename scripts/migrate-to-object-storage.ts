/**
 * Migration Script: Migrate Existing Files to Replit Object Storage
 * 
 * This script migrates file content from the database (base64 encoded) to Replit Object Storage.
 * It processes files in batches and updates the database records with storage keys.
 * 
 * Usage:
 *   npx tsx scripts/migrate-to-object-storage.ts
 *   npx tsx scripts/migrate-to-object-storage.ts --dry-run    # Preview without making changes
 *   npx tsx scripts/migrate-to-object-storage.ts --batch=50   # Custom batch size
 *   npx tsx scripts/migrate-to-object-storage.ts --validate   # Validate migration only
 * 
 * Safety Features:
 *   - Dry run mode to preview changes
 *   - Batch processing with progress logging
 *   - Validation step to verify successful migration
 *   - Original content preserved in database (no deletions per project policy)
 */

import { config } from "dotenv";
config();

import { db } from "../server/db";
import { files } from "../shared/schema";
import { eq, sql, isNull, and, isNotNull } from "drizzle-orm";
import { storageService, generateStorageKey } from "../server/services/storageService";

// Configuration
const DEFAULT_BATCH_SIZE = 25;
const PROGRESS_LOG_INTERVAL = 10;

interface MigrationStats {
  totalFiles: number;
  migrated: number;
  skipped: number;
  failed: number;
  alreadyMigrated: number;
  startTime: Date;
  endTime?: Date;
}

interface MigrationOptions {
  dryRun: boolean;
  batchSize: number;
  validateOnly: boolean;
}

function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    batchSize: parseInt(args.find(a => a.startsWith("--batch="))?.split("=")[1] || String(DEFAULT_BATCH_SIZE)),
    validateOnly: args.includes("--validate"),
  };
}

async function getMigrationCandidates(): Promise<any[]> {
  // Find files that have content but no storage_key
  const candidates = await db
    .select({
      id: files.id,
      userId: files.userId,
      originalName: files.originalName,
      mimeType: files.mimeType,
      size: files.size,
      encoding: files.encoding,
      storageKey: files.storageKey,
      hasContent: sql<boolean>`${files.content} IS NOT NULL`,
    })
    .from(files)
    .where(
      and(
        isNotNull(files.content),
        isNull(files.storageKey),
        eq(files.status, "active")
      )
    );

  return candidates;
}

async function getAlreadyMigratedCount(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(files)
    .where(isNotNull(files.storageKey));
  
  return result[0]?.count || 0;
}

async function migrateFile(file: any, dryRun: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch the full content
    const fileRecord = await db
      .select({ content: files.content, encoding: files.encoding })
      .from(files)
      .where(eq(files.id, file.id))
      .limit(1);

    if (!fileRecord[0]?.content) {
      return { success: false, error: "No content found" };
    }

    const content = fileRecord[0].content;
    const encoding = fileRecord[0].encoding || "utf-8";

    // Decode content to Buffer
    let buffer: Buffer;
    if (encoding === "base64") {
      buffer = Buffer.from(content, "base64");
    } else {
      buffer = Buffer.from(content, "utf-8");
    }

    // Generate storage key
    const storageKey = generateStorageKey(file.userId, file.originalName);

    if (dryRun) {
      console.log(`  [DRY RUN] Would upload file ${file.id} (${file.originalName}) to ${storageKey}`);
      return { success: true };
    }

    // Upload to Object Storage
    const uploadResult = await storageService.uploadFile(storageKey, buffer);

    if (!uploadResult.success) {
      return { success: false, error: "Object Storage upload failed" };
    }

    // Update database with storage key
    await db
      .update(files)
      .set({
        storageKey,
        updatedAt: new Date(),
      })
      .where(eq(files.id, file.id));

    console.log(`  ✅ Migrated file ${file.id} (${file.originalName}) -> ${storageKey}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Failed to migrate file ${file.id}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

async function validateMigration(): Promise<{ valid: boolean; issues: string[] }> {
  console.log("\n🔍 Validating migration...\n");
  const issues: string[] = [];

  // Check for files with storage_key but no Object Storage content
  const migratedFiles = await db
    .select({
      id: files.id,
      storageKey: files.storageKey,
      originalName: files.originalName,
    })
    .from(files)
    .where(
      and(
        isNotNull(files.storageKey),
        eq(files.status, "active")
      )
    )
    .limit(100); // Sample first 100

  let validated = 0;
  let failed = 0;

  for (const file of migratedFiles) {
    if (!file.storageKey) continue;

    try {
      const exists = await storageService.fileExists(file.storageKey);
      if (!exists) {
        issues.push(`File ${file.id} (${file.originalName}): Storage key ${file.storageKey} not found in Object Storage`);
        failed++;
      } else {
        validated++;
      }
    } catch (error) {
      issues.push(`File ${file.id}: Error checking storage - ${error}`);
      failed++;
    }
  }

  console.log(`  Validated: ${validated}`);
  console.log(`  Failed: ${failed}`);
  
  if (issues.length > 0) {
    console.log("\n⚠️ Issues found:");
    issues.forEach(issue => console.log(`  - ${issue}`));
  }

  return { valid: issues.length === 0, issues };
}

async function runMigration(options: MigrationOptions): Promise<MigrationStats> {
  const stats: MigrationStats = {
    totalFiles: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    alreadyMigrated: 0,
    startTime: new Date(),
  };

  console.log("\n" + "=".repeat(60));
  console.log("📦 FILE MIGRATION TO REPLIT OBJECT STORAGE");
  console.log("=".repeat(60) + "\n");

  if (options.dryRun) {
    console.log("🔔 DRY RUN MODE - No changes will be made\n");
  }

  if (options.validateOnly) {
    await validateMigration();
    return stats;
  }

  // Check Object Storage availability
  const storageAvailable = await storageService.isAvailable();
  if (!storageAvailable) {
    console.error("❌ Replit Object Storage is not available.");
    console.error("   This script must be run in a Replit environment with Object Storage configured.");
    process.exit(1);
  }

  console.log("✅ Object Storage connected\n");

  // Get already migrated count
  stats.alreadyMigrated = await getAlreadyMigratedCount();
  console.log(`📊 Files already migrated: ${stats.alreadyMigrated}`);

  // Get migration candidates
  const candidates = await getMigrationCandidates();
  stats.totalFiles = candidates.length;

  console.log(`📊 Files to migrate: ${stats.totalFiles}`);
  console.log(`📊 Batch size: ${options.batchSize}\n`);

  if (stats.totalFiles === 0) {
    console.log("✨ No files need migration!\n");
    stats.endTime = new Date();
    return stats;
  }

  // Process in batches
  const batches = Math.ceil(stats.totalFiles / options.batchSize);
  
  for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
    const start = batchIndex * options.batchSize;
    const end = Math.min(start + options.batchSize, stats.totalFiles);
    const batch = candidates.slice(start, end);

    console.log(`\n📦 Processing batch ${batchIndex + 1}/${batches} (files ${start + 1}-${end})`);

    for (const file of batch) {
      const result = await migrateFile(file, options.dryRun);

      if (result.success) {
        stats.migrated++;
      } else {
        stats.failed++;
      }

      // Progress log
      const processed = stats.migrated + stats.failed + stats.skipped;
      if (processed % PROGRESS_LOG_INTERVAL === 0) {
        console.log(`  Progress: ${processed}/${stats.totalFiles} (${Math.round(processed / stats.totalFiles * 100)}%)`);
      }
    }
  }

  stats.endTime = new Date();

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 MIGRATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Total files processed: ${stats.totalFiles}`);
  console.log(`  Successfully migrated: ${stats.migrated}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Previously migrated: ${stats.alreadyMigrated}`);
  console.log(`  Duration: ${((stats.endTime.getTime() - stats.startTime.getTime()) / 1000).toFixed(2)}s`);
  console.log("=".repeat(60) + "\n");

  if (options.dryRun) {
    console.log("🔔 This was a DRY RUN - no changes were made.");
    console.log("   Run without --dry-run to perform actual migration.\n");
  }

  // Run validation after migration
  if (!options.dryRun && stats.migrated > 0) {
    await validateMigration();
  }

  return stats;
}

// Main execution
async function main() {
  try {
    const options = parseArgs();
    await runMigration(options);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

main();

