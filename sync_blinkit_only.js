import mongoose from 'mongoose';
import ProductSnapshot from './models/ProductSnapshot.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRUITS_VEGI_DIR = path.join(__dirname, '12marchdata', '10march', 'Fruits _ Vegetables');
const TARGET_SCRAPED_AT = new Date('2026-03-10T02:30:00.000Z');
const BATCH_SIZE = 100;

async function syncBlinkitFilesOnly() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get only Blinkit JSON files from the folder
    const allFiles = fs.readdirSync(FRUITS_VEGI_DIR)
      .filter(file => file.endsWith('.json') && file.startsWith('Blinkit_'))
      .sort();

    console.log(`📁 Found ${allFiles.length} Blinkit JSON files`);
    console.log(`🔍 Database scrapedAt: ${TARGET_SCRAPED_AT.toISOString()}\n`);
    console.log('═'.repeat(70));

    let globalTotalProcessed = 0;
    let globalTotalUpdated = 0;
    let globalTotalNotFound = 0;
    let globalTotalSkipped = 0;
    let filesProcessed = 0;
    let filesWithUpdates = 0;

    for (const fileName of allFiles) {
      const jsonFile = path.join(FRUITS_VEGI_DIR, fileName);

      try {
        // Read JSON file
        const fileContent = fs.readFileSync(jsonFile, 'utf8');
        const data = JSON.parse(fileContent);

        if (!data.products || !Array.isArray(data.products)) {
          console.log(`[${filesProcessed + 1}/${allFiles.length}] ${fileName.padEnd(55)} ⚠ No products`);
          filesProcessed++;
          continue;
        }

        const products = data.products;
        let fileUpdated = 0;
        let fileNotFound = 0;
        let fileSkipped = 0;

        // Process in batches
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
                fileSkipped++;
                globalTotalSkipped++;
                continue;
              }

              // Normalize platform name to lowercase
              const normalizedPlatform = platform.toLowerCase();

              // Update product in database
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
                fileUpdated++;
                globalTotalUpdated++;
              } else {
                fileNotFound++;
                globalTotalNotFound++;
              }

              globalTotalProcessed++;
            } catch (err) {
              fileSkipped++;
              globalTotalSkipped++;
            }
          }
        }

        filesProcessed++;
        if (fileUpdated > 0) {
          filesWithUpdates++;
        }

        const status = fileUpdated > 0 ? `✓ ${fileUpdated}`.padStart(8) : `✗ 0`.padStart(8);
        console.log(`[${filesProcessed}/${allFiles.length}] ${fileName.padEnd(55)} ${status} updated`);
      } catch (err) {
        console.error(`✗ Error processing ${fileName}: ${err.message}`);
        filesProcessed++;
      }
    }

    console.log('═'.repeat(70));
    console.log('\n📊 Final Summary');
    console.log('═'.repeat(70));
    console.log(`Files Processed: ${filesProcessed}/${allFiles.length}`);
    console.log(`Files With Updates: ${filesWithUpdates}`);
    console.log(`\nProduct Statistics:`);
    console.log(`  Total Processed: ${globalTotalProcessed}`);
    console.log(`  ✓ Updated: ${globalTotalUpdated}`);
    console.log(`  ✗ Not Found: ${globalTotalNotFound}`);
    console.log(`  ⊘ Skipped: ${globalTotalSkipped}`);
    console.log('═'.repeat(70));

    // Verify with count
    const dbCount = await ProductSnapshot.countDocuments({
      scrapedAt: TARGET_SCRAPED_AT,
      platform: 'blinkit'
    });

    console.log(`\n🔍 Total Blinkit products in DB with this scrapedAt: ${dbCount}`);

    const samples = await ProductSnapshot.find({
      scrapedAt: TARGET_SCRAPED_AT,
      platform: 'blinkit'
    }).limit(3);

    if (samples.length > 0) {
      console.log('\n✓ Sample synced Blinkit products:');
      samples.forEach((sample, idx) => {
        console.log(`\n  Sample ${idx + 1}:`);
        console.log(`  - Product ID: ${sample.productId}`);
        console.log(`  - Platform: ${sample.platform}`);
        console.log(`  - Pincode: ${sample.pincode}`);
        console.log(`  - New field: ${sample.new}`);
      });
    }

    await mongoose.connection.close();
    console.log('\n✓ Connection closed');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

syncBlinkitFilesOnly();
