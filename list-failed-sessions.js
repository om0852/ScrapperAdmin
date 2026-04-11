#!/usr/bin/env node

/**
 * List Failed Ingestion Sessions
 * Shows all available failed session logs for retry
 * 
 * Usage:
 *   node list-failed-sessions.js [--details]
 * 
 * Examples:
 *   node list-failed-sessions.js
 *   node list-failed-sessions.js --details
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllFailedSessions, getFailedFiles } from './utils/failedIngestionTracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAILED_LOG_DIR = path.join(__dirname, 'failed_ingestion_logs');

const args = process.argv.slice(2);
const showDetails = args.includes('--details');

console.log(`\n${'='.repeat(80)}`);
console.log(`📋 FAILED INGESTION SESSIONS`);
console.log(`${'='.repeat(80)}\n`);

const sessions = getAllFailedSessions();

if (sessions.length === 0) {
  console.log(`✅ No failed sessions found!\n`);
  process.exit(0);
}

console.log(`Found ${sessions.length} failed session(s):\n`);

sessions.forEach((session, index) => {
  const failedFiles = getFailedFiles(session);
  const sessionPath = path.join(FAILED_LOG_DIR, `${session}_failed.json`);
  
  let sessionDate = 'Unknown';
  try {
    const stat = fs.statSync(sessionPath);
    sessionDate = new Date(stat.mtime).toLocaleString();
  } catch (e) {
    // Use empty string
  }

  console.log(`[${index + 1}] 🎯 ${session}`);
  console.log(`    📅 Date: ${sessionDate}`);
  console.log(`    📊 Failed Files: ${failedFiles.length}`);

  if (showDetails && failedFiles.length > 0) {
    console.log(`    📄 Files:`);
    failedFiles.forEach((file, fileIndex) => {
      console.log(`       • ${file.fileName}`);
      console.log(`         Platform: ${file.platform}, Pincode: ${file.pincode}`);
      console.log(`         Error: ${file.error}`);
    });
  }

  console.log('');
});

if (!showDetails && sessions.length > 0) {
  console.log(`💡 Tip: Run with --details flag to see individual files\n`);
  console.log(`   node list-failed-sessions.js --details\n`);
}

console.log(`To retry a session:\n`);
console.log(`   node batch-ingest-retry-session.js <sessionId>\n`);
console.log(`Example:\n`);
console.log(`   node batch-ingest-retry-session.js ${sessions[0]}\n`);
console.log(`${'='.repeat(80)}\n`);
