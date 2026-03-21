import mongoose from 'mongoose';
import ProductSnapshot from './models/ProductSnapshot.js';
import dotenv from 'dotenv';

dotenv.config();

const BATCH_SIZE = 1000;
const TARGET_SCRAPED_AT = new Date('2026-03-10T02:30:00.000Z');

async function updateNewFieldByDate() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Find total count of products with target scrapedAt
    const totalCount = await ProductSnapshot.countDocuments({
      scrapedAt: TARGET_SCRAPED_AT
    });

    if (totalCount === 0) {
      console.log(`No products found with scrapedAt: ${TARGET_SCRAPED_AT}`);
      await mongoose.connection.close();
      return;
    }

    console.log(`\nFound ${totalCount} products with scrapedAt: ${TARGET_SCRAPED_AT}`);
    console.log(`Updating using bulk operations in batches of ${BATCH_SIZE}...\n`);

    let processedCount = 0;
    let updatedCount = 0;

    // Process in batches using updateMany
    for (let skip = 0; skip < totalCount; skip += BATCH_SIZE) {
      const batch = await ProductSnapshot.find({
        scrapedAt: TARGET_SCRAPED_AT
      })
        .select('_id')
        .limit(BATCH_SIZE)
        .skip(skip)
        .lean();

      if (batch.length === 0) break;

      const ids = batch.map(doc => doc._id);

      try {
        // Update all products in this batch
        const result = await ProductSnapshot.updateMany(
          { _id: { $in: ids } },
          { new: true }
        );

        updatedCount += result.modifiedCount || 0;
        processedCount += batch.length;

        const progress = Math.min(skip + BATCH_SIZE, totalCount);
        console.log(`Progress: ${progress}/${totalCount} products processed (${updatedCount} updated)`);
      } catch (err) {
        console.error(`Error updating batch at skip ${skip}:`, err.message);
      }
    }

    console.log('\n📊 Update Complete!');
    console.log(`Processed: ${processedCount}`);
    console.log(`Updated: ${updatedCount}`);

    // Show sample of updated products
    const sample = await ProductSnapshot.findOne({
      scrapedAt: TARGET_SCRAPED_AT,
      new: true
    });

    if (sample) {
      console.log('\n✓ Sample updated product:');
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

updateNewFieldByDate();
