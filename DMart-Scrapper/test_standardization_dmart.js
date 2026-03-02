/**
 * Test Script for DMart Standardization API
 * usage: node test_standardization_dmart.js
 * 
 * Pre-requisite: DMart Server must be running on port 4199
 */

import axios from 'axios';
import fs from 'fs';

const API_URL = 'http://localhost:4199/dmartcategoryscrapper';

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
    console.log('🚀 Starting DMart API Standardization Test...');

    const payload = {
        pincode: '401202',
        url: 'https://www.dmart.in/category/dals-pulses-aesc-dals-pulses' // Example DMart Category
    };

    try {
        console.log(`📡 Sending request to ${API_URL}...`);
        console.log(`   Payload: Pincode=${payload.pincode}, URL=${payload.url}`);

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

            EXPECTED_FIELDS.forEach((field, index) => {
                if (!firstProduct.hasOwnProperty(field)) {
                    console.error(`❌ Missing Field: ${field}`);
                    orderError = true;
                }
            });

            // Check strict order
            const responseKeys = Object.keys(firstProduct);
            for (let i = 0; i < EXPECTED_FIELDS.length; i++) {
                if (responseKeys[i] !== EXPECTED_FIELDS[i]) {
                    console.warn(`⚠️ Field Order Mismatch at index ${i}: Expected '${EXPECTED_FIELDS[i]}', Found '${responseKeys[i]}'`);
                }
            }

            if (!orderError) {
                console.log('✅ All expected fields are present.');
            }

            // 2. Check N/A Defaults
            console.log('\n🔍 Checking for Null/Undefined values...');
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
            let lastRank = 0;
            for (let i = 0; i < products.length; i++) {
                if (products[i].ranking !== (lastRank + 1)) {
                    console.error(`❌ Ranking broken at index ${i}. Expected ${lastRank + 1}, Got ${products[i].ranking}`);
                    rankError = true;
                    break;
                }
                lastRank++;
            }
            if (!rankError) console.log('✅ Rankings are sequential.');

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
            console.log('\n📋 Sample Data (First Item):');
            console.log(`   Category (Master): ${firstProduct.category}`);
            console.log(`   Category URL: ${firstProduct.categoryUrl}`);
            console.log(`   Official Category: ${firstProduct.officialCategory}`);
            console.log(`   Product ID: ${firstProduct.productId}`);
            console.log(`   Ranking: ${firstProduct.ranking}`);

            // Save Result to File
            fs.writeFileSync('api_test_result_dmart.json', JSON.stringify(products, null, 2));
            console.log('\n💾 Test result saved to: api_test_result_dmart.json');

        } else {
            console.error('❌ API returned error status:', response.data);
        }

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error('❌ Could not connect to server. Is it running on port 4199?');
        } else {
            console.error(`❌ Request failed: ${error.message}`);
        }
    }
}

runTest();
