const axios = require('axios');
const fs = require('fs').promises;

const SERVER_URL = 'http://localhost:4400/instamartcategorywrapper';
const PINCODES = [
  "201303",
  "201014",
  "122008",
  "122016",
  "122010",
  "400706",
  "400703",
  "400070",
  "401101",
  "401202",
];const MAX_CONCURRENT = 4;
const BATCH_SIZE = 12;

// Target URLs (Deduplicated list)
const rawUrls =[
  "https://www.swiggy.com/instamart/category-listing?categoryName=Chips+and+Namkeens&filterId=6822eeebed32000001e25a64&filterName=Chips+and+Crisps&offset=0&showAgeConsent=false&storeId=1404643&taxonomyType=Speciality+taxonomy+3",
  "https://www.swiggy.com/instamart/category-listing?categoryName=Chips+and+Namkeens&filterId=6884b8787738c300014fb9fb&filterName=Nuts&offset=0&showAgeConsent=false&storeId=1404643&taxonomyType=Speciality+taxonomy+3",
  "https://www.swiggy.com/instamart/category-listing?categoryName=Chips+and+Namkeens&filterId=6822eeebed32000001e25a67&filterName=Bhujia+and+Namkeens&offset=0&showAgeConsent=false&storeId=1404643&taxonomyType=Speciality+taxonomy+3"
]

const uniqueUrls = [...new Set(rawUrls)];

const FILENAME = `scraped_data_combined_${Date.now()}.json`;

function log(msg, type = 'INFO') {
    const time = new Date().toLocaleTimeString();
    let icon = 'ℹ️';
    if (type === 'SUCCESS') icon = '✅';
    if (type === 'ERROR') icon = '❌';
    if (type === 'WARN') icon = '⚠️';
    console.log(`[${time}] ${icon} ${msg}`);
}

async function scrapeInBatches(urls, pincode) {
    const results = [];
    const errors = [];
    const totalBatches = Math.ceil(urls.length / BATCH_SIZE);
    const pincodeFilename = `scraped_data_combined_${pincode}_${Date.now()}.json`;

    log(`Starting scrape task for Pincode: ${pincode}`);
    log(`Target File: ${pincodeFilename}`);
    log(`Total URLs: ${urls.length} | Batches: ${totalBatches}`);

    // Initialize empty file
    await fs.writeFile(pincodeFilename, JSON.stringify([], null, 2));

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const batch = urls.slice(i, i + BATCH_SIZE);

        log(`Processing Batch ${batchNum}/${totalBatches} (${batch.length} URLs)...`);

        try {
            const res = await axios.post(SERVER_URL, {
                pincode: pincode,
                urls: batch,
                maxConcurrentTabs: MAX_CONCURRENT
            }, { timeout: 600000 }); // Increased to 10 min timeout

            if (res.data?.products) {
                const newProducts = res.data.products;
                results.push(...newProducts);
                log(`Batch ${batchNum} Complete. Extracted ${newProducts.length} products.`, 'SUCCESS');

                // Read current file content to append safely (or just overwrite with full 'results' array)
                await fs.writeFile(pincodeFilename, JSON.stringify(results, null, 2));
                log(`Updated ${pincodeFilename} with total ${results.length} products.`);
            } else {
                log(`Batch ${batchNum} returned no products.`, 'WARN');
            }
        } catch (err) {
            log(`Batch ${batchNum} Failed: ${err.message}`, 'ERROR');
            errors.push({ batch: batchNum, urls: batch, error: err.message });
        }

        // Brief pause between batches
        if (i + BATCH_SIZE < urls.length) {
            log('Pausing for 3 seconds...');
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    return { results, errors, pincode, filename: pincodeFilename };
}

async function main() {
    const start = Date.now();
    const allResults = [];
    const allErrors = [];
    const fileList = [];

    log(`Starting scrape for ${PINCODES.length} pincode(s)`);

    for (const pincode of PINCODES) {
        log(`\n--- Processing Pincode: ${pincode} ---`);
        try {
            const { results, errors, filename } = await scrapeInBatches(uniqueUrls, pincode);
            allResults.push(...results);
            allErrors.push(...errors);
            fileList.push({ pincode, filename, count: results.length });
        } catch (err) {
            log(`Failed to process pincode ${pincode}: ${err.message}`, 'ERROR');
            allErrors.push({ pincode, error: err.message });
        }

        // Pause between pincodes (if not the last one)
        if (pincode !== PINCODES[PINCODES.length - 1]) {
            log('Pausing for 5 seconds before next pincode...');
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    const duration = ((Date.now() - start) / 1000 / 60).toFixed(2);

    console.log('\n=========================================');
    log(`Scrape Job Completed in ${duration} minutes`, 'SUCCESS');
    log(`Total Products Across All Pincodes: ${allResults.length}`);
    log(`Files Generated: ${fileList.length}`);
    fileList.forEach(f => log(`  - ${f.filename} (${f.count} products)`));

    if (allErrors.length > 0) {
        log(`Errors occurred. Check error logs.`, 'ERROR');
        await fs.writeFile(`errors_all_pincodes_${Date.now()}.json`, JSON.stringify(allErrors, null, 2));
    }
    console.log('=========================================\n');
}

main().catch(console.error);