import mongoose from 'mongoose';
import ProductSnapshot from './models/ProductSnapshot.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILE_PATH = path.join(__dirname, '12marchdata', '10march', 'Fruits _ Vegetables', 'Blinkit_201014_2026-03-10T15-06-09-325Z.json');
const TARGET_SCRAPED_AT = new Date('2026-03-10T02:30:00.000Z');
const BATCH_SIZE = 100;

async function syncSingleJsonFile() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Read JSON file
    const fileContent = fs.readFileSync(FILE_PATH, 'utf8');
    const data = JSON.parse(fileContent);

    if (!data.products || !Array.isArray(data.products)) {
      console.log('✗ No products array found in JSON file');
      await mongoose.connection.close();
      return;
    }

    const products = data.products;
    const fileName = path.basename(FILE_PATH);

    console.log(`📁 Processing: ${fileName}`);
    console.log(`📊 Total products in file: ${products.length}`);
    console.log(`🔍 Database scrapedAt: ${TARGET_SCRAPED_AT.toISOString()}\n`);

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalNotFound = 0;

    // Process in batches for efficiency
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);

      for (const product of batch) {
        try {
          const { 
            productId, 
            platform, 
            pincode, 
            category, 
            officialCategory, 
            officialSubCategory, 
            new: newFieldValue 
          } = product;

          if (!productId) {
            totalSkipped++;
            totalProcessed++;
            continue;
          }

          // Normalize platform name (Blinkit -> blinkit, etc.)
          const normalizedPlatform = platform.toLowerCase();

          // Find product in database matching all criteria with FIXED scrapedAt
          const result = await ProductSnapshot.findOneAndUpdate(
            {
              productId,
              platform: normalizedPlatform,
              pincode,
              category,
              officialCategory,
              officialSubCategory,
              scrapedAt: TARGET_SCRAPED_AT
            },
            { new: newFieldValue },
            { returnDocument: 'after' }
          );

          if (result) {
            totalUpdated++;
          } else {
            totalNotFound++;
          }

          totalProcessed++;
        } catch (err) {
          console.error(`  ✗ Error updating product: ${err.message}`);
          totalSkipped++;
        }
      }

      const progress = Math.min(i + BATCH_SIZE, products.length);
      console.log(`Progress: ${progress}/${products.length} products processed`);
    }

    console.log('\n' + '═'.repeat(50));
    console.log('📊 Sync Complete!');
    console.log('═'.repeat(50));
    console.log(`Total Processed: ${totalProcessed}`);
    console.log(`✓ Updated: ${totalUpdated}`);
    console.log(`✗ Not Found: ${totalNotFound}`);
    console.log(`⊘ Skipped: ${totalSkipped}`);

    // Show sample of synced products
    const samples = await ProductSnapshot.find({
      scrapedAt: TARGET_SCRAPED_AT,
      platform: 'blinkit',
      pincode: '201014'
    }).limit(3);

    if (samples.length > 0) {
      console.log('\n✓ Synced Sample Products:');
      samples.forEach((sample, idx) => {
        console.log(`\n  Sample ${idx + 1}:`);
        console.log(`  - Product ID: ${sample.productId}`);
        console.log(`  - Platform: ${sample.platform}`);
        console.log(`  - Pincode: ${sample.pincode}`);
        console.log(`  - Category: ${sample.category}`);
        console.log(`  - New field: ${sample.new}`);
        console.log(`  - ScrapedAt: ${sample.scrapedAt.toISOString()}`);
      });
    }

    await mongoose.connection.close();
    console.log('\n✓ Connection closed');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

syncSingleJsonFile();
