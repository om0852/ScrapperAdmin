const express = require('express');
const bodyParser = require('body-parser');
const { chromium, firefox, devices } = require('playwright');

const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4400;

app.use(bodyParser.json({ limit: '50mb' }));

const SESSION_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR);
}

// API Dumps storage directory
const API_DUMPS_DIR = path.join(__dirname, 'api_dumps');
if (!fs.existsSync(API_DUMPS_DIR)) {
    fs.mkdirSync(API_DUMPS_DIR);
}

// === LOAD STANDARDIZATION MODULES (ESM) ===
let transformInstamartProduct, deduplicateRawProducts, loadCategoryMappings, enrichProductWithCategoryMapping;
let CATEGORY_MAPPINGS;

(async () => {
    try {
        const transformModule = await import('./transform_response_format.js');
        transformInstamartProduct = transformModule.transformInstamartProduct;
        deduplicateRawProducts = transformModule.deduplicateRawProducts;

        const enrichModule = await import('../enrich_categories.js');
        loadCategoryMappings = enrichModule.loadCategoryMappings;
        enrichProductWithCategoryMapping = enrichModule.enrichProductWithCategoryMapping;

        CATEGORY_MAPPINGS = loadCategoryMappings(path.join(__dirname, '..', 'categories_with_urls.json'));
        console.log('✅ Loaded Standardization Modules & Category Mappings');
    } catch (e) {
        console.error('❌ Failed to load standardization modules:', e);
    }
})();

// Function to save API dumps
function saveApiDump(pincode, url, jsonData, dumpType = 'response') {
    try {
        const timestamp = Date.now();
        const urlHash = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const filename = `dump_${pincode}_${dumpType}_${urlHash}_${timestamp}.json`;
        const filepath = path.join(API_DUMPS_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(jsonData, null, 2));
        console.log(`✓ API dump saved: ${filename}`);
        return filename;
    } catch (err) {
        console.error(`✗ Failed to save API dump: ${err.message}`);
        return null;
    }
}

const getSessionPath = (pincode) => path.join(SESSION_DIR, `session_${pincode}.json`);

const saveSession = async (context, pincode) => {
    if (!pincode) return;
    const sessionPath = getSessionPath(pincode);
    await context.storageState({ path: sessionPath });
    console.log(`Session saved for pincode ${pincode} at ${sessionPath}`);
};

async function setupLocation(page, context, pincode) {
    if (!pincode) return;
    const sessionPath = getSessionPath(pincode);
    if (fs.existsSync(sessionPath)) {
        console.log(`Session file exists for ${pincode}, assuming it's loaded.`);
        return;
    }
    console.log(`Setting up location for pincode: ${pincode}`);
    try {
        try {
            await page.waitForSelector('div[data-testid="address-bar"]', { timeout: 5000 });
            await page.click('div[data-testid="address-bar"]');
        } catch (e) {
            console.log('Address bar not found or clickable');
        }
        try {
            await page.waitForSelector('div[data-testid="search-location"]', { timeout: 5000 });
            await page.click('div[data-testid="search-location"]');
        } catch (e) { console.log('Search location button not found.'); }

        const inputSelector = 'input[placeholder="Search for area, street name…"]';
        try {
            await page.waitForSelector(inputSelector, { timeout: 5000 });
            await page.fill(inputSelector, pincode);
        } catch (e) { console.log('Input field not found.'); }

        try {
            await page.waitForSelector('div._11n32', { timeout: 5000 });
            const results = await page.$$('div._11n32');
            if (results.length > 0) await results[0].click();
        } catch (e) { console.log('No address results.'); }

        try {
            await page.waitForTimeout(2000);
            const confirmBtn = page.getByRole('button', { name: /confirm/i });
            if (await confirmBtn.isVisible()) await confirmBtn.click();
        } catch (e) { }

        await page.waitForTimeout(3000);
        await saveSession(context, pincode);
    } catch (error) { console.error('Error in setupLocation:', error); }
}

async function autoScroll(page, minItemCount = null) {
    console.log(`Starting fast robust auto-scroll sequence... Target: ${minItemCount ? minItemCount + ' items' : 'Unlimited'}`);
    const maxTime = 300000; // 5 mins
    const startTime = Date.now();

    let lastHeight = 0;
    let stuckCount = 0;
    let ghostTryAgainCount = 0;
    const STUCK_THRESHOLD = 20;

    // Selector for counting
    const CARD_SELECTOR = 'div[data-testid="item-collection-card-full"]';

    while (Date.now() - startTime < maxTime) {
        try {
            if (page.isClosed()) break;

            // --- NEW: Check Item Count ---
            if (minItemCount) {
                const currentCount = await page.locator(CARD_SELECTOR).count();
                if (currentCount >= minItemCount) {
                    console.log(`Reached target item count (${currentCount} >= ${minItemCount}). Stopping scroll.`);
                    break;
                }
            }
            // -----------------------------

            // 1. Scroll and measure height
            const { newHeight } = await page.evaluate(() => {
                const distance = 1200;
                let scrollTarget = window;
                let maxScrollHeight = 0;

                if (document.body.scrollHeight > window.innerHeight) {
                    maxScrollHeight = document.body.scrollHeight;
                }

                const divs = document.querySelectorAll('div');
                divs.forEach(div => {
                    if (div.scrollHeight > div.clientHeight && div.clientHeight > 0 && div.scrollHeight > 300) {
                        if (div.scrollHeight > maxScrollHeight) {
                            maxScrollHeight = div.scrollHeight;
                            scrollTarget = div;
                        }
                    }
                });

                if (scrollTarget === window) {
                    window.scrollBy(0, distance);
                } else {
                    scrollTarget.scrollBy(0, distance);
                }

                return { newHeight: maxScrollHeight };
            });

            // 2. Check overlap/stuck state
            if (Math.abs(newHeight - lastHeight) < 10) {
                // Quick check for Try Again
                const tryAgainLoc = page.locator('button, div[role="button"], div[role="alert"] span').filter({ hasText: /Try Again/i }).first();

                const isVisible = await tryAgainLoc.isVisible({ timeout: 500 });

                if (isVisible) {
                    const isTrulyVisible = await tryAgainLoc.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    }).catch(() => false);

                    if (isTrulyVisible) {
                        console.log('"Try Again" button found (DOM visible). Clicking...');
                        let clickRetries = 0;
                        let shouldStopScrolling = false;

                        while (clickRetries < 3) {
                            try {
                                await tryAgainLoc.scrollIntoViewIfNeeded();

                                // Safe viewport check
                                const box = await tryAgainLoc.boundingBox();
                                const viewport = await page.viewportSize();

                                if (box && viewport) {
                                    const isOffScreen = (box.y > viewport.height || (box.y + box.height) < 0);
                                    if (isOffScreen) {
                                        console.log('Skipping off-screen "Try Again"');
                                        break;
                                    }

                                    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                                    await page.mouse.down();
                                    await page.mouse.up();
                                } else {
                                    // Fallback if no box/viewport
                                    await tryAgainLoc.click({ delay: 50, force: true });
                                }

                                await page.waitForTimeout(2000);

                                const checkHeight = await page.evaluate(() => document.body.scrollHeight);
                                if (checkHeight > newHeight) {
                                    stuckCount = 0;
                                    lastHeight = checkHeight;
                                    ghostTryAgainCount = 0;
                                    break;
                                }
                            } catch (e) {
                                if (e.message.includes('outside of the viewport')) {
                                    ghostTryAgainCount++;
                                    console.log(`Ghost "Try Again" detected (${ghostTryAgainCount}/40). Ignoring.`);
                                    if (ghostTryAgainCount > 40) {
                                        shouldStopScrolling = true;
                                    }
                                    break;
                                }
                            }
                            clickRetries++;
                        }

                        if (shouldStopScrolling) break;
                        if (stuckCount === 0) continue;
                    }
                }

                stuckCount++;
                if (stuckCount % 5 === 0) console.log(`Stuck: ${stuckCount}/${STUCK_THRESHOLD}`);

                if (stuckCount >= STUCK_THRESHOLD) {
                    console.log('Stuck limit reached. Finishing.');
                    break;
                }

                // Wiggle faster
                if (stuckCount > 1) {
                    await page.mouse.wheel(0, -100);
                    await page.waitForTimeout(200);
                    await page.mouse.wheel(0, 300);
                }

            } else {
                stuckCount = 0;
                ghostTryAgainCount = 0;
                lastHeight = newHeight;
            }

            await page.waitForTimeout(400);

        } catch (e) {
            if (e.message.includes('Target closed') || page.isClosed()) break;
            stuckCount++;
            await page.waitForTimeout(1000);
        }
    }
    console.log('Auto-scroll finished.');
}

async function extractProducts(page) {
    console.log('Skipping manual DOM scraping (User confirmed API data is sufficient)...');
    return [];
}

// --- API Processing Logic ---
function findProductInJson(obj, foundProducts = []) {
    if (!obj || typeof obj !== 'object') return;

    // Check if this object looks like a product info block
    // Swiggy usually has 'product_info' or 'data' with these fields
    // NEW: Handle camelCase keys from the dump (productId, displayName)
    if ((obj.product_id || obj.productId) && (obj.name || obj.displayName) && (obj.price || obj.variations)) {
        foundProducts.push(obj);
        return;
    }

    // Recursive search
    if (Array.isArray(obj)) {
        obj.forEach(item => findProductInJson(item, foundProducts));
    } else if (typeof obj === 'object') {
        Object.values(obj).forEach(value => findProductInJson(value, foundProducts));
    }
}

function processCapturedJson(json) {
    const rawProducts = [];
    findProductInJson(json, rawProducts);

    return rawProducts.map(item => {
        try {
            // Handle both snake_case (legacy/other API) and camelCase (new API)

            // 1. Identification
            const pid = item.productId || item.product_id;
            const name = item.displayName || item.name;

            // 2. Variations / Pricing
            let variant = item;
            if (item.variations && item.variations.length > 0) {
                variant = item.variations[0];
            }

            const priceObj = variant.price || variant.final_price || variant.offer_price;

            // Extract Price (Handle Google Money "units" or Paice)
            let currentPrice = 0;
            let originalPrice = 0;

            if (priceObj) {
                // Formatting from "units" (Rupees)
                if (priceObj.offerPrice?.units) {
                    currentPrice = parseFloat(priceObj.offerPrice.units);
                } else if (priceObj.price) { // sometimes direct
                    currentPrice = priceObj.price / 100;
                }

                if (priceObj.mrp?.units) {
                    originalPrice = parseFloat(priceObj.mrp.units);
                } else if (priceObj.store_price?.price) {
                    originalPrice = priceObj.store_price.price / 100;
                }
            }

            if (currentPrice === 0 && variant.price?.price) {
                // Fallback to direct price object if not in offerPrice
                currentPrice = variant.price.price / 100; // Assume paise if simple number
            }

            if (originalPrice === 0) originalPrice = currentPrice;

            if (originalPrice === 0) originalPrice = currentPrice;

            // 3. Meta Data
            const weight = variant.quantityDescription || variant.quantity_label || variant.weight || '';
            const imageId = (variant.imageIds && variant.imageIds[0]) || variant.cloudinary_image_id || variant.image_id || '';
            const imageUrl = imageId ? `https://instamart-media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,h_544,w_504/${imageId}` : null;

            // Brand Extraction
            const brand = variant.brandName || item.brand || item.brandName || 'N/A';

            // isAd: Check if adTrackingContext has a value (indicates sponsored/ad product)
            const isAdValue = item.adTrackingContext || false;
            const ratingVal = variant.rating?.value || item.rating?.value || item.avg_rating || 0;

            const inStock = variant.inventory?.inStock || item.inventory?.in_stock;
            const isOutOfStock = inStock === false;

            // Server: Get from analytics.extraFields.storeIDflag (PRIMARY or SECONDARY)
            const server = item.analytics?.extraFields?.storeIDflag || 'N/A';

            // Discount
            let discountPercentage = 0;
            if (item.offerApplied?.listingDescription) {
                // e.g. "13% OFF"
                const match = item.offerApplied.listingDescription.match(/(\d+)%/);
                if (match) discountPercentage = parseInt(match[1]);
            } else if (variant.price?.offerApplied?.listingDescription) {
                const match = variant.price.offerApplied.listingDescription.match(/(\d+)%/);
                if (match) discountPercentage = parseInt(match[1]);
            } else if (originalPrice > currentPrice) {
                discountPercentage = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
            }

            return {
                productId: pid,
                productName: name,
                brand: brand,
                productImage: imageUrl,
                productWeight: weight,
                quantity: weight,
                deliveryTime: null,
                isAd: !!isAdValue,
                server: server,
                rating: ratingVal,
                currentPrice: currentPrice,
                originalPrice: originalPrice,
                discountPercentage: discountPercentage,
                isOutOfStock: isOutOfStock,
                productUrl: pid ? `https://www.swiggy.com/instamart/item/${pid}` : null,
                platform: "instamart",
                scrapedAt: new Date().toISOString()
            };
        } catch (e) { return null; }
    }).filter(p => p !== null);
}

// --- REFACTORED: Scrape Logic extracted for Parallel Execution ---
async function scrapeCategoryInContext(context, url, pincode) {
    const page = await context.newPage();
    const capturedProducts = new Map(); // Use Map to avoid duplicates by ID
    let scrapedDeliveryTime = null;

    try {
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // --- NEW: Block Images/Fonts for Performance ---
        await page.route('**/*', async (route) => {
            const resourceType = route.request().resourceType();
            if (['image', 'media', 'font'].includes(resourceType)) {
                await route.abort();
            } else {
                await route.continue();
            }
        });
        // -----------------------------------------------

        // API Interceptor
        page.on('response', async response => {
            const resUrl = response.url();
            const resourceType = response.request().resourceType();

            // Capture Logic
            if (resUrl.includes('api/instamart/') && (resourceType === 'fetch' || resourceType === 'xhr')) {
                // Special Debug for Filter API
                if (resUrl.includes('category-listing/filter')) {
                    try {
                        const json = await response.json();
                        // Save API dump
                        saveApiDump(pincode, url, json, 'filter_api');
                        const parsed = processCapturedJson(json);
                        if (parsed.length > 0) {
                            parsed.forEach(p => capturedProducts.set(p.productId, p));
                        }
                    } catch (e) { }
                }

                // General Listing Capture
                if (resUrl.includes('category/list') || resUrl.includes('listing') || resUrl.includes('api/instamart/item/v2/')) {
                    try {
                        const status = response.status();
                        if (status >= 200 && status < 300) {
                            const json = await response.json();
                            // Save API dump
                            saveApiDump(pincode, url, json, 'listing_api');
                            // Process immediately
                            const parsed = processCapturedJson(json);
                            if (parsed.length > 0) {
                                parsed.forEach(p => {
                                    if (!capturedProducts.has(p.productId)) {
                                        capturedProducts.set(p.productId, p);
                                    }
                                });
                            }
                        }
                    } catch (e) { }
                }
            }
        });

        // Navigate
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Validate Location (Optional check, mainly for debug, assuming setup already done)
        if (pincode) {
            try {
                const addressEl = page.locator('div[data-testid="address-bar"]');
                if (await addressEl.isVisible()) {
                    const addressText = await addressEl.innerText();
                    if (!addressText.includes(pincode)) {
                        console.log(`[${url}] Warning: Location mismatch? Current: "${addressText}"`);
                    }
                }
            } catch (e) { }
        }

        // Extract Delivery Time (Try homepage logic if possible or just current page header)
        try {
            const deliverySelector = 'div[data-testid="address-name"] span._31zZQ';
            if (await page.locator(deliverySelector).count() > 0) {
                scrapedDeliveryTime = await page.locator(deliverySelector).first().innerText();
            }
        } catch (e) { }


        // SSR Data Extraction
        try {
            const initialStateFn = async () => {
                const nextDataScript = document.getElementById('__NEXT_DATA__');
                if (nextDataScript) return JSON.parse(nextDataScript.textContent);
                if (window.__NEXT_DATA__) return window.__NEXT_DATA__;
                return null;
            };
            const initialState = await page.evaluate(initialStateFn);
            if (initialState) {
                const ssrProducts = processCapturedJson(initialState);
                ssrProducts.forEach(p => {
                    if (!capturedProducts.has(p.productId)) {
                        capturedProducts.set(p.productId, p);
                    }
                });
            }
        } catch (e) { }

        // Click-and-Close Strategy for API Trigger
        try {
            const cardSelector = 'div[data-testid="item-collection-card-full"]';
            try {
                await page.waitForSelector(cardSelector, { timeout: 10000 });
                const firstCard = page.locator(cardSelector).first();
                if (await firstCard.isVisible()) {
                    await firstCard.click({ force: true });
                    const popupSelector = '#product-details-page-container, div._1ne2g';
                    await page.waitForSelector(popupSelector, { timeout: 5000 }).catch(() => { });
                    await page.waitForTimeout(1000);

                    const backBtn = page.locator('button[data-testid="simpleheader-back"]');
                    if (await backBtn.isVisible()) {
                        await backBtn.click();
                    } else {
                        await page.keyboard.press('Escape');
                    }
                    await page.waitForSelector(cardSelector, { timeout: 5000 }).catch(() => { });
                }
            } catch (e) { }
        } catch (e) { }


        // Scroll
        await autoScroll(page);

        // Final Extraction
        const domProducts = await extractProducts(page);

        // Merge Logic
        const finalProducts = [];
        const normalize = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const apiMapByName = new Map();
        const usedApiIds = new Set();

        capturedProducts.forEach(p => {
            if (p.productName) apiMapByName.set(normalize(p.productName), p);
        });

        domProducts.forEach(domItem => {
            const normName = normalize(domItem.productName);
            const apiMatch = apiMapByName.get(normName);

            if (apiMatch) {
                usedApiIds.add(apiMatch.productId);
                finalProducts.push({
                    ...domItem,
                    ...apiMatch,
                    ranking: domItem.ranking,
                    deliveryTime: scrapedDeliveryTime || domItem.deliveryTime,
                    scrapedAt: new Date().toISOString()
                });
            } else {
                finalProducts.push({
                    ...domItem,
                    deliveryTime: scrapedDeliveryTime || domItem.deliveryTime
                });
            }
        });

        let nextRank = domProducts.length + 1;
        capturedProducts.forEach(apiItem => {
            if (!usedApiIds.has(apiItem.productId)) {
                finalProducts.push({
                    ...apiItem,
                    ranking: nextRank++,
                    deliveryTime: scrapedDeliveryTime,
                    productUrl: `https://www.swiggy.com/instamart/item/${apiItem.productId}`,
                    platform: "instamart",
                    scrapedAt: new Date().toISOString()
                });
            }
        });

        finalProducts.forEach((p, i) => p.ranking = i + 1);

        return finalProducts;

    } catch (e) {
        console.error(`Error scraping ${url}:`, e);
        return [];
    } finally {
        await page.close();
    }
}


app.post('/instamartcategorywrapper', async (req, res) => {
    const { url, urls, pincode, maxConcurrentTabs = 2, store } = req.body;

    // Support legacy single URL or new array
    let targetUrls = [];
    if (urls && Array.isArray(urls)) {
        targetUrls = urls;
    } else if (url) {
        targetUrls = [url];
    }

    if (targetUrls.length === 0) return res.status(400).json({ error: 'URL(s) is required' });

    console.log(`Received request for Pincode: ${pincode}, URLs: ${targetUrls.length}`);

    let browser;
    try {
        browser = await chromium.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars'
            ],
            ignoreDefaultArgs: ['--enable-automation']
        });

        // 1. Setup Session (Single Context)
        let setupContext = await browser.newContext();
        if (pincode && fs.existsSync(getSessionPath(pincode))) {
            // Try to load existing if compatible, but setupLocation handles it.
            // We'll trust setupLocation to handle the file check/creation using this context.
        }

        // Note: setupLocation writes to disk. 
        // We will do a robust setup run first if pincode is present.
        if (pincode) {
            const setupPage = await setupContext.newPage();
            await setupPage.goto('https://www.swiggy.com/instamart', { waitUntil: 'domcontentloaded' });
            await setupLocation(setupPage, setupContext, pincode);
            await setupPage.close();
        }
        await setupContext.close();

        // Load the session state we just ensured exists/is valid
        let storageState = undefined;
        if (pincode && fs.existsSync(getSessionPath(pincode))) {
            storageState = getSessionPath(pincode);
        }

        // 2. Parallel Scrape
        const CONCURRENCY_LIMIT = Math.min(targetUrls.length, maxConcurrentTabs);
        const queue = targetUrls.map((u, i) => ({ url: u, index: i }));
        const allResults = [];

        console.log(`Starting processing with concurrency ${CONCURRENCY_LIMIT}...`);

        const workers = Array(CONCURRENCY_LIMIT).fill().map(async (_, workerId) => {
            while (queue.length > 0) {
                const { url, index } = queue.shift();
                console.log(`[Worker ${workerId}] Processing: ${url}`);

                let context = null;
                try {
                    context = await browser.newContext({
                        storageState: storageState,
                        viewport: null
                    });

                    const products = await scrapeCategoryInContext(context, url, pincode);

                    // Add category URL
                    products.forEach(p => p.categoryUrl = url);
                    allResults.push(...products);

                    console.log(`[Worker ${workerId}] Finished ${url}: ${products.length} products`);

                } catch (e) {
                    console.error(`[Worker ${workerId}] Failed ${url}:`, e);
                } finally {
                    if (context) await context.close();
                }
            }
        });

        await Promise.all(workers);

        // Save consolidated file for backward compat (or one big file)
        const finalFilename = path.join(__dirname, `scraped_data_combined_${pincode}_${Date.now()}.json`);
        fs.writeFileSync(finalFilename, JSON.stringify(allResults, null, 2));

        console.log(`All done. Raw products: ${allResults.length}`);

        // === APPLY STANDARDIZED FORMAT ===
        let productsToReturn = [];

        if (deduplicateRawProducts && transformInstamartProduct) {
            // 1. Transform and Enrich first (suffix gets added here)
            const transformedAll = allResults.map((product, index) => {
                const productCategoryUrl = product.categoryUrl || 'N/A';
                const officialCategory = 'Unknown';

                let categoryMapping = null;
                if (productCategoryUrl !== 'N/A' && enrichProductWithCategoryMapping) {
                    const enriched = enrichProductWithCategoryMapping({ categoryUrl: productCategoryUrl }, CATEGORY_MAPPINGS);
                    if (enriched.categoryMappingFound) {
                        categoryMapping = enriched;
                    }
                }

                return transformInstamartProduct(
                    product,
                    productCategoryUrl,
                    officialCategory,
                    'N/A',
                    pincode,
                    index + 1,
                    categoryMapping
                );
            });

            // 2. Deduplicate AFTER transform (suffix is now part of the unique key)
            const seenIds = new Set();
            productsToReturn = transformedAll.filter(p => {
                const key = p.productId || p.productName;
                if (!key || seenIds.has(key)) return false;
                seenIds.add(key);
                return true;
            });

            // 3. Re-assign rankings after dedup
            productsToReturn.forEach((p, i) => { p.ranking = i + 1; });

            console.log(`[API] Raw: ${allResults.length}, After transform+dedup: ${productsToReturn.length} unique products`);
        } else {
            console.warn('⚠️ Standardization modules not loaded, returning raw data');
            productsToReturn = allResults;
        }

        const responsePayload = {
            status: 'success',
            pincode,
            totalProducts: productsToReturn.length,
            products: productsToReturn,
            meta: {
                total_urls: targetUrls.length,
                scrapedAt: new Date().toISOString()
            }
        };

        // === STORAGE LOGIC (NEW) ===
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

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
server.setTimeout(0);
