/**
 * Test Script for Blinkit Standardization API
 * usage: node test_standardization_api.js
 * 
 * Pre-requisite: Server must be running on port 3088 (or specified port)
 */

import axios from 'axios';

const API_URL = 'http://localhost:3088/blinkitcategoryscrapper';

// Expected Fields in STRICT ORDER
const EXPECTED_FIELDS = [
    'category',
    'categoryUrl',
    'officialCategory',
    'officialSubCategory',
    'pincode',
    'platform',
    'scrapedAt',
    'productId',
    'skuId',
    'brand',
    'productName',
    'productImage',
    'productWeight',
    'quantity',
    'combo',
    'deliveryTime',
    'isAd',
    'rating',
    'currentPrice',
    'originalPrice',
    'discountPercentage',
    'ranking',
    'isOutOfStock',
    'productUrl'
];

async function runTest() {
    console.log('🚀 Starting API Standardization Test...');

    const payload = {
        pincode: '401202',
        // Use a simple, reliable URL or keywords that returns data quickly
        // Using a category array to mock logic if needed, or a real URL
        // Let's use a "test" request. The server script scrapes real data.
        // We'll try a known category URL if possible, or just a generic one.
        // Since we can't easily mock the scraping part without a real browser in this script,
        // we assume the user will run this against a working server that can scrape.
        // We'll use a category from the user's `categories_with_urls.json` to ensure mapping works.
        url: 'https://blinkit.com/cn/exotics-premium/cid/1487/278' // Example URL
    };

    try {
        console.log(`📡 Sending request to ${API_URL}...`);
        console.log(`   Payload: Pincode=${payload.pincode}, URL=${payload.url}`);

        // Set a long timeout as scraping takes time
        const response = await axios.post(API_URL, payload, { timeout: 0 });

        if (response.status === 200 && response.data.status === 'success') {
            console.log('\n✅ API Response Received');
            const products = response.data.products;
            console.log(`📦 Received ${products.length} products`);

            if (products.length === 0) {
                console.warn('⚠️ No products returned. Cannot validate format fully.');
                return;
            }

            // Validate First Product
            const firstProduct = products[0];
            console.log('\n🔍 Validating First Product Structure...');

            // 1. Check Field Order and Presence
            const keys = Object.keys(firstProduct);
            let orderError = false;

            // Note: In JS, key order is generally preserved for non-integer keys.
            // We'll check if expected keys exist and match the list.

            EXPECTED_FIELDS.forEach((field, index) => {
                if (!firstProduct.hasOwnProperty(field)) {
                    console.error(`❌ Missing Field: ${field}`);
                    orderError = true;
                }
            });

            // Check strict order (optional but requested "as same")
            const responseKeys = Object.keys(firstProduct);
            // Filter response keys to only those we care about for order check (ignoring extra internal keys if any)
            // But we standardized it, so there shouldn't be extra keys.

            for (let i = 0; i < EXPECTED_FIELDS.length; i++) {
                if (responseKeys[i] !== EXPECTED_FIELDS[i]) {
                    console.warn(`⚠️ Field Order Mismatch at index ${i}: Expected '${EXPECTED_FIELDS[i]}', Found '${responseKeys[i]}'`);
                    // strict order might not be guaranteed across all JSON parsers but we try.
                }
            }

            if (!orderError) {
                console.log('✅ All expected fields are present.');
            }

            // 2. Check N/A Defaults
            console.log('\n🔍 Checking for Null/Undefined values (should be "N/A" or specific type)...');
            let nullError = false;
            products.forEach((p, idx) => {
                Object.entries(p).forEach(([k, v]) => {
                    if (v === null || v === undefined) {
                        console.error(`❌ Product [${idx}] has null/undefined value for key '${k}'`);
                        nullError = true;
                    }
                });
            });
            if (!nullError) console.log('✅ No null/undefined values found.');

            // 3. Check Ranking Sequence
            console.log('\n🔍 Checking Ranking Sequence...');
            let rankError = false;
            for (let i = 0; i < products.length; i++) {
                if (products[i].ranking !== (i + 1)) {
                    console.error(`❌ Ranking broken at index ${i}. Expected ${i + 1}, Got ${products[i].ranking}`);
                    rankError = true;
                    break;
                }
            }
            if (!rankError) console.log('✅ Rankings are sequential and gapless.');

            // 4. Check Deduplication
            console.log('\n🔍 Checking Deduplication...');
            const ids = products.map(p => p.productId).filter(id => id !== 'N/A');
            const uniqueIds = new Set(ids);
            if (ids.length !== uniqueIds.size) {
                console.warn(`⚠️ Duplicates found! Total IDs: ${ids.length}, Unique: ${uniqueIds.size}`);
            } else {
                console.log('✅ No duplicate Product IDs found.');
            }

            // 5. Check Category Mapping
            // We used a URL, so 'category' (masterCategory) should probably be 'N/A' 
            // unless that specific test URL is in the mapping file.
            // Let's just print what we got.
            console.log('\n📋 Sample Data (First Item):');
            console.log(`   Category (Master): ${firstProduct.category}`);
            console.log(`   Category URL: ${firstProduct.categoryUrl}`);
            console.log(`   Official Category: ${firstProduct.officialCategory}`);
            console.log(`   Product ID: ${firstProduct.productId}`);
            console.log(`   Ranking: ${firstProduct.ranking}`);

            // Save Result to File
            import('fs').then(fs => {
                fs.writeFileSync('api_test_result.json', JSON.stringify(products, null, 2));
                console.log('\n💾 Test result saved to: api_test_result.json');
            });

        } else {
            console.error('❌ API returned error status:', response.data);
        }

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error('❌ Could not connect to server. Is it running on port 3088?');
        } else {
            console.error(`❌ Request failed: ${error.message}`);
        }
    }
}

runTest();
