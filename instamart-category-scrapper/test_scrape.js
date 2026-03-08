const axios = require('axios');

const TEST_URL = "https://www.swiggy.com/instamart/category-listing?categoryName=Fresh+Vegetables&filterId=6822eeeded32000001e25aa4&filterName=Exotic+Vegetables&offset=0&showAgeConsent=false&storeId=1404643&taxonomyType=Speciality+taxonomy+1";
const PINCODE = "201014"; // Assuming a default or user's pincode
const SERVER_URL = "http://localhost:4400/instamartcategorywrapper";

async function runTest() {
    console.log("Starting Test Scrape...");
    console.log(`Target URL: ${TEST_URL}`);
    console.log(`Pincode: ${PINCODE}`);

    const payload = {
        url: TEST_URL,
        pincode: PINCODE,
        maxConcurrentTabs: 1
    };

    try {
        const startTime = Date.now();
        const response = await axios.post(SERVER_URL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        const data = response.data;
        const duration = (Date.now() - startTime) / 1000;

        console.log("---------------------------------------------------");
        console.log("TEST PASSED ✅");
        console.log(`Duration: ${duration.toFixed(2)}s`);
        // Handle count if it exists, or calculate length of products
        const count = data.count || (data.products ? data.products.length : 0);
        console.log(`Total Products Extracted: ${count}`);

        if (data.products && data.products.length > 0) {
            console.log("First Product Preview:");
            console.log(`  Name: ${data.products[0].productName}`);
            console.log(`  Price: ₹${data.products[0].currentPrice}`);
        }

        if (data.file) {
            console.log(`Saved to file: ${data.file}`);
        }
        console.log("---------------------------------------------------");

    } catch (error) {
        console.error("---------------------------------------------------");
        console.error("TEST FAILED ❌");
        if (error.response) {
            console.error(`Server responded with ${error.response.status} ${error.response.statusText}`);
            console.error(error.response.data);
        } else {
            console.error(`Error: ${error.message}`);
        }
        console.error("Ensure the server is running on port 4400!");
        console.error("---------------------------------------------------");
    }
}

runTest();
