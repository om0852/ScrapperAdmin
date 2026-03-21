import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const productSchema = new mongoose.Schema({}, { collection: 'productsnapshots', strict: false });
const Product = mongoose.model('ProductSnapshot', productSchema);

async function quickDuplicateCheck() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    const targetDate = new Date('2026-03-10T02:30:00.000Z');

    // Get all records for target date grouped by platform
    const records = await Product.find({ scrapedAt: targetDate })
      .select('productId platform pincode')
      .lean();

    console.log(`Total records for 2026-03-10T02:30:00.000Z: ${records.length}\n`);

    // Count duplicates by finding combinations that appear more than once
    const combinations = {};
    let duplicateCount = 0;

    for (const rec of records) {
      const key = `${rec.productId}|${rec.platform}|${rec.pincode}`;
      combinations[key] = (combinations[key] || 0) + 1;
      if (combinations[key] > 1) {
        duplicateCount++;
      }
    }

    const uniqueCombinations = Object.keys(combinations).length;
    const duplicateEntries = duplicateCount;

    console.log(`Unique productId+platform+pincode combinations: ${uniqueCombinations}`);
    console.log(`Records that are duplicates: ${duplicateEntries}`);
    console.log(`\nDuplicate ratio: ${(duplicateEntries / records.length * 100).toFixed(2)}%`);

    // By platform stats
    console.log(`\n📈 Records by Platform:`);
    const platforms = {};
    for (const rec of records) {
      if (!platforms[rec.platform]) platforms[rec.platform] = 0;
      platforms[rec.platform]++;
    }

    for (const [platform, count] of Object.entries(platforms).sort()) {
      console.log(`  ${platform}: ${count} records`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

quickDuplicateCheck();
