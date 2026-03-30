const express = require('express');
const bodyParser = require('body-parser');
const { scrapeMultiple } = require('./scraper_service');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5500;

app.use(bodyParser.json());

// API Dumps storage directory
const API_DUMPS_DIR = path.join(__dirname, 'api_dumps');
if (!fs.existsSync(API_DUMPS_DIR)) {
    fs.mkdirSync(API_DUMPS_DIR);
}

// === LOAD STANDARDIZATION MODULES (ESM) ===
let transformFlipkartProduct, deduplicateRawProducts, loadCategoryMappings, enrichProductWithCategoryMapping;
let CATEGORY_MAPPINGS;

(async () => {
    try {
        const transformModule = await import('./transform_response_format.js');
        transformFlipkartProduct = transformModule.transformFlipkartProduct;
        deduplicateRawProducts = transformModule.deduplicateRawProducts;

        const enrichModule = await import('../enrich_categories.js');
        loadCategoryMappings = enrichModule.loadCategoryMappings;
        enrichProductWithCategoryMapping = enrichModule.enrichProductWithCategoryMapping;

        CATEGORY_MAPPINGS = loadCategoryMappings(path.join(__dirname, '..', 'categories_with_urls.json'));
        console.log('✅ Loaded Standardization Modules & Category Mappings');
    } catch (e) {
        console.error('❌ Failed to load standardization modules:', e);
    }
})();

// Function to save API dumps
function saveApiDump(pincode, url, jsonData, dumpType = 'response') {
    try {
        const timestamp = Date.now();
        const urlHash = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const filename = `dump_${pincode}_${dumpType}_${urlHash}_${timestamp}.json`;
        const filepath = path.join(API_DUMPS_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(jsonData, null, 2));
        console.log(`✓ API dump saved: ${filename}`);
        return filename;
    } catch (err) {
        console.error(`✗ Failed to save API dump: ${err.message}`);
        return null;
    }
}

app.post('/scrape-flipkart-minutes', async (req, res) => {
    const { url, urls, pincode, store, maxConcurrentTabs = 3 } = req.body;

    if ((!url && !urls) || !pincode) {
        return res.status(400).json({ error: 'URL(s) and pincode are required.' });
    }

    const targetUrls = urls || [url];
    const msg = `[API] Received scrape request for Pincode: ${pincode}, URLs: ${targetUrls.length}\n`;
    console.log(msg);
    require('fs').appendFileSync('server.log', msg);

    try {
        // Use scrapeMultiple for both single and multiple URLs to leverage the new logic
        // Assuming scrapeMultiple accepts concurrency as 3rd arg or options object. 
        // Based on previous analysis, scrapeMultiple signature might need check. 
        // But for standardization, we pass it. If valid scraper_service doesn't take it, JS ignores extra args.
        const results = await scrapeMultiple(targetUrls, pincode, maxConcurrentTabs);

        // === SAVE RAW API DUMP ===
        const rawDumpFilename = saveApiDump(pincode, targetUrls.join('|'), results, 'raw_response');
        console.log(`[DumpDebug] Raw API dump: ${rawDumpFilename}`);

        // Flatten results if needed or keep structure. 
        // Original expected a single array of products for single URL.
        // If single URL input, return single array. If multiple, return array of arrays (or flat).

        // Flatten results from multiple URLs into one list
        const allProducts = results.flat();
        console.log(`[API] Raw Products Scraped: ${allProducts.length}`);

        // === APPLY STANDARDIZED FORMAT ===
        let productsToReturn = [];

        if (deduplicateRawProducts && transformFlipkartProduct) {
            // 1. Transform and Enrich first (suffix gets added here)
            const transformedAll = allProducts.map((product, index) => {
                const productCategoryUrl = product.categoryUrl || 'N/A';
                const officialCategory = product.categoryName || 'Unknown';

                let categoryMapping = null;
                if (productCategoryUrl !== 'N/A' && enrichProductWithCategoryMapping) {
                    const enriched = enrichProductWithCategoryMapping({ categoryUrl: productCategoryUrl }, CATEGORY_MAPPINGS);
                    if (enriched.categoryMappingFound) {
                        categoryMapping = enriched;
                    }
                }

                return transformFlipkartProduct(
                    product,
                    productCategoryUrl,
                    officialCategory,
                    'N/A',
                    pincode,
                    index + 1,
                    categoryMapping
                );
            }).filter(p => p !== null); // remove products with invalid names (e.g. numeric-only)

            // 2. Deduplicate AFTER transform using the shared composite-key logic
            productsToReturn = deduplicateRawProducts(transformedAll);

            // 3. Re-assign rankings per officialSubCategory
            const subCatRankCounters = new Map();
            productsToReturn.forEach(p => {
                const subCat = p.officialSubCategory || '__unknown__';
                const nextRank = (subCatRankCounters.get(subCat) || 0) + 1;
                subCatRankCounters.set(subCat, nextRank);
                p.ranking = nextRank;
            });

            console.log(`[API] Raw: ${allProducts.length}, After transform+dedup: ${productsToReturn.length} unique products`);
        
        // === SAVE TRANSFORMED API DUMP ===
        const transformedDumpFilename = saveApiDump(pincode, targetUrls.join('|'), productsToReturn, 'transformed_response');
        console.log(`[DumpDebug] Transformed API dump: ${transformedDumpFilename}`);
        } else {
            console.warn('⚠️ Standardization modules not loaded, returning raw data');
            productsToReturn = allProducts;
        }

        const responseData = {
            status: 'success',
            pincode,
            totalProducts: productsToReturn.length,
            products: productsToReturn,
            meta: {
                total_urls: targetUrls.length,
                scrapedAt: new Date().toISOString()
            }
        };

        // === STORAGE LOGIC (NEW) ===
        if (store === true) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `scraped_data_${pincode}_${timestamp}.json`;
            const storageDir = path.join(__dirname, 'scraped_data');

            if (!fs.existsSync(storageDir)) {
                fs.mkdirSync(storageDir);
            }

            const filepath = path.join(storageDir, filename);
            fs.writeFileSync(filepath, JSON.stringify(responseData, null, 2));
            console.log(`[Storage] Saved response to ${filepath}`);
            responseData.meta.storedFile = filename;
        }

        res.json(responseData);

    } catch (error) {
        console.error('[API] Scrape failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'FlipkartMinutes' });
});

app.get('/status', (req, res) => {
    res.json({
        status: 'ready',
        uptime: process.uptime()
    });
});

const server = app.listen(PORT, () => {
    console.log(`Flipkart Minutes Scraper Server running on http://localhost:${PORT}`);
    console.log('Endpoint: POST /scrape-flipkart-minutes');
});
server.setTimeout(0);
