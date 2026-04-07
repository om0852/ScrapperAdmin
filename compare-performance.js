/**
 * Performance Comparison Test
 * Run: node compare-performance.js
 * 
 * Tests both old and new insertion methods to measure improvement
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import processScrapedDataOptimized from './controllers/dataControllerOptimized.js';
import processScrapedDataUltraOptimized from './controllers/dataControllerUltraOptimized.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quick_commerce');
    console.log('✅ Connected to MongoDB\n');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }
}

function loadTestData() {
  // Load a real scraped file
  const testDir = './scraped_data/Fruits _ Vegetables';
  const files = fs.readdirSync(testDir);
  const instamart = files.find(f => f.includes('Instamart'));

  if (!instamart) {
    console.error('❌ No Instamart test data found');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(path.join(testDir, instamart), 'utf8'));
  console.log(`📁 Loaded test file: ${instamart}`);
  console.log(`📊 Contains ${data.products?.length || data.length} products\n`);

  return data;
}

async function runComparison() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║          INSERTION PERFORMANCE COMPARISON TEST            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  await connectDB();
  const testData = loadTestData();

  const pincode = '401202';
  const platform = 'Instamart';
  const category = 'Fruits _ Vegetables';
  const products = (testData.products || testData).slice(0, 200); // Test with first 200

  const testPayload = { pincode, platform, category, products };

  // ═══════════════════════════════════════════════════════════════════
  // TEST 1: OLD OPTIMIZED VERSION
  // ═══════════════════════════════════════════════════════════════════
  console.log('🔄 Testing: dataControllerOptimized (Previous Version)');
  console.log('─'.repeat(60));

  const start1 = process.hrtime.bigint();
  try {
    const result1 = await processScrapedDataOptimized(testPayload);
    const end1 = process.hrtime.bigint();
    const duration1 = Number(end1 - start1) / 1_000_000; // ms

    console.log(`✅ Success`);
    console.log(`   ⏱️  Total time: ${duration1.toFixed(2)}ms`);
    console.log(`   📊 Per product: ${(duration1 / products.length).toFixed(2)}ms`);
    console.log(`   📈 Stats:`, result1.stats);
    console.log();

    var oldTime = duration1;
  } catch (err) {
    console.error(`❌ Error:`, err.message);
    console.log();
    var oldTime = null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 2: NEW ULTRA-OPTIMIZED VERSION
  // ═══════════════════════════════════════════════════════════════════
  console.log('⚡ Testing: dataControllerUltraOptimized (NEW)');
  console.log('─'.repeat(60));

  const start2 = process.hrtime.bigint();
  try {
    const result2 = await processScrapedDataUltraOptimized(testPayload);
    const end2 = process.hrtime.bigint();
    const duration2 = Number(end2 - start2) / 1_000_000; // ms

    console.log(`✅ Success`);
    console.log(`   ⏱️  Total time: ${duration2.toFixed(2)}ms`);
    console.log(`   📊 Per product: ${(duration2 / products.length).toFixed(2)}ms`);
    console.log(`   📈 Stats:`, result2.stats);
    console.log();

    var newTime = duration2;
  } catch (err) {
    console.error(`❌ Error:`, err.message);
    console.log();
    var newTime = null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════════════
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                   📊 RESULTS SUMMARY                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  if (oldTime && newTime) {
    const improvement = ((oldTime - newTime) / oldTime * 100).toFixed(1);
    const speedup = (oldTime / newTime).toFixed(1);

    console.log(`📈 Performance Improvement:`);
    console.log(`   OLD time:           ${oldTime.toFixed(2)}ms`);
    console.log(`   NEW time:           ${newTime.toFixed(2)}ms`);
    console.log(`   ⚡ Faster:          ${improvement}%`);
    console.log(`   🚀 Speedup:         ${speedup}x\n`);

    console.log(`⏱️  Per Product:`);
    console.log(`   OLD: ${(oldTime / products.length).toFixed(2)}ms`);
    console.log(`   NEW: ${(newTime / products.length).toFixed(2)}ms\n`);

    console.log(`📊 Projected for 92,919 products:`);
    const oldTotal = (oldTime * 92919) / products.length / 1000 / 60;
    const newTotal = (newTime * 92919) / products.length / 1000 / 60;

    console.log(`   OLD: ~${oldTotal.toFixed(1)} minutes (${(oldTotal * 60).toFixed(0)} seconds)`);
    console.log(`   NEW: ~${newTotal.toFixed(1)} minutes (${(newTotal * 60).toFixed(0)} seconds)`);
    console.log(`   💰 Time saved: ~${(oldTotal - newTotal).toFixed(1)} minutes\n`);

    if (speedup > 1.3) {
      console.log(`✅ ULTRA-OPTIMIZED VERSION IS RECOMMENDED`);
      console.log(`   Recommendation: Update routes to use dataControllerUltraOptimized.js\n`);
    }
  } else {
    console.log('⚠️  Could not complete comparison (check errors above)\n');
  }

  process.exit(0);
}

runComparison().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
