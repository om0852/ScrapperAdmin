/**
 * DMart Scraper API Server
 * Exposes DMart scraping capability via REST API using dmart_bulk_scraper logic
 */

import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { transformDMartProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../Blinkit-Scrapper/enrich_categories.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4199;

// Load mappings
const CATEGORY_MAPPINGS = loadCategoryMappings(path.join(__dirname, '..', 'categories_with_urls.json'));

// --- HELPER FUNCTIONS ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getSlugFromUrl(url) {
    const match = url.match(/\/category\/([^\/]+)/);
    return match ? match[1] : null;
}

// --- SCRAPER LOGIC ---
async function scrapeDMart(pincode, urls, maxConcurrentTabs = 1) {
    let browser;
    const allProducts = [];

    try {
        console.log("Launching browser for DMart...");
        browser = await chromium.launch({
            headless: false,
            args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
        });

        const context = await browser.newContext({ viewport: null });
        const page = await context.newPage();

        console.log(`Navigating to DMart home for pincode ${pincode}...`);
        await page.goto("https://www.dmart.in/", { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(3000);

        // Handle Pincode Dialog
        try {
            const pincodeInput = await page.$("#pincodeInput");
            if (pincodeInput) {
                console.log("Pincode dialog detected. Entering pincode...");
                await pincodeInput.fill(pincode);
                await sleep(1500);

                const firstResult = await page.$("ul.list-none > li:first-child > button");
                if (firstResult) {
                    console.log("Selecting first location result...");
                    await firstResult.click();
                    await sleep(2000);

                    // Try clicking confirm / start shopping
                    try {
                        const confirmBtn = await page.$("button:has-text('START SHOPPING'), button:has-text('Start Shopping'), button:has-text('Confirm'), button:has-text('CONFIRM')");
                        if (confirmBtn) {
                            console.log("Found confirm button, clicking...");
                            await confirmBtn.click();
                            await sleep(3000);
                        } else {
                            console.log("No confirm button found (maybe it auto-redirected).");
                        }
                    } catch (e) {
                        console.log("Could not click confirm button:", e.message);
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

        let STORE_ID = "10706";
        try {
            const Cookies = await context.cookies();
            const dmStoreId = Cookies.find((c) => c.name === "dm_store_id");
            if (dmStoreId) {
                STORE_ID = dmStoreId.value;
                console.log(`Updated STORE_ID to ${STORE_ID} from cookies.`);
            }
        } catch (e) {
            console.log("Could not access cookies for Store ID.");
        }

        for (const urlItem of urls) {
            // Input schema specifically requests arrays of strings
            const url = typeof urlItem === 'string' ? urlItem : urlItem.url;
            console.log(`\n--- Processing Category: ${url} ---`);
            const slug = getSlugFromUrl(url);

            if (!slug) {
                console.error(`Could not extract slug from ${url}, skipping.`);
                continue;
            }
            console.log(`Slug: ${slug}`);

            let currentPage = 1;
            let keepScraping = true;
            const PAGE_SIZE = 40;

            while (keepScraping) {
                console.log(`Scraping Page ${currentPage}...`);
                const apiUrl = `https://digital.dmart.in/api/v3/plp/${slug}?page=${currentPage}&size=${PAGE_SIZE}&channel=web&storeId=${STORE_ID}`;

                try {
                    const data = await page.evaluate(async (targetUrl) => {
                        const res = await fetch(targetUrl, {
                            method: "GET",
                            headers: { accept: "application/json, text/plain, */*" }
                        });
                        if (!res.ok) throw new Error(res.status);
                        return res.json();
                    }, apiUrl);

                    const productsList = data.products || (data.data && data.data.products) || [];

                    if (productsList.length === 0) {
                        console.log(`No more products found on page ${currentPage}. Moving to next category.`);
                        keepScraping = false;
                        break;
                    }

                    // Raw format expected by transform_response_format.js
                    const rawItems = productsList.map(item => {
                        const sku = item.sKUs && item.sKUs.length > 0 ? item.sKUs[0] : {};
                        let imageUrl = "";
                        if (sku.imageKey) {
                            imageUrl = `https://cdn.dmart.in/images/products/${sku.imageKey}_5_P.jpg`;
                        }

                        return {
                            ...item,
                            sku: sku.skuUniqueID || 'N/A',
                            price: sku.priceSALE ? parseFloat(sku.priceSALE) : 0,
                            originalPrice: sku.priceMRP ? parseFloat(sku.priceMRP) : 0,
                            packSize: sku.variantTextValue || '',
                            quantity: sku.variantTextValue || '',
                            invType: sku.invType,
                            imageKey: sku.imageKey,
                            image: imageUrl,
                            skuId: sku.skuUniqueID || 'N/A',
                            categoryUrl: url,
                            // specific for transformer mapping
                            productId: item.productId,
                            productName: item.name,
                            isOutOfStock: sku.invType !== "A",
                            productUrl: `https://www.dmart.in/product/${item.seo_token_ntk}?selectedProd=${sku.skuUniqueID}`,
                            discountPercentage: sku.savingPercentage || 0
                        };
                    });

                    console.log(`  -> Found ${rawItems.length} products on page ${currentPage}.`);
                    allProducts.push(...rawItems);

                    currentPage++;
                    await sleep(1000 + Math.random() * 2000);
                } catch (err) {
                    console.error(`Error scraping page ${currentPage}:`, err.message);
                    keepScraping = false;
                }
            }
            await sleep(2000);
        }

    } catch (e) {
        throw e;
    } finally {
        if (browser) await browser.close();
    }

    return allProducts;
}

// --- API ENDPOINTS ---

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', platform: 'DMart' });
});

app.get('/status', (req, res) => {
    res.status(200).json({ status: 'running', platform: 'DMart', timestamp: new Date().toISOString() });
});

app.post('/dmartcategoryscrapper', async (req, res) => {
    const { pincode, url, urls, store, maxConcurrentTabs = 1 } = req.body;

    let targetUrls = [];
    if (urls && Array.isArray(urls)) targetUrls = urls;
    else if (url) targetUrls = [url];

    // the updated schema: only takes an array of strings
    targetUrls = targetUrls.map(u => typeof u === 'string' ? u : u.url).filter(Boolean);

    if (!pincode || targetUrls.length === 0) {
        return res.status(400).json({ error: "Pincode and URL(s) required" });
    }

    console.log(`Request: Pincode ${pincode}, URLs: ${targetUrls.length}`);

    try {
        const rawProducts = await scrapeDMart(pincode, targetUrls, maxConcurrentTabs);

        // 1. Deduplicate
        const dedupedCtx = deduplicateRawProducts(rawProducts);

        // 2. Transform
        const transformed = dedupedCtx.map((p, i) => {
            const catUrl = p.categoryUrl || 'N/A';
            let mapping = null;
            if (catUrl !== 'N/A') {
                const enriched = enrichProductWithCategoryMapping({ categoryUrl: catUrl }, CATEGORY_MAPPINGS);
                if (enriched.categoryMappingFound) mapping = enriched;
            }

            return transformDMartProduct(
                p,
                catUrl,
                'Unknown',
                'N/A',
                pincode,
                i + 1,
                mapping
            );
        });

        const responsePayload = {
            status: 'success',
            pincode,
            totalProducts: transformed.length,
            products: transformed,
            meta: {
                scrapedAt: new Date().toISOString()
            }
        };

        if (store === true) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `scraped_data_${pincode}_${timestamp}.json`;
            const storageDir = path.join(__dirname, 'scraped_data');

            if (!fs.existsSync(storageDir)) {
                fs.mkdirSync(storageDir);
            }

            const filepath = path.join(storageDir, filename);
            fs.writeFileSync(filepath, JSON.stringify(responsePayload, null, 2));
            console.log(`[Storage] Saved response to ${filepath}`);
            responsePayload.meta.storedFile = filename;
        }

        res.json(responsePayload);

    } catch (e) {
        console.error("Scrape Error:", e);
        res.status(500).json({ error: e.message });
    }
});

const server = app.listen(PORT, () => {
    console.log(`DMart Scraper Server running on http://localhost:${PORT}`);
});
server.setTimeout(0);
