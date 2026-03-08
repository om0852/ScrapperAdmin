const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// Configuration
const URLS_FILE = path.join(__dirname, "..", "dmart_urls_array.json");

// Pincode → Store ID mapping
const PINCODE_STORE_MAP = {
  "400706": "10718",
  "400703": "10718",
  "401101": "10706",
  "401202": "10706",
  "400070": "10734",
};

const PAGE_SIZE = 40;
const PINCODE = "401101";
let STORE_ID = PINCODE_STORE_MAP[PINCODE] || "10706"; // Auto-resolves from map; falls back to 10706
const OUTPUT_FILE = path.join(__dirname, `dmart_bulk_data_${PINCODE}.json`);
const PLATFORM = "dmart";

// Load URLs from file
const CATEGORY_URLS = JSON.parse(fs.readFileSync(URLS_FILE, "utf8"));

// Helper to extract slug from URL
function getSlugFromUrl(url) {
  // pattern: .../category/<slug>
  const match = url.match(/\/category\/([^\/]+)/);
  return match ? match[1] : null;
}

// Helper: Sleep
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let browser;
  let allProducts = [];

  try {
    console.log("Launching browser...");
    // Open visible browser as per preference
    browser = await chromium.launch({
      headless: false,
      args: ["--start-maximized"],
    });

    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();

    // 1. Initialize Session & Handle Pincode
    console.log("Navigating to DMart home to initialize session...");
    await page.goto("https://www.dmart.in/", { waitUntil: "domcontentloaded" });
    await sleep(3000); // Wait for potential dialog

    // Handle Pincode Dialog
    try {
      const pincodeInput = await page.$("#pincodeInput");
      if (pincodeInput) {
        console.log("Pincode dialog detected. Entering pincode...");
        await pincodeInput.fill(PINCODE);
        await sleep(1500); // Wait for search results

        // Click first result: ul.list-none > li > button
        const firstResult = await page.$(
          "ul.list-none > li:first-child > button",
        );
        if (firstResult) {
          console.log("Selecting first location result...");
          await firstResult.click();
          await sleep(2000);

          try {
            const confirmBtn = await page.$("button:has-text('START SHOPPING'), button:has-text('Start Shopping'), button:has-text('Confirm'), button:has-text('CONFIRM')");
            if (confirmBtn) {
              console.log("Found confirm button, clicking...");
              await confirmBtn.click();
              await sleep(3000);
            } else {
              console.log("No extra confirm button found.");
            }
          } catch (e) {
            console.log("Error clicking confirm button:", e.message);
          }
        } else {
          console.log("No location results found!");
        }
      } else {
        console.log("Pincode dialog not found immediately.");
      }
    } catch (e) {
      console.log("Error handling pincode dialog:", e.message);
    }

    // Extract Store ID from cookies or local storage if possible
    const Cookies = await context.cookies();
    const storeCookie = Cookies.find((c) =>
      c.name.toLowerCase().includes("store"),
    );
    if (storeCookie) {
      console.log("Found store cookie:", storeCookie);
      // Logic to extract if needed, but often DMart uses 'dm_store_id' or similar in headers
    }

    // Try to capture a network request to get the correct storeId
    // Or simply rely on browser context to handle it.
    // However, the user explicitly asked to "use the storeid from it".
    // Let's try to grab it from localStorage if accessible
    try {
      const localStorageData = await page.evaluate(() => window.localStorage);
      // Inspecting common keys. DMart might use 'userSelectedLocation' or similar.
      // For now, let's assume if we are authenticated/located, the API calls will work with browser context.
      // But to be safe, let's update STORE_ID if we find a better one in cookies.
      const dmStoreId = Cookies.find((c) => c.name === "dm_store_id");
      if (dmStoreId) {
        STORE_ID = dmStoreId.value;
        console.log(`Updated STORE_ID to ${STORE_ID} from cookies.`);
      }
    } catch (e) {
      console.log("Could not access localStorage or cookies for Store ID.");
    }

    // 2. Iterate Categories
    for (const item of CATEGORY_URLS) {
      const url = typeof item === "string" ? item : item.url;
      const officialCategory =
        typeof item === "string" ? "" : item.officialCategory;

      console.log(`\n--- Processing Category: ${url} ---`);
      const slug = getSlugFromUrl(url);

      if (!slug) {
        console.error(`Could not extract slug from ${url}, skipping.`);
        continue;
      }
      console.log(`Slug: ${slug}`);

      let currentPage = 1;
      let keepScraping = true;
      let currentRank = 1;

      while (keepScraping) {
        console.log(`Scraping Page ${currentPage}...`);
        const apiUrl = `https://digital.dmart.in/api/v3/plp/${slug}?page=${currentPage}&size=${PAGE_SIZE}&channel=web&storeId=${STORE_ID}`;

        try {
          // Fetch in context
          const data = await page.evaluate(async (targetUrl) => {
            const res = await fetch(targetUrl, {
              method: "GET",
              headers: {
                accept: "application/json, text/plain, */*",
                // 'storeid': '10718' // usually set by cookies/headers automatically in browser, but we can explicit if needed.
                // Let's rely on browser context first.
              },
            });
            if (!res.ok) throw new Error(res.status);
            return res.json();
          }, apiUrl);

          // Extract logic
          const productsList =
            data.products || (data.data && data.data.products) || [];

          if (productsList.length === 0) {
            console.log(
              `No more products found on page ${currentPage}. Moving to next category.`,
            );
            keepScraping = false;
            break;
          }

          // Format
          const formatted = productsList.map((item) => {
            const sku = item.sKUs && item.sKUs.length > 0 ? item.sKUs[0] : {};
            let imageUrl = "";
            if (sku.imageKey) {
              imageUrl = `https://cdn.dmart.in/images/products/${sku.imageKey}_5_P.jpg`;
            }

            return {
              rank: currentRank++,
              productId: item.productId,
              productName: item.name,
              productImage: imageUrl,
              productWeight: sku.variantTextValue || "",
              currentPrice: sku.priceSALE ? parseFloat(sku.priceSALE) : 0,
              originalPrice: sku.priceMRP ? parseFloat(sku.priceMRP) : 0,
              discountPercentage: sku.savingPercentage || 0,
              isOutOfStock: sku.invType !== "A",
              productUrl: `https://www.dmart.in/product/${item.seo_token_ntk}?selectedProd=${sku.skuUniqueID}`,
              categoryUrl: url, // Track source
              officialCategory: officialCategory,
              pincode: PINCODE,
              platform: PLATFORM,
            };
          });

          console.log(
            `  -> Found ${formatted.length} products on page ${currentPage}.`,
          );
          allProducts.push(...formatted);

          // Incremental Save
          fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allProducts, null, 2));

          currentPage++;
          // Delay to avoid bot detection (minimum 1 second)
          await sleep(1000 + Math.random() * 2000);
        } catch (err) {
          console.error(`Error scraping page ${currentPage}:`, err.message);
          // Decide whether to retry or skip. For now, assume end of category or hard error.
          // If 404 or similar, likely end.
          keepScraping = false;
        }
      }

      await sleep(2000); // Break between categories
    }

    console.log(
      `\nBulk scrap completed. Total products: ${allProducts.length}`,
    );
  } catch (error) {
    console.error("Fatal error:", error);
  } finally {
    if (browser) await browser.close();
  }
})();
