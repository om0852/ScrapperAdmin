import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_URL = "http://localhost:4099/jiomartcategoryscrapper";
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
];
const BATCH_SIZE = 4;
const CONCURRENCY = 4; // Keep at 2 to minimize load per batch on the server

const allUrls = [
  "https://www.jiomart.com/c/groceries/biscuits-drinks-packaged-foods/chips-namkeens/29000",
  "https://www.jiomart.com/c/groceries/biscuits-drinks-packaged-foods/biscuits-cookies/28998",
];
async function scrapePincode(pincode) {
  console.log(`\n🚀 Starting Jiomart bulk scrape for Pincode: ${pincode}`);
  const OUTPUT_FILE = path.join(
    __dirname,
    `jiomart_bulk_results_${pincode}.json`,
  );

  // Load existing results to handle resume
  let allResults = [];
  let scrapedUrls = new Set();

  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const data = fs.readFileSync(OUTPUT_FILE, "utf8");
      allResults = JSON.parse(data);
      console.log(
        `Parsed ${allResults.length} existing results from ${OUTPUT_FILE}`,
      );

      allResults.forEach((p) => {
        if (p.categoryUrl) {
          // Normalize URL by removing trailing slashes and query params for consistency
          const normalizedUrl = p.categoryUrl.split("?")[0].replace(/\/$/, "");
          scrapedUrls.add(normalizedUrl);
        }
      });
      console.log(
        `Found data for ${scrapedUrls.size} unique URLs already scraped.`,
      );

      // Debug: Show unique URLs from results
      console.log(`\n📊 URLs in existing results:`);
      const uniqueUrlsInResults = new Set();
      allResults.forEach((p) => {
        if (p.categoryUrl) {
          const normalizedUrl = p.categoryUrl.split("?")[0].replace(/\/$/, "");
          uniqueUrlsInResults.add(normalizedUrl);
        }
      });
      console.log(`  Total unique URLs: ${uniqueUrlsInResults.size}`);
    } catch (e) {
      console.log("Existing output file is invalid or empty, starting fresh.");
    }
  }

  const validUrls = allUrls.filter((u) => u !== "URL_NOT_FOUND");

  // Normalize URLs for comparison
  const urlsToScrape = validUrls.filter((u) => {
    const normalizedUrl = u.split("?")[0].replace(/\/$/, "");
    return !scrapedUrls.has(normalizedUrl);
  });

  console.log(`\n📋 URL Status for ${pincode}:`);
  console.log(`  Total URLs in list: ${validUrls.length}`);
  console.log(`  URLs already scraped: ${scrapedUrls.size}`);
  console.log(`  URLs remaining to scrape: ${urlsToScrape.length}`);

  if (urlsToScrape.length > 0) {
    console.log(`\n⏳ Remaining URLs to scrape:`);
    urlsToScrape.slice(0, 5).forEach((u, i) => {
      console.log(`  ${i + 1}. ${u}`);
    });
    if (urlsToScrape.length > 5) {
      console.log(`  ... and ${urlsToScrape.length - 5} more`);
    }
  }

  console.log(
    `\nResuming scrape with ${urlsToScrape.length} remaining URLs (out of ${validUrls.length} total).`,
  );

  if (urlsToScrape.length === 0) {
    console.log("All URLs already scraped.");
    return;
  }

  // Helper to save
  const saveResults = () => {
    try {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
      console.log(
        `💾 Saved ${allResults.length} total products to ${OUTPUT_FILE}`,
      );
    } catch (e) {
      console.error("Error saving results:", e.message);
    }
  };

  // Process in batches
  for (let i = 0; i < urlsToScrape.length; i += BATCH_SIZE) {
    const batchUrls = urlsToScrape.slice(i, i + BATCH_SIZE);
    console.log(
      `\n🚀 Processing Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(urlsToScrape.length / BATCH_SIZE)} (${batchUrls.length} URLs)`,
    );

    try {
      const response = await axios.post(
        TARGET_URL,
        {
          pincode: pincode,
          urls: batchUrls,
          maxConcurrentTabs: CONCURRENCY,
        },
        {
          timeout: 3600000, // 1 hour timeout per batch
        },
      );

      if (
        response.data &&
        response.data.success &&
        Array.isArray(response.data.data)
      ) {
        const newProducts = response.data.data;
        console.log(
          `✅ Batch complete. Received ${newProducts.length} products.`,
        );
        if (newProducts.length > 0) {
          allResults.push(...newProducts);
          saveResults(); // Save immediately after success
        } else {
          console.log("⚠️ No products in this batch.");
        }
      } else {
        console.error(
          "❌ Batch response unsuccessful or invalid format:",
          response.data,
        );
      }
    } catch (error) {
      console.error(`❌ Batch failed: ${error.message}`);
      if (error.code) console.error("Error Code:", error.code);
      // Don't exit, try next batch.
    }

    // Delay between batches
    console.log("⏳ Waiting 5 seconds before next batch...");
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log(`\n🎉 Scrape completed for ${pincode}.`);
}

async function runBulkScrape() {
  for (const pincode of PINCODES) {
    await scrapePincode(pincode);
    console.log(`\nWaiting 10 seconds before next pincode...`);
    await new Promise((r) => setTimeout(r, 10000));
  }
  console.log("\n🌟 All pincodes processed.");
}

runBulkScrape().catch((e) => console.error("Fatal Error:", e));
