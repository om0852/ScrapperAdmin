import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductSnapshot from './models/ProductSnapshot.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_MAPPINGS_PATH = path.join(__dirname, 'categories_with_urls.json');
const SCRAPED_DATA_DIR = path.join(__dirname, 'scraped_data');

// Load master mappings
let categoryMappings = {};
if (fs.existsSync(CATEGORY_MAPPINGS_PATH)) {
    const fileContent = fs.readFileSync(CATEGORY_MAPPINGS_PATH, 'utf-8');
    categoryMappings = JSON.parse(fileContent);
    console.log(`✅ Loaded category mappings object with keys: ${Object.keys(categoryMappings).join(', ')}`);
} else {
    console.error(`❌ Mappings file not found at ${CATEGORY_MAPPINGS_PATH}`);
    process.exit(1);
}

// Helper to find mapping for a URL and platform
function findMapping(url, platform) {
    if (!url || url === 'N/A') return null;

    let allMappings = categoryMappings;
    if (!Array.isArray(categoryMappings) && typeof categoryMappings === 'object') {
        allMappings = [];
        if (platform && categoryMappings[platform]) {
            allMappings = categoryMappings[platform];
        } else {
            Object.values(categoryMappings).forEach(arr => {
                if (Array.isArray(arr)) allMappings.push(...arr);
            });
        }
    }

    return allMappings.find(mapping => {
        if (!mapping.url) return false;

        if (mapping.url === url) return true;

        const urlWithoutQuery = url.split('?')[0];
        const mappingUrlWithoutQuery = mapping.url.split('?')[0];

        return urlWithoutQuery === mappingUrlWithoutQuery;
    });
}

// Process all files in scraped_data directory and its subdirectories
async function processDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);
    let updatedFilesCount = 0;

    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            updatedFilesCount += await processDirectory(fullPath);
        } else if (file.endsWith('.json')) {
            try {
                const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

                if (data.products && Array.isArray(data.products)) {
                    let updatedProducts = 0;

                    data.products = await Promise.all(data.products.map(async prod => {
                        const url = prod.categoryUrl;
                        let platformKey = prod.platform;
                        if (platformKey === 'flipkartMinutes') platformKey = 'Flipkart';
                        if (platformKey === 'instamart') platformKey = 'Instamart';
                        if (platformKey === 'blinkit') platformKey = 'Blinkit';
                        if (platformKey === 'zepto') platformKey = 'Zepto';
                        if (platformKey === 'jiomart') platformKey = 'Jiomart';
                        if (platformKey === 'dmart') platformKey = 'DMart';

                        const mapping = findMapping(url, platformKey);

                        let newCategory = prod.category || 'Unknown';
                        let newSubCategory = 'N/A';
                        let newOfficialCategory = 'N/A';
                        let newOfficialSubCategory = 'N/A';

                        if (mapping) {
                            newCategory = mapping.masterCategory || newCategory;
                            newSubCategory = mapping.subCategory || mapping.officalSubCategory || 'N/A';
                            newOfficialCategory = mapping.officalCategory || mapping.officialCategory || 'N/A';
                            newOfficialSubCategory = mapping.officalSubCategory || mapping.officialSubCategory || 'N/A';
                        }

                        // Check if product is inherently new by querying DB
                        const PLATFORM_ENUM = ['zepto', 'blinkit', 'jiomart', 'dmart', 'instamart', 'flipkartMinutes'];
                        const normalizedPlatform = PLATFORM_ENUM.find(p => p.toLowerCase() === prod.platform.toLowerCase()) || prod.platform.toLowerCase();

                        const lastSnapshot = await ProductSnapshot.findOne({
                            productId: prod.id || prod.productId,
                            platform: normalizedPlatform,
                            pincode: (prod.pincode || data.pincode || '').trim(),
                            category: newCategory.trim()
                        }).lean();

                        const isNew = !lastSnapshot;

                        let finalWeight = prod.productWeight || prod.weight || 'N/A';
                        if (finalWeight === 'N/A' || finalWeight === '') {
                            finalWeight = prod.quantity || 'N/A';
                        }

                        // Track changes
                        if (prod.subCategory !== newSubCategory ||
                            prod.category !== newCategory ||
                            prod.officialCategory !== newOfficialCategory ||
                            prod.officialSubCategory !== newOfficialSubCategory ||
                            prod.productWeight !== finalWeight ||
                            prod.new !== isNew) {
                            updatedProducts++;
                        }


                        return {
                            ...prod,
                            category: newCategory,
                            subCategory: newSubCategory,
                            officialCategory: newOfficialCategory,
                            officialSubCategory: newOfficialSubCategory,
                            productWeight: finalWeight,
                            new: isNew
                        };
                    }));

                    if (updatedProducts > 0) {
                        fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
                        console.log(`[UPDATED] ${file} - Updated ${updatedProducts} products.`);
                        updatedFilesCount++;
                    } else {
                        console.log(`[SKIPPED] ${file} - Already up to date.`);
                    }
                }
            } catch (err) {
                console.error(`❌ Error processing ${file}: ${err.message}`);
            }
        }
    }

    return updatedFilesCount;
}

async function start() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB.');

        console.log('Starting category post-processing and backfilling "new" field...');
        const totalUpdated = await processDirectory(SCRAPED_DATA_DIR);
        console.log(`\n🎉 Post-processing complete! Transformed ${totalUpdated} files.`);
    } catch (err) {
        console.error('Fatal Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

start();
