import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { transformZeptoProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../enrich_categories.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load mappings once at startup
const CATEGORY_MAPPINGS = loadCategoryMappings(path.join(__dirname, '..', 'categories_with_urls.json'));

// Load storage states if available
let STORAGE_MAP = {};
try {
    const storageData = fs.readFileSync('pincodes_storage_map.json', 'utf8');
    STORAGE_MAP = JSON.parse(storageData);
    console.log(`✅ Loaded storage states for pincodes: ${Object.keys(STORAGE_MAP).join(', ')}`);
} catch (e) {
    console.warn('⚠️ Could not load pincodes_storage_map.json. Storage optimization will be disabled.');
}

const app = express();
const PORT = process.env.PORT || 4089;

// Middleware
app.use(express.json());

// ==================== HELPER FUNCTIONS ====================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SELECTORS = {
    locationButton: [
        '[data-testid="user-address"]',
        'button:has([data-testid="user-address"])',
        'button[aria-label="Select Location"]',
        'button.__4y7HY',
        'div.a0Ppr button'
    ],
    locationModal: 'div[data-testid="address-modal"]',
    searchInput: 'div[data-testid="address-search-input"] input[type="text"]',
    searchResultItem: 'div[data-testid="address-search-item"]',
    productLink: 'a.B4vNQ',
    productCard: 'div.cTH4Df',
    productName: [
        'div[data-slot-id="ProductName"] span',
        'div.cQAjo6.ch5GgP span',
        'h3',
        'h2'
    ],
    productImage: 'img',
    priceSpan: '[data-slot-id="EdlpPrice"] span, span',
    packSize: '[data-slot-id="PackSize"] span',
    rating: '[data-slot-id="RatingInformation"]',
    sponsorTag: '[data-slot-id="SponsorTag"]',
    eta: '[data-slot-id="EtaInformation"]',
    searchResultsContainer: 'div.grid',
};

async function setPincode(page, targetPincode) {
    try {
        console.log(`🎯 Setting location to pincode: ${targetPincode}`);

        await page.waitForLoadState('domcontentloaded');
        await delay(500);

        // Click location button
        let clicked = false;
        for (const selector of SELECTORS.locationButton) {
            try {
                const button = page.locator(selector).first();
                if (await button.count() > 0) {
                    await button.click({ timeout: 3000 });
                    console.log(`✓ Clicked location button: ${selector}`);
                    clicked = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!clicked) {
            console.error('❌ Could not find location button');
            return false;
        }
        await delay(1000); // Wait for modal to open

        // Wait for modal detection (increased timeout for slow connections)
        try {
            await page.waitForSelector(SELECTORS.locationModal, { timeout: 10000 });
            console.log('✓ Location modal opened');
        } catch (e) {
            console.error('❌ Location modal did not appear (timeout)');
            return false;
        }

        // Wait for modal animation/content to stabilize
        await delay(1500);

        // Type pincode - ensure input is focused and clear
        const searchInput = page.locator(SELECTORS.searchInput).first();
        if (await searchInput.count() === 0) {
            console.error('❌ Search input not found');
            return false;
        }

        // Click on input to ensure it's active
        await searchInput.click();
        await delay(300);

        // Clear any existing value
        await searchInput.fill(''); // Use fill instead of keyboard to clear
        await delay(200);

        // Type the pincode
        await searchInput.fill(targetPincode); // Use fill for reliability
        console.log(`✓ Typed pincode: ${targetPincode}`);
        await delay(800); // Wait for search results to appear

        // Wait for search results
        try {
            await page.waitForSelector(SELECTORS.searchResultItem, { timeout: 8000 });
            console.log('✓ Address results appeared');
        } catch (e) {
            console.error('❌ No address results appeared');
            return false;
        }

        await delay(500); // Extra wait for all results to render

        // Click address - use second result if available (more specific), otherwise first
        // The clickable element is the inner div.cgG1vl
        const addressResults = page.locator(SELECTORS.searchResultItem);
        const count = await addressResults.count();
        console.log(`✓ Found ${count} address results`);

        if (count > 0) {
            // Always use first result as requested
            const targetIndex = 0;
            const targetAddress = addressResults.nth(targetIndex);

            // Click the inner clickable div
            const clickableDiv = targetAddress.locator('div.cgG1vl').first();

            console.log(`📍 Attempting to select address #${targetIndex + 1}`);

            // Try multiple click methods
            let clicked = false;

            // Method 1: Click inner div
            try {
                await clickableDiv.click({ timeout: 3000 });
                console.log('✓ Clicked address (inner div)');
                clicked = true;
            } catch (e) {
                console.log('⚠️ Inner div click failed, trying outer container');

                // Method 2: Click outer container
                try {
                    await targetAddress.click({ force: true, timeout: 3000 });
                    console.log('✓ Clicked address (outer container)');
                    clicked = true;
                } catch (e2) {
                    console.log('⚠️ Container click failed, trying JS click');

                    // Method 3: JavaScript click on second item
                    await page.evaluate((index) => {
                        const items = document.querySelectorAll('div[data-testid="address-search-item"]');
                        if (items[index]) {
                            const clickable = items[index].querySelector('div.cgG1vl');
                            if (clickable) {
                                clickable.click();
                            } else {
                                items[index].click();
                            }
                        }
                    }, targetIndex);
                    console.log('✓ Clicked address (JS)');
                    clicked = true;
                }
            }

            if (!clicked) {
                console.error('❌ All click methods failed');
                return false;
            }

            // Wait for modal to process and close
            await delay(1500);

            // Check if "Confirm Location" button appeared (sometimes Zepto asks for confirmation)
            const confirmBtn = page.locator('button:has-text("Confirm Location"), button:has-text("Confirm & Proceed")').first();
            if (await confirmBtn.isVisible()) {
                console.log('ℹ️ Confirm Location button appeared, clicking it...');
                await confirmBtn.click();
                await delay(2000);
            }

            // Check if modal closed
            const modalStillOpen = await page.locator(SELECTORS.locationModal).count();
            if (modalStillOpen === 0) {
                console.log('✅ Location set successfully - modal closed');
                return true;
            } else {
                console.error('❌ Modal still open after clicking address');

                // Try to close modal with Escape key
                console.log('⚠️ Attempting to close modal with Escape...');
                await page.keyboard.press('Escape');
                await delay(1000);

                // Verify if address is set by checking text length/content
                // If text is different from "Select Location" or has significant length, it's likely set
                const addressEl = page.locator('[data-testid="user-address"]');
                const addressText = await addressEl.textContent().catch(() => '');

                console.log(`ℹ️ Current address text: "${addressText}"`);

                if (addressText && addressText.length > 5 && !addressText.toLowerCase().includes('select')) {
                    console.log('✅ Address text appears valid, treating as success');
                    return true;
                }

                // Final check: if modal is now closed, assume success
                if (await page.locator(SELECTORS.locationModal).count() === 0) {
                    console.log('✅ Modal closed after Escape, assuming success');
                    return true;
                }

                return false;
            }
        } else {
            console.error('❌ No address results found to click');
            return false;
        }


    } catch (error) {
        console.error(`❌ Error setting pincode: ${error.message}`);
        return false;
    }
}

/**
 * Retry setPincode up to 3 times with delays between attempts
 */
async function setPincodeWithRetry(page, targetPincode, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`\n🔄 Pincode setting attempt ${attempt}/${maxRetries}`);

        const success = await setPincode(page, targetPincode);

        if (success) {
            console.log(`✅ Pincode set successfully on attempt ${attempt}`);
            return true;
        }

        if (attempt < maxRetries) {
            const waitTime = 2000 * attempt; // Increasing wait: 2s, 4s
            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
            await delay(waitTime);

            // Reload page before retry
            console.log('🔄 Reloading page for retry...');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await delay(2000);
        }
    }

    console.error(`❌ Failed to set pincode after ${maxRetries} attempts`);
    return false;
}


async function autoScroll(page, maxScrolls = null) {
    try {
        const isInfiniteScroll = maxScrolls === null;
        let previousHeight = await page.evaluate('document.body.scrollHeight');
        let noChangeCount = 0;
        let scrollIteration = 0;

        while (true) {
            scrollIteration++;
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await delay(150);

            const newHeight = await page.evaluate('document.body.scrollHeight');

            if (newHeight === previousHeight) {
                noChangeCount++;
                if (noChangeCount === 1) {
                    await page.evaluate(() => window.scrollBy(0, -500));
                    await delay(100);
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await delay(300);
                }
                if (noChangeCount >= 3) break;
            } else {
                noChangeCount = 0;
                previousHeight = newHeight;
            }

            if (!isInfiniteScroll && scrollIteration >= maxScrolls) break;
        }

        await page.evaluate(() => window.scrollTo(0, 0));
        await delay(500);
    } catch (error) {
        console.warn(`Auto-scroll failed: ${error.message}`);
    }
}

async function waitForSearchResults(page) {
    try {
        await page.waitForSelector(SELECTORS.productLink, { timeout: 20000 });
        const count = await page.locator(SELECTORS.productLink).count();
        if (count > 0) {
            await delay(500);
            return true;
        }
    } catch (e) {
        return false;
    }
    return false;
}

async function extractProducts(page) {
    return await page.evaluate((selectors) => {
        const productCards = [];
        const productLinks = document.querySelectorAll(selectors.productLink);

        function textOrNull(el) {
            return el ? (el.textContent || '').trim() : null;
        }

        productLinks.forEach((link, index) => {
            try {
                const productUrl = link.href;
                const urlMatch = productUrl.match(/\/pn\/([^/]+)\/pvid\/([^/]+)/) ||
                    productUrl.match(/\/(?:p|product)\/([^/]+)\/([^/]+)/);
                const productSlug = urlMatch?.[1] || null;
                const productId = urlMatch?.[2] || `zepto-${index}`;

                const card = link.querySelector(selectors.productCard) || link;

                let productName = null;
                for (const sel of selectors.productName) {
                    const el = card.querySelector(sel);
                    if (el && textOrNull(el)) {
                        productName = textOrNull(el);
                        break;
                    }
                }
                if (!productName) {
                    productName = link.getAttribute('title') || link.querySelector('img')?.alt || null;
                }

                const imgEl = card.querySelector(selectors.productImage) || link.querySelector('img');
                const productImage = imgEl?.src || imgEl?.getAttribute('data-src') || null;

                let currentPrice = null;
                const spans = Array.from(card.querySelectorAll(selectors.priceSpan));
                for (const s of spans) {
                    const match = (s.textContent || '').match(/₹\s*(\d+(?:,\d+)*(?:\.\d+)?)/);
                    if (match) {
                        currentPrice = parseFloat(match[1].replace(/,/g, ''));
                        break;
                    }
                }

                let originalPrice = null;
                const origSpan = spans.find(s =>
                    /(MRP|strike|original|cx3iWL)/i.test(s.className || '')
                );
                if (origSpan) {
                    const match = (origSpan.textContent || '').match(/₹\s*(\d+(?:,\d+)*(?:\.\d+)?)/);
                    if (match) originalPrice = parseFloat(match[1].replace(/,/g, ''));
                }

                let discountPercentage = null;
                if (currentPrice && originalPrice && originalPrice > currentPrice) {
                    discountPercentage = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
                }

                const packSizeEl = card.querySelector(selectors.packSize);
                const quantity = packSizeEl ? textOrNull(packSizeEl) : null;

                let rating = null;
                const ratingEl = card.querySelector(selectors.rating);
                if (ratingEl) {
                    const match = (ratingEl.textContent || '').match(/(\d+(\.\d+)?)/);
                    if (match) rating = parseFloat(match[1]);
                }

                const isAd = !!card.querySelector(selectors.sponsorTag);

                const etaEl = card.querySelector(selectors.eta);
                const deliveryTime = etaEl ? textOrNull(etaEl) : null;

                const dataOutOfStock = card.getAttribute?.('data-is-out-of-stock') === 'true';
                const hasSoldOutTag = !!card.querySelector('[data-slot-id="SystemTag"]');
                const hasNotifyButton = !!card.querySelector('button.cFrKpy');
                const isOutOfStock = dataOutOfStock || hasSoldOutTag || hasNotifyButton;

                if (productName || currentPrice || productImage) {
                    productCards.push({
                        productId,
                        productSlug,
                        productName,
                        productImage,
                        currentPrice,
                        originalPrice,
                        discountPercentage,
                        quantity,
                        rating,
                        isAd,
                        deliveryTime,
                        isOutOfStock,
                        productUrl,
                        scrapedAt: new Date().toISOString()
                    });
                }
            } catch (err) {
                // Ignore errors for individual products
            }
        });

        return { products: productCards };
    }, SELECTORS);
}

async function scrapeCategory(context, category, config) {
    const page = await context.newPage();

    try {
        // Add random delay to prevent burst requests (100ms to 300ms)
        const jitter = Math.floor(Math.random() * 200) + 100;
        await delay(jitter);

        console.log(`🔍 Opening category: ${category.name} (delayed ${jitter}ms)`);

        try {
            const response = await page.goto(category.url, {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });

            if (response && !response.ok()) {
                console.warn(`⚠️ Warning: ${category.name} returned status ${response.status()}`);
            }
        } catch (navError) {
            console.error(`❌ Navigation error for ${category.name}: ${navError.message}`);
            throw navError; // Re-throw to be caught by outer catch and retry logic
        }

        await delay(100);

        try {
            const closeBtn = page.locator('button[aria-label*="Close"]').first();
            if (await closeBtn.count() > 0) {
                await closeBtn.click({ timeout: 1500 });
            }
        } catch (e) { }

        const resultsFound = await waitForSearchResults(page);
        if (!resultsFound) {
            console.warn(`⚠️ No results for: ${category.name}`);
            return [];
        }

        await autoScroll(page, config.scrollCount);
        const { products } = await extractProducts(page);

        const enrichedProducts = products
            .slice(0, config.maxProductsPerSearch)
            .map((p, index) => ({
                ...p,
                rank: index + 1,
                categoryName: category.name,
                categoryUrl: category.url,
                platform: 'Zepto',
                pincode: config.pincode
            }));

        console.log(`✅ Scraped ${enrichedProducts.length} products from: ${category.name}`);
        return enrichedProducts;

    } catch (error) {
        console.error(`❌ Error scraping ${category.name}: ${error.message}`);
        return [];
    } finally {
        await page.close();
    }
}

/**
 * Retry scrapeCategory up to 2 times
 */
async function scrapeCategoryWithRetry(context, category, config, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const results = await scrapeCategory(context, category, config);

        if (results && results.length > 0) {
            if (attempt > 1) console.log(`✅ Category '${category.name}' scraped successfully on attempt ${attempt}`);
            return results;
        }

        if (attempt <= maxRetries) {
            console.warn(`⚠️ Attempt ${attempt} failed for '${category.name}'. Retrying...`);
            await delay(2000);
        } else {
            console.error(`❌ Failed to scrape '${category.name}' after ${maxRetries + 1} attempts`);
        }
    }
    return [];
}

// ==================== API ENDPOINT ====================

app.post('/zeptocategoryscrapper', async (req, res) => {
    const startTime = Date.now();

    try {
        const {
            pincode = '411001',
            categories = [],
            urls = [], // Support simple URLs array
            scrollCount = null,
            maxProductsPerSearch = 100,
            maxConcurrentTabs = 3,
            headless = true,
            navigationTimeout = 60000,
            proxyUrl = null,  // Optional Apify proxy URL
            store = false
        } = req.body;

        // Normalize input: Support `urls` array by converting to categories objects
        let targetCategories = [...categories];
        if (urls && Array.isArray(urls) && urls.length > 0) {
            urls.forEach(u => {
                targetCategories.push({
                    name: 'Unknown Category', // Will be populated or generic
                    url: u
                });
            });
        }

        if (targetCategories.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No categories or urls provided',
                message: 'Please provide `urls` array or `categories` array with {name, url} objects'
            });
        }

        console.log(`\n🚀 Starting scraping for ${targetCategories.length} categories`);
        console.log(`📍 Pincode: ${pincode}`);
        console.log(`🔢 Batch size: ${maxConcurrentTabs}`);
        if (proxyUrl) {
            console.log(`🔒 Using proxy: ${proxyUrl.split('@')[1] || 'configured'}`);
        }

        // Launch browser with optional proxy
        const launchOptions = {
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
            ],
        };

        // Add proxy if provided
        if (proxyUrl) {
            try {
                const parsedProxy = new URL(proxyUrl);
                launchOptions.proxy = {
                    server: `${parsedProxy.protocol}//${parsedProxy.host}`,
                    username: parsedProxy.username,
                    password: parsedProxy.password
                };
                console.log('🔒 Proxy authentication configured');
            } catch (e) {
                console.error('❌ Invalid proxy URL format');
            }
        }

        const browser = await chromium.launch(launchOptions);


        let storageState = undefined;
        let shouldUseStoredState = false;

        if (STORAGE_MAP[pincode]) {
            console.log(`⚡ Found stored state for pincode ${pincode}, skipping manual location set.`);
            storageState = STORAGE_MAP[pincode];
            shouldUseStoredState = true;
        } else {
            console.log(`ℹ️ No stored state for pincode ${pincode}, will set manually.`);
        }

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'en-US',
            timezoneId: 'Asia/Kolkata',
            storageState: storageState, // Inject storage state if available
            // Ensure httpCredentials are set if proxy is used (double safety)
            httpCredentials: proxyUrl ? {
                username: new URL(proxyUrl).username,
                password: new URL(proxyUrl).password,
            } : undefined
        });

        // Block unnecessary resources to speed up loading
        await context.route('**/*', (route) => {
            const request = route.request();
            const resourceType = request.resourceType();
            const blockedTypes = ['image', 'font', 'media', 'other'];

            if (blockedTypes.includes(resourceType)) {
                return route.abort();
            }
            return route.continue();
        });

        // Only run setPincode logic if we didn't use a stored state
        if (!shouldUseStoredState) {
            // Set pincode with retry logic (up to 3 attempts)
            const setupPage = await context.newPage();

            // If using standard flow, we might need to go to home page first
            await setupPage.goto('https://www.zepto.com/', {
                waitUntil: 'domcontentloaded',
                timeout: navigationTimeout
            });

            const pincodeSet = await setPincodeWithRetry(setupPage, pincode, 3);

            if (!pincodeSet) {
                await setupPage.close();
                await browser.close();
                return res.status(500).json({
                    success: false,
                    error: 'Failed to set pincode after 3 attempts',
                    message: 'Could not set delivery location. Please try again.'
                });
            }

            await setupPage.reload({ waitUntil: 'domcontentloaded' });
            await delay(2000);
            console.log('✅ Pincode set successfully (Manual)');
            await setupPage.close(); // Close setup page to free resources
        } else {
            // If using stored state, verify we are logged in/location set by checking a dummy page or just trusting it
            // For now, we trust the state is valid as per user requirement to "fast" scrape
            console.log('✅ Used stored storage state for session.');
        }

        // Scrape in batches
        const scrapingConfig = {
            pincode,
            scrollCount,
            maxProductsPerSearch,
            navigationTimeout
        };

        const allResults = [];
        const totalBatches = Math.ceil(targetCategories.length / maxConcurrentTabs);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIdx = batchIndex * maxConcurrentTabs;
            const endIdx = Math.min(startIdx + maxConcurrentTabs, targetCategories.length);
            const batch = targetCategories.slice(startIdx, endIdx);

            console.log(`\n🔄 Batch ${batchIndex + 1}/${totalBatches} (${batch.length} categories)`);

            const batchPromises = batch.map(category =>
                scrapeCategoryWithRetry(context, category, scrapingConfig, 2)
            );

            const batchResults = await Promise.all(batchPromises);
            allResults.push(...batchResults);

            console.log(`✅ Batch ${batchIndex + 1}/${totalBatches} completed`);

            if (batchIndex < totalBatches - 1) {
                console.log('⏳ Waiting before next batch to avoid rate limiting...');
                await delay(200);
            }
        }

        await browser.close();

        const allProducts = allResults.flat();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`\n✅ Scraping completed in ${duration}s`);
        console.log(`📦 Raw products: ${allProducts.length}`);

        // === APPLY STANDARDIZED FORMAT ===

        // 1. Transform and Enrich first (suffix gets added here)
        const transformedProducts = allProducts.map((product, index) => {
            const productCategoryUrl = product.categoryUrl || 'N/A';
            const officialCategory = product.categoryName || 'N/A';

            // Enrich with category mapping
            let categoryMapping = null;
            if (productCategoryUrl !== 'N/A') {
                const enriched = enrichProductWithCategoryMapping({ categoryUrl: productCategoryUrl }, CATEGORY_MAPPINGS);
                if (enriched.categoryMappingFound) {
                    categoryMapping = enriched;
                }
            }

            return transformZeptoProduct(
                product,
                productCategoryUrl,
                officialCategory,
                'N/A', // subCategory default
                pincode,
                index + 1, // Temp ranking (reassigned after dedup)
                categoryMapping
            );
        });

        // 2. Deduplicate AFTER transform (so suffix is part of the unique key)
        const seenIds = new Set();
        const dedupedProducts = transformedProducts.filter(p => {
            const key = p.productId || p.productName;
            if (!key || seenIds.has(key)) return false;
            seenIds.add(key);
            return true;
        });

        // 3. Re-assign rankings after dedup
        dedupedProducts.forEach((p, i) => { p.ranking = i + 1; });

        console.log(`📦 Raw products: ${allProducts.length}`);
        console.log(`✨ Deduplicated to ${dedupedProducts.length} unique products (with suffix-aware dedup)`);

        const responsePayload = {
            status: 'success',
            pincode,
            totalProducts: dedupedProducts.length,
            products: dedupedProducts,
            meta: {
                totalCategories: targetCategories.length,
                scrapedAt: new Date().toISOString(),
                durationSeconds: parseFloat(duration)
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
        console.error(`❌ Error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Zepto scraper API is running' });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`\n🎯 Zepto Scraper API running on http://localhost:${PORT}`);
    console.log(`📡 Endpoint: POST http://localhost:${PORT}/zeptocategoryscrapper`);
    console.log(`💚 Health check: GET http://localhost:${PORT}/health\n`);
});
server.setTimeout(0);
