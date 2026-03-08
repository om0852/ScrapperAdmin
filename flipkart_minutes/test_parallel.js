const { fetch } = require('undici');

async function testParallel() {
    console.log('Starting Parallel Scrape Test...');
    const url = 'http://localhost:5500/scrape-flipkart-minutes';

    // Example URLs (using generic category/store pages)
    const testUrls = [
        'https://www.flipkart.com/flipkart-minutes-store?marketplace=HYPERLOCAL', // Main store
        'https://www.flipkart.com/search?q=milk&marketplace=HYPERLOCAL',         // Search results
        'https://www.flipkart.com/search?q=bread&marketplace=HYPERLOCAL'         // Another search
    ];

    const body = {
        pincode: '122016', // User requested pincode
        urls: testUrls
    };

    try {
        console.log(`Sending POST request to ${url} with 3 URLs...`);
        const start = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        const duration = (Date.now() - start) / 1000;

        console.log('Response received in', duration.toFixed(2), 'seconds');

        if (data.success) {
            console.log('✅ Success!');
            console.log('Total URLs processed:', data.total_urls);
            console.log('Results count:', data.results ? data.results.length : 0);
            if (data.results) {
                data.results.forEach((res, idx) => {
                    console.log(`URL ${idx + 1}: ${res.length} products found.`);
                });
            }
        } else {
            console.error('❌ Failed:', data.error);
        }

    } catch (e) {
        console.error('Error running test:', e);
    }
}

// Check for unserviceable pincode
async function testUnserviceable() {
    console.log('\nStarting Unserviceable Pincode Test...');
    const url = 'http://localhost:5500/scrape-flipkart-minutes';

    const body = {
        pincode: '999999', // Likely unserviceable
        urls: ['https://www.flipkart.com/flipkart-minutes-store?marketplace=HYPERLOCAL']
    };

    try {
        const start = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        const duration = (Date.now() - start) / 1000;
        console.log('Response received in', duration.toFixed(2), 'seconds');

        if (data.success) {
            console.log('✅ Response Success (Correctly handled unserviceable)');
            // Expecting empty results
            const products = data.results ? data.results[0] : [];
            console.log('Product count:', products.length);
            if (products.length === 0) console.log('✅ Correctly returned 0 products.');
            else console.warn('⚠️ Returned products for unserviceable pincode?');
        } else {
            console.error('❌ Request Failed (API error):', data.error);
        }

    } catch (e) {
        console.error('Error in unserviceable test:', e);
    }
}

(async () => {
    await testParallel();
    await testUnserviceable();
})();
