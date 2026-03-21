import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MONGODB_URI = 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const productSnapshotSchema = new mongoose.Schema({}, { collection: 'productsnapshots' });
const ProductSnapshot = mongoose.model('ProductSnapshot', productSnapshotSchema);

// Get the directory of all JSON files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jsonDir = path.join(__dirname, '12marchdata', '10march', 'Fruits _ Vegetables');

async function updateNewFieldAllPlatforms() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB');
        console.log('📝 Starting update of "new" field for all platforms...\n');

        // Target date
        const targetDate = new Date('2026-03-10T02:30:00.000Z');
        console.log(`🎯 Target scrapedAt: ${targetDate.toISOString()}\n`);

        // Get all JSON files in the directory
        const files = fs.readdirSync(jsonDir).filter(file => file.endsWith('.json'));
        console.log(`📂 Found ${files.length} JSON files\n`);

        let totalFilesProcessed = 0;
        let totalProductsUpdated = 0;

        // Process each JSON file
        for (const file of files) {
            const filePath = path.join(jsonDir, file);
            const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const products = fileData.products || [];

            if (products.length === 0) {
                console.log(`⏭️  Skipping ${file} (no products)`);
                continue;
            }

            // Extract info from filename
            // Format: Platform_Pincode_ScrapedAt.json
            const match = file.match(/^([A-Za-z]+)_(\d+)_/);
            if (!match) {
                console.log(`⚠️  Skipping ${file} (invalid filename format)`);
                continue;
            }

            const [, platform, pincode] = match;
            const platformLower = platform.toLowerCase();

            console.log(`📄 Processing: ${file}`);
            console.log(`   Platform: ${platformLower} | Pincode: ${pincode}`);
            console.log(`   ScrapedAt: ${targetDate.toISOString()}`);

            let batchUpdated = 0;

            // Process products in batches of 100
            for (let i = 0; i < products.length; i += 100) {
                const batch = products.slice(i, i + 100);
                const batchOps = [];

                for (const prod of batch) {
                    batchOps.push({
                        updateMany: {
                            filter: {
                                productId: prod.productId,
                                platform: platformLower,
                                pincode: pincode,
                                scrapedAt: targetDate,
                                new: false  // Only update products that are NOT marked as new
                            },
                            update: {
                                $set: {
                                    new: prod.new
                                }
                            }
                        }
                    });
                }

                // Execute batch
                const result = await ProductSnapshot.collection.bulkWrite(batchOps);
                batchUpdated += result.modifiedCount;
            }

            totalProductsUpdated += batchUpdated;
            totalFilesProcessed++;
            console.log(`   ✓ Updated ${batchUpdated} products\n`);
        }

        console.log(`\n✅ Update Complete!`);
        console.log(`\n📈 Final Summary:`);
        console.log(`   ✓ Files processed: ${totalFilesProcessed}`);
        console.log(`   ✓ Total products updated: ${totalProductsUpdated}`);
        console.log(`   🎯 Target date: ${targetDate.toISOString()}`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB\n');
    }
}

updateNewFieldAllPlatforms();
