import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MONGODB_URI = 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const productSchema = new mongoose.Schema({}, { collection: 'productsnapshots', strict: false });
const Product = mongoose.model('ProductSnapshot', productSchema);

async function findAndFixAllPlatformDuplicates() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get all JSON files from the Fruits & Vegetables directory
    const dirPath = path.join(__dirname, '12marchdata/10march/Fruits _ Vegetables');
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));

    console.log(`📂 Found ${files.length} JSON files\n`);

    const targetDate = new Date('2026-03-10T02:30:00.000Z');
    let totalProductsChecked = 0;
    let totalDuplicatesFound = 0;
    let totalDuplicatesRemoved = 0;
    const platformSummary = {};

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);
      const products = data.products || [];

      // Extract platform and pincode from filename
      const match = file.match(/^([^_]+)_(\d+)_/);
      if (!match) continue;

      let platform = match[1];
      const pincode = match[2];

      // Normalize platform names to lowercase
      platform = platform.toLowerCase().replace(/flipkartminutes/i, 'flipkartminutes');

      if (!platformSummary[platform]) {
        platformSummary[platform] = {
          productsChecked: 0,
          duplicatesFound: 0,
          duplicatesRemoved: 0,
          filesProcessed: 0
        };
      }

      console.log(`\n📄 Processing: ${file}`);
      console.log(`   Platform: ${platform} | Pincode: ${pincode} | Products: ${products.length}`);

      let fileDuplicatesFound = 0;
      let fileDuplicatesRemoved = 0;

      for (const product of products) {
        totalProductsChecked++;
        platformSummary[platform].productsChecked++;

        const allRecords = await Product.find({
          productId: product.productId,
          platform: platform,
          pincode: pincode,
          scrapedAt: targetDate
        }).select('_id new');

        if (allRecords.length > 1) {
          fileDuplicatesFound += allRecords.length;
          totalDuplicatesFound += allRecords.length;
          platformSummary[platform].duplicatesFound += allRecords.length;

          // Find the correct record (matching new value from JSON)
          const correctRecord = allRecords.find(r => r.new === product.new);
          let recordToKeep;

          if (correctRecord) {
            recordToKeep = correctRecord._id;
          } else {
            recordToKeep = allRecords[0]._id;
          }

          const toDelete = allRecords.filter(r => r._id.toString() !== recordToKeep.toString());

          if (toDelete.length > 0) {
            const result = await Product.deleteMany({
              _id: { $in: toDelete.map(d => d._id) }
            });
            fileDuplicatesRemoved += result.deletedCount;
            totalDuplicatesRemoved += result.deletedCount;
            platformSummary[platform].duplicatesRemoved += result.deletedCount;
          }
        }
      }

      platformSummary[platform].filesProcessed++;
      console.log(`   ✓ Duplicates found: ${fileDuplicatesFound}, Removed: ${fileDuplicatesRemoved}`);
    }

    // Print summary
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(70));
    console.log(`\nTotal products checked: ${totalProductsChecked}`);
    console.log(`Total duplicate records found: ${totalDuplicatesFound}`);
    console.log(`Total duplicate records removed: ${totalDuplicatesRemoved}`);

    console.log('\n📈 By Platform:');
    for (const [platform, stats] of Object.entries(platformSummary)) {
      console.log(`\n${platform.toUpperCase()}:`);
      console.log(`  Files processed: ${stats.filesProcessed}`);
      console.log(`  Products checked: ${stats.productsChecked}`);
      console.log(`  Duplicates found: ${stats.duplicatesFound}`);
      console.log(`  Duplicates removed: ${stats.duplicatesRemoved}`);
    }

    console.log('\n✅ Cleanup complete for all platforms!');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findAndFixAllPlatformDuplicates();
