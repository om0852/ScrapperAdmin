/**
 * Test Script for Flipkart Minutes Standardization API (Direct Service Call)
 * usage: node test_standardization_flipkart.js
 */

const { scrapeMultiple } = require('./scraper_service');
const fs = require('fs');

async function runTest() {
    console.log('🚀 Starting Flipkart Minutes Scraper Service Test (Direct)...');

    const pincode = '400703';
    const url = 'https://www.flipkart.com/hyperlocal/hloc/7201/pr?sid=hloc%2F0072%2F7201&marketplace=HYPERLOCAL&pageUID=1766499285460';

    try {
        console.log(`📡 Scraping directly...`);
        console.log(`   Pincode=${pincode}, URL=${url}`);

        const results = await scrapeMultiple([url], pincode);
        const products = results[0] || [];

        console.log('\n✅ Scrape Completed');
        console.log(`📦 Received ${products.length} products`);

        if (products.length === 0) {
            console.warn('⚠️ No products returned. Cannot validate format fully.');
            return;
        }

        // Validate First Product
        const firstProduct = products[0];
        console.log('\n🔍 Validating First Product Structure...');
        console.log('Sample Product:', JSON.stringify(firstProduct, null, 2));

        // Save Result to File
        fs.writeFileSync('api_test_result_flipkart.json', JSON.stringify(products, null, 2));
        console.log('\n💾 Test result saved to: api_test_result_flipkart.json');

        // Check Delivery Time specifically
        const deliveryTimes = products.map(p => p.deliveryTime);
        const hasDeliveryTime = deliveryTimes.some(t => t !== 'N/A');
        console.log(`\n🚚 Delivery Time Extraction Check:`);
        console.log(`   - Found Non-N/A: ${hasDeliveryTime}`);
        console.log(`   - Sample Values: ${deliveryTimes.slice(0, 5).join(', ')}`);

    } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
    }
}

runTest();
