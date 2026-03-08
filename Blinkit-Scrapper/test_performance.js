import axios from 'axios';
import { performance } from 'perf_hooks';

// Configuration
const TEST_URLS = [
    'https://blinkit.com/cn/pasta/cid/15/968',
    'https://blinkit.com/cn/cookies/cid/888/28',
    'https://blinkit.com/cn/tea/cid/12/957'
];

const PINCODE = '122016';
const SERVER_URL = 'http://localhost:3088';

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    red: "\x1b[31m"
};

async function testServer() {
    console.log(`\n${colors.cyan}${colors.bright}=== Blinkit Scraper Performance Test ===${colors.reset}\n`);

    // Check health
    try {
        const health = await axios.get(`${SERVER_URL}/health`);
        console.log(`${colors.green}✓${colors.reset} Server Status:`);
        console.log(`  Mode: ${health.data.performance.slowNetworkMode ? 'SLOW NETWORK' : 'NORMAL'}`);
        console.log(`  Memory: ${health.data.performance.lowMemoryMode ? 'LOW MEMORY' : 'NORMAL'}`);
        console.log(`  Concurrency: ${health.data.performance.maxConcurrentTabs} tabs\n`);
    } catch (e) {
        console.error(`${colors.red}✗${colors.reset} Server not running at ${SERVER_URL}`);
        process.exit(1);
    }

    // Test individual URLs
    console.log(`${colors.bright}Testing ${TEST_URLS.length} URLs:${colors.reset}\n`);

    let totalTime = 0;
    let totalProducts = 0;
    const results = [];

    for (let i = 0; i < TEST_URLS.length; i++) {
        const url = TEST_URLS[i];
        const categoryName = url.split('/cn/')[1].split('/')[0];
        
        console.log(`${colors.yellow}[${i + 1}/${TEST_URLS.length}]${colors.reset} ${categoryName}...`);
        
        const startTime = performance.now();

        try {
            const response = await axios.post(`${SERVER_URL}/blinkitcategoryscrapper`, {
                url: url,
                pincode: PINCODE,
                maxConcurrentTabs: 1
            }, {
                timeout: 300000
            });

            const endTime = performance.now();
            const duration = (endTime - startTime) / 1000;
            const productCount = response.data.totalProducts || 0;

            results.push({
                url,
                category: categoryName,
                duration,
                products: productCount,
                productPerSecond: (productCount / duration).toFixed(2)
            });

            totalTime += duration;
            totalProducts += productCount;

            console.log(`  ${colors.green}✓${colors.reset} ${productCount} products in ${duration.toFixed(2)}s (${(productCount / duration).toFixed(2)} p/s)\n`);

        } catch (e) {
            console.error(`  ${colors.red}✗${colors.reset} Error: ${e.message}\n`);
        }

        // Add delay between requests
        if (i < TEST_URLS.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Summary
    console.log(`${colors.bright}=== Test Summary ===${colors.reset}\n`);
    console.log(`Total Requests: ${TEST_URLS.length}`);
    console.log(`Successful: ${results.length}`);
    console.log(`Total Time: ${totalTime.toFixed(2)}s`);
    console.log(`Average Time per Category: ${(totalTime / TEST_URLS.length).toFixed(2)}s`);
    console.log(`Total Products: ${totalProducts}`);
    console.log(`Overall Rate: ${(totalProducts / totalTime).toFixed(2)} products/second\n`);

    if (results.length > 0) {
        console.log(`${colors.bright}Breakdown:${colors.reset}`);
        results.forEach(r => {
            console.log(`  ${r.category.padEnd(20)} | ${r.duration.toFixed(2)}s | ${r.products.toString().padStart(5)} products | ${r.productPerSecond} p/s`);
        });
    }

    // Recommendations
    console.log(`\n${colors.bright}Performance Recommendations:${colors.reset}`);
    const avgTime = totalTime / TEST_URLS.length;
    
    if (avgTime > 60) {
        console.log(`  ${colors.yellow}⚠${colors.reset} Slow performance detected (${avgTime.toFixed(2)}s per category)`);
        console.log(`     Try: SLOW_NETWORK=true node server_optimized.js`);
    } else if (avgTime > 40) {
        console.log(`  ${colors.yellow}⚠${colors.reset} Moderate performance (${avgTime.toFixed(2)}s per category)`);
        console.log(`     Monitor memory usage and network`);
    } else {
        console.log(`  ${colors.green}✓${colors.reset} Good performance (${avgTime.toFixed(2)}s per category)`);
    }

    const avgProducts = totalProducts / TEST_URLS.length;
    console.log(`  ${colors.green}✓${colors.reset} Average ${avgProducts.toFixed(0)} products per category`);
    
    console.log();
}

testServer().catch(e => {
    console.error(`Fatal error: ${e.message}`);
    process.exit(1);
});
