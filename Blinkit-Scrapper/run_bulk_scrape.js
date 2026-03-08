import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PINCODES = ["122010","201303","201014","122008","122016","400070","400706","400703","401202","401101"];
const TARGET_URL = "http://localhost:3088/blinkitcategoryscrapper";
const BATCH_SIZE = 4; // Process 10 URLs at a time
const CONCURRENCY = 4; // Server-side concurrency

const allUrls = [
  "https://blinkit.com/cn/namkeen-snacks/cid/1237/29",
  "https://blinkit.com/cn/papad-fryums/cid/1237/80",
  "https://blinkit.com/cn/popcorn/cid/1237/156",
  "https://blinkit.com/cn/nachos/cid/1237/316",
  "https://blinkit.com/cn/healthy-snacks/cid/1237/816",
  "https://blinkit.com/cn/chips-crisps/cid/1237/940",
  "https://blinkit.com/cn/bhujia-mixtures/cid/1237/1178"
]


async function runBulkScrapeForPincode(pincode) {
  const OUTPUT_FILE = path.join(__dirname, `blinkit_bulk_results_${pincode}.json`);
  console.log(`🚀 Starting Blinkit bulk scrape for Pincode: ${pincode}`);
  console.log(`Total URLs: ${allUrls.length}`);

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
        if (p.categoryUrl) scrapedUrls.add(p.categoryUrl);
      });
      console.log(
        `Found data for ${scrapedUrls.size} unique URLs already scraped.`,
      );
    } catch (e) {
      console.log("Existing output file is invalid or empty, starting fresh.");
    }
  }

  const urlsToScrape = allUrls.filter((u) => !scrapedUrls.has(u));
  console.log(
    `Resuming scrape with ${urlsToScrape.length} remaining URLs (out of ${allUrls.length} total).`,
  );

  if (urlsToScrape.length === 0) {
    console.log("All URLs already scraped for this pincode.");
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
          categories: batchUrls.map((u) => {
            let name = "Unknown";
            try {
              const parts = u.split("/");
              const cnIndex = parts.indexOf("cn");
              if (cnIndex !== -1 && parts[cnIndex + 1]) {
                name = parts[cnIndex + 1]
                  .replace(/-/g, " ")
                  .split(" ")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ");
              }
            } catch (e) {}
            return { name, url: u };
          }),
          maxConcurrentTabs: CONCURRENCY,
        },
        {
          timeout: 600000, // 10 minutes per batch
        },
      );

      // Handle Blinkit server response format: {status, pincode, totalProducts, products: [...]}
      let newProducts = [];
      if (response.data && Array.isArray(response.data.products)) {
        // Blinkit format: {status, pincode, totalProducts, products: [...]}
        newProducts = response.data.products;
      } else if (
        response.data &&
        response.data.success &&
        Array.isArray(response.data.data)
      ) {
        // Wrapped format: {success: true, data: [...]}
        newProducts = response.data.data;
      } else if (Array.isArray(response.data)) {
        // Direct array format: [...]
        newProducts = response.data;
      } else {
        console.error(
          "❌ Batch response in unexpected format:",
          typeof response.data,
        );
        console.log("Response structure:", Object.keys(response.data || {}));
      }

      if (newProducts.length > 0) {
        console.log(
          `✅ Batch complete. Received ${newProducts.length} products.`,
        );
        allResults.push(...newProducts);
        saveResults(); // Save immediately after success
      } else {
        console.log("⚠️ No products in this batch.");
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

  console.log(`\n🎉 Scrape completed for Pincode: ${pincode}`);
  console.log(`📦 Total products scraped: ${allResults.length}`);
}

async function runBulkScrapeForAllPincodes() {
  console.log(`\n🌐 Starting bulk scrape for ${PINCODES.length} pincodes...\n`);

  for (let i = 0; i < PINCODES.length; i++) {
    const pincode = PINCODES[i];
    console.log(`\n📍 Processing Pincode ${i + 1}/${PINCODES.length}: ${pincode}`);
    console.log("=".repeat(60));

    try {
      await runBulkScrapeForPincode(pincode);
    } catch (error) {
      console.error(`❌ Fatal error for pincode ${pincode}:`, error.message);
    }

    // Add delay between pincodes to avoid overwhelming the server
    if (i < PINCODES.length - 1) {
      console.log(`\n⏳ Waiting 10 seconds before processing next pincode...`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  console.log(`\n✨ All pincodes processed successfully!`);
}

runBulkScrapeForAllPincodes().catch((e) => console.error("Fatal Error:", e));
