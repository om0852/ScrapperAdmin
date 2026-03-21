import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONGODB_URI = 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const productSnapshotSchema = new mongoose.Schema({}, { collection: 'productsnapshots' });
const ProductSnapshot = mongoose.model('ProductSnapshot', productSnapshotSchema);

// Platform name mapping
const platformMap = {
    'Blinkit': 'blinkit',
    'FlipkartMinutes': 'flipkartMinutes',
    'Instamart': 'instamart',
    'Jiomart': 'jiomart',
    'Zepto': 'zepto',
    'DMart': 'dmart'
};

function parseFilename(filename) {
    // Format: Platform_Pincode_DateTime.json
    const parts = filename.replace('.json', '').split('_');
    
    if (parts.length < 2) return null;
    
    const platform = parts[0];
    const pincode = parts[1];
    
    // Find the date part (last parts joined with _)
    const dateStart = parts.findIndex((p, i) => i > 1 && /^\d{4}-\d{2}-\d{2}T/.test(p));
    const datePart = parts.slice(dateStart).join('_');
    
    return {
        platform: platformMap[platform] || platform.toLowerCase(),
        pincode,
        dateString: datePart
    };
}

async function updateAllRankings() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB\n');
        console.log('📊 Processing all JSON files in Fruits & Vegetables folder...\n');

        const dataDir = path.join(__dirname, '12marchdata/10march/Fruits _ Vegetables');
        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

        console.log(`Found ${files.length} JSON files to process\n`);

        let totalUpdated = 0;
        let processedFiles = 0;

        // Use the exact reference date from database (8 AM UTC = 02:30 AM IST March 10)
        const referenceDate = new Date('2026-03-10T02:30:00.000Z');

        for (const file of files) {
            try {
                const fileData = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
                
                if (!fileData.products || fileData.products.length === 0) {
                    console.log(`⏭️  Skipped: ${file} (no products)`);
                    continue;
                }

                const meta = parseFilename(file);
                if (!meta) {
                    console.log(`⚠️  Could not parse: ${file}`);
                    continue;
                }

                console.log(`\n📄 Processing: ${file}`);
                console.log(`   Platform: ${meta.platform} | Pincode: ${meta.pincode}`);
                console.log(`   Products: ${fileData.products.length}`);

                let fileUpdateCount = 0;
                const batchOps = [];

                for (const prod of fileData.products) {
                    batchOps.push({
                        updateOne: {
                            filter: {
                                productId: prod.productId,
                                platform: meta.platform,
                                pincode: meta.pincode,
                                category: 'Fruits & Vegetables',
                                scrapedAt: referenceDate,
                                new: false  // Only update products that are NOT marked as new
                            },
                            update: {
                                $set: {
                                    ranking: prod.ranking || 999,
                                    officialSubCategory: prod.officialSubCategory,
                                    categoryUrl: prod.categoryUrl,
                                    discountPercentage: prod.discountPercentage,
                                    currentPrice: prod.currentPrice,
                                    originalPrice: prod.originalPrice,
                                    isOutOfStock: prod.isOutOfStock || false
                                }
                            }
                        }
                    });
                }

                // Execute batch
                if (batchOps.length > 0) {
                    const result = await ProductSnapshot.collection.bulkWrite(batchOps);
                    fileUpdateCount = result.modifiedCount;
                    totalUpdated += fileUpdateCount;
                    console.log(`   ✓ Updated: ${fileUpdateCount} products`);
                }

                processedFiles++;
            } catch (err) {
                console.error(`✗ Error processing ${file}: ${err.message}`);
            }
        }

        console.log(`\n\n✅ All Files Processed!`);
        console.log(`\n📈 Final Summary:`);
        console.log(`   ✓ Files processed: ${processedFiles}/${files.length}`);
        console.log(`   ✓ Total products updated: ${totalUpdated}`);
        console.log(`   🎯 Reference date: ${referenceDate.toISOString()}`);
        console.log(`   📍 Only updated products where new = false`);

        if (totalUpdated > 0) {
            console.log(`\n✨ Database has been synchronized with all JSON files!`);
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB\n');
    }
}

updateAllRankings();
