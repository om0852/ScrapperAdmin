import axios from 'axios';

const BLINKIT_SERVER_URL = 'http://localhost:3088/blinkitcategoryscrapper';

async function testParallelScrape() {
    console.log('Starting Blinkit Parallel Scrape Test...');

    const testUrls = [
        "https://blinkit.com/cn/milk/cid/14/922",
        "https://blinkit.com/cn/bread/cid/14/953",
        "https://blinkit.com/cn/eggs/cid/14/1200"
    ];

    const body = {
        pincode: '400070', // Use a known working pincode
        urls: testUrls,
        maxConcurrentTabs: 2
    };

    console.log(`Sending POST request to ${BLINKIT_SERVER_URL} with ${testUrls.length} URLs...`);
    const startTime = Date.now();

    try {
        const response = await axios.post(BLINKIT_SERVER_URL, body, {
            headers: { 'Content-Type': 'application/json' }
        });

        const duration = (Date.now() - startTime) / 1000;
        console.log(`Response received in ${duration.toFixed(2)}s`);

        const data = response.data;
        console.log('✅ Response Success');

        if (data.status === 'success') {
            console.log(`Total Products Returned: ${data.totalProducts}`);
            console.log(`Products Count in payload: ${data.products?.length}`);

            // Verification
            const foundUrls = new Set(data.products.map(p => p.categoryUrl));
            console.log(`Unique Category URLs found in response: ${foundUrls.size}`);
            foundUrls.forEach(u => console.log(` - ${u}`));

            if (foundUrls.size === testUrls.length) {
                console.log('✅ SUCCESS: All requested URLs were processed and returned data.');
            } else {
                console.log(`⚠️ WARNING: Expected ${testUrls.length} URLs, but found products from ${foundUrls.size}`);
            }

        } else {
            console.error('❌ API returned error status:', data);
        }

    } catch (error) {
        console.error('❌ Test Script Error:', error);
    }
}

testParallelScrape();
