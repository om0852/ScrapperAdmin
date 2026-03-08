const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const SERVER_URL = 'http://localhost:4400/instamartcategorywrapper';
const PINCODES = ["122010","201303","201014","122008","122016","400070","400706","400703","401202","401101"]; // Add/modify pincodes here
const MAX_CONCURRENT = 4;
const BATCH_SIZE = 12;

// Target URLs (Deduplicated list)
const rawUrls =[
  "https://www.swiggy.com/instamart/category-listing?categoryName=Skincare&filterId=6824a99856df9b0001250153&filterName=Beauty+Supplements&offset=0&showAgeConsent=false&storeId=1404643&taxonomyType=Supermarket",
  "https://www.swiggy.com/instamart/category-listing?categoryName=Makeup&filterId=6824a99856df9b0001250154&filterName=Beauty+Supplements&offset=0&showAgeConsent=false&storeId=1404643&taxonomyType=Supermarket",
  "https://www.swiggy.com/instamart/category-listing?categoryName=Pharma+and+Hygiene&filterId=682058d4bbe7600001aae475&filterName=Feminine+Hygiene&taxonomyType=All+Listing",
  "https://www.swiggy.com/instamart/category-listing?categoryName=Pharma+and+Hygiene&filterId=682058d4bbe7600001aae478&filterName=Oral+Care&taxonomyType=All+Listing",
  "https://www.swiggy.com/instamart/category-listing?categoryName=Pharma+and+Hygiene&filterId=682058d4bbe7600001aae477&filterName=Hand+Wash+%26+Sanitizers&taxonomyType=All+Listing",
  "https://www.swiggy.com/instamart/category-listing?categoryName=Pharma+and+Hygiene&filterId=682058d4bbe7600001aae474&filterName=Basic+Pharma&taxonomyType=All+Listing",
  "https://www.swiggy.com/instamart/category-listing?categoryName=Pharma+and+Hygiene&filterId=682058d4bbe7600001aae47a&filterName=Vitamins+%26+Digestives&taxonomyType=All+Listing",
  "https://www.swiggy.com/instamart/category-listing?categoryName=Pharma+and+Hygiene&filterId=682058d4bbe7600001aae47b&filterName=Wound+Care+%26+Pain&taxonomyType=All+Listing",
  "https://www.swiggy.com/instamart/category-listing?categoryName=Pharma+and+Hygiene&filterId=682058d4bbe7600001aae476&filterName=Hair+Removal&taxonomyType=All+Listing"
]

const uniqueUrls = [...new Set(rawUrls)];

function log(msg, type = 'INFO') {
    const time = new Date().toLocaleTimeString();
    let icon = 'ℹ️';
    if (type === 'SUCCESS') icon = '✅';
    if (type === 'ERROR') icon = '❌';
    if (type === 'WARN') icon = '⚠️';
    console.log(`[${time}] ${icon} ${msg}`);
}

// Load existing products from file (if exists) and return as map by productId for deduplication
async function loadExistingProducts(pincodeFilename) {
    try {
        const data = await fs.readFile(pincodeFilename, 'utf8');
        const products = JSON.parse(data);
        const productMap = new Map();
        
        if (Array.isArray(products)) {
            for (const product of products) {
                if (product.productId) {
                    productMap.set(product.productId, product);
                }
            }
        }
        
        log(`Loaded ${productMap.size} existing products from ${pincodeFilename}`);
        return productMap;
    } catch (err) {
        if (err.code === 'ENOENT') {
            log(`No existing file found for pincode, starting fresh`);
            return new Map();
        }
        throw err;
    }
}

// Merge new products with existing ones (avoid duplicates)
function mergeProducts(existingMap, newProducts) {
    const merged = new Map(existingMap);
    let addedCount = 0;
    let updatedCount = 0;

    for (const product of newProducts) {
        if (product.productId) {
            if (merged.has(product.productId)) {
                // Update existing product with latest data
                merged.set(product.productId, { ...merged.get(product.productId), ...product });
                updatedCount++;
            } else {
                // Add new product
                merged.set(product.productId, product);
                addedCount++;
            }
        }
    }

    return { merged, addedCount, updatedCount };
}

async function scrapeInBatches(urls, pincode) {
    const results = [];
    const errors = [];
    const totalBatches = Math.ceil(urls.length / BATCH_SIZE);
    
    // Single file per pincode without timestamp
    const pincodeFilename = `scraped_data_instamart_${pincode}.json`;

    log(`Starting scrape task for Pincode: ${pincode}`);
    log(`Target File: ${pincodeFilename}`);
    log(`Total URLs: ${urls.length} | Batches: ${totalBatches}`);

    // Load existing products
    const existingProducts = await loadExistingProducts(pincodeFilename);
    log(`Current products in file: ${existingProducts.size}`);

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const batch = urls.slice(i, i + BATCH_SIZE);

        log(`Processing Batch ${batchNum}/${totalBatches} (${batch.length} URLs)...`);

        try {
            const res = await axios.post(SERVER_URL, {
                pincode: pincode,
                urls: batch,
                maxConcurrentTabs: MAX_CONCURRENT
            }, { timeout: 600000 }); // Increased to 10 min timeout

            if (res.data?.products) {
                const newProducts = res.data.products;
                results.push(...newProducts);
                log(`Batch ${batchNum} Complete. Extracted ${newProducts.length} products.`, 'SUCCESS');

                // Merge with existing products
                const { merged, addedCount, updatedCount } = mergeProducts(existingProducts, newProducts);
                
                // Convert map back to array
                const mergedArray = Array.from(merged.values());
                
                // Save merged data
                await fs.writeFile(pincodeFilename, JSON.stringify(mergedArray, null, 2));
                log(`Updated ${pincodeFilename} | Total: ${mergedArray.length} | New: ${addedCount} | Updated: ${updatedCount}`);
            } else {
                log(`Batch ${batchNum} returned no products.`, 'WARN');
            }
        } catch (err) {
            log(`Batch ${batchNum} Failed: ${err.message}`, 'ERROR');
            errors.push({ batch: batchNum, urls: batch, error: err.message });
        }

        // Brief pause between batches
        if (i + BATCH_SIZE < urls.length) {
            log('Pausing for 3 seconds...');
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    return { results, errors, pincode, filename: pincodeFilename };
}

async function main() {
    const start = Date.now();
    const allResults = [];
    const allErrors = [];
    const fileList = [];

    log(`Starting scrape for ${PINCODES.length} pincode(s)`);
    log(`Files will be stored as: scraped_data_instamart_{pincode}.json`);

    for (const pincode of PINCODES) {
        log(`\n--- Processing Pincode: ${pincode} ---`);
        try {
            const { results, errors, filename } = await scrapeInBatches(uniqueUrls, pincode);
            allResults.push(...results);
            allErrors.push(...errors);
            
            // Get final file info
            const fileData = JSON.parse(await fs.readFile(filename, 'utf8'));
            fileList.push({ pincode, filename, count: fileData.length });
        } catch (err) {
            log(`Failed to process pincode ${pincode}: ${err.message}`, 'ERROR');
            allErrors.push({ pincode, error: err.message });
        }

        // Pause between pincodes (if not the last one)
        if (pincode !== PINCODES[PINCODES.length - 1]) {
            log('Pausing for 5 seconds before next pincode...');
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    const duration = ((Date.now() - start) / 1000 / 60).toFixed(2);

    console.log('\n=========================================');
    log(`Scrape Job Completed in ${duration} minutes`, 'SUCCESS');
    log(`Total Products Across All Pincodes: ${allResults.length}`);
    log(`Files Generated: ${fileList.length}`);
    fileList.forEach(f => log(`  - ${f.filename} (${f.count} products)`));

    if (allErrors.length > 0) {
        log(`Errors occurred. Check error logs.`, 'ERROR');
        await fs.writeFile(`errors_instamart_all_pincodes_${Date.now()}.json`, JSON.stringify(allErrors, null, 2));
    }
    console.log('=========================================\n');

    // Create consolidated summary
    const summary = {
        timestamp: new Date().toISOString(),
        totalPincodes: PINCODES.length,
        totalProducts: allResults.length,
        duration: `${duration} minutes`,
        files: fileList,
        errors: allErrors.length
    };
    
    await fs.writeFile('scrape_summary_instamart.json', JSON.stringify(summary, null, 2));
    log('Created summary file: scrape_summary_instamart.json', 'SUCCESS');
}

main().catch(console.error);
