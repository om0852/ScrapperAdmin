import axios from 'axios';

const INSTAMART_SERVER_URL = 'http://localhost:4400/instamartcategorywrapper';

async function testParallelScrape() {
    console.log('Starting Instamart Parallel Scrape Test...');

    const testUrls = [
        "https://www.swiggy.com/instamart/category-listing?categoryId=1487&custom_back_action=true&taxonomyType=CategoryListing",
        "https://www.swiggy.com/instamart/category-listing?categoryId=876&custom_back_action=true&taxonomyType=CategoryListing",
        "https://www.swiggy.com/instamart/category-listing?categoryId=571&custom_back_action=true&taxonomyType=CategoryListing"
    ];

    const body = {
        pincode: '400070', // Use a known working pincode
        urls: testUrls,
        maxConcurrentTabs: 2
    };

    console.log(`Sending POST request to ${INSTAMART_SERVER_URL} with ${testUrls.length} URLs...`);
    const startTime = Date.now();

    try {
        const response = await axios.post(INSTAMART_SERVER_URL, body, {
            headers: { 'Content-Type': 'application/json' }
        });

        const duration = (Date.now() - startTime) / 1000;
        console.log(`Response received in ${duration.toFixed(2)}s`);

        const data = response.data;
        console.log('✅ Response Success');

        if (Array.isArray(data.products)) {
            console.log(`Total Products Returned: ${data.count}`);
            console.log(`Products in Array: ${data.products.length}`);

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
            console.error('❌ API returned unexpected structure:', data);
        }

    } catch (error) {
        console.error('❌ Test Script Error:', error);
    }
}

testParallelScrape();
