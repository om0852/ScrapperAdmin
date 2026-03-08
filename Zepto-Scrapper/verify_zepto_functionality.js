import axios from 'axios';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:4089/zeptocategoryscrapper';
const PINCODE = '400072'; // Powai/Mumbai pincode usually works for Zepto

async function testZepto() {
    console.log('🚀 Starting Zepto Scraper Verification...');

    const payload = {
        pincode: PINCODE,
        // Using a reliable category URL (e.g., Atta/Rice or similar staple)
        urls: ['https://www.zepto.com/cn/atta-flour/cid/168/2470'],
        store: true,
        maxConcurrentTabs: 1
    };

    console.log(`📡 Sending request to ${API_URL}`);
    console.log(`   Payload: Pincode=${payload.pincode}, URLs=${payload.urls}`);

    try {
        const startTime = Date.now();
        const response = await axios.post(API_URL, payload, { timeout: 120000 }); // 2 min timeout
        const duration = (Date.now() - startTime) / 1000;

        if (response.status === 200 && response.data.status === 'success') {
            console.log(`\n✅ Success! Request took ${duration}s`);
            const { products, meta } = response.data;

            console.log(`📦 Returned ${products.length} products`);
            if (products.length > 0) {
                console.log('📝 Sample Product:', JSON.stringify(products[0], null, 2));
            } else {
                console.warn('⚠️ No products returned. Check if pincode is serviceable or category is valid.');
            }

            // Verify Storage
            if (meta.storedFile) {
                const filePath = path.join(process.cwd(), 'scraped_data', meta.storedFile);
                console.log(`\n💾 Checking storage file: ${meta.storedFile}`);
                if (fs.existsSync(filePath)) {
                    console.log('✅ File exists on disk.');
                    const stats = fs.statSync(filePath);
                    console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
                } else {
                    console.error('❌ File reported in meta but not found on disk.');
                }
            } else {
                console.warn('⚠️ No storedFile field in meta. Storage might be disabled or failed.');
            }

        } else {
            console.error('❌ API returned error:', response.data);
        }

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error('❌ Connection refused. Is the Zepto Server running on port 4089?');
            console.log('   Run: node server.js');
        } else {
            console.error('❌ Request failed:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data, null, 2));
            }
        }
    }
}

testZepto();
