import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const productSchema = new mongoose.Schema({}, { collection: 'productsnapshots', strict: false });
const Product = mongoose.model('ProductSnapshot', productSchema);

async function removeDuplicates() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    const productId = 'VEGHCM6M8MFYPVHK__fresh-vegetable';
    const pincode = '201303';
    const scrapedAt = new Date('2026-03-10T02:30:00.000Z');

    // Find all duplicates
    const allRecords = await Product.find({
      productId: productId,
      pincode: pincode,
      scrapedAt: scrapedAt
    }).select('_id new');

    console.log(`Found ${allRecords.length} records for this product combination\n`);

    // Find the one with new: true (correct one)
    const correctRecord = allRecords.find(r => r.new === true);
    const duplicates = allRecords.filter(r => r.new === false);

    if (correctRecord && duplicates.length > 0) {
      console.log(`✓ Found correct record with new: true (ID: ${correctRecord._id})`);
      console.log(`❌ Found ${duplicates.length} duplicates with new: false\n`);

      // Delete duplicates
      const duplicateIds = duplicates.map(d => d._id);
      const result = await Product.deleteMany({
        _id: { $in: duplicateIds }
      });

      console.log(`✓ Deleted ${result.deletedCount} duplicate records`);
      console.log(`✓ Kept the correct record with new: true`);
    } else if (!correctRecord && duplicates.length > 0) {
      console.log('⚠️  No record with new: true found!');
      console.log(`Keeping the first record and deleting ${duplicates.length - 1} others`);
      
      const duplicatesToDelete = duplicates.slice(1).map(d => d._id);
      const result = await Product.deleteMany({
        _id: { $in: duplicatesToDelete }
      });

      console.log(`✓ Deleted ${result.deletedCount} duplicate records`);
      console.log(`✓ Kept 1 record`);
    } else {
      console.log('✓ No duplicates found!');
    }

    // Verify
    const finalCount = await Product.countDocuments({
      productId: productId,
      pincode: pincode,
      scrapedAt: scrapedAt
    });

    console.log(`\n✅ Final count for this product: ${finalCount} record(s)`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

removeDuplicates();
