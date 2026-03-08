import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const SERVER_URL = 'http://localhost:3088';
const TEST_URL = 'https://blinkit.com/cn/pasta/cid/15/968';
const PINCODE = '221014'; // Delhi pincode - change as needed
const OUTPUT_DIR = path.join(__dirname, 'test_results');

// Colors for console output
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m"
};

const log = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    let icon = '';
    let color = colors.reset;

    switch (type) {
        case 'info': icon = 'ℹ️'; color = colors.cyan; break;
        case 'success': icon = '✅'; color = colors.green; break;
        case 'warn': icon = '⚠️'; color = colors.yellow; break;
        case 'error': icon = '❌'; color = colors.red; break;
        case 'debug': icon = '🐛'; color = colors.dim; break;
        case 'start': icon = '🚀'; color = colors.magenta; break;
    }

    console.log(`${colors.dim}[${timestamp}]${colors.reset} ${icon} ${color}${message}${colors.reset}`);
};

async function testScraper() {
    try {
        log('start', 'Starting Blinkit Scraper Test');
        log('info', `Target URL: ${TEST_URL}`);
        log('info', `Pincode: ${PINCODE}`);
        log('info', `Server: ${SERVER_URL}`);

        // Create output directory
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
            log('info', `Created output directory: ${OUTPUT_DIR}`);
        }

        // Make the request
        log('info', 'Sending scraping request...');
        const startTime = Date.now();

        const response = await axios.post(`${SERVER_URL}/blinkitcategoryscrapper`, {
            url: TEST_URL,
            pincode: PINCODE,
            maxConcurrentTabs: 1
        }, {
            timeout: 300000 // 5 minutes timeout
        });

        const duration = Date.now() - startTime;
        log('success', `Request completed in ${(duration / 1000).toFixed(2)}s`);

        const data = response.data;

        // Log summary
        log('success', `Status: ${data.status}`);
        log('success', `Total Products: ${data.totalProducts}`);

        // Save full response
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const responseFile = path.join(OUTPUT_DIR, `response_${timestamp}.json`);
        fs.writeFileSync(responseFile, JSON.stringify(data, null, 2));
        log('info', `Full response saved to: ${responseFile}`);

        // Display sample products
        if (data.products && data.products.length > 0) {
            log('success', `Found ${data.products.length} products`);
            
            // Show first 3 products
            console.log(`\n${colors.bright}${colors.blue}Sample Products (First 3):${colors.reset}\n`);
            data.products.slice(0, 3).forEach((product, idx) => {
                console.log(`${colors.cyan}Product ${idx + 1}:${colors.reset}`);
                console.log(`  ID: ${product.id}`);
                console.log(`  Name: ${product.name}`);
                console.log(`  Price: ₹${product.price}`);
                console.log(`  Original Price: ₹${product.originalPrice}`);
                console.log(`  Discount: ${product.discount}`);
                console.log(`  Category: ${product.category}`);
                console.log(`  Stock: ${product.isOutOfStock ? '❌ Out of Stock' : '✅ In Stock'}`);
                console.log(`  Delivery: ${product.deliveryTime || 'N/A'}`);
                console.log();
            });

            // Save products to separate CSV
            const csvFile = path.join(OUTPUT_DIR, `products_${timestamp}.csv`);
            const csvHeader = 'ID,Name,Price,Original Price,Discount,Category,In Stock,Delivery Time,URL\n';
            const csvData = data.products.map(p => 
                `"${p.id}","${p.name}","${p.price}","${p.originalPrice}","${p.discount}","${p.category}","${!p.isOutOfStock}","${p.deliveryTime}","${p.url}"`
            ).join('\n');
            fs.writeFileSync(csvFile, csvHeader + csvData);
            log('success', `Products exported to CSV: ${csvFile}`);

            // Statistics
            const stats = {
                totalProducts: data.products.length,
                outOfStock: data.products.filter(p => p.isOutOfStock).length,
                withDiscount: data.products.filter(p => p.discount).length,
                withImages: data.products.filter(p => p.image).length,
                averagePrice: (data.products.reduce((sum, p) => sum + parseFloat(p.price || 0), 0) / data.products.length).toFixed(2),
                categories: [...new Set(data.products.map(p => p.category))]
            };

            console.log(`\n${colors.bright}${colors.blue}Statistics:${colors.reset}`);
            console.log(`  Total Products: ${stats.totalProducts}`);
            console.log(`  Out of Stock: ${stats.outOfStock}`);
            console.log(`  With Discount: ${stats.withDiscount}`);
            console.log(`  With Images: ${stats.withImages}`);
            console.log(`  Average Price: ₹${stats.averagePrice}`);
            console.log(`  Categories: ${stats.categories.join(', ')}`);

            // Save stats
            const statsFile = path.join(OUTPUT_DIR, `stats_${timestamp}.json`);
            fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
            log('info', `Statistics saved to: ${statsFile}`);

        } else {
            log('warn', 'No products found in response');
        }

        log('success', 'Test completed successfully!');
        return true;

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            log('error', `Connection refused. Is the server running on ${SERVER_URL}?`);
            log('info', 'Start the server with: npm start');
        } else if (error.response) {
            log('error', `Server error (${error.response.status}): ${error.response.data?.message || error.message}`);
            console.log(colors.red, error.response.data, colors.reset);
        } else if (error.code === 'ENOTFOUND') {
            log('error', 'Server not found. Check the SERVER_URL configuration');
        } else if (error.code === 'ETIMEDOUT') {
            log('error', 'Request timeout. The scraping operation took too long');
        } else {
            log('error', `Test failed: ${error.message}`);
        }
        return false;
    }
}

// Run test
testScraper().then(success => {
    process.exit(success ? 0 : 1);
});
