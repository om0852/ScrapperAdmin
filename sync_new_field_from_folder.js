import mongoose from 'mongoose';
import ProductSnapshot from './models/ProductSnapshot.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_SCRAPED_AT = new Date('2026-03-10T02:30:00.000Z');
const FRUITS_VEGI_DIR = path.join(__dirname, '12marchdata', '10march', 'Fruits _ Vegetables');
const BATCH_SIZE = 100;

async function syncNewFieldFromJsonFolder() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');
    console.log(`📁 Processing folder: ${FRUITS_VEGI_DIR}\n`);

    // Get all JSON files from the folder
    const jsonFiles = fs.readdirSync(FRUITS_VEGI_DIR)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(FRUITS_VEGI_DIR, file));

    console.log(`Found ${jsonFiles.length} JSON files\n`);

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let filesProcessed = 0;

    for (const jsonFile of jsonFiles) {
      try {
        // Read JSON file
        const fileContent = fs.readFileSync(jsonFile, 'utf8');
        const data = JSON.parse(fileContent);

        if (!data.products || !Array.isArray(data.products)) {
          console.log(`⚠ Skipping ${path.basename(jsonFile)}: No products array`);
          continue;
        }

        const products = data.products;
        const fileName = path.basename(jsonFile);
        console.log(`[${filesProcessed + 1}/${jsonFiles.length}] ${fileName} (${products.length} products)`);

        let fileUpdated = 0;
        let fileFailed = 0;

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
                continue;
              }

              // Normalize platform name to lowercase
              const normalizedPlatform = platform.toLowerCase();

              // Find product in database matching all criteria including target scrapedAt
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
                totalUpdated++;
              } else {
                totalSkipped++;
              }

              totalProcessed++;
            } catch (err) {
              console.error(`  ✗ Error updating product: ${err.message}`);
              fileFailed++;
              totalSkipped++;
            }
          }
        }

        if (fileUpdated > 0) {
          console.log(`  ✓ Updated ${fileUpdated} products`);
        }
        if (fileFailed > 0) {
          console.log(`  ✗ Failed: ${fileFailed} products`);
        }
        console.log();

        filesProcessed++;
      } catch (err) {
        console.error(`✗ Error processing file ${path.basename(jsonFile)}: ${err.message}\n`);
      }
    }

    console.log('═══════════════════════════════════════');
    console.log('📊 Sync Complete!');
    console.log('═══════════════════════════════════════');
    console.log(`Files Processed: ${filesProcessed}/${jsonFiles.length}`);
    console.log(`Total Products Processed: ${totalProcessed}`);
    console.log(`Total Updated: ${totalUpdated}`);
    console.log(`Total Skipped/Not Found: ${totalSkipped}`);

    // Show sample of synced products
    const sample = await ProductSnapshot.findOne({
      scrapedAt: TARGET_SCRAPED_AT
    }).limit(1);

    if (sample) {
      console.log('\n✓ Sample synced product:');
      console.log(`  Product ID: ${sample.productId}`);
      console.log(`  Platform: ${sample.platform}`);
      console.log(`  Pincode: ${sample.pincode}`);
      console.log(`  New field: ${sample.new}`);
      console.log(`  ScrapedAt: ${sample.scrapedAt}`);
    }

    await mongoose.connection.close();
    console.log('\n✓ Connection closed');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

syncNewFieldFromJsonFolder();
