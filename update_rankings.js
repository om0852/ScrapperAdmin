import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const MONGODB_URI = 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const productSnapshotSchema = new mongoose.Schema({}, { collection: 'productsnapshots' });
const ProductSnapshot = mongoose.model('ProductSnapshot', productSnapshotSchema);

async function updateRankingsInBulk() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB');
        console.log('📝 Starting bulk ranking update...\n');

        // Read the JSON file
        const filePath = path.join(
            'D:/creatosaurus-intership/quick-commerce-scrappers/mainserver/12marchdata/10march/Fruits _ Vegetables',
            'Blinkit_201303_2026-03-10T14-01-38-270Z.json'
        );

        const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const products = fileData.products;

        console.log(`📊 Total products to process: ${products.length}`);

        // Target date for update
        const targetDate = new Date('2026-03-10T02:30:00.000Z');
        console.log(`🎯 Target scrapedAt: ${targetDate.toISOString()}`);
        console.log(`📍 Platform: blinkit | Pincode: 201303\n`);

        let totalUpdated = 0;
        let processedCount = 0;

        // Process in batches of 100 to avoid overwhelming the database
        for (let i = 0; i < products.length; i += 100) {
            const batch = products.slice(i, i + 100);
            const batchOps = [];

            for (const prod of batch) {
                batchOps.push({
                    updateMany: {
                        filter: {
                            productId: prod.productId,
                            platform: 'blinkit',
                            pincode: '201303',
                            scrapedAt: targetDate,
                            new: false  // Only update products that are NOT marked as new
                        },
                        update: {
                            $set: {
                                ranking: prod.ranking,
                                officialSubCategory: prod.officialSubCategory,
                                categoryUrl: prod.categoryUrl
                            }
                        }
                    }
                });
            }

            // Execute batch
            const result = await ProductSnapshot.collection.bulkWrite(batchOps);
            totalUpdated += result.modifiedCount;
            processedCount += batch.length;

            // Progress update
            const progress = Math.round((processedCount / products.length) * 100);
            process.stdout.write(`\r⏳ Progress: ${processedCount}/${products.length} (${progress}%) - Updated so far: ${totalUpdated}`);
        }

        console.log(`\n\n✅ Update Complete!`);
        console.log(`\n📈 Final Summary:`);
        console.log(`   ✓ Successfully updated: ${totalUpdated} product rankings`);
        console.log(`   📦 Total processed: ${products.length}`);
        console.log(`   🎯 Filter: scrapedAt = ${targetDate.toISOString()}`);
        console.log(`   📍 Filter: platform = blinkit, pincode = 201303`);

        if (totalUpdated > 0) {
            console.log(`\n✨ Database rankings have been synchronized with the file!`);
        } else {
            console.log(`\n⚠️ No records were updated. Please verify the data.`);
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB\n');
    }
}

updateRankingsInBulk();
