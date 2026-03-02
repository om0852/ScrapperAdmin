
console.log('Script started');
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

console.log('Imports 1 done');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log('Dirname:', __dirname);

// Use dynamic import to catch import errors
let transformJiomartProduct, deduplicateRawProducts;
try {
    const module = await import('./transform_response_format.js');
    transformJiomartProduct = module.transformJiomartProduct;
    deduplicateRawProducts = module.deduplicateRawProducts;
    console.log('Imports 2 done');
} catch (e) {
    console.error('Import error:', e);
    process.exit(1);
}

async function processAllDataFiles() {
    console.log('Processing started');
    try {
        const files = fs.readdirSync(__dirname);
        const dataFiles = files.filter(f => f.startsWith('jiomart_data_') && f.endsWith('.json'));

        console.log(`Found ${dataFiles.length} data files to process.`);

        for (const file of dataFiles) {
            const inputPath = path.join(__dirname, file);
            // Extract pincode from filename (jiomart_data_123456.json)
            const pincodeMatch = file.match(/jiomart_data_(\d+)\.json/);
            const pincode = pincodeMatch ? pincodeMatch[1] : 'unknown';
            const outputPath = path.join(__dirname, `jiomart_processed_${pincode}.json`);

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

        console.log('\n🎉 All files processed.');

    } catch (error) {
        console.error('❌ Error reading directory:', error);
    }
}

processAllDataFiles();
