#!/usr/bin/env node

/**
 * Enhanced Batch Ingestion with Auto-Retry
 * Ingests all JSON files from a directory with automatic retry for failed files
 * Tracks network failures and retries them automatically at the end
 * 
 * Usage:
 *   node batch-ingest-with-retry.js <directory> [--max-retries=3] [--retry-delay=5000]
 * 
 * Example:
 *   node batch-ingest-with-retry.js ./scraped_data/Fruits_Vegetables
 *   node batch-ingest-with-retry.js ./scraped_data --max-retries=5 --retry-delay=3000
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ingestJsonFile } from './utils/manualIngest.js';
import {
  createSessionId,
  logFailedFile,
  getFailedFiles,
  clearFailedFiles,
  updateRetryCount,
  createRetryReport,
  printFailedFilesSummary,
  printRetryReport
} from './utils/failedIngestionTracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const targetDirectory = args[0] || './scraped_data';
const maxRetries = Math.max(1, Number(
  args.find(arg => arg.startsWith('--max-retries='))?.split('=')[1] || 3
));
const retryDelay = Math.max(1000, Number(
  args.find(arg => arg.startsWith('--retry-delay='))?.split('=')[1] || 5000
));

const sessionId = createSessionId();

console.log(`\n${'='.repeat(80)}`);
console.log(`🚀 ENHANCED BATCH INGESTION WITH AUTO-RETRY`);
console.log(`${'='.repeat(80)}\n`);

console.log(`📁 Directory: ${path.resolve(targetDirectory)}`);
console.log(`🎯 Session ID: ${sessionId}`);
console.log(`🔄 Max Retries: ${maxRetries}`);
console.log(`⏱️  Retry Delay: ${retryDelay}ms\n`);

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getJsonFiles = (dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${dirPath}`);
    }

    const allFiles = fs.readdirSync(dirPath);
    const jsonFiles = [];

    // Recursive search for JSON files
    const searchDirectory = (dirToSearch) => {
      const files = fs.readdirSync(dirToSearch);
      files.forEach(file => {
        const fullPath = path.join(dirToSearch, file);
        const fileStat = fs.statSync(fullPath);

        if (fileStat.isDirectory()) {
          searchDirectory(fullPath);
        } else if (file.endsWith('.json') && !file.startsWith('.')) {
          jsonFiles.push({
            name: file,
            path: fullPath,
            size: fileStat.size,
            relative: path.relative(dirPath, fullPath)
          });
        }
      });
    };

    searchDirectory(dirPath);
    return jsonFiles;
  } catch (error) {
    console.error(`❌ Error getting files: ${error.message}`);
    return [];
  }
};

const extractMetadata = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    const fileName = path.basename(filePath);
    const categoryFolder = path.basename(path.dirname(filePath));

    let pincode = null;
    let platform = null;

    // Try to extract from filename
    const pincodeMatch = fileName.match(/_(\d{6})_/);
    if (pincodeMatch) {
      pincode = pincodeMatch[1];
    }

    const platformMatch = fileName.match(/^([^_]+)_\d+_/);
    if (platformMatch) {
      platform = platformMatch[1];
    }

    // Fallback to data if available
    pincode = pincode || data.pincode;
    platform = platform || data.platform;

    return {
      pincode,
      platform,
      categoryFolder,
      productCount: Array.isArray(data.products) ? data.products.length : 0
    };
  } catch (error) {
    return {
      pincode: null,
      platform: null,
      categoryFolder: null,
      productCount: 0,
      error: error.message
    };
  }
};

// ═══════════════════════════════════════════════════════════════════
// MAIN INGESTION FLOW
// ═══════════════════════════════════════════════════════════════════

async function ingestDirectory(dirPath) {
  const jsonFiles = getJsonFiles(dirPath);

  if (jsonFiles.length === 0) {
    console.log(`❌ No JSON files found in ${dirPath}\n`);
    process.exit(1);
  }

  console.log(`✅ Found ${jsonFiles.length} JSON file(s) to ingest\n`);
  console.log(`${'─'.repeat(80)}\n`);

  const results = {
    successful: [],
    failed: []
  };

  // First pass: Initial ingestion
  for (let index = 0; index < jsonFiles.length; index++) {
    const file = jsonFiles[index];
    const fileIndex = index + 1;
    const percentage = Math.round((fileIndex / jsonFiles.length) * 100);

    console.log(`[${fileIndex}/${jsonFiles.length}] (${percentage}%) 📂 ${file.relative}`);

    const metadata = extractMetadata(file.path);

    if (!metadata.pincode || !metadata.platform) {
      const errorMsg = `Cannot extract pincode or platform from file`;
      console.log(`   ❌ ${errorMsg}`);
      console.log(`      Pincode: ${metadata.pincode}, Platform: ${metadata.platform}\n`);

      logFailedFile(sessionId, {
        fileName: file.name,
        filePath: file.path,
        categoryFolder: metadata.categoryFolder,
        pincode: metadata.pincode,
        platform: metadata.platform,
        error: errorMsg,
        fileSize: file.size,
        retryCount: 0
      });

      results.failed.push({
        fileName: file.name,
        path: file.path,
        error: errorMsg,
        fileSize: file.size
      });

      continue;
    }

    try {
      console.log(`   🔄 Processing ${metadata.productCount} product(s)...`);

      const result = await ingestJsonFile(
        file.path,
        metadata.pincode,
        metadata.platform,
        false,
        null
      );

      if (result.success && result.stats) {
        console.log(`   ✅ Success! Inserted: ${result.stats.inserted} products`);
        console.log(`      New: ${result.stats.new}, Updated: ${result.stats.updated}\n`);

        results.successful.push({
          fileName: file.name,
          path: file.path,
          stats: result.stats
        });
      } else {
        const errorMsg = result.error || 'Unknown ingestion error';
        console.log(`   ❌ Failed: ${errorMsg}\n`);

        logFailedFile(sessionId, {
          fileName: file.name,
          filePath: file.path,
          categoryFolder: metadata.categoryFolder,
          pincode: metadata.pincode,
          platform: metadata.platform,
          error: errorMsg,
          fileSize: file.size,
          retryCount: 0
        });

        results.failed.push({
          fileName: file.name,
          path: file.path,
          error: errorMsg,
          fileSize: file.size
        });
      }
    } catch (error) {
      const errorMsg = error.message || 'Network or processing error';
      console.log(`   ❌ Error: ${errorMsg}\n`);

      logFailedFile(sessionId, {
        fileName: file.name,
        filePath: file.path,
        categoryFolder: metadata.categoryFolder,
        pincode: metadata.pincode,
        platform: metadata.platform,
        error: errorMsg,
        fileSize: file.size,
        retryCount: 0
      });

      results.failed.push({
        fileName: file.name,
        path: file.path,
        error: errorMsg,
        fileSize: file.size
      });
    }

    // Delay between files to avoid overwhelming the system
    if (index < jsonFiles.length - 1) {
      await wait(500);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // SECOND PASS: AUTO-RETRY FAILED FILES
  // ═════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔄 AUTO-RETRY PHASE - Retrying ${results.failed.length} failed file(s)`);
  console.log(`${'='.repeat(80)}\n`);

  let failedFiles = getFailedFiles(sessionId);

  if (failedFiles.length === 0) {
    console.log(`✅ All files ingested successfully! No retries needed.\n`);
    return printFinalSummary(results, sessionId, failedFiles);
  }

  const successfulRetries = [];
  const failedRetries = [];

  for (let retryAttempt = 1; retryAttempt <= maxRetries; retryAttempt++) {
    if (failedFiles.length === 0) {
      console.log(`✅ All failed files recovered!\n`);
      break;
    }

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🔄 RETRY ATTEMPT ${retryAttempt}/${maxRetries} - ${failedFiles.length} file(s) remaining`);
    console.log(`${'─'.repeat(80)}\n`);

    // Wait before retry
    if (retryAttempt > 1) {
      console.log(`⏳ Waiting ${retryDelay / 1000} seconds before retry...\n`);
      await wait(retryDelay);
    }

    const filesToRetry = [...failedFiles];
    failedFiles = [];

    for (let index = 0; index < filesToRetry.length; index++) {
      const failedFile = filesToRetry[index];
      const retryIndex = index + 1;
      const retryPercentage = Math.round((retryIndex / filesToRetry.length) * 100);

      console.log(`[${retryIndex}/${filesToRetry.length}] (${retryPercentage}%) 🔄 ${failedFile.fileName}`);
      console.log(`   📍 Pincode: ${failedFile.pincode}, 🏪 Platform: ${failedFile.platform}`);

      try {
        const result = await ingestJsonFile(
          failedFile.filePath,
          failedFile.pincode,
          failedFile.platform,
          false,
          null
        );

        if (result.success && result.stats) {
          console.log(`   ✅ Recovered! Inserted: ${result.stats.inserted} products\n`);

          successfulRetries.push({
            fileName: failedFile.fileName,
            filePath: failedFile.filePath,
            retryAttempt,
            completedAt: new Date().toISOString()
          });
        } else {
          const errorMsg = result.error || 'Unknown error on retry';
          console.log(`   ❌ Still failed: ${errorMsg}\n`);

          failedFiles.push(failedFile);
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

        failedFiles.push(failedFile);
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

    // Update retry counts
    failedFiles.forEach(file => {
      updateRetryCount(sessionId, file.filePath, retryAttempt);
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ═════════════════════════════════════════════════════════════════════

  return printFinalSummary(
    results,
    sessionId,
    failedFiles,
    successfulRetries,
    failedRetries
  );
}

function printFinalSummary(results, sessionID, failedFiles, successfulRetries = [], failedRetries = []) {
  const allFailed = [...results.failed];

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 FINAL INGESTION SUMMARY`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`Session ID: ${sessionID}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  console.log(`📈 Initial Ingestion Results:`);
  console.log(`   ✅ Successful: ${results.successful.length}`);
  console.log(`   ❌ Failed: ${results.failed.length}\n`);

  if (successfulRetries.length > 0 || failedRetries.length > 0) {
    console.log(`🔄 Retry Results:`);
    console.log(`   ✅ Recovered: ${successfulRetries.length}`);
    console.log(`   ❌ Still Failed: ${failedRetries.length}\n`);
  }

  const totalAttempted = results.successful.length + results.failed.length;
  const totalSuccessful = results.successful.length + successfulRetries.length;
  const finalSuccessRate = totalAttempted > 0 
    ? `${Math.round((totalSuccessful / totalAttempted) * 100)}%`
    : '0%';

  console.log(`🎯 Final Results:`);
  console.log(`   Total Files: ${totalAttempted}`);
  console.log(`   ✅ Total Successful: ${totalSuccessful}`);
  console.log(`   ❌ Total Failed: ${failedRetries.length}`);
  console.log(`   📊 Success Rate: ${finalSuccessRate}\n`);

  if (failedRetries.length > 0) {
    console.log(`${'─'.repeat(80)}`);
    console.log(`⚠️  FILES REQUIRING MANUAL ATTENTION`);
    console.log(`${'─'.repeat(80)}\n`);

    failedRetries.forEach((file, index) => {
      console.log(`[${index + 1}] ${file.fileName}`);
      console.log(`    ❌ Error: ${file.error}`);
      console.log(`    Attempts: ${file.retryAttempt}/${maxRetries}\n`);
    });
  }

  // Create and print retry report
  const initialFailed = getFailedFiles(sessionID) || [];
  const report = createRetryReport(
    sessionID,
    initialFailed,
    successfulRetries,
    failedRetries
  );

  printRetryReport(report);

  if (failedRetries.length === 0) {
    clearFailedFiles(sessionID);
    console.log(`🎉 All files processed successfully!\n`);
    process.exit(0);
  } else {
    console.log(`${'─'.repeat(80)}\n`);
    console.log(`To retry these files later, run:\n`);
    console.log(`  node batch-ingest-retry-session.js ${sessionID}\n`);
    console.log(`${'─'.repeat(80)}\n`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════════

const resolvedDir = path.resolve(targetDirectory);
ingestDirectory(resolvedDir).catch(error => {
  console.error(`\n❌ Fatal error: ${error.message}`);
  process.exit(1);
});
