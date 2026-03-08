const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PINCODES = ["122010","201303","201014","122008","122016","400070","400706","400703","401202","401101"];
const URLS_FILE = path.join(__dirname, '../flipkart_urls_array.json');
const SERVER_URL = 'http://localhost:5500/scrape-flipkart-minutes';
const BATCH_SIZE = 9;

// Helper to clean URL
function cleanUrl(url) {
    try {
        const u = new URL(url);
        u.searchParams.delete('pageUID');
        return u.toString();
    } catch (e) { return url; }
}

async function scrapePincode(pincode) {
    console.log(`\n=== Starting Client Runner for Pincode: ${pincode} ===`);
    const OUTPUT_FILE = path.join(__dirname, `flipkart_bulk_results_${pincode}.json`);

    // 1. Load URLs
    if (!fs.existsSync(URLS_FILE)) {
        console.error(`URLs file not found at ${URLS_FILE}`);
        return;
    }
    const rawUrls = JSON.parse(fs.readFileSync(URLS_FILE, 'utf8'));
    const allUrls = [...new Set(rawUrls.map(cleanUrl))]; // Deduplicate and clean
    console.log(`Loaded ${allUrls.length} unique URLs.`);

    // 2. Initialize Results & Resume Logic
    let allResults = [];
    let scrapedUrls = new Set();

    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            allResults = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            console.log(`Parsed ${allResults.length} existing results.`);
            allResults.forEach(p => {
                if (p.categoryUrl) scrapedUrls.add(cleanUrl(p.categoryUrl));
            });
            console.log(`Found data for ${scrapedUrls.size} unique URLs already scraped.`);
        } catch (e) {
            console.log('Existing output file is invalid or empty, starting fresh.');
        }
    }

    // Filter URLs to scrape
    const urlsToScrape = allUrls.filter(u => !scrapedUrls.has(u));
    console.log(`Resuming scrape with ${urlsToScrape.length} remaining URLs for ${pincode}.`);

    if (urlsToScrape.length === 0) {
        console.log(`All URLs already scraped for ${pincode}.`);
        return;
    }

    // 3. Batch Processing
    for (let i = 0; i < urlsToScrape.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(urlsToScrape.length / BATCH_SIZE);
        const batchUrls = urlsToScrape.slice(i, i + BATCH_SIZE);

        console.log(`\n--- Sending Batch ${batchNum}/${totalBatches} (${batchUrls.length} URLs) for ${pincode} ---`);

        try {
            // Send request to server
            const response = await axios.post(SERVER_URL, {
                urls: batchUrls,
                pincode: pincode,
                store: false // We handle storage content here, but maybe handy to have server store backups too? Let's keep it false to avoid dupes or let user decide. server.js has store logic.
                // explicitly setting store: false because we save here.
            });

            const resultData = response.data;
            if (resultData.status === 'success') {
                const newProducts = resultData.products || [];

                if (newProducts.length > 0) {
                    allResults.push(...newProducts);
                    console.log(`Batch ${batchNum} success. Received ${newProducts.length} products.`);

                    // Save incrementally
                    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
                    console.log(`Updated results in ${OUTPUT_FILE}`);
                } else {
                    console.log(`Batch ${batchNum} returned 0 products (Server might have failed or empty category).`);
                }
            } else {
                console.error(`Batch ${batchNum} failed on server: ${JSON.stringify(resultData)}`);
            }

        } catch (e) {
            console.error(`Batch ${batchNum} request failed: ${e.message}`);
            if (e.response) {
                console.error('Server responded with:', e.response.status, e.response.data);
            }
        }

        // Slight pause between batches to avoid overloading server/browser
        if (i + BATCH_SIZE < urlsToScrape.length) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    console.log(`=== Finished Client Run for Pincode: ${pincode} ===\n`);
}

async function runBulkScrape() {
    console.log('Starting Multi-Pincode Client Runner...');
    for (const pincode of PINCODES) {
        await scrapePincode(pincode);
    }
    console.log('\nAll Multi-Pincode client scrapes completed.');
}

runBulkScrape().catch(console.error);
