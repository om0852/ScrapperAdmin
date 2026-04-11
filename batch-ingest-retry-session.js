#!/usr/bin/env node

/**
 * Retry Failed Session
 * Retries all failed files from a specific ingestion session
 * 
 * Usage:
 *   node batch-ingest-retry-session.js <sessionId> [--max-retries=3]
 * 
 * Example:
 *   node batch-ingest-retry-session.js ingest_2026-04-11T10-30-45_abc123
 *   node batch-ingest-retry-session.js ingest_2026-04-11T10-30-45_abc123 --max-retries=5
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { ingestJsonFile } from './utils/manualIngest.js';
import {
  getFailedFiles,
  clearFailedFiles,
  updateRetryCount,
  createRetryReport,
  printFailedFilesSummary,
  printRetryReport,
  getAllFailedSessions
} from './utils/failedIngestionTracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const sessionId = args[0];
const maxRetries = Math.max(1, Number(
  args.find(arg => arg.startsWith('--max-retries='))?.split('=')[1] || 3
));
const retryDelay = Math.max(1000, Number(
  args.find(arg => arg.startsWith('--retry-delay='))?.split('=')[1] || 5000
));

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════

console.log(`\n${'='.repeat(80)}`);
console.log(`🔄 RETRY FAILED INGESTION SESSION`);
console.log(`${'='.repeat(80)}\n`);

if (!sessionId) {
  console.log(`❌ Session ID required!\n`);
  
  const availableSessions = getAllFailedSessions();
  
  if (availableSessions.length > 0) {
    console.log(`📋 Available sessions to retry:\n`);
    availableSessions.forEach((session, index) => {
      console.log(`   [${index + 1}] ${session}`);
    });
    console.log('');
  } else {
    console.log(`ℹ️  No failed sessions found to retry.\n`);
  }
  
  console.log(`Usage: node batch-ingest-retry-session.js <sessionId>\n`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN RETRY FLOW
// ═══════════════════════════════════════════════════════════════════

async function retryFailedSession() {
  console.log(`🎯 Session ID: ${sessionId}`);
  console.log(`🔄 Max Retries: ${maxRetries}`);
  console.log(`⏱️  Retry Delay: ${retryDelay}ms\n`);

  // Get failed files from session
  const failedFiles = getFailedFiles(sessionId);

  if (failedFiles.length === 0) {
    console.log(`✅ No failed files found for this session!\n`);
    process.exit(0);
  }

  printFailedFilesSummary(failedFiles);

  console.log(`${'─'.repeat(80)}\n`);

  const successfulRetries = [];
  const failedRetries = [];
  let remainingFiles = [...failedFiles];

  for (let retryAttempt = 1; retryAttempt <= maxRetries; retryAttempt++) {
    if (remainingFiles.length === 0) {
      console.log(`✅ All failed files recovered!\n`);
      break;
    }

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🔄 RETRY ATTEMPT ${retryAttempt}/${maxRetries} - ${remainingFiles.length} file(s) remaining`);
    console.log(`${'─'.repeat(80)}\n`);

    // Wait before retry (except for first attempt)
    if (retryAttempt > 1) {
      console.log(`⏳ Waiting ${retryDelay / 1000} seconds before retry...\n`);
      await wait(retryDelay);
    }

    const filesToRetry = [...remainingFiles];
    remainingFiles = [];

    for (let index = 0; index < filesToRetry.length; index++) {
      const failedFile = filesToRetry[index];
      const retryIndex = index + 1;
      const retryPercentage = Math.round((retryIndex / filesToRetry.length) * 100);

      console.log(`[${retryIndex}/${filesToRetry.length}] (${retryPercentage}%) 🔄 ${failedFile.fileName}`);
      console.log(`   📍 Pincode: ${failedFile.pincode}`);
      console.log(`   🏪 Platform: ${failedFile.platform}`);
      console.log(`   📁 Category: ${failedFile.categoryFolder || 'Unknown'}`);
      console.log(`   ⏰ Original Error: ${failedFile.error}`);

      try {
        console.log(`   🚀 Retrying...\n`);

        const result = await ingestJsonFile(
          failedFile.filePath,
          failedFile.pincode,
          failedFile.platform,
          false,
          null
        );

        if (result.success && result.stats) {
          console.log(`   ✅ SUCCESS! File recovered!`);
          console.log(`      Inserted: ${result.stats.inserted} products`);
          console.log(`      New: ${result.stats.new}, Updated: ${result.stats.updated}\n`);

          successfulRetries.push({
            fileName: failedFile.fileName,
            filePath: failedFile.filePath,
            retryAttempt,
            completedAt: new Date().toISOString(),
            stats: result.stats
          });
        } else {
          const errorMsg = result.error || 'Unknown error on retry';
          console.log(`   ❌ Still failed: ${errorMsg}\n`);

          remainingFiles.push(failedFile);
          failedRetries.push({
            fileName: failedFile.fileName,
            filePath: failedFile.filePath,
            error: errorMsg,
            retryAttempt,
            failedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        const errorMsg = error.message || 'Network error on retry';
        console.log(`   ❌ Error: ${errorMsg}\n`);

        remainingFiles.push(failedFile);
        failedRetries.push({
          fileName: failedFile.fileName,
          filePath: failedFile.filePath,
          error: errorMsg,
          retryAttempt,
          failedAt: new Date().toISOString()
        });
      }

      if (index < filesToRetry.length - 1) {
        await wait(500);
      }
    }

    // Update retry counts in tracker
    remainingFiles.forEach(file => {
      updateRetryCount(sessionId, file.filePath, retryAttempt);
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ═════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 RETRY SESSION SUMMARY`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`Session ID: ${sessionId}`);
  console.log(`Total Failed Files: ${failedFiles.length}`);
  console.log(`✅ Successfully Recovered: ${successfulRetries.length}`);
  console.log(`❌ Still Failing: ${failedRetries.length}\n`);

  if (failedRetries.length > 0) {
    console.log(`${'─'.repeat(80)}`);
    console.log(`⚠️  FILES REQUIRING MANUAL ATTENTION`);
    console.log(`${'─'.repeat(80)}\n`);

    failedRetries.forEach((file, index) => {
      console.log(`[${index + 1}] ${file.fileName}`);
      console.log(`    ❌ Error: ${file.error}`);
      console.log(`    Path: ${file.filePath}`);
      console.log(`    Attempts: ${file.retryAttempt}/${maxRetries}\n`);
    });
  }

  // Create and print retry report
  const report = createRetryReport(
    sessionId,
    failedFiles,
    successfulRetries,
    failedRetries
  );

  printRetryReport(report);

  if (failedRetries.length === 0) {
    clearFailedFiles(sessionId);
    console.log(`🎉 Session completed successfully!\n`);
    process.exit(0);
  } else {
    console.log(`${'─'.repeat(80)}\n`);
    console.log(`💡 Next Steps:\n`);
    console.log(`   1. Check the failed files above`);
    console.log(`   2. Fix the issues (network, data format, etc.)`);
    console.log(`   3. Run this command to retry:\n`);
    console.log(`      node batch-ingest-retry-session.js ${sessionId} --max-retries=5\n`);
    console.log(`${'─'.repeat(80)}\n`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════════

retryFailedSession().catch(error => {
  console.error(`\n❌ Fatal error: ${error.message}`);
  process.exit(1);
});
