#!/usr/bin/env node

/**
 * Clean Failed Logs
 * Removes old failed ingestion logs to keep directory clean
 * 
 * Usage:
 *   node clean-failed-logs.js [--days=7] [--list-only]
 * 
 * Examples:
 *   node clean-failed-logs.js                    # Remove logs older than 7 days
 *   node clean-failed-logs.js --days=3           # Remove logs older than 3 days
 *   node clean-failed-logs.js --list-only        # Only show what would be deleted
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAILED_LOG_DIR = path.join(__dirname, 'failed_ingestion_logs');

const args = process.argv.slice(2);
const daysToKeep = Math.max(1, Number(
  args.find(arg => arg.startsWith('--days='))?.split('=')[1] || 7
));
const listOnly = args.includes('--list-only');

console.log(`\n${'='.repeat(80)}`);
console.log(`🧹 CLEAN FAILED INGESTION LOGS`);
console.log(`${'='.repeat(80)}\n`);

if (!fs.existsSync(FAILED_LOG_DIR)) {
  console.log(`✅ No logs directory found - nothing to clean!\n`);
  process.exit(0);
}

const files = fs.readdirSync(FAILED_LOG_DIR);
if (files.length === 0) {
  console.log(`✅ No log files found - directory is clean!\n`);
  process.exit(0);
}

const now = Date.now();
const cutoffTime = now - (daysToKeep * 24 * 60 * 60 * 1000);

console.log(`📚 Keeping logs from last ${daysToKeep} day(s)`);
console.log(`📅 Cutoff date: ${new Date(cutoffTime).toLocaleString()}\n`);

const filesToDelete = [];
let totalSize = 0;

files.forEach(file => {
  const filePath = path.join(FAILED_LOG_DIR, file);
  const stat = fs.statSync(filePath);

  if (stat.mtime.getTime() < cutoffTime) {
    filesToDelete.push({
      name: file,
      path: filePath,
      date: new Date(stat.mtime).toLocaleString(),
      size: stat.size
    });
    totalSize += stat.size;
  }
});

if (filesToDelete.length === 0) {
  console.log(`✅ All logs are recent - nothing to delete!\n`);
  process.exit(0);
}

console.log(`📋 Files to delete (${filesToDelete.length}):\n`);

filesToDelete.forEach((file, index) => {
  console.log(`[${index + 1}] ${file.name}`);
  console.log(`    📅 Date: ${file.date}`);
  console.log(`    💾 Size: ${(file.size / 1024).toFixed(2)} KB\n`);
});

console.log(`💾 Total size to free: ${(totalSize / 1024).toFixed(2)} KB\n`);

if (listOnly) {
  console.log(`(List only mode - no files deleted)\n`);
  console.log(`to remove these files, run:\n`);
  console.log(`   node clean-failed-logs.js --days=${daysToKeep}\n`);
  process.exit(0);
}

console.log(`${'─'.repeat(80)}\n`);
console.log(`🗑️  Deleting old logs...\n`);

let deletedCount = 0;
filesToDelete.forEach(file => {
  try {
    fs.unlinkSync(file.path);
    console.log(`✅ Deleted: ${file.name}`);
    deletedCount++;
  } catch (error) {
    console.error(`❌ Failed to delete ${file.name}: ${error.message}`);
  }
});

console.log(`\n${'─'.repeat(80)}\n`);
console.log(`✅ Cleanup complete!`);
console.log(`🗑️  Deleted: ${deletedCount} file(s)`);
console.log(`💾 Freed: ${(totalSize / 1024).toFixed(2)} KB\n`);

const remaining = files.length - deletedCount;
console.log(`📚 Remaining log files: ${remaining}\n`);
console.log(`${'='.repeat(80)}\n`);
