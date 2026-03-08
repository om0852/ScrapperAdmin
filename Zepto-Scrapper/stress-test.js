const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const PINCODES = ['122018', '122017', '122016', '122015', '122011'];
const SERVER_URL = 'http://localhost:4000/zeptocategoryscrapper';

const CATEGORIES = [
    {
        "name": "Fruit & Vegetables - All",
        "url": "https://www.zepto.com/cn/fruits-vegetables/all/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/e78a8422-5f20-4e4b-9a9f-22a0e53962e3"
    },
    {
        "name": "Fruit & Vegetables - Fresh Vegetables",
        "url": "https://www.zepto.com/cn/fruits-vegetables/fresh-vegetables/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/b4827798-fcb6-4520-ba5b-0f2bd9bd7208"
    },
    {
        "name": "Fruit & Vegetables - New Launches",
        "url": "https://www.zepto.com/cn/fruits-vegetables/new-launches/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/fc342528-4d25-4a6b-a28a-7c8df22fa857"
    },
    {
        "name": "Fruit & Vegetables - Fresh Fruits",
        "url": "https://www.zepto.com/cn/fruits-vegetables/fresh-fruits/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/09e63c15-e5f7-4712-9ff8-513250b79942"
    },
    {
        "name": "Fruit & Vegetables - Exotics & Premium",
        "url": "https://www.zepto.com/cn/fruits-vegetables/exotics-premium/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/0a065d7d-ea57-4359-9900-b03425028d47"
    },
    {
        "name": "Fruit & Vegetables - Organics & Hydroponics",
        "url": "https://www.zepto.com/cn/fruits-vegetables/organics-hydroponics/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/414e9381-3ba3-4632-92e0-00fc29304900"
    },
    {
        "name": "Fruit & Vegetables - Leafy",
        "url": "https://www.zepto.com/cn/fruits-vegetables/leafy-herbs-seasonings/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/bc8ec1d3-95cf-4af5-aa60-43cde99798c1"
    },
    {
        "name": "Fruit & Vegetables - Flowers & Leaves",
        "url": "https://www.zepto.com/cn/fruits-vegetables/flowers-leaves/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/ec911f07-e53f-4086-81e7-089a789860c8"
    },
    {
        "name": "Fruit & Vegetables - Plants & Gardening",
        "url": "https://www.zepto.com/cn/fruits-vegetables/plants-gardening/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/97c725c2-41b3-4d78-ba3e-75e92b3ba054"
    },
    {
        "name": "Fruit & Vegetables - Cuts & Sprouts",
        "url": "https://www.zepto.com/cn/fruits-vegetables/cuts-sprouts/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/6eb7a384-5edf-4a68-aa99-a1c2b30c2c19"
    },
    {
        "name": "Fruit & Vegetables - Frozen Veggies",
        "url": "https://www.zepto.com/cn/fruits-vegetables/frozen-veggies-pulp/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/287a523f-f6c5-4f0c-b00a-4d872c837b80"
    }
];

const CONFIG = {
    maxConcurrentTabs: 8,
    headless: true,
    proxyUrl: "http://groups-RESIDENTIAL:apify_proxy_qSfOtbOtJniV67rnynnJYcP2BBL7G520BFKa@proxy.apify.com:8000"
};

async function runTest() {
    console.log(`🚀 Starting Stress Test with ${PINCODES.length} concurrent requests...`);
    // Random delay between requests to simulate real-world arrival (0-2s)

    const startTime = Date.now();

    const requests = PINCODES.map(async (pincode, index) => {
        // Stagger starts slightly
        await new Promise(r => setTimeout(r, index * 500));

        const reqStart = Date.now();
        console.log(`[Request ${index + 1}] Sending for Pincode ${pincode}...`);

        try {
            const response = await fetch(SERVER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pincode: pincode,
                    categories: CATEGORIES,
                    ...CONFIG
                })
            });

            const data = await response.json();
            const duration = ((Date.now() - reqStart) / 1000).toFixed(2);

            if (response.ok) {
                console.log(`✅ [Request ${index + 1}] Pincode ${pincode} Completed in ${duration}s. Products Found: ${data.data?.products?.length || 0}`);
            } else {
                console.error(`❌ [Request ${index + 1}] Pincode ${pincode} Failed in ${duration}s. Status: ${response.status} - ${data.error}`);
            }
            return { pincode, success: response.ok, duration };
        } catch (error) {
            console.error(`❌ [Request ${index + 1}] PINCODE ${pincode} Error: ${error.message}`);
            return { pincode, success: false, error: error.message };
        }
    });

    const results = await Promise.all(requests);

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n🏁 All tests completed in ${totalDuration}s`);
    console.table(results);
}

runTest();
