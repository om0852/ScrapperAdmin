import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MONGODB_URI = 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const productSchema = new mongoose.Schema({}, { collection: 'productsnapshots', strict: false });
const Product = mongoose.model('ProductSnapshot', productSchema);

async function insertFlipkartMinutesProducts() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Read the JSON file
    const filePath = path.join(__dirname, '12marchdata/10march/Fruits _ Vegetables/FlipkartMinutes_201303_2026-03-10T16-20-11-605Z.json');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    const products = data.products || [];

    console.log(`\n📝 Inserting Flipkart Minutes products...`);
    console.log(`📂 File: FlipkartMinutes_201303_2026-03-10T16-20-11-605Z.json`);
    console.log(`📊 Total products in file: ${products.length}`);

    const targetDate = new Date('2026-03-10T02:30:00.000Z');
    const pincode = '201303';
    const platform = 'flipkartMinutes';

    let totalInserted = 0;
    let totalUpdated = 0;
    const batchSize = 100;

    // Process in batches
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, Math.min(i + batchSize, products.length));
      const bulkOps = [];

      batch.forEach(prod => {
        bulkOps.push({
          updateOne: {
            filter: {
              productId: prod.productId,
              platform: platform,
              pincode: pincode,
              scrapedAt: targetDate
            },
            update: {
              $set: {
                ...prod,
                platform: platform,
                pincode: pincode,
                scrapedAt: targetDate
              }
            },
            upsert: true
          }
        });
      });

      if (bulkOps.length > 0) {
        const result = await Product.collection.bulkWrite(bulkOps);
        totalInserted += result.upsertedCount || 0;
        totalUpdated += result.modifiedCount || 0;
      }
    }

    console.log(`\n✓ Total upserted: ${totalInserted + totalUpdated} products`);
    console.log(`  - Inserted: ${totalInserted}`);
    console.log(`  - Updated: ${totalUpdated}`);
    console.log(`🎯 Target scrapedAt: ${targetDate.toISOString()}`);
    console.log(`🎯 Platform: ${platform}`);
    console.log(`🎯 Pincode: ${pincode}`);

    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

insertFlipkartMinutesProducts();
