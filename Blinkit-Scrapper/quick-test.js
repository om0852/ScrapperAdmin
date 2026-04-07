#!/usr/bin/env node

/**
 * Quick Test Script for Blinkit Scraper
 * 
 * This is a simplified test for quick validation
 * Run: node quick-test.js
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:3088/blinkitcategoryscrapper';

async function quickTest() {
    console.log('🚀 Quick Blinkit Scraper Test\n');

    const payload = {
        url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
        pincode: '201303'
    };

    console.log('📤 Sending request...');
    console.log(`   URL: ${payload.url}`);
    console.log(`   Pincode: ${payload.pincode}\n`);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            timeout: 180000
        });

        const data = await response.json();

        if (data.status === 'success') {
            console.log('✅ Success!\n');
            console.log(`   Total Products: ${data.totalProducts}`);
            console.log(`   Pincode: ${data.pincode}`);
            console.log(`   Scraped At: ${data.meta.scrapedAt}\n`);

            if (data.products.length > 0) {
                console.log('📦 Sample Product:');
                const product = data.products[0];
                console.log(`   ID: ${product.productId}`);
                console.log(`   Name: ${product.productName}`);
                console.log(`   Price: ${product.price}`);
                console.log(`   Ranking: ${product.ranking}\n`);
            }

            console.log(`✅ Test passed! ${data.totalProducts} products extracted.`);
        } else {
            console.log(`❌ Failed: ${data.message || data.error}`);
            process.exit(1);
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        console.log('\n📝 Make sure the server is running:');
        console.log('   node server.js\n');
        process.exit(1);
    }
}

quickTest();
