#!/usr/bin/env node

/**
 * Retry Failed File Ingestion
 * Re-ingests a specific file that failed during batch processing
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { ingestJsonFile } from './utils/manualIngest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION - Failed file details
// ═══════════════════════════════════════════════════════════════════

const FAILED_FILE = {
  name: 'Instamart_400070_2026-03-27T06-52-29-295Z.json',
  directory: 'Fruits _ Vegetables',
  pincode: '400070',
  platform: 'Instamart'
};

// ═══════════════════════════════════════════════════════════════════
// Retry Ingestion
// ═══════════════════════════════════════════════════════════════════

async function retryFailedFile() {
  const filePath = path.join(
    __dirname, 
    'scraped_data', 
    FAILED_FILE.directory, 
    FAILED_FILE.name
  );

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔄 RETRYING FAILED FILE INGESTION`);
  console.log(`${'='.repeat(70)}\n`);
  
  console.log(`📂 File: ${FAILED_FILE.name}`);
  console.log(`📍 Pincode: ${FAILED_FILE.pincode}`);
  console.log(`🏪 Platform: ${FAILED_FILE.platform}`);
  console.log(`📚 Category: ${FAILED_FILE.directory}\n`);

  try {
    console.log(`🚀 Starting ingestion...`);
    const result = await ingestJsonFile(
      filePath,
      FAILED_FILE.pincode,
      FAILED_FILE.platform,
      false, // skipCategoryMapping = false (enable category mapping with fix)
      null   // dateOverride = null (use original timestamp)
    );

    if (result.success) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`✅ SUCCESS - File re-ingested successfully!`);
      console.log(`${'='.repeat(70)}\n`);
      
      console.log(`📊 Ingestion Results:`);
      console.log(`  - File: ${result.file}`);
      console.log(`  - Pincode: ${result.pincode}`);
      console.log(`  - Platform: ${result.platform}`);
      console.log(`  - Category: ${result.category}`);
      console.log(`  - Controller Result: ${JSON.stringify(result.result, null, 2)}`);
      
      console.log(`\n🎉 Failed file has been successfully re-processed!`);
      process.exit(0);
    } else {
      console.log(`\n❌ FAILED - Ingestion returned false`);
      console.log(`Error: ${result.error || 'Unknown error'}`);
      process.exit(1);
    }

  } catch (error) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`❌ ERROR - Failed to retry ingestion`);
    console.log(`${'='.repeat(70)}\n`);
    console.error(`Error Details:`, error);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Run
// ═══════════════════════════════════════════════════════════════════

retryFailedFile();
