import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const productSnapshotSchema = new mongoose.Schema({}, { collection: 'productsnapshots' });
const ProductSnapshot = mongoose.model('ProductSnapshot', productSnapshotSchema);

async function removeDuplicateProducts() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✓ Connected to MongoDB\n');

        // Target scrape date
        const targetScrapedAt = new Date('2026-03-10T02:30:00.000Z');
        
        console.log(`🎯 Removing duplicates for scrapeAt: ${targetScrapedAt.toISOString()}\n`);

        // Find all products from this scrape date
        const allProducts = await ProductSnapshot.find({ 
            scrapedAt: targetScrapedAt 
        }).lean();

        console.log(`Found ${allProducts.length} total products on this date\n`);

        // Group by composite key: productId + pincode + category + officialCategory + officialSubCategory
        const groupedByKey = {};
        let totalDuplicates = 0;

        for (const prod of allProducts) {
            const category = (prod.category || 'Unknown').trim();
            const officialCategory = prod.officialCategory || 'N/A';
            const officialSubCategory = prod.officialSubCategory || prod.officalSubCategory || 'N/A';
            const pincode = prod.pincode || 'N/A';
            const productId = prod.productId || 'N/A';

            const key = `${productId}|${pincode}|${category}|${officialCategory}|${officialSubCategory}`;

            if (!groupedByKey[key]) {
                groupedByKey[key] = [];
            }
            groupedByKey[key].push({
                id: prod._id,
                key: key,
                productId: productId,
                platform: prod.platform,
                pincode: pincode,
                category: category,
                productName: prod.productName
            });
        }

        console.log(`Found ${Object.keys(groupedByKey).length} unique combinations\n`);

        // Find duplicates
        const duplicateGroups = Object.entries(groupedByKey).filter(([key, items]) => items.length > 1);

        console.log(`Found ${duplicateGroups.length} groups with duplicates\n`);

        let idsToDelete = [];

        for (const [key, items] of duplicateGroups) {
            const [productId, pincode, category, officialCategory, officialSubCategory] = key.split('|');
            
            console.log(`\n⚠️  Duplicate Group:`);
            console.log(`    ProductId: ${productId}`);
            console.log(`    Pincode: ${pincode}`);
            console.log(`    Category: ${category}`);
            console.log(`    OfficialCategory: ${officialCategory}`);
            console.log(`    OfficialSubCategory: ${officialSubCategory}`);
            console.log(`    Found: ${items.length} duplicates\n`);

            // Keep the first one, mark others for deletion
            for (let i = 1; i < items.length; i++) {
                const item = items[i];
                console.log(`    Deleting: ${item.platform} | ${item.productName} | ID: ${item.id}`);
                idsToDelete.push(item.id);
            }
            
            totalDuplicates += items.length - 1;
        }

        if (idsToDelete.length === 0) {
            console.log('✅ No duplicates found! Database is clean.');
            await mongoose.disconnect();
            return;
        }

        console.log(`\n${'='.repeat(70)}`);
        console.log(`Total duplicates to delete: ${totalDuplicates}`);
        console.log(`${'='.repeat(70)}\n`);

        // Confirm deletion
        console.log('🗑️  Deleting duplicates...\n');

        // Delete in batches
        for (let i = 0; i < idsToDelete.length; i += 100) {
            const batch = idsToDelete.slice(i, i + 100);
            const result = await ProductSnapshot.deleteMany({ 
                _id: { $in: batch } 
            });
            console.log(`✓ Batch ${Math.floor(i/100) + 1}: Deleted ${result.deletedCount} products`);
        }

        console.log(`\n✅ Deletion Complete!`);
        console.log(`\n📊 Summary:`);
        console.log(`   ✓ Target scrapedAt: ${targetScrapedAt.toISOString()}`);
        console.log(`   ✓ Duplicate groups found: ${duplicateGroups.length}`);
        console.log(`   ✓ Total products deleted: ${totalDuplicates}`);
        console.log(`   ✓ Remaining products: ${allProducts.length - totalDuplicates}`);

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB');
        process.exit(0);
    }
}

removeDuplicateProducts();
