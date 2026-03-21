import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MONGODB_URI = 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const productSnapshotSchema = new mongoose.Schema({}, { collection: 'productsnapshots' });
const ProductSnapshot = mongoose.model('ProductSnapshot', productSnapshotSchema);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to recursively find all JSON files
function findAllJsonFiles(dirPath) {
    const files = [];
    
    function walkDir(currentPath) {
        if (!fs.existsSync(currentPath)) return;
        
        const items = fs.readdirSync(currentPath);
        for (const item of items) {
            const fullPath = path.join(currentPath, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                walkDir(fullPath);  // Recursively walk subdirectories
            } else if (item.endsWith('.json') && !item.startsWith('.')) {
                files.push(fullPath);
            }
        }
    }
    
    walkDir(dirPath);
    return files;
}

// Extract metadata from filename
function parseFilename(filename) {
    const match = filename.match(/^([A-Za-z]+)_(\d+)_([\d\-T:.Z]+)/);
    if (!match) return null;
    
    return {
        platform: match[1].toLowerCase(),
        pincode: match[2],
        filename: filename,
        filenameDate: match[3]
    };
}

async function updateNewFieldAllFiles() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB\n');

        // Get all JSON files starting from 12marchdata directory
        const baseDir = path.join(__dirname, '12marchdata');
        const allJsonFiles = findAllJsonFiles(baseDir);
        
        console.log(`📂 Found ${allJsonFiles.length} JSON files across all directories\n`);

        if (allJsonFiles.length === 0) {
            console.log('⚠️  No JSON files found!');
            await mongoose.disconnect();
            return;
        }

        let totalFilesProcessed = 0;
        let totalProductsUpdated = 0;
        const filesByPlatform = {};

        // Group files by platform for better reporting
        for (const filePath of allJsonFiles) {
            const filename = path.basename(filePath);
            const metadata = parseFilename(filename);
            
            if (!metadata) {
                console.log(`⚠️  Skipping ${filename} (invalid format)`);
                continue;
            }

            const { platform } = metadata;
            if (!filesByPlatform[platform]) {
                filesByPlatform[platform] = [];
            }
            filesByPlatform[platform].push(filePath);
        }

        // Process each file
        for (const filePath of allJsonFiles) {
            const filename = path.basename(filePath);
            const metadata = parseFilename(filename);
            
            if (!metadata) continue;

            const { platform, pincode } = metadata;
            
            try {
                const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const products = fileData.products || [];
                const scrapedAt = fileData.scrapedAt ? new Date(fileData.scrapedAt) : null;

                if (products.length === 0) {
                    console.log(`⏭️  Skipping ${filename} (no products)`);
                    continue;
                }

                if (!scrapedAt) {
                    console.log(`⚠️  Skipping ${filename} (no scrapedAt timestamp in JSON)`);
                    continue;
                }

                console.log(`📄 ${filename}`);
                console.log(`   Platform: ${platform} | Pincode: ${pincode} | Products: ${products.length}`);
                console.log(`   ScrapedAt: ${scrapedAt.toISOString()}`);

                let batchUpdated = 0;

                // Process products in batches of 100
                for (let i = 0; i < products.length; i += 100) {
                    const batch = products.slice(i, i + 100);
                    const batchOps = [];

                    for (const prod of batch) {
                        const productId = prod.productId || prod.id;
                        const category = (prod.category || 'Unknown').trim();
                        const officialCategory = prod.officialCategory || 'N/A';
                        const officialSubCategory = prod.officialSubCategory || prod.officalSubCategory || 'N/A';

                        batchOps.push({
                            updateOne: {
                                filter: {
                                    productId: productId,
                                    platform: platform,
                                    pincode: pincode,
                                    category: category,
                                    scrapedAt: scrapedAt
                                },
                                update: {
                                    $set: {
                                        new: prod.new === true,  // Convert to boolean
                                        officialCategory: officialCategory,
                                        officialSubCategory: officialSubCategory
                                    }
                                },
                                upsert: false
                            }
                        });
                    }

                    // Execute batch
                    if (batchOps.length > 0) {
                        const result = await ProductSnapshot.collection.bulkWrite(batchOps);
                        batchUpdated += result.modifiedCount || 0;
                    }
                }

                totalProductsUpdated += batchUpdated;
                totalFilesProcessed++;
                console.log(`   ✅ Updated ${batchUpdated} products\n`);

            } catch (err) {
                console.error(`   ❌ Error processing ${filename}: ${err.message}\n`);
            }
        }

        console.log(`\n${'='.repeat(70)}`);
        console.log('UPDATE SUMMARY');
        console.log(`${'='.repeat(70)}`);
        console.log(`✓ Files processed: ${totalFilesProcessed}`);
        console.log(`✓ Total products updated: ${totalProductsUpdated}`);
        console.log(`\n📊 Breakdown by platform:`);
        for (const [platform, files] of Object.entries(filesByPlatform)) {
            console.log(`   ${platform}: ${files.length} file(s)`);
        }

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB');
        process.exit(0);
    }
}

updateNewFieldAllFiles();
