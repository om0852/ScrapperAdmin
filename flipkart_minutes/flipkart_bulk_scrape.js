const { scrapeMultiple, setupSession } = require('./scraper_service');
const fs = require('fs');
const path = require('path');

const PINCODES = [ "401202", "401101"]; // Add more pincodes here as needed
const URLS_FILE = path.join(__dirname, '../flipkart_urls_array.json');
const BATCH_SIZE = 9; // User requested 9 URLs per batch

// Helper to clean URL
function cleanUrl(url) {
    try {
        const u = new URL(url);
        u.searchParams.delete('pageUID');
        return u.toString();
    } catch (e) { return url; }
}

async function scrapePincode(pincode) {
    console.log(`\n=== Starting scrape for Pincode: ${pincode} ===`);
    const OUTPUT_FILE = path.join(__dirname, `flipkart_bulk_results_${pincode}.json`);

    // 1. Load URLs
    if (!fs.existsSync(URLS_FILE)) {
        console.error(`URLs file not found at ${URLS_FILE}`);
        return;
    }
    const rawUrls = JSON.parse(fs.readFileSync(URLS_FILE, 'utf8'));
    const allUrls = [...new Set(rawUrls.map(cleanUrl))]; // Deduplicate and clean
    console.log(`Loaded ${allUrls.length} unique URLs.`);

    // 2. Setup Session (Ensure session valid before start)
    try {
        const sessionRes = await setupSession(pincode);
        if (sessionRes.status === 'unserviceable') {
            console.error(`Pincode ${pincode} is unserviceable. Skipping.`);
            return;
        }
    } catch (e) {
        console.error(`Failed to setup session for ${pincode}: ${e.message}`);
        return;
    }

    // 3. Initialize Results
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

    // 4. Batch Processing
    for (let i = 0; i < urlsToScrape.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(urlsToScrape.length / BATCH_SIZE);
        const batchUrls = urlsToScrape.slice(i, i + BATCH_SIZE);

        console.log(`\n--- Processing Batch ${batchNum}/${totalBatches} (${batchUrls.length} URLs) for ${pincode} ---`);

        try {
            // Using scrapeMultiple which handles browser context & retries internally
            const batchResults = await scrapeMultiple(batchUrls, pincode);

            // Flatten results (scrapeMultiple returns array of arrays)
            const flatResults = batchResults.flat();

            if (flatResults.length > 0) {
                allResults.push(...flatResults);
                console.log(`Batch ${batchNum} complete. Found ${flatResults.length} products.`);

                // Save incrementally
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
                console.log(`Saved results to ${OUTPUT_FILE}`);
            } else {
                console.log(`Batch ${batchNum} returned 0 products.`);
            }

        } catch (e) {
            console.error(`Batch ${batchNum} failed: ${e.message}`);
        }

        // Slight pause between batches to be nice
        if (i + BATCH_SIZE < urlsToScrape.length) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    console.log(`=== Finished scrape for Pincode: ${pincode} ===\n`);
}

async function runBulkScrape() {
    for (const pincode of PINCODES) {
        await scrapePincode(pincode);
    }
    console.log('\nAll Multi-Pincode scrapes completed.');
}

runBulkScrape().catch(console.error);
