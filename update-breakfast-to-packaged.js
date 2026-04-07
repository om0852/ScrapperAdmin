/**
 * Update Category: Breakfast & Sauces → Packaged Food
 * For all products with scrapedAt: 2026-03-22T00:00:00Z
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductSnapshot from './models/ProductSnapshot.js';

dotenv.config();

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quick_commerce');
    console.log('✅ Connected to MongoDB\n');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

async function updateCategoryMapping() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔄 UPDATE CATEGORY MAPPING                              ║');
  console.log('║  Breakfast & Sauces → Packaged Food                      ║');
  console.log('║  Filter: scrapedAt = 2026-03-22T00:00:00Z               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    const targetDate = new Date('2026-03-22T00:00:00Z');

    const matchQuery = {
      category: 'Breakfast & Sauces',
      scrapedAt: targetDate
    };

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: COUNT PRODUCTS BEFORE
    // ═══════════════════════════════════════════════════════════════════
    console.log('🔍 Step 1: Analyzing products to update...\n');

    const countBefore = await ProductSnapshot.countDocuments(matchQuery);
    console.log(`📊 Products found: ${countBefore}`);

    if (countBefore === 0) {
      console.log('⚠️  No products found with this filter\n');
      return { success: false, message: 'No products found' };
    }

    // Get platform distribution before
    const platformBefore = await ProductSnapshot.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('   Breakdown by platform:');
    platformBefore.forEach(p => {
      console.log(`     ${p._id}: ${p.count}`);
    });
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: SHOW SAMPLE PRODUCTS BEFORE
    // ═══════════════════════════════════════════════════════════════════
    console.log('📝 Step 2: Sample products (before):\n');

    const samplesBefore = await ProductSnapshot.find(matchQuery).limit(5);
    samplesBefore.forEach((product, index) => {
      console.log(`   [${index + 1}] ${product.productName}`);
      console.log(`       Category: ${product.category}`);
      console.log(`       Platform: ${product.platform}`);
      console.log(`       Pincode: ${product.pincode}\n`);
    });

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: PERFORM UPDATE
    // ═══════════════════════════════════════════════════════════════════
    console.log('💾 Step 3: Updating category...\n');

    const result = await ProductSnapshot.updateMany(
      matchQuery,
      { $set: { category: 'Packaged Food' } }
    );

    console.log(`   ✅ Matched: ${result.matchedCount}`);
    console.log(`   ✅ Modified: ${result.modifiedCount}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: VERIFY UPDATE
    // ═══════════════════════════════════════════════════════════════════
    console.log('🔍 Step 4: Verifying update...\n');

    const countAfter = await ProductSnapshot.countDocuments({
      category: 'Packaged Food',
      scrapedAt: targetDate
    });

    const samplesAfter = await ProductSnapshot.find({
      category: 'Packaged Food',
      scrapedAt: targetDate
    }).limit(5);

    console.log(`✅ Products now in Packaged Food (with Mar 22 date): ${countAfter}`);
    console.log(`   (Includes newly updated ${result.modifiedCount} + existing)\n`);

    console.log('📝 Step 5: Sample products (after):\n');
    samplesAfter.forEach((product, index) => {
      console.log(`   [${index + 1}] ${product.productName}`);
      console.log(`       Category: ${product.category}`);
      console.log(`       Platform: ${product.platform}`);
      console.log(`       Pincode: ${product.pincode}\n`);
    });

    // ═══════════════════════════════════════════════════════════════════
    // FINAL REPORT
    // ═══════════════════════════════════════════════════════════════════
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  ✅ CATEGORY UPDATED                      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('📊 Summary:');
    console.log(`   From Category: Breakfast & Sauces`);
    console.log(`   To Category: Packaged Food`);
    console.log(`   Filter: scrapedAt = 2026-03-22T00:00:00Z`);
    console.log(`   Products Updated: ${result.modifiedCount}`);
    console.log(`   Verified Count: ${countAfter}\n`);

    return {
      success: true,
      updated: result.modifiedCount,
      verified: countAfter
    };

  } catch (err) {
    console.error('❌ Error:', err.message);
    return { success: false, error: err.message };
  }
}

async function main() {
  try {
    await connectDB();
    const result = await updateCategoryMapping();

    if (result.success) {
      console.log(`✅ Done! Updated ${result.updated} products.\n`);
      process.exit(0);
    } else {
      console.error(`❌ Failed: ${result.error || result.message}\n`);
      process.exit(1);
    }

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
