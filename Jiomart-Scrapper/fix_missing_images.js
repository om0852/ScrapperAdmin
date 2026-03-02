
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transformJiomartProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../enrich_categories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PINCODE = '122008';
const INPUT_FILE = path.join(__dirname, `jiomart_data_${PINCODE}.json`);
const OUTPUT_FILE = path.join(__dirname, 'scraped_data', `scraped_data_${PINCODE}_fixed.json`);
const MAPPING_FILE = path.join(__dirname, 'categories_with_urls.json');

// Load mappings
const CATEGORY_MAPPINGS = loadCategoryMappings(MAPPING_FILE);

async function runFix() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Input file not found: ${INPUT_FILE}`);
        return;
    }

    console.log(`Reading raw data from ${INPUT_FILE}...`);
    const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

    // Check if data is array or object with data property
    let products = Array.isArray(rawData) ? rawData : rawData.data;

    if (!products || products.length === 0) {
        console.error('No products found in input file.');
        return;
    }

    console.log(`Found ${products.length} raw products.`);

    // 1. Deduplicate
    const dedupedProducts = deduplicateRawProducts(products);
    console.log(`Deduplicated to ${dedupedProducts.length} unique products.`);

    // 2. Transform and Enrich
    let fixedCount = 0;
    const transformedProducts = dedupedProducts.map((product, index) => {
        const productCategoryUrl = product.categoryUrl || 'N/A';
        const officialCategory = product.name ? 'Unknown' : 'N/A';

        // Enrich
        let categoryMapping = null;
        if (productCategoryUrl !== 'N/A') {
            const enriched = enrichProductWithCategoryMapping({ categoryUrl: productCategoryUrl }, CATEGORY_MAPPINGS);
            if (enriched.categoryMappingFound) {
                categoryMapping = enriched;
            }
        }

        const transformed = transformJiomartProduct(
            product,
            productCategoryUrl,
            officialCategory,
            'N/A', // subCategory
            PINCODE,
            index + 1, // Rank
            categoryMapping
        );

        if (transformed.productImage !== 'N/A') {
            fixedCount++;
        }

        return transformed;
    });

    console.log(`Transformation complete. ${fixedCount}/${transformedProducts.length} products have images.`);

    const responsePayload = {
        status: 'success',
        pincode: PINCODE,
        totalProducts: transformedProducts.length,
        products: transformedProducts,
        meta: {
            scrapedAt: new Date().toISOString(),
            fixedAt: new Date().toISOString()
        }
    };

    // Ensure output dir exists
    const storageDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(responsePayload, null, 2));
    console.log(`Saved fixed data to ${OUTPUT_FILE}`);
}

runFix().catch(console.error);
