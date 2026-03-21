import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const problematicFile = path.join(__dirname, 'problematic_groupings_fruits_vegetables.json');
const problematicGroupings = JSON.parse(fs.readFileSync(problematicFile, 'utf-8'));

const productSchema = new mongoose.Schema({}, { collection: 'productsnapshots', strict: false });
const ProductSnapshot = mongoose.model('ProductSnapshot', productSchema);

async function findMissingProducts() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Target dates
    const date1 = new Date('2026-03-10T02:30:00.000Z'); // March 10
    const date2 = new Date('2026-03-01T08:00:00.000Z'); // March 1

    console.log(`📅 Checking for products at:`);
    console.log(`   1. ${date1.toISOString()}`);
    console.log(`   2. ${date2.toISOString()}\n`);

    // Extract all unique productIds from groupings
    const allProductIds = new Set();
    const productIdSources = {}; // Map productId to grouping info

    for (const grouping of problematicGroupings) {
      for (const [platform, issue] of Object.entries(grouping.issues)) {
        for (const product of issue.products) {
          const prodId = product.productId;
          allProductIds.add(prodId);
          
          if (!productIdSources[prodId]) {
            productIdSources[prodId] = {
              platform,
              groupingId: grouping.groupingId,
              groupName: grouping.primaryName,
              baseId: product.baseId
            };
          }
        }
      }
    }

    console.log(`📊 Total unique productIds in problematic groupings: ${allProductIds.size}\n`);

    // Check which products exist at each date
    const productsAtDate1 = new Set();
    const productsAtDate2 = new Set();
    const missingAtBothDates = [];
    const missingAtDate1 = [];
    const missingAtDate2 = [];

    const batchSize = 100;
    const productArray = Array.from(allProductIds);

    console.log(`🔍 Checking database for existence at both dates...\n`);

    for (let i = 0; i < productArray.length; i += batchSize) {
      const batch = productArray.slice(i, Math.min(i + batchSize, productArray.length));

      // Check at date 1
      const recordsDate1 = await ProductSnapshot.find({
        productId: { $in: batch },
        scrapedAt: date1
      }).lean();

      recordsDate1.forEach(rec => productsAtDate1.add(rec.productId));

      // Check at date 2
      const recordsDate2 = await ProductSnapshot.find({
        productId: { $in: batch },
        scrapedAt: date2
      }).lean();

      recordsDate2.forEach(rec => productsAtDate2.add(rec.productId));

      process.stdout.write(`   Checked ${Math.min(i + batchSize, productArray.length)}/${productArray.length} products...\r`);
    }

    console.log(`\n✅ Database check complete\n`);

    // Categorize missing products
    for (const prodId of allProductIds) {
      const existsAtDate1 = productsAtDate1.has(prodId);
      const existsAtDate2 = productsAtDate2.has(prodId);

      if (!existsAtDate1 && !existsAtDate2) {
        missingAtBothDates.push(prodId);
      } else if (!existsAtDate1) {
        missingAtDate1.push(prodId);
      } else if (!existsAtDate2) {
        missingAtDate2.push(prodId);
      }
    }

    // Display results
    console.log(`\n📈 SUMMARY:\n`);
    console.log(`   Present at both dates: ${allProductIds.size - missingAtDate1.length - missingAtDate2.length - missingAtBothDates.length}`);
    console.log(`   Missing at March 10: ${missingAtDate1.length}`);
    console.log(`   Missing at March 1: ${missingAtDate2.length}`);
    console.log(`   Missing at BOTH dates: ${missingAtBothDates.length}`);

    // Save detailed results
    const results = {
      checkDates: {
        date1: date1.toISOString(),
        date2: date2.toISOString()
      },
      summary: {
        totalProductIds: allProductIds.size,
        presentAtBothDates: allProductIds.size - missingAtDate1.length - missingAtDate2.length - missingAtBothDates.length,
        missingAtDate1Only: missingAtDate1.length,
        missingAtDate2Only: missingAtDate2.length,
        missingAtBothDates: missingAtBothDates.length
      },
      missingAtBothDates: missingAtBothDates.map(prodId => ({
        productId: prodId,
        ...productIdSources[prodId]
      })),
      missingAtDate1Only: missingAtDate1.map(prodId => ({
        productId: prodId,
        ...productIdSources[prodId]
      })),
      missingAtDate2Only: missingAtDate2.map(prodId => ({
        productId: prodId,
        ...productIdSources[prodId]
      }))
    };

    const outputPath = path.join(__dirname, 'missing_products_at_dates.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    console.log(`\n✅ Results saved to: missing_products_at_dates.json\n`);

    // Display details
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    if (missingAtBothDates.length > 0) {
      console.log(`❌ PRODUCTS MISSING AT BOTH DATES (${missingAtBothDates.length}):\n`);
      missingAtBothDates.slice(0, 20).forEach((prodId, idx) => {
        const source = productIdSources[prodId];
        console.log(`${idx + 1}. ${prodId}`);
        console.log(`   From: ${source.groupName}`);
        console.log(`   Platform: ${source.platform}`);
        console.log(`   Base ID: ${source.baseId}`);
      });
      if (missingAtBothDates.length > 20) {
        console.log(`   ... and ${missingAtBothDates.length - 20} more`);
      }
    }

    if (missingAtDate1.length > 0) {
      console.log(`\n⚠️ PRODUCTS MISSING AT MARCH 10 (${missingAtDate1.length}):\n`);
      missingAtDate1.slice(0, 10).forEach((prodId, idx) => {
        const source = productIdSources[prodId];
        console.log(`${idx + 1}. ${prodId} (from group: ${source.groupName})`);
      });
      if (missingAtDate1.length > 10) {
        console.log(`   ... and ${missingAtDate1.length - 10} more`);
      }
    }

    if (missingAtDate2.length > 0) {
      console.log(`\n⚠️ PRODUCTS MISSING AT MARCH 1 (${missingAtDate2.length}):\n`);
      missingAtDate2.slice(0, 10).forEach((prodId, idx) => {
        const source = productIdSources[prodId];
        console.log(`${idx + 1}. ${prodId} (from group: ${source.groupName})`);
      });
      if (missingAtDate2.length > 10) {
        console.log(`   ... and ${missingAtDate2.length - 10} more`);
      }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

findMissingProducts();
