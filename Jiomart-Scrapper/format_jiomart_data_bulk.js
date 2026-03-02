import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transformJiomartProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../enrich_categories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load mappings once
const CATEGORY_MAPPINGS = loadCategoryMappings('../categories_with_urls.json'); // Adjusted path to use the one in parent or current? 
// User mentioned `Jiomart-Scrapper/categories_with_urls.json` implicitly or explicitly? 
// In Step 93, "Other open documents" shows `d:\creatosaurus-intership\quick-commerce-scrappers\Jiomart-Scrapper\categories_with_urls.json`.
// But `enrich_categories.js` default is `./categories_with_urls.json`.
// If I run this script from `Jiomart-Scrapper` folder, and `enrich_categories.js` is in `../`, then `../enrich_categories.js` might look for `./categories_with_urls.json` relative to CWD.
// Let's assume `categories_with_urls.json` is in `Jiomart-Scrapper` based on user context.
// Wait, `server.js` loads it from `./categories_with_urls.json` (line 11).
// So I will use `./categories_with_urls.json`.

const MAPPING_FILE = './categories_with_urls.json';
const MAPPINGS = loadCategoryMappings(MAPPING_FILE);

const FILES_TO_PROCESS = [
    'jiomart_data_122008.json',
    'jiomart_data_122010.json',
    'jiomart_data_122016.json',
    'jiomart_data_201014.json',
    'jiomart_data_201303.json',
    'jiomart_data_400070.json',
    'jiomart_data_400703.json',
    'jiomart_data_400706.json',
    'jiomart_data_401101.json',
    'jiomart_data_401202.json'
];

async function processFiles() {
    for (const file of FILES_TO_PROCESS) {
        const filePath = path.join(__dirname, file);
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ File not found: ${file}`);
            continue;
        }

        console.log(`\n📦 Processing ${file}...`);
        try {
            const rawContent = fs.readFileSync(filePath, 'utf8');
            let jsonData;
            try {
                jsonData = JSON.parse(rawContent);
            } catch (e) {
                console.error(`❌ Invalid JSON in ${file}`);
                continue;
            }

            let rawProducts = [];
            if (jsonData.data && Array.isArray(jsonData.data)) {
                rawProducts = jsonData.data;
            } else if (Array.isArray(jsonData)) {
                rawProducts = jsonData;
            } else {
                console.error(`❌ Could not find product array in ${file}`);
                continue;
            }

            console.log(`   Found ${rawProducts.length} raw products.`);

            // 1. Deduplicate
            const dedupedProducts = deduplicateRawProducts(rawProducts);
            console.log(`   Detailed deduplication: ${rawProducts.length} -> ${dedupedProducts.length}`);

            // 2. Transform & Enrich
            // We need to extract pincode from filename or content
            // Filename format: jiomart_data_<PINCODE>.json
            const pincodeMatch = file.match(/jiomart_data_(\d+)\.json/);
            const pincode = pincodeMatch ? pincodeMatch[1] : 'Unknown';

            const transformedProducts = dedupedProducts.map((product, index) => {
                const productCategoryUrl = product.categoryUrl || 'N/A';
                const officialCategory = product.name ? 'Unknown' : 'N/A';

                let categoryMapping = null;
                if (productCategoryUrl !== 'N/A') {
                    const enriched = enrichProductWithCategoryMapping({ categoryUrl: productCategoryUrl }, MAPPINGS);
                    if (enriched.categoryMappingFound) {
                        categoryMapping = enriched;
                    }
                }

                return transformJiomartProduct(
                    product,
                    productCategoryUrl,
                    officialCategory,
                    'N/A', // subCategory
                    pincode,
                    index + 1, // Rank
                    categoryMapping
                );
            });

            // 3. Save
            const outputFilename = `formatted_${file}`;
            const outputPath = path.join(__dirname, outputFilename);

            fs.writeFileSync(outputPath, JSON.stringify(transformedProducts, null, 2));
            console.log(`✅ Saved ${transformedProducts.length} formatted products to ${outputFilename}`);

        } catch (error) {
            console.error(`❌ Error processing ${file}:`, error);
        }
    }
}

processFiles();
