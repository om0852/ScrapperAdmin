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

// Pincode → Store ID mapping (used to set correct storeId in API calls)
const PINCODE_STORE_MAP = {
    "400706": "10718",
    "400703": "10718",
    "401101": "10706",
    "401202": "10706",
    "400070": "10734",
};

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
        console.log(`Launching browser for DMart (pincode: ${pincode})...`);
        browser = await chromium.launch({
            headless: false,
            args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
        });

        const context = await browser.newContext({ viewport: null });
        const page = await context.newPage();

        await page.goto("https://www.dmart.in/", { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(3000);

        // Handle Pincode Dialog
        try {
            const pincodeInput = await page.$("#pincodeInput");
            if (pincodeInput) {
                await pincodeInput.fill(pincode);
                await sleep(1500);

                const firstResult = await page.$("ul.list-none > li:first-child > button");
                if (firstResult) {
                    await firstResult.click();
                    await sleep(2000);

                    try {
                        const confirmBtn = await page.$("button:has-text('START SHOPPING'), button:has-text('Start Shopping'), button:has-text('Confirm'), button:has-text('CONFIRM')");
                        if (confirmBtn) {
                            await confirmBtn.click();
                            await sleep(3000);
                        }
                    } catch (e) { /* confirm button optional */ }
                }
            }
        } catch (e) {
            console.error("Error handling pincode dialog:", e.message);
        }

        // Resolve Store ID: prefer pincode map, then fall back to cookie
        let STORE_ID = PINCODE_STORE_MAP[pincode] || "10706";
        console.log(`[DMart] Using Store ID: ${STORE_ID} for pincode: ${pincode}`);
        try {
            const Cookies = await context.cookies();
            const dmStoreId = Cookies.find((c) => c.name === "dm_store_id");
            if (dmStoreId && !PINCODE_STORE_MAP[pincode]) {
                // Only override from cookie if we don't have a known mapping
                STORE_ID = dmStoreId.value;
                console.log(`[DMart] Overriding Store ID from cookie: ${STORE_ID}`);
            }
        } catch (e) { /* ignore */ }

        for (const urlItem of urls) {
            const url = typeof urlItem === 'string' ? urlItem : urlItem.url;
            const slug = getSlugFromUrl(url);
            if (!slug) {
                console.error(`Could not extract slug from ${url}, skipping.`);
                continue;
            }
            console.log(`\nProcessing: ${slug}`);

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
                    // Mirrors the working dmart_bulk_scraper.js field mapping exactly
                    const rawItems = productsList.map(item => {
                        const sku = item.sKUs && item.sKUs.length > 0 ? item.sKUs[0] : {};

                        // Build image URL exactly as working bulk scraper does
                        let productImage = '';
                        if (sku.imageKey) {
                            productImage = `https://cdn.dmart.in/images/products/${sku.imageKey}_5_P.jpg`;
                        }

                        // Build product URL exactly as working bulk scraper does
                        const productUrl = item.seo_token_ntk
                            ? `https://www.dmart.in/product/${item.seo_token_ntk}?selectedProd=${sku.skuUniqueID}`
                            : '';

                        return {
                            ...item,
                            // Direct fields used by transformer
                            productImage,           // transformer checks product.productImage first
                            productUrl,             // transformer checks product.productUrl first
                            // SKU-level fields
                            sku: sku.skuUniqueID || 'N/A',
                            skuId: sku.skuUniqueID || 'N/A',
                            price: sku.priceSALE ? parseFloat(sku.priceSALE) : 0,
                            originalPrice: sku.priceMRP ? parseFloat(sku.priceMRP) : 0,
                            packSize: sku.variantTextValue || '',
                            quantity: sku.variantTextValue || '',
                            invType: sku.invType,
                            imageKey: sku.imageKey || '',
                            // Product-level fields
                            productId: item.productId,
                            productName: item.name,
                            isOutOfStock: sku.invType !== 'A',
                            categoryUrl: url,
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

        // 1. Transform first (suffix gets added here)
        const transformedAll = rawProducts.map((p, i) => {
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

        // 2. Deduplicate AFTER transform (suffix is now part of the unique key)
        const seenIds = new Set();
        const transformed = transformedAll.filter(p => {
            const key = p.productId || p.productName;
            if (!key || seenIds.has(key)) return false;
            seenIds.add(key);
            return true;
        });

        // 3. Re-assign rankings after dedup
        transformed.forEach((p, i) => { p.ranking = i + 1; });

        console.log(`DMart: Raw ${rawProducts.length}, After transform+dedup: ${transformed.length} unique products`);

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
