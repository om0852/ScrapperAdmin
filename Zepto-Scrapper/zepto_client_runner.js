import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PINCODES = [ '122010', '201303', '201014', '122008', '122016', '401202',"400070","400703","400706","401101"];
const URLS_FILE = path.join(__dirname, '../zepto_urls_array.json');
const SERVER_URL = 'http://localhost:4089/zeptocategoryscrapper';
const BATCH_SIZE = 4;
const CONCURRENCY = 4; // Server-side concurrency

async function runClientScrapeForPincode(pincode) {
    const OUTPUT_FILE = path.join(__dirname, `zepto_bulk_results_${pincode}.json`);
    console.log(`Starting Zepto Client Scraper for Pincode: ${pincode}`);

    // Load URLs
    if (!fs.existsSync(URLS_FILE)) {
        console.error(`URLs file not found at ${URLS_FILE}`);
        return;
    }
    const rawUrls = JSON.parse(fs.readFileSync(URLS_FILE, 'utf8'));
    console.log(`Loaded ${rawUrls.length} total URLs.`);

    // Load existing results
    let allResults = [];
    let scrapedUrls = new Set();

    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const data = fs.readFileSync(OUTPUT_FILE, 'utf8');
            allResults = JSON.parse(data);
            console.log(`Parsed ${allResults.length} existing results from ${OUTPUT_FILE}`);

            allResults.forEach(p => {
                if (p.categoryUrl) scrapedUrls.add(p.categoryUrl);
            });
            console.log(`Found data for ${scrapedUrls.size} unique URLs already scraped.`);
        } catch (e) {
            console.log('Existing output file is invalid or empty, starting fresh.');
        }
    }

    // Filter URLs
    const urlsToScrape = rawUrls.filter(u => !scrapedUrls.has(u));
    console.log(`Resuming scrape with ${urlsToScrape.length} remaining URLs.`);

    if (urlsToScrape.length === 0) {
        console.log('All URLs already scraped.');
        return;
    }

    // Helper to save
    const saveResults = () => {
        try {
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
            console.log(`Saved ${allResults.length} total products to file.`);
        } catch (e) {
            console.error('Error saving results:', e.message);
        }
    };

    // Batch Processing
    for (let i = 0; i < urlsToScrape.length; i += BATCH_SIZE) {
        const batchUrls = urlsToScrape.slice(i, i + BATCH_SIZE);
        console.log(`\n🚀 Processing Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(urlsToScrape.length / BATCH_SIZE)} (${batchUrls.length} URLs)`);

        try {
            const response = await fetch(SERVER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pincode: pincode,
                    urls: batchUrls,
                    maxConcurrentTabs: CONCURRENCY,
                    maxProductsPerSearch: 100, // Default
                    scrollCount: 20 // Ensure enough scrolling
                })
            });

            if (!response.ok) {
                console.error(`❌ Batch failed with status ${response.status}: ${response.statusText}`);
                const text = await response.text();
                console.error('Response:', text);
                continue;
            }

            const json = await response.json();
            if (json.status === 'success' && Array.isArray(json.products)) {
                const newProducts = json.products;
                console.log(`✅ Batch complete. Received ${newProducts.length} products.`);
                if (newProducts.length > 0) {
                    allResults.push(...newProducts);
                    saveResults();
                } else {
                    console.log('⚠️ No products in this batch.');
                }
            } else {
                console.error('❌ Invalid response structure:', json);
            }

        } catch (error) {
            console.error(`❌ Network or Server Error: ${error.message}`);
        }

        // Small delay between batches to be nice
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n🎉 Scrape completed for Pincode: ${pincode}`);
}

async function runClientScrapeForAllPincodes() {
    console.log(`\n🌐 Starting Zepto scrape for ${PINCODES.length} pincodes...\n`);

    for (let i = 0; i < PINCODES.length; i++) {
        const pincode = PINCODES[i];
        console.log(`\n📍 Processing Pincode ${i + 1}/${PINCODES.length}: ${pincode}`);
        console.log('='.repeat(60));

        try {
            await runClientScrapeForPincode(pincode);
        } catch (error) {
            console.error(`❌ Fatal error for pincode ${pincode}:`, error.message);
        }

        // Add delay between pincodes
        if (i < PINCODES.length - 1) {
            console.log(`\n⏳ Waiting 10 seconds before processing next pincode...`);
            await new Promise(r => setTimeout(r, 10000));
        }
    }

    console.log(`\n✨ All pincodes processed successfully!`);
}

runClientScrapeForAllPincodes().catch(console.error);
