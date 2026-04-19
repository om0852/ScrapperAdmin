import express from 'express';
import bodyParser from 'body-parser';
import { chromium, firefox, devices } from 'playwright';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    fs.mkdirSync(API_DUMPS_DIR, { recursive: true });
}

// === LOAD STANDARDIZATION MODULES (ESM) ===
let transformInstamartProduct, deduplicateRawProducts;
let categoryMapper;

(async () => {
    try {
        const transformModule = await import('./transform_response_format.js');
        transformInstamartProduct = transformModule.transformInstamartProduct;
        deduplicateRawProducts = transformModule.deduplicateRawProducts;

        // ✅ USE CORRECT categoryMapper WITH CASE-INSENSITIVE & URL ENCODING FIX
        const categoryMapperModule = await import('../utils/categoryMapper.js');
        categoryMapper = categoryMapperModule.default;

        console.log('✅ Loaded Standardization Modules & Category Mapper');
    } catch (e) {
        console.error('❌ Failed to load standardization modules:', e);
    }
})();

// Enhanced Function to save API dumps with metadata tracking
function saveApiDump(pincode, url, jsonData, dumpType = 'response') {
    try {
        // Create organized directory structure
        const pincodeDumpDir = path.join(API_DUMPS_DIR, `pincode_${pincode}`);
        fs.mkdirSync(pincodeDumpDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const urlHash = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
        const filename = `dump_${pincode}_${dumpType}_${urlHash}_${timestamp}.json`;
        const filepath = path.join(pincodeDumpDir, filename);

        // Convert to JSON string
        const jsonString = JSON.stringify(jsonData, null, 2);
        const byteSize = Buffer.byteLength(jsonString, 'utf8');

        // Save the dump
        fs.writeFileSync(filepath, jsonString);

        // Track metadata
        const metadataPath = path.join(API_DUMPS_DIR, 'api_dumps_metadata.json');
        let metadata = { dumps: [] };
        
        if (fs.existsSync(metadataPath)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
            } catch (e) {
                metadata = { dumps: [] };
            }
        }

        metadata.dumps.push({
            timestamp,
            pincode,
            dumpType,
            url,
            filename,
            filepath,
            byteSize,
            dataPoints: Array.isArray(jsonData) ? jsonData.length : 1
        });

        // Keep only last 500 metadata entries
        if (metadata.dumps.length > 500) {
            metadata.dumps = metadata.dumps.slice(-500);
        }

        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        const sizeMB = (byteSize / 1024 / 1024).toFixed(2);
        console.log(`✓ API dump saved: ${filename} (${sizeMB}MB, type: ${dumpType})`);
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
                isAd: !!item.adTrackingContext,
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

        // Enhanced API Interceptor - Capture All Instamart API Responses
        page.on('response', async response => {
            const resUrl = response.url();
            const resourceType = response.request().resourceType();
            const status = response.status();

            // Capture ALL api/instamart responses
            if (resUrl.includes('api/instamart/') && (resourceType === 'fetch' || resourceType === 'xhr')) {
                try {
                    // Only process 2xx responses
                    if (status >= 200 && status < 300) {
                        const json = await response.json().catch(() => null);
                        
                        if (json) {
                            // Determine API type based on URL pattern
                            let apiType = 'other_api';
                            if (resUrl.includes('category-listing/filter')) apiType = 'filter_api';
                            else if (resUrl.includes('category/list') || resUrl.includes('listing')) apiType = 'listing_api';
                            else if (resUrl.includes('item/v2')) apiType = 'item_api';
                            else if (resUrl.includes('search')) apiType = 'search_api';
                            else if (resUrl.includes('recommendation')) apiType = 'recommendation_api';

                            // Save the API dump
                            saveApiDump(pincode, url, json, apiType);

                            // Process and extract products
                            const parsed = processCapturedJson(json);
                            if (parsed && parsed.length > 0) {
                                parsed.forEach(p => {
                                    if (!capturedProducts.has(p.productId)) {
                                        capturedProducts.set(p.productId, p);
                                    }
                                });
                            }

                            console.log(`✓ Captured ${apiType} (${parsed?.length || 0} products)`);
                        }
                    }
                } catch (e) {
                    console.log(`[API Interception] Error processing ${resUrl}: ${e.message}`);
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
    const { url, urls, pincode, maxConcurrentTabs = 3, store } = req.body;

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
        const CONCURRENCY_LIMIT = Math.min(targetUrls.length, Number(maxConcurrentTabs) || 3, 3);
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
                let categoryMapping = null;

                // ✅ USE categoryMapper.extractCategoryFromUrl() - handles case-insensitive + URL encoding
                if (productCategoryUrl !== 'N/A' && categoryMapper) {
                    const extracted = categoryMapper.extractCategoryFromUrl(productCategoryUrl, 'Instamart');
                    
                    // Build categoryMapping object compatible with transform function
                    categoryMapping = {
                        categoryMappingFound: extracted.officialCategory !== 'Unknown',
                        masterCategory: extracted.masterCategory,
                        officialCategory: extracted.officialCategory,
                        officialSubCategory: extracted.officialSubCategory,
                        fullUrl: productCategoryUrl
                    };
                }

                const transformedProduct = transformInstamartProduct(
                    product,
                    productCategoryUrl,
                    categoryMapping?.officialCategory || 'N/A',
                    'N/A',
                    pincode,
                    index + 1,
                    categoryMapping
                );

                return {
                    transformedProduct,
                    dedupeKey: product.productId
                        ? `${product.productId}||${transformedProduct.officialSubCategory || 'N/A'}||${productCategoryUrl}`
                        : `__keep__${index}`
                };
            });

            // 2. Deduplicate only when raw productId + officialSubCategory + categoryUrl are the same
            const seenIds = new Set();
            productsToReturn = transformedAll.filter(p => {
                if (seenIds.has(p.dedupeKey)) return false;
                seenIds.add(p.dedupeKey);
                return true;
            }).map(entry => entry.transformedProduct);

            // 3. Re-assign rankings per officialSubCategory
            const subCatRankCounters = new Map();
            productsToReturn.forEach(p => {
                const subCat = p.officialSubCategory || '__unknown__';
                const nextRank = (subCatRankCounters.get(subCat) || 0) + 1;
                subCatRankCounters.set(subCat, nextRank);
                p.ranking = nextRank;
            });

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

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'Instamart' });
});

app.get('/status', (req, res) => {
    res.json({
        status: 'ready',
        uptime: process.uptime()
    });
});

// 🔹 NEW ENDPOINTS FOR API DUMP MANAGEMENT

// Get metadata about all API dumps
app.get('/api/dumps/metadata', (req, res) => {
    try {
        const metadataPath = path.join(API_DUMPS_DIR, 'api_dumps_metadata.json');
        if (!fs.existsSync(metadataPath)) {
            return res.json({ dumps: [], total: 0, message: 'No dumps found yet' });
        }
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        res.json({
            total: metadata.dumps.length,
            dumps: metadata.dumps.slice(-50) // Return last 50
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// List all API dumps for a specific pincode
app.get('/api/dumps/:pincode', (req, res) => {
    try {
        const { pincode } = req.params;
        const pincodeDir = path.join(API_DUMPS_DIR, `pincode_${pincode}`);
        
        if (!fs.existsSync(pincodeDir)) {
            return res.json({ pincode, dumps: [], total: 0 });
        }

        const files = fs.readdirSync(pincodeDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const fullPath = path.join(pincodeDir, f);
                const stats = fs.statSync(fullPath);
                return {
                    filename: f,
                    size: stats.size,
                    sizeKB: (stats.size / 1024).toFixed(2),
                    modified: stats.mtime
                };
            })
            .sort((a, b) => b.modified - a.modified);

        res.json({
            pincode,
            total: files.length,
            dumps: files
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get a specific API dump
app.get('/api/dumps/:pincode/:filename', (req, res) => {
    try {
        const { pincode, filename } = req.params;
        const filepath = path.join(API_DUMPS_DIR, `pincode_${pincode}`, filename);
        
        // Security check: prevent path traversal
        if (!filepath.startsWith(API_DUMPS_DIR)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'Dump not found' });
        }

        const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Consolidate all dumps for a pincode into a single master file
app.post('/api/dumps/:pincode/consolidate', (req, res) => {
    try {
        const { pincode } = req.params;
        const pincodeDir = path.join(API_DUMPS_DIR, `pincode_${pincode}`);

        if (!fs.existsSync(pincodeDir)) {
            return res.status(404).json({ error: 'No dumps found for this pincode' });
        }

        const files = fs.readdirSync(pincodeDir)
            .filter(f => f.endsWith('.json') && f.startsWith('dump_'));

        const consolidatedData = {
            pincode,
            consolidatedAt: new Date().toISOString(),
            totalDumps: files.length,
            dumps: []
        };

        files.forEach(filename => {
            try {
                const filepath = path.join(pincodeDir, filename);
                const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
                consolidatedData.dumps.push({
                    source: filename,
                    data: data,
                    timestamp: fs.statSync(filepath).mtime
                });
            } catch (e) {
                console.error(`Failed to read ${filename}:`, e.message);
            }
        });

        // Save consolidated file
        const consolidatedFilename = `consolidated_${pincode}_${Date.now()}.json`;
        const consolidatedPath = path.join(API_DUMPS_DIR, consolidatedFilename);
        fs.writeFileSync(consolidatedPath, JSON.stringify(consolidatedData, null, 2));

        res.json({
            success: true,
            message: `Consolidated ${files.length} dumps`,
            filename: consolidatedFilename,
            size: fs.statSync(consolidatedPath).size
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get summary statistics about API dumps
app.get('/api/dumps/stats/summary', (req, res) => {
    try {
        const metadataPath = path.join(API_DUMPS_DIR, 'api_dumps_metadata.json');
        const metadata = fs.existsSync(metadataPath) 
            ? JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
            : { dumps: [] };

        const stats = {
            totalDumps: metadata.dumps.length,
            totalBytes: metadata.dumps.reduce((sum, d) => sum + (d.byteSize || 0), 0),
            totalMB: (metadata.dumps.reduce((sum, d) => sum + (d.byteSize || 0), 0) / 1024 / 1024).toFixed(2),
            byType: {},
            byPincode: {},
            oldestDump: metadata.dumps[0]?.timestamp,
            newestDump: metadata.dumps[metadata.dumps.length - 1]?.timestamp
        };

        metadata.dumps.forEach(dump => {
            stats.byType[dump.dumpType] = (stats.byType[dump.dumpType] || 0) + 1;
            stats.byPincode[dump.pincode] = (stats.byPincode[dump.pincode] || 0) + 1;
        });

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 END API DUMP ENDPOINTS

const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
server.setTimeout(0);
