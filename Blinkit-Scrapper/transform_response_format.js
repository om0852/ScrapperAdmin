/**
 * Blinkit Response Format Transformer
 * Standardizes all Blinkit scraper responses to a consistent format
 * Handles deduplication, field mapping, N/A values, and category enrichment
 */

import fs from 'fs';
import path from 'path';
import { enrichProductWithCategoryMapping, loadCategoryMappings } from '../enrich_categories.js';


/**
 * Extract quantity number from quantity string
 * Example: "30 ml" -> 30
 */
function extractQuantityNumber(quantity) {
    if (!quantity || quantity === 'N/A') return 'N/A';
    const match = quantity.toString().match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 'N/A';
}

/**
 * Extract unit from quantity string
 * Example: "30 ml" -> "ml"
 */
function extractUnit(quantity) {
    if (!quantity || quantity === 'N/A') return 'N/A';
    const match = quantity.toString().match(/([a-zA-Z%]+)$/);
    return match ? match[1].toLowerCase() : 'N/A';
}

/**
 * Calculate discount percentage if prices are available
 */
function calculateDiscount(originalPrice, currentPrice) {
    if (!originalPrice || !currentPrice) return 'N/A';

    const orig = parseFloat(originalPrice);
    const curr = parseFloat(currentPrice);

    if (orig && curr && orig > 0 && orig > curr) {
        return Math.round(((orig - curr) / orig) * 100);
    }
    return 'N/A';
}

/**
 * Transform a single Blinkit product to standardized format
 * STRICT FIELD ORDER REQUIRED
 */
function transformBlinkitProduct(product, categoryUrl, officialCategory, officialSubCategory, pincode, ranking = null, categoryMapping = null) {

    // Resolve Category Fields
    // User Requirement: map category -> masterCategory from mapping file
    const category = categoryMapping?.masterCategory || 'N/A';

    // User Requirement: map officialCategory -> officialCategory
    const finalOfficialCategory = categoryMapping?.officialCategory || officialCategory || 'N/A';

    // User Requirement: map officialSubCategory -> officialSubCategory
    const finalOfficialSubCategory = categoryMapping?.officialSubCategory || officialSubCategory || 'N/A';

    const subCatSuffix = (finalOfficialSubCategory && finalOfficialSubCategory !== 'N/A')
        ? '__' + finalOfficialSubCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        : '';

    return {
        category: category,
        categoryUrl: categoryUrl || 'N/A',
        officialCategory: finalOfficialCategory,
        officialSubCategory: finalOfficialSubCategory,
        pincode: pincode || 'N/A',
        platform: 'Blinkit',
        scrapedAt: product.scrapedAt || new Date().toISOString(),
        productId: (product.id || product.productId) ? (product.id || product.productId) + subCatSuffix : 'N/A',
        skuId: product.skuId || product.sku || 'N/A',
        brand: product.brand || 'N/A',
        productName: product.name || product.productName || 'N/A',
        productImage: product.image || product.productImage || 'N/A',
        productWeight: product.productWeight || product.quantity || 'N/A',
        quantity: product.quantity || 'N/A',
        combo: product.combo || 'N/A', // Changed default to N/A as per vague instruction "if any field is not present write N/A", formerly '1'
        deliveryTime: product.deliveryTime || 'N/A',
        isAd: (product.isAd === true || product.isAd === 'true') ? true : false,
        rating: product.rating || 'N/A',
        currentPrice: product.price || product.currentPrice || 'N/A',
        originalPrice: product.originalPrice || 'N/A',
        discountPercentage: product.discountPercentage || calculateDiscount(product.originalPrice, product.price || product.currentPrice),
        ranking: ranking !== null ? ranking : 'N/A',
        isOutOfStock: (product.isOutOfStock === true || product.isOutOfStock === 'true') ? true : false,
        productUrl: product.url || product.productUrl || 'N/A'
    };
}

/**
 * Deduplicate products based on productId
 * MUST be called BEFORE ranking
 */
function deduplicateRawProducts(products) {
    const seen = new Map();
    const deduplicated = [];

    products.forEach((product) => {
        const productId = product.id || product.productId;
        if (!productId) {
            // If no ID, keep it? Or skip? Usually keep to be safe, but duplicates check might fail.
            // Let's assume valid products have IDs. If not, we push them.
            deduplicated.push(product);
            return;
        }

        if (!seen.has(productId)) {
            seen.set(productId, true);
            deduplicated.push(product);
        }
    });

    return deduplicated;
}

/**
 * Transform raw Blinkit response to standardized format
 */
function transformBlinkitResponse(rawData, categoryUrl, officialCategory, officialSubCategory, pincode, categoryMapping = null) {
    // Handle different input formats
    let products = [];

    if (Array.isArray(rawData)) {
        products = rawData;
    } else if (rawData && Array.isArray(rawData.products)) {
        products = rawData.products;
    } else if (rawData && Array.isArray(rawData.data)) {
        products = rawData.data;
    } else {
        console.warn('⚠️ Unable to extract products from response');
        return [];
    }

    // 1. Deduplicate BEFORE ranking
    products = deduplicateRawProducts(products);

    // 2. Transform and Assign Ranking
    const transformed = products.map((product, index) =>
        transformBlinkitProduct(
            product,
            categoryUrl,
            officialCategory,
            officialSubCategory,
            pincode,
            index + 1, // Ranking is 1-based index after deduplication
            categoryMapping
        )
    );

    return transformed;
}

/**
 * Transform entire result file
 */
function transformResultFile(inputFile, outputFile = null, categoryMappingFile = null) {
    try {
        console.log(`📂 Reading file: ${inputFile}`);
        const rawData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

        // Load category mappings if available
        let categoryMap = null;
        let mappingFound = false;

        // Defaults
        // If the file is structured (blinkit_bulk_results_XXXXXX.json), we might get pincode/category from it or filename
        // But usually the raw data has some structure or we can infer.

        if (categoryMappingFile && fs.existsSync(categoryMappingFile)) {
            try {
                console.log(`📂 Loading category mappings...`);
                categoryMap = loadCategoryMappings(categoryMappingFile);
                mappingFound = true;
            } catch (e) {
                console.warn(`⚠️ Could not load category mappings: ${e.message}`);
            }
        }

        // Determine output filename
        if (!outputFile) {
            const basename = path.basename(inputFile, '.json');
            const dirname = path.dirname(inputFile);
            outputFile = path.join(dirname, `${basename}_transformed.json`);
        }

        let transformed = [];

        if (Array.isArray(rawData)) {
            // Flat array - assume single category context isn't fully known OR mixed.
            // This case is tricky if it's mixed categories. 
            // If it's a flat dump, we might need to look up category by URL for EACH product if they have it.
            // But typical usage seems to be per-category scraping.

            console.log(`📦 Processing ${rawData.length} products (Flat Array)...`);

            // Deduplicate first
            const dedupedRaw = deduplicateRawProducts(rawData);
            console.log(`   - Deduplicated from ${rawData.length} to ${dedupedRaw.length}`);

            transformed = dedupedRaw.map((product, index) => {
                // Try to find mapping if product has a categoryUrl
                let categoryMapping = null;
                const productCategoryUrl = product.categoryUrl || 'N/A';

                if (mappingFound && productCategoryUrl !== 'N/A') {
                    categoryMapping = enrichProductWithCategoryMapping({ categoryUrl: productCategoryUrl }, categoryMap);
                }

                return transformBlinkitProduct(
                    product,
                    productCategoryUrl,
                    'N/A',
                    'N/A',
                    product.pincode || 'N/A',
                    index + 1,
                    categoryMapping
                );
            });

        } else if (rawData.products && Array.isArray(rawData.products)) {
            // Structured response with metadata
            console.log(`📦 Processing ${rawData.products.length} products from structured response...`);

            const categoryUrl = rawData.categoryUrl || rawData.url || 'N/A';
            const officialCategory = rawData.officialCategory || rawData.category || 'N/A';
            const officialSubCategory = rawData.officialSubCategory || rawData.subcategory || 'N/A';
            const pincode = rawData.pincode || 'N/A';

            // Try to get category mapping
            let categoryMapping = null;
            if (mappingFound && categoryUrl !== 'N/A') {
                categoryMapping = enrichProductWithCategoryMapping({ categoryUrl }, categoryMap);
            }

            // Use the main transformation logic
            transformed = transformBlinkitResponse(
                rawData, // Pass the whole object, function handles extraction
                categoryUrl,
                officialCategory,
                officialSubCategory,
                pincode,
                categoryMapping
            );
        }

        // Save transformed data
        fs.writeFileSync(outputFile, JSON.stringify(transformed, null, 2));
        console.log(`💾 Saved to: ${outputFile}`);

        // Summary
        console.log(`✅ Transformation complete`);
        console.log(`   - Total products: ${transformed.length}`);

        return transformed;

    } catch (error) {
        console.error(`❌ Error transforming file: ${error.message}`);
        throw error;
    }
}

/**
 * Batch transform all Blinkit result files
 */
function batchTransform(directory = '.', categoryMappingFile = null) {
    try {
        console.log(`🔍 Scanning directory: ${directory}`);
        const files = fs.readdirSync(directory)
            .filter(f => f.match(/blinkit_bulk_results.*\.json$/i) && !f.includes('_transformed'));

        console.log(`📋 Found ${files.length} files to transform`);

        // Resolve absolute path for mapping file if provided
        if (categoryMappingFile) {
            if (!path.isAbsolute(categoryMappingFile)) {
                categoryMappingFile = path.resolve(process.cwd(), categoryMappingFile); // Or relative to directory? Better explicitly resolved.
            }
            if (!fs.existsSync(categoryMappingFile)) {
                console.warn(`⚠️ Category mapping file not found: ${categoryMappingFile}`);
                categoryMappingFile = null;
            }
        }

        const results = [];
        files.forEach((file, index) => {
            console.log(`\n[${index + 1}/${files.length}] Processing: ${file}`);
            try {
                const filepath = path.join(directory, file);
                const transformed = transformResultFile(filepath, null, categoryMappingFile);
                results.push({
                    file,
                    status: 'success',
                    productsCount: transformed.length
                });
            } catch (error) {
                results.push({
                    file,
                    status: 'error',
                    error: error.message
                });
            }
        });

        console.log('\n\n========== BATCH TRANSFORMATION SUMMARY ==========');
        results.forEach(r => {
            if (r.status === 'success') {
                console.log(`✅ ${r.file}: ${r.productsCount} products`);
            } else {
                console.log(`❌ ${r.file}: ${r.error}`);
            }
        });

        return results;

    } catch (error) {
        console.error(`❌ Batch transformation error: ${error.message}`);
        throw error;
    }
}

// === EXPORTS ===
export {
    transformBlinkitProduct,
    transformBlinkitResponse,
    transformResultFile,
    batchTransform,
    deduplicateRawProducts,
    calculateDiscount,
    extractQuantityNumber,
    extractUnit
};

import { pathToFileURL } from 'url';

// === CLI USAGE ===
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
📝 Blinkit Response Format Transformer
Standardized fields, deduplicated, and mapped.

Usage:
  node transform_response_format.js [file]
  node transform_response_format.js --batch [dir] [categories_file]

Examples:
  node transform_response_format.js blinkit_bulk_results_401202.json
  node transform_response_format.js --batch ./Blinkit-Scrapper ../categories_with_urls.json
        `);
        process.exit(0);
    }

    if (args[0] === '--batch') {
        const dir = args[1] || '.';
        const categoryFile = args[2] || '../categories_with_urls.json';
        batchTransform(dir, categoryFile);
    } else {
        // Single file mode
        // Check if second arg is category file
        const file = args[0];
        const categoryFile = args[1] || null;
        transformResultFile(file, null, categoryFile);
    }
}
