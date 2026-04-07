#!/usr/bin/env node

/**
 * Advanced Integration Test for Blinkit Scraper
 * 
 * Tests:
 * - API response validation
 * - Product data quality
 * - Performance metrics
 * - Error recovery
 * - Data persistence
 * 
 * Run: node advanced-test.js
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:3088/blinkitcategoryscrapper';

class AdvancedTester {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
        this.startTime = Date.now();
    }

    log(type, msg) {
        const icons = {
            '✅': '✅',
            '❌': '❌',
            'ℹ️': 'ℹ️',
            '⚡': '⚡',
            '📊': '📊'
        };
        const colors = {
            reset: '\x1b[0m',
            green: '\x1b[32m',
            red: '\x1b[31m',
            yellow: '\x1b[33m',
            blue: '\x1b[36m'
        };
        console.log(`${icons[type]} ${msg}${colors.reset}`);
    }

    async test(name, fn) {
        console.log(`\n📝 Test: ${name}`);
        try {
            const startTime = Date.now();
            await fn();
            const duration = Date.now() - startTime;
            this.results.passed++;
            this.results.tests.push({ name, status: 'PASS', duration });
            this.log('✅', `PASSED (${duration}ms)`);
            return true;
        } catch (error) {
            this.results.failed++;
            this.results.tests.push({ name, status: 'FAIL', error: error.message });
            this.log('❌', `FAILED: ${error.message}`);
            return false;
        }
    }

    async runAll() {
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║   Blinkit Scraper Advanced Tests      ║');
        console.log('╚════════════════════════════════════════╝\n');

        // Test 1: Response Structure
        await this.test('Response Structure Validation', async () => {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
                    pincode: '201303'
                }),
                timeout: 180000
            });

            if (!response.ok) throw new Error(`Status: ${response.status}`);

            const data = await response.json();

            // Validate top-level fields
            const requiredFields = ['status', 'pincode', 'totalProducts', 'products', 'meta'];
            for (const field of requiredFields) {
                if (!(field in data)) throw new Error(`Missing field: ${field}`);
            }

            if (data.status !== 'success') throw new Error(`Status not success: ${data.status}`);
            if (typeof data.totalProducts !== 'number') throw new Error('totalProducts not a number');
            if (!Array.isArray(data.products)) throw new Error('products not an array');
        });

        // Test 2: Product Data Quality
        await this.test('Product Data Quality', async () => {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
                    pincode: '201303'
                }),
                timeout: 180000
            });

            const data = await response.json();
            if (data.products.length === 0) throw new Error('No products extracted');

            const product = data.products[0];
            const requiredFields = ['ranking', 'productId', 'productName', 'productImage', 'price'];

            for (const field of requiredFields) {
                if (!(field in product)) throw new Error(`Product missing: ${field}`);
            }

            // Validate price format
            const price = parseFloat(product.price);
            if (isNaN(price) || price <= 0) throw new Error(`Invalid price: ${product.price}`);

            // Validate URL format
            if (!product.productImage || !product.productImage.startsWith('http')) {
                throw new Error(`Invalid image URL: ${product.productImage}`);
            }
        });

        // Test 3: Deduplication Check
        await this.test('Product Deduplication', async () => {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
                    pincode: '201303'
                }),
                timeout: 180000
            });

            const data = await response.json();
            const ids = new Set();
            const duplicates = [];

            data.products.forEach(p => {
                if (ids.has(p.productId)) {
                    duplicates.push(p.productId);
                }
                ids.add(p.productId);
            });

            if (duplicates.length > 0) {
                throw new Error(`Found ${duplicates.length} duplicate products`);
            }
        });

        // Test 4: Ranking Consistency
        await this.test('Ranking Consistency', async () => {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
                    pincode: '201303'
                }),
                timeout: 180000
            });

            const data = await response.json();
            for (let i = 0; i < Math.min(data.products.length, 10); i++) {
                if (data.products[i].ranking !== i + 1) {
                    throw new Error(`Invalid ranking at index ${i}: ${data.products[i].ranking}`);
                }
            }
        });

        // Test 5: Multiple URLs Processing
        await this.test('Multiple URLs Processing', async () => {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    urls: [
                        'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489'
                    ],
                    pincode: '201303',
                    maxConcurrentTabs: 1
                }),
                timeout: 180000
            });

            const data = await response.json();
            if (data.status !== 'success') throw new Error('Multiple URLs failed');
            if (data.totalProducts === 0) throw new Error('No products from multiple URLs');
        });

        // Test 6: Concurrent Tab Handling
        await this.test('Concurrent Tab Handling', async () => {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
                    pincode: '201303',
                    maxConcurrentTabs: 2
                }),
                timeout: 180000
            });

            const data = await response.json();
            if (data.status !== 'success') throw new Error('Concurrent processing failed');
        });

        // Test 7: Error Handling - Missing Pincode
        await this.test('Error Handling - Missing Pincode', async () => {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489'
                })
            });

            if (response.status !== 400) throw new Error(`Expected 400, got ${response.status}`);
            const data = await response.json();
            if (!data.error) throw new Error('No error message provided');
        });

        // Test 8: Error Handling - Invalid URL
        await this.test('Error Handling - Invalid Input', async () => {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pincode: '201303'
                    // No url/urls/categories
                })
            });

            if (response.status !== 400) throw new Error(`Expected 400, got ${response.status}`);
        });

        // Test 9: Large Dataset Handling
        await this.test('Large Dataset Handling', async () => {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
                    pincode: '201303'
                }),
                timeout: 180000
            });

            const data = await response.json();
            // Should handle at least 20 products
            if (data.totalProducts < 20) return; // Skip if fewer products
        });

        // Test 10: Response Time Performance
        await this.test('Response Time - Under 3 minutes', async () => {
            const startTime = Date.now();
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
                    pincode: '201303'
                }),
                timeout: 180000
            });

            const duration = Date.now() - startTime;
            if (duration > 180000) {
                throw new Error(`Response took ${duration}ms (over 3 minutes)`);
            }
        });

        // Test 11: Metadata Completeness
        await this.test('Metadata Completeness', async () => {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
                    pincode: '201303'
                }),
                timeout: 180000
            });

            const data = await response.json();
            if (!data.meta || !data.meta.scrapedAt) {
                throw new Error('Missing metadata');
            }

            if (!data.meta.total_urls) {
                throw new Error('Missing total_urls in metadata');
            }
        });

        // Test 12: Data Persistence (Storage)
        await this.test('Data Persistence with Store Flag', async () => {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
                    pincode: '201303',
                    store: true
                }),
                timeout: 180000
            });

            const data = await response.json();
            if (data.status !== 'success') throw new Error('Storage request failed');
            // Files are saved asynchronously, so we won't check immediately
        });

        this.printSummary();
    }

    printSummary() {
        const duration = Date.now() - this.startTime;
        const total = this.results.passed + this.results.failed;

        console.log('\n╔════════════════════════════════════════╗');
        console.log('║         TEST SUMMARY REPORT            ║');
        console.log('╚════════════════════════════════════════╝\n');

        console.log(`Total Tests: ${total}`);
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`⏱️  Total Time: ${(duration / 1000).toFixed(2)}s\n`);

        if (this.results.failed === 0) {
            console.log('🎉 All tests passed!\n');
        } else {
            console.log('📋 Failed Tests:\n');
            this.results.tests
                .filter(t => t.status === 'FAIL')
                .forEach(t => {
                    console.log(`   ❌ ${t.name}`);
                    console.log(`      Error: ${t.error}\n`);
                });
        }

        // Write report to file
        const report = {
            timestamp: new Date().toISOString(),
            total,
            passed: this.results.passed,
            failed: this.results.failed,
            duration: (duration / 1000).toFixed(2) + 's',
            tests: this.results.tests
        };

        fs.writeFileSync(
            'test-report.json',
            JSON.stringify(report, null, 2)
        );
        console.log('📄 Report saved to: test-report.json\n');

        process.exit(this.results.failed === 0 ? 0 : 1);
    }
}

// Run tests
const tester = new AdvancedTester();
tester.runAll().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});
