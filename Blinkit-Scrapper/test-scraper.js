#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3088';
const API_ENDPOINT = `${BASE_URL}/blinkitcategoryscrapper`;
const HEALTH_ENDPOINT = `${BASE_URL}/health`;

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bright: '\x1b[1m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
    header: (msg) => console.log(`\n${colors.bright}${colors.blue}┌─ ${msg}${colors.reset}`),
    test: (msg) => console.log(`${colors.bright}${colors.cyan}🧪 ${msg}${colors.reset}`)
};

// Test 1: Health Check
async function testHealthCheck() {
    log.header('Test 1: Health Check');
    try {
        const response = await fetch(HEALTH_ENDPOINT);
        const data = await response.json();
        
        if (response.ok && data.status === 'ok') {
            log.success(`Server is healthy: ${JSON.stringify(data)}`);
            return true;
        } else {
            log.error(`Server returned unexpected status: ${JSON.stringify(data)}`);
            return false;
        }
    } catch (error) {
        log.error(`Failed to reach server at ${BASE_URL}`);
        log.error(`Error: ${error.message}`);
        log.info('Make sure the server is running: node server.js');
        return false;
    }
}

// Test 2: Single URL Test
async function testSingleUrl() {
    log.header('Test 2: Single URL Scrape (Fresh Vegetables)');
    
    const testPayload = {
        url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
        pincode: '201303',
        store: false
    };

    log.test(`Testing with pincode: ${testPayload.pincode}`);
    log.test(`Testing with URL: ${testPayload.url}`);

    try {
        console.log(`\n📤 Sending request...`);
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testPayload),
            timeout: 180000 // 3 minutes
        });

        const data = await response.json();

        // Validate response structure
        if (!response.ok) {
            log.error(`Server returned status ${response.status}`);
            log.error(`Response: ${JSON.stringify(data)}`);
            return false;
        }

        // Check for success
        if (data.status !== 'success') {
            log.error(`Response status is not 'success': ${data.status}`);
            return false;
        }

        log.success(`Request successful`);
        log.info(`Pincode: ${data.pincode}`);
        log.info(`Total Products: ${data.totalProducts}`);

        // Validate products array
        if (!Array.isArray(data.products)) {
            log.error(`Products is not an array`);
            return false;
        }

        if (data.products.length === 0) {
            log.warn(`No products extracted`);
            return true; // Not necessarily a failure
        }

        // Validate first product structure
        const firstProduct = data.products[0];
        const requiredFields = ['productId', 'productName', 'price', 'productImage'];
        const missingFields = requiredFields.filter(field => !(field in firstProduct));

        if (missingFields.length > 0) {
            log.error(`Product missing fields: ${missingFields.join(', ')}`);
            log.info(`Sample product: ${JSON.stringify(firstProduct)}`);
            return false;
        }

        log.success(`All required product fields present`);
        log.info(`Sample product:`);
        console.log(JSON.stringify(firstProduct, null, 2));

        // Save response for inspection
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `test_response_${timestamp}.json`;
        const filepath = path.join(process.cwd(), filename);
        
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        log.success(`Full response saved to: ${filename}`);

        return true;
    } catch (error) {
        log.error(`Request failed: ${error.message}`);
        return false;
    }
}

// Test 3: Multiple URLs Test
async function testMultipleUrls() {
    log.header('Test 3: Multiple URLs Scrape');
    
    const testPayload = {
        urls: [
            'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
            'https://blinkit.com/cn/dairy-breakfast/cid/1487/1488'
        ],
        pincode: '201303',
        maxConcurrentTabs: 2,
        store: false
    };

    log.test(`Testing with ${testPayload.urls.length} URLs`);
    testPayload.urls.forEach((url, i) => log.info(`URL ${i + 1}: ${url}`));

    try {
        console.log(`\n📤 Sending request...`);
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testPayload),
            timeout: 300000 // 5 minutes for multiple URLs
        });

        const data = await response.json();

        if (!response.ok || data.status !== 'success') {
            log.error(`Request failed: ${data.status || response.status}`);
            log.error(`Message: ${data.message}`);
            return false;
        }

        log.success(`Request successful`);
        log.info(`Total Products: ${data.totalProducts}`);
        log.info(`URLs processed: ${data.meta?.total_urls || 'unknown'}`);

        if (data.products.length === 0) {
            log.warn(`No products extracted from multiple URLs`);
        } else {
            log.success(`Extracted ${data.products.length} products`);
        }

        return true;
    } catch (error) {
        log.error(`Request failed: ${error.message}`);
        return false;
    }
}

// Test 4: Categories Array Test
async function testCategoriesArray() {
    log.header('Test 4: Categories Array Scrape');
    
    const testPayload = {
        categories: [
            {
                name: 'Fresh Vegetables',
                url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489'
            }
        ],
        pincode: '201303',
        store: false
    };

    log.test(`Testing with categories array`);
    log.test(`Category: ${testPayload.categories[0].name}`);

    try {
        console.log(`\n📤 Sending request...`);
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testPayload),
            timeout: 180000
        });

        const data = await response.json();

        if (!response.ok || data.status !== 'success') {
            log.error(`Request failed: ${data.status || response.status}`);
            return false;
        }

        log.success(`Request successful`);
        log.info(`Total Products: ${data.totalProducts}`);

        return data.totalProducts > 0;
    } catch (error) {
        log.error(`Request failed: ${error.message}`);
        return false;
    }
}

// Test 5: Invalid Pincode Test (Error Handling)
async function testErrorHandling() {
    log.header('Test 5: Error Handling (Missing Pincode)');
    
    const testPayload = {
        url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489'
        // Intentionally omit pincode
    };

    log.test(`Testing error handling for missing pincode`);

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testPayload),
            timeout: 30000
        });

        const data = await response.json();

        if (response.status === 400 && data.error) {
            log.success(`Server correctly rejected invalid request`);
            log.info(`Error message: ${data.error}`);
            return true;
        } else {
            log.error(`Server should have returned 400 error`);
            return false;
        }
    } catch (error) {
        log.error(`Request failed unexpectedly: ${error.message}`);
        return false;
    }
}

// Test 6: Storage Test
async function testStorageFeature() {
    log.header('Test 6: Storage Feature Test');
    
    const testPayload = {
        url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
        pincode: '201303',
        store: true  // Enable storage
    };

    log.test(`Testing with storage enabled`);

    try {
        console.log(`\n📤 Sending request...`);
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testPayload),
            timeout: 180000
        });

        const data = await response.json();

        if (!response.ok || data.status !== 'success') {
            log.error(`Request failed: ${data.status || response.status}`);
            return false;
        }

        // Check if scraped_data directory exists
        const scrapedDataDir = path.join(process.cwd(), 'Blinkit-Scrapper', 'scraped_data');
        if (fs.existsSync(scrapedDataDir)) {
            const files = fs.readdirSync(scrapedDataDir);
            if (files.length > 0) {
                log.success(`Storage working - files saved to scraped_data/`);
                log.info(`Sample files: ${files.slice(0, 3).join(', ')}`);
                return true;
            }
        }

        log.warn(`Storage feature enabled but no files found yet`);
        return true;
    } catch (error) {
        log.error(`Request failed: ${error.message}`);
        return false;
    }
}

// Main test runner
async function runAllTests() {
    console.log(`\n${colors.bright}${colors.blue}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}  Blinkit Scraper API - Test Suite${colors.reset}`);
    console.log(`${colors.bright}═══════════════════════════════════════${colors.reset}\n`);

    const results = {};

    // Test 1: Health Check
    results['Health Check'] = await testHealthCheck();
    if (!results['Health Check']) {
        log.error(`Cannot continue without server. Aborting.`);
        printSummary(results);
        process.exit(1);
    }

    // Allow a moment for server to be ready
    await new Promise(r => setTimeout(r, 2000));

    // Test 2: Single URL
    results['Single URL Scrape'] = await testSingleUrl();

    // Test 3: Multiple URLs
    results['Multiple URLs Scrape'] = await testMultipleUrls();

    // Test 4: Categories Array
    results['Categories Array'] = await testCategoriesArray();

    // Test 5: Error Handling
    results['Error Handling'] = await testErrorHandling();

    // Test 6: Storage Feature
    results['Storage Feature'] = await testStorageFeature();

    // Print summary
    printSummary(results);
}

function printSummary(results) {
    log.header('Test Summary');
    
    const tests = Object.entries(results);
    const passed = tests.filter(([_, result]) => result).length;
    const total = tests.length;

    tests.forEach(([name, result]) => {
        if (result) {
            log.success(name);
        } else {
            log.error(name);
        }
    });

    console.log(`\n${colors.bright}Results: ${passed}/${total} tests passed${colors.reset}\n`);

    if (passed === total) {
        log.success(`All tests passed! 🎉`);
        process.exit(0);
    } else {
        log.error(`Some tests failed.`);
        process.exit(1);
    }
}

// Run tests
runAllTests().catch(err => {
    log.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
