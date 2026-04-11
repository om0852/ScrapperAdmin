/**
 * Failed Ingestion Tracker
 * Tracks failed files during batch ingestion and provides retry capabilities
 * Automatically saves failed file details for later retry attempts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAILED_LOG_DIR = path.join(__dirname, '..', 'failed_ingestion_logs');

// Ensure failed logs directory exists
const ensureFailedLogsDir = () => {
  if (!fs.existsSync(FAILED_LOG_DIR)) {
    fs.mkdirSync(FAILED_LOG_DIR, { recursive: true });
  }
};

/**
 * Create a unique session ID for tracking ingestion attempts
 */
export const createSessionId = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const random = Math.random().toString(36).slice(2, 8);
  return `ingest_${timestamp}_${random}`;
};

/**
 * Log a failed file with details for retry
 */
export const logFailedFile = (sessionId, failedFileData) => {
  ensureFailedLogsDir();

  const failedFile = {
    timestamp: new Date().toISOString(),
    fileName: failedFileData.fileName,
    filePath: failedFileData.filePath,
    categoryFolder: failedFileData.categoryFolder,
    pincode: failedFileData.pincode,
    platform: failedFileData.platform,
    error: failedFileData.error,
    fileSize: failedFileData.fileSize || 0,
    retryCount: failedFileData.retryCount || 0,
    lastRetryTime: failedFileData.lastRetryTime || null
  };

  const sessionLogPath = path.join(FAILED_LOG_DIR, `${sessionId}_failed.json`);
  
  try {
    let failedFiles = [];
    
    if (fs.existsSync(sessionLogPath)) {
      const existing = fs.readFileSync(sessionLogPath, 'utf8');
      failedFiles = JSON.parse(existing);
    }
    
    // Check if file already logged to avoid duplicates
    const exists = failedFiles.some(f => f.filePath === failedFile.filePath);
    if (!exists) {
      failedFiles.push(failedFile);
      fs.writeFileSync(sessionLogPath, JSON.stringify(failedFiles, null, 2), 'utf8');
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to log failed file: ${error.message}`);
    return false;
  }
};

/**
 * Get all failed files for a session
 */
export const getFailedFiles = (sessionId) => {
  ensureFailedLogsDir();
  const sessionLogPath = path.join(FAILED_LOG_DIR, `${sessionId}_failed.json`);
  
  try {
    if (!fs.existsSync(sessionLogPath)) {
      return [];
    }
    
    const data = fs.readFileSync(sessionLogPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Failed to read failed files: ${error.message}`);
    return [];
  }
};

/**
 * Clear failed files after successful retry
 */
export const clearFailedFiles = (sessionId) => {
  ensureFailedLogsDir();
  const sessionLogPath = path.join(FAILED_LOG_DIR, `${sessionId}_failed.json`);
  
  try {
    if (fs.existsSync(sessionLogPath)) {
      fs.unlinkSync(sessionLogPath);
      return true;
    }
    return true;
  } catch (error) {
    console.error(`❌ Failed to clear failed files: ${error.message}`);
    return false;
  }
};

/**
 * Update retry count for a failed file
 */
export const updateRetryCount = (sessionId, filePath, newRetryCount) => {
  ensureFailedLogsDir();
  const sessionLogPath = path.join(FAILED_LOG_DIR, `${sessionId}_failed.json`);
  
  try {
    if (!fs.existsSync(sessionLogPath)) {
      return false;
    }
    
    let failedFiles = JSON.parse(fs.readFileSync(sessionLogPath, 'utf8'));
    const file = failedFiles.find(f => f.filePath === filePath);
    
    if (file) {
      file.retryCount = newRetryCount;
      file.lastRetryTime = new Date().toISOString();
      fs.writeFileSync(sessionLogPath, JSON.stringify(failedFiles, null, 2), 'utf8');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Failed to update retry count: ${error.message}`);
    return false;
  }
};

/**
 * Get all session logs to find older failed files
 */
export const getAllFailedSessions = () => {
  ensureFailedLogsDir();
  
  try {
    const files = fs.readdirSync(FAILED_LOG_DIR)
      .filter(file => file.endsWith('_failed.json'));
    
    return files.map(file => file.replace('_failed.json', ''));
  } catch (error) {
    console.error(`❌ Failed to list failed sessions: ${error.message}`);
    return [];
  }
};

/**
 * Create a comprehensive retry report
 */
export const createRetryReport = (sessionId, failedFiles, successfulRetries, failedRetries) => {
  ensureFailedLogsDir();
  
  const report = {
    sessionId,
    generatedAt: new Date().toISOString(),
    totalFailed: failedFiles.length,
    successfulRetries: successfulRetries.length,
    failedRetries: failedRetries.length,
    retrySuccessRate: failedFiles.length > 0 
      ? `${Math.round((successfulRetries.length / failedFiles.length) * 100)}%`
      : '0%',
    failedFiles: failedFiles.map(f => ({
      fileName: f.fileName,
      filePath: f.filePath,
      platform: f.platform,
      pincode: f.pincode,
      originalError: f.error,
      retryCount: f.retryCount || 0
    })),
    successfulRetries: successfulRetries.map(s => ({
      fileName: s.fileName,
      filePath: s.filePath,
      retryAttempt: s.retryAttempt,
      completedAt: s.completedAt
    })),
    failedRetries: failedRetries.map(f => ({
      fileName: f.fileName,
      filePath: f.filePath,
      error: f.error,
      retryAttempt: f.retryAttempt,
      failedAt: f.failedAt
    }))
  };
  
  const reportPath = path.join(FAILED_LOG_DIR, `${sessionId}_retry_report.json`);
  
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    return report;
  } catch (error) {
    console.error(`❌ Failed to create retry report: ${error.message}`);
    return report;
  }
};

/**
 * Print nicely formatted failed files summary
 */
export const printFailedFilesSummary = (failedFiles) => {
  if (failedFiles.length === 0) {
    console.log(`\n✅ No failed files to retry!\n`);
    return;
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`⚠️  FAILED FILES SUMMARY - ${failedFiles.length} file(s) need retry`);
  console.log(`${'='.repeat(80)}\n`);

  failedFiles.forEach((file, index) => {
    console.log(`📄 [${index + 1}/${failedFiles.length}] ${file.fileName}`);
    console.log(`   📍 Pincode: ${file.pincode}`);
    console.log(`   🏪 Platform: ${file.platform}`);
    console.log(`   📁 Category: ${file.categoryFolder || 'Unknown'}`);
    console.log(`   ❌ Error: ${file.error}`);
    console.log(`   🔄 Retry Count: ${file.retryCount || 0}`);
    console.log('');
  });

  console.log(`${'='.repeat(80)}\n`);
};

/**
 * Print nicely formatted retry report
 */
export const printRetryReport = (report) => {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 RETRY REPORT - Session: ${report.sessionId}`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Total Failed Files: ${report.totalFailed}`);
  console.log(`✅ Successful Retries: ${report.successfulRetries}`);
  console.log(`❌ Failed Retries: ${report.failedRetries}`);
  console.log(`🎯 Success Rate: ${report.retrySuccessRate}\n`);

  if (report.successfulRetries > 0) {
    console.log(`${'─'.repeat(80)}`);
    console.log(`✅ SUCCESSFULLY RETRIED FILES:`);
    console.log(`${'─'.repeat(80)}`);
    report.successfulRetries.forEach((file, index) => {
      console.log(`[${index + 1}] ${file.fileName}`);
      console.log(`    ✅ Retry Attempt: ${file.retryAttempt}`);
    });
    console.log('');
  }

  if (report.failedRetries > 0) {
    console.log(`${'─'.repeat(80)}`);
    console.log(`❌ FAILED RETRY FILES (Need Manual Attention):`);
    console.log(`${'─'.repeat(80)}`);
    report.failedRetries.forEach((file, index) => {
      console.log(`[${index + 1}] ${file.fileName}`);
      console.log(`    ❌ Error: ${file.error}`);
      console.log(`    Retry Attempt: ${file.retryAttempt}`);
    });
    console.log('');
  }

  console.log(`Report saved: ${path.join(FAILED_LOG_DIR, `${report.sessionId}_retry_report.json`)}\n`);
  console.log(`${'='.repeat(80)}\n`);
};
