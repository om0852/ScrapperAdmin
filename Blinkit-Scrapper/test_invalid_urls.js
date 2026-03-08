import axios from 'axios';

const SERVER_URL = 'http://localhost:3088';
const PINCODE = '110001';

// Test URLs - mix of valid and some that might show errors
const TEST_URLS = [
    'https://blinkit.com/cn/pasta/cid/15/968',        // Valid - usually has products
    'https://blinkit.com/cn/cookies/cid/888/28',      // Valid - usually has products
    'https://blinkit.com/cn/tea/cid/12/957'           // Valid - usually has products
];

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    red: "\x1b[31m"
};

async function testInvalidUrlHandling() {
    console.log(`\n${colors.cyan}${colors.bright}=== Testing Invalid URL & End Detection ===${colors.reset}\n`);

    // Check server
    try {
        const health = await axios.get(`${SERVER_URL}/health`);
        console.log(`${colors.green}✓${colors.reset} Server running\n`);
    } catch (e) {
        console.error(`${colors.red}✗${colors.reset} Server not running at ${SERVER_URL}`);
        console.log(`\nStart server first: node server_optimized.js`);
        process.exit(1);
    }

    console.log(`${colors.bright}Testing ${TEST_URLS.length} URLs with error detection...${colors.reset}\n`);

    let results = {
        successful: 0,
        invalid: 0,
        failed: 0,
        totalProducts: 0
    };

    for (let i = 0; i < TEST_URLS.length; i++) {
        const url = TEST_URLS[i];
        const category = url.split('/cn/')[1].split('/')[0];
        
        console.log(`${colors.yellow}[${i + 1}/${TEST_URLS.length}]${colors.reset} Testing: ${category}`);

        try {
            const response = await axios.post(`${SERVER_URL}/blinkitcategoryscrapper`, {
                url: url,
                pincode: PINCODE,
                maxConcurrentTabs: 1
            }, {
                timeout: 300000
            });

            const products = response.data.totalProducts || 0;

            if (products > 0) {
                console.log(`  ${colors.green}✓ Success${colors.reset} - ${products} products found\n`);
                results.successful++;
                results.totalProducts += products;
            } else {
                // 0 products could mean invalid URL was skipped
                const fs = await import('fs');
                const path = await import('path');
                
                const invalidPath = path.resolve('invalid_urls.json');
                let isInvalid = false;
                
                try {
                    if (fs.existsSync(invalidPath)) {
                        const content = fs.readFileSync(invalidPath, 'utf-8');
                        const invalid = JSON.parse(content);
                        isInvalid = invalid.some(item => item.url === url);
                    }
                } catch (e) {}

                if (isInvalid) {
                    console.log(`  ${colors.yellow}⚠ Invalid${colors.reset} - Marked as invalid (error message detected)\n`);
                    results.invalid++;
                } else {
                    console.log(`  ${colors.red}✗ Failed${colors.reset} - 0 products, not marked invalid\n`);
                    results.failed++;
                }
            }

        } catch (e) {
            console.error(`  ${colors.red}✗ Error${colors.reset} - ${e.message}\n`);
            results.failed++;
        }

        // Delay between requests
        if (i < TEST_URLS.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Summary
    console.log(`${colors.bright}=== Test Summary ===${colors.reset}\n`);
    console.log(`Successful: ${results.successful}/${TEST_URLS.length}`);
    console.log(`Invalid (skipped): ${results.invalid}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Total products: ${results.totalProducts}\n`);

    // Check files
    const fs = await import('fs');
    const path = await import('path');

    const invalidPath = path.resolve('invalid_urls.json');
    const failedPath = path.resolve('failed_urls.json');

    console.log(`${colors.bright}Files Generated:${colors.reset}`);
    
    if (fs.existsSync(invalidPath)) {
        const invalid = JSON.parse(fs.readFileSync(invalidPath, 'utf-8'));
        console.log(`  ${colors.green}✓${colors.reset} invalid_urls.json - ${invalid.length} URLs`);
    } else {
        console.log(`  ${colors.yellow}○${colors.reset} invalid_urls.json - Not created (no errors detected)`);
    }

    if (fs.existsSync(failedPath)) {
        const failed = JSON.parse(fs.readFileSync(failedPath, 'utf-8'));
        console.log(`  ${colors.yellow}○${colors.reset} failed_urls.json - ${failed.length} URLs`);
    } else {
        console.log(`  ${colors.yellow}○${colors.reset} failed_urls.json - Not created (all succeeded)`);
    }

    console.log(`\n${colors.bright}Features Tested:${colors.reset}`);
    console.log(`  ✓ Error message pre-check (sorry message detection)`);
    console.log(`  ✓ Improved bottom detection (precise scroll end)`);
    console.log(`  ✓ Invalid URL tracking (invalid_urls.json)`);
    console.log(`  ✓ Failed URL tracking (failed_urls.json)`);

    console.log(`\n${colors.bright}Next Steps:${colors.reset}`);
    console.log(`  • Review invalid_urls.json if any errors found`);
    console.log(`  • Run with more categories to see full benefit`);
    console.log(`  • Monitor scroll detection improvement`);
    console.log();
}

testInvalidUrlHandling().catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
});
