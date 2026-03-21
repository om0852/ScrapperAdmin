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
const DATA_DIR = path.join(__dirname, '12marchdata');
const BATCH_SIZE = 100;

async function getAllJsonFiles(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await getAllJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function syncNewFieldFromJson() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get all JSON files
    const jsonFiles = await getAllJsonFiles(DATA_DIR);
    console.log(`Found ${jsonFiles.length} JSON files\n`);

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const jsonFile of jsonFiles) {
      try {
        // Read JSON file
        const fileContent = fs.readFileSync(jsonFile, 'utf8');
        const data = JSON.parse(fileContent);

        if (!data.products || !Array.isArray(data.products)) {
          continue;
        }

        const products = data.products;
        console.log(`Processing: ${path.basename(jsonFile)} (${products.length} products)`);

        let fileUpdated = 0;

        // Process in batches for efficiency
        for (let i = 0; i < products.length; i += BATCH_SIZE) {
          const batch = products.slice(i, i + BATCH_SIZE);

          for (const product of batch) {
            try {
              const { productId, platform, pincode, category, officialCategory, officialSubCategory, new: newFieldValue } = product;

              if (!productId) {
                totalSkipped++;
                continue;
              }

              // Find product in database matching all criteria including target scrapedAt
              const dbProduct = await ProductSnapshot.findOneAndUpdate(
                {
                  productId,
                  platform,
                  pincode,
                  category,
                  officialCategory,
                  officialSubCategory,
                  scrapedAt: TARGET_SCRAPED_AT
                },
                { new: newFieldValue },
                { returnDocument: 'after' }
              );

              if (dbProduct) {
                fileUpdated++;
                totalUpdated++;
              }

              totalProcessed++;
            } catch (err) {
              console.error(`Error updating product:`, err.message);
              totalSkipped++;
            }
          }
        }

        if (fileUpdated > 0) {
          console.log(`  ✓ Updated ${fileUpdated} products from this file\n`);
        }
      } catch (err) {
        console.error(`Error processing file ${jsonFile}:`, err.message);
      }
    }

    console.log('\n📊 Sync Complete!');
    console.log(`Total Processed: ${totalProcessed}`);
    console.log(`Total Updated: ${totalUpdated}`);
    console.log(`Total Skipped: ${totalSkipped}`);

    // Show sample of updated products
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

syncNewFieldFromJson();
