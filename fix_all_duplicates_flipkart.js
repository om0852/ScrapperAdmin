import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MONGODB_URI = 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const productSchema = new mongoose.Schema({}, { collection: 'productsnapshots', strict: false });
const Product = mongoose.model('ProductSnapshot', productSchema);

async function findAndFixAllDuplicates() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Read the JSON file to get all product IDs
    const filePath = path.join(__dirname, '12marchdata/10march/Fruits _ Vegetables/FlipkartMinutes_201303_2026-03-10T16-20-11-605Z.json');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    const products = data.products || [];

    const pincode = '201303';
    const scrapedAt = new Date('2026-03-10T02:30:00.000Z');
    const platform = 'flipkartMinutes';

    console.log(`📊 Checking ${products.length} products for duplicates...\n`);

    let totalDuplicatesFound = 0;
    let totalDuplicatesRemoved = 0;
    const productsWithDuplicates = [];

    for (const product of products) {
      const allRecords = await Product.find({
        productId: product.productId,
        pincode: pincode,
        scrapedAt: scrapedAt
      }).select('_id new');

      if (allRecords.length > 1) {
        totalDuplicatesFound += allRecords.length;
        const trueCount = allRecords.filter(r => r.new === true).length;
        const falseCount = allRecords.filter(r => r.new === false).length;

        productsWithDuplicates.push({
          productId: product.productId,
          total: allRecords.length,
          newTrue: trueCount,
          newFalse: falseCount
        });

        // Remove all but one (prefer the one with correct new value from JSON)
        const correctRecord = allRecords.find(r => r.new === product.new);
        let recordToKeep;

        if (correctRecord) {
          recordToKeep = correctRecord._id;
        } else {
          // If no matching new value, keep the first one
          recordToKeep = allRecords[0]._id;
        }

        const toDelete = allRecords.filter(r => r._id.toString() !== recordToKeep.toString());
        
        if (toDelete.length > 0) {
          const result = await Product.deleteMany({
            _id: { $in: toDelete.map(d => d._id) }
          });
          totalDuplicatesRemoved += result.deletedCount;
        }
      }
    }

    console.log(`\n📈 Summary:`);
    console.log(`  Products with duplicates: ${productsWithDuplicates.length}`);
    console.log(`  Total duplicate records found: ${totalDuplicatesFound}`);
    console.log(`  Total duplicate records removed: ${totalDuplicatesRemoved}`);

    if (productsWithDuplicates.length > 0) {
      console.log(`\n📋 Products with duplicates:`);
      productsWithDuplicates.slice(0, 10).forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.productId}: ${p.total} records (new:true=${p.newTrue}, new:false=${p.newFalse})`);
      });
      if (productsWithDuplicates.length > 10) {
        console.log(`  ... and ${productsWithDuplicates.length - 10} more`);
      }
    }

    console.log(`\n✅ Cleanup complete!`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findAndFixAllDuplicates();
