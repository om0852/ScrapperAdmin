console.log('Script started');
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use dynamic import to catch import errors
let transformJiomartProduct, deduplicateRawProducts;
try {
    const module = await import('./transform_response_format.js');
    transformJiomartProduct = module.transformJiomartProduct;
    deduplicateRawProducts = module.deduplicateRawProducts;
} catch (e) {
    console.error('Import error:', e);
    process.exit(1);
}

const targetPincodes = ['122008', '122010'];

async function processSpecificFiles() {
    console.log('Processing specific files...');

    for (const pincode of targetPincodes) {
        const file = `jiomart_data_${pincode}.json`;
        const inputPath = path.join(__dirname, file);
        const outputPath = path.join(__dirname, `jiomart_processed_${pincode}.json`);

        if (!fs.existsSync(inputPath)) {
            console.warn(`Input file not found: ${file}`);
            continue;
        }

        console.log(`\nProcessing ${file} (Pincode: ${pincode})...`);

        try {
            const rawContent = fs.readFileSync(inputPath, 'utf8');
            const rawData = JSON.parse(rawContent);
            const products = rawData.data || [];

            console.log(`  📦 Found ${products.length} raw products.`);

            // 1. Deduplicate
            const dedupedProducts = deduplicateRawProducts(products);
            console.log(`  ✨ Deduplicated to ${dedupedProducts.length} unique items.`);

            // 2. Transform
            const transformedProducts = dedupedProducts.map((p, index) => {
                const categoryUrl = p.categoryUrl || 'N/A';
                const categoryName = p.categoryName || 'Unknown Category';

                return transformJiomartProduct(p, categoryUrl, categoryName, 'N/A', pincode, index + 1);
            });

            // 3. Save
            fs.writeFileSync(outputPath, JSON.stringify(transformedProducts, null, 2));
            console.log(`  ✅ Saved processed data to ${path.basename(outputPath)}`);

        } catch (err) {
            console.error(`  ❌ Failed to process ${file}:`, err.message);
        }
    }
}

processSpecificFiles();
