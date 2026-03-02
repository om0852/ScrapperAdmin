
import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { transformJiomartProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../enrich_categories.js';

// Load mappings once at startup
const CATEGORY_MAPPINGS = loadCategoryMappings('./categories_with_urls.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4099;
const STORAGE_MAP_FILE = path.join(__dirname, 'jiomart_storage_map.json');
const SESSION_FILE = path.join(__dirname, 'jiomart_sessions.json');
const SESSIONS_DIR = path.join(__dirname, 'sessions');

let PRELOADED_SESSIONS = {};

// Load preloaded sessions
(async () => {
    try {
        const data = await fs.readFile(SESSION_FILE, 'utf8');
        PRELOADED_SESSIONS = JSON.parse(data);
        console.log(`Loaded ${Object.keys(PRELOADED_SESSIONS).length} preloaded sessions.`);
    } catch (e) {
        console.log('No preloaded sessions file found or empty.');
    }
})();

// Ensure sessions directory exists
try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
} catch (e) {
    console.error('Failed to create sessions directory:', e);
}

// User Agents for rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

/**
 * Random delay between min and max milliseconds
 */
const delay = (min = 1000, max = 3000) => {
    const time = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, time));
};

/**
 * Helper to parse proxy URL into server, username, password
 */
const parseProxy = (proxyUrl) => {
    if (!proxyUrl) return undefined;
    try {
        const u = new URL(proxyUrl);
        if (u.username || u.password) {
            return {
                server: `${u.protocol}//${u.host}`,
                username: decodeURIComponent(u.username),
                password: decodeURIComponent(u.password)
            };
        }
        return { server: proxyUrl };
    } catch (e) {
        console.warn('⚠️ Invalid proxy URL format, using as-is');
        return { server: proxyUrl };
    }
};

/**
 * Helper to get or create storage state for a pincode
 */
async function getStorageStateForPincode(browser, pincode, proxyUrl) {
    if (PRELOADED_SESSIONS[pincode]) {
        console.log(`✅ Using preloaded session for ${pincode}`);
        return PRELOADED_SESSIONS[pincode];
    }

    let map = {};
    try {
        const data = await fs.readFile(STORAGE_MAP_FILE, 'utf8');
        map = JSON.parse(data);
    } catch (e) { }

    if (map[pincode]) {
        const statePath = path.join(SESSIONS_DIR, map[pincode]);
        try {
            await fs.access(statePath);
            console.log(`✅ Found existing session for pincode ${pincode}`);
            return statePath;
        } catch (e) {
            console.log(`⚠️ Map entry exists but file missing for ${pincode}, recreating...`);
        }
    }

    console.log(`🔄 Creating new session for pincode ${pincode}`);
    const context = await browser.newContext({
        userAgent: USER_AGENTS[0],
        viewport: { width: 1920, height: 1080 },
        proxy: parseProxy(proxyUrl),
    });

    const page = await context.newPage();
    const stateFileName = `jiomart_${pincode}_${Date.now()}.json`;
    const statePath = path.join(SESSIONS_DIR, stateFileName);

    try {
        await page.goto('https://www.jiomart.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(2000, 4000);

        try {
            const closeBtn = page.locator('#btn_location_close_icon, button.close-privacy').first();
            if (await closeBtn.isVisible({ timeout: 5000 })) {
                console.log('Detected Location Popup, closing it...');
                await closeBtn.click();
                await closeBtn.waitFor({ state: 'hidden', timeout: 3000 });
                await delay(500);
            }
        } catch (e) { }

        const locationBtn = page.locator('#btn_delivery_location, .delivery-location, .pin-code-text, img[src*="pin"], button[class*="delivery"]').first();
        if (await locationBtn.isVisible()) {
            await locationBtn.click();
            await delay(1000, 2000);
        } else {
            const headerLoc = page.getByText(/Deliver to/i).first();
            if (await headerLoc.isVisible()) {
                await headerLoc.click();
                await delay(1000, 2000);
            }
        }

        const input = page.locator('input[id="rel_pincode"], input[placeholder*="pincode"], input[type="tel"]').first();
        await input.waitFor({ state: 'visible', timeout: 10000 });

        await input.fill(pincode);
        await delay(500, 1000);

        const applyBtn = page.getByText('Apply').first();
        await applyBtn.click();

        await delay(3000, 5000);

        await context.storageState({ path: statePath });

        map[pincode] = stateFileName;
        await fs.writeFile(STORAGE_MAP_FILE, JSON.stringify(map, null, 2));

        console.log(`✅ Session created and saved for ${pincode}`);
        return statePath;

    } catch (error) {
        console.error(`❌ Failed to set pincode ${pincode}:`, error.message);
        throw error;
    } finally {
        await context.close();
    }
}

/**
 * Robust Auto-Scroll
 */
async function smartScroll(page, logPrefix) {
    let previousHeight = 0;
    let noChangeCount = 0;
    const maxScrolls = 30; // Limit scrolls

    for (let i = 0; i < maxScrolls; i++) {
        const currentHeight = await page.evaluate('document.body.scrollHeight');
        if (currentHeight === previousHeight) {
            noChangeCount++;
            if (noChangeCount >= 2) break; // Stop if no new content
        } else {
            noChangeCount = 0;
            previousHeight = currentHeight;
        }

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(1500, 2500); // Wait for load

        const showMore = page.getByText(/Show More/i).first();
        if (await showMore.isVisible()) {
            await showMore.click().catch(() => ({}));
            await delay(1000, 2000);
        }
    }
}

/**
 * Scrape a single category using an existing context with Retry Logic
 */
/**
 * Scrape a single category using an isolated context with Retry Logic
 */
async function scrapeCategory(browser, category, contextOptions, maxRetries = 2) {
    let attempt = 0;

    while (attempt <= maxRetries) {
        let context = null;
        let page = null;
        try {
            attempt++;

            // Create a NEW context for this attempt to isolate failures
            context = await browser.newContext({
                ...contextOptions,
                extraHTTPHeaders: {
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                }
            });

            // Apply Advanced Stealth Scripts
            await context.addInitScript(() => {
                // 1. Pass WebDriver check
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

                // 2. Mock Chrome Runtime
                window.chrome = { runtime: {} };

                // 3. Mock Plugins
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

                // 4. Mock Permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: 'denied' }) :
                        originalQuery(parameters)
                );
            });

            page = await context.newPage();

            // Block heavy resources
            await page.route('**/*.{png,jpg,jpeg,gif,svg,font,woff,woff2}', route => route.abort());

            console.log(`🚀 [Attempt ${attempt}] processing: ${category.name}`);

            await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Wait for network idle to ensure dynamic content load starts
            try {
                // Reduced timeout to 5s because Jiomart has persistent background network activity
                await page.waitForLoadState('networkidle', { timeout: 5000 });
            } catch (e) {
                console.log(`⚠️ Network idle timeout (5s) for ${category.name}, proceeding anyway...`);
            }

            // Explicitly wait for products to load
            try {
                await page.waitForSelector('li.ais-InfiniteHits-item, .plp-card-wrapper, .product-card', { state: 'attached', timeout: 45000 });
            } catch (e) {
                console.log(`⚠️ Timeout waiting for selectors on ${category.name}, might be empty or slow.`);
            }

            // Infinite Scroll
            await smartScroll(page, category.name);

            // Extract Data
            const products = await page.evaluate(() => {
                const items = [];
                const seenIds = new Set();
                // Selectors from user provided HTML
                const cards = document.querySelectorAll('li.ais-InfiniteHits-item, .plp-card-wrapper, .product-card');

                cards.forEach(card => {
                    try {
                        const gtmDiv = card.querySelector('.gtmEvents');

                        // Name
                        let name = gtmDiv?.getAttribute('data-name');
                        if (!name) {
                            const nameEl = card.querySelector('.plp-card-details-name, .product-title');
                            name = nameEl ? nameEl.innerText.trim() : 'Unknown';
                        }
                        if (name === 'Unknown') return;

                        // ID/Slug
                        const linkEl = card.querySelector('a');
                        const url = linkEl ? linkEl.href : '';
                        const slug = url.split('/').pop().split('?')[0] || '';
                        const id = gtmDiv?.getAttribute('data-id') || slug;

                        if (seenIds.has(id)) return;
                        seenIds.add(id);

                        // Price
                        let currentPrice = 0;
                        const priceAttr = gtmDiv?.getAttribute('data-price');
                        if (priceAttr) {
                            currentPrice = parseFloat(priceAttr);
                        } else {
                            const priceEl = card.querySelector('.plp-card-details-price .jm-heading-xxs, .final-price');
                            currentPrice = priceEl ? parseFloat(priceEl.innerText.replace(/[^0-9.]/g, '')) : 0;
                        }

                        // Original Price
                        const originalPriceEl = card.querySelector('.plp-card-details-price .line-through, .mrp-price');
                        let originalPrice = originalPriceEl ? parseFloat(originalPriceEl.innerText.replace(/[^0-9.]/g, '')) : currentPrice;

                        // Discount
                        const discountEl = card.querySelector('.plp-card-details-discount .jm-badge, .dis-percent');
                        const discount = discountEl ? discountEl.innerText.trim() : '0%';

                        // Image
                        const imgEl = card.querySelector('div.plp-card-image img, .product-image img');
                        const image = imgEl ? (imgEl.getAttribute('data-src') || imgEl.src) : '';

                        // Pack Size
                        let packSize = '';
                        const sizeMatch = name.match(/(\d+\s*(?:g|kg|ml|l|pc|pcs|pack))/i);
                        if (sizeMatch) {
                            packSize = sizeMatch[0];
                        }

                        // Stock Status
                        const addBtn = card.querySelector('button.addtocartbtn');
                        const outOfStockEl = card.querySelector('.out_of_stock, .btn-out-of-stock');
                        const isOutOfStock = !!outOfStockEl || !addBtn || addBtn.disabled;

                        // Rating
                        const ratingEl = card.querySelector('.rating-content, .badge-rating');
                        const rating = ratingEl ? ratingEl.innerText.trim() : null;

                        // Sponsored / Ad
                        const tags = Array.from(card.querySelectorAll('span')).map(s => s.innerText.toLowerCase());
                        const isSponsored = tags.some(t => t.includes('ad') || t.includes('sponsored'));

                        // Delivery Time
                        const deliveryEl = card.querySelector('.delivery-time, .sla-text');
                        const deliveryTime = deliveryEl ? deliveryEl.innerText.trim() : '';

                        items.push({
                            rank: items.length + 1,
                            name,
                            currentPrice,
                            originalPrice,
                            discount,
                            image,
                            packSize,
                            isOutOfStock,
                            id,
                            rating,
                            isSponsored,
                            deliveryTime,
                            url,
                            productUrl: url
                        });
                    } catch (e) { }
                });
                return items;
            });

            if (products.length === 0) {
                console.warn(`⚠️ Extracted 0 items for ${category.name} (Attempt ${attempt})`);
                if (attempt <= maxRetries) {
                    console.log(`🔄 Retrying...`);
                    // We don't need to explicitly close here because the finally block will handle it
                    // but we need to ensure we don't return success yet.
                    throw new Error("Zero products extracted");
                }
            }

            console.log(`✅ Extracted ${products.length} items from ${category.name}`);

            // Add categoryUrl to each product
            products.forEach(p => {
                p.categoryUrl = category.url;
            });

            return { category: category.name, success: true, products };

        } catch (error) {
            console.error(`❌ Error scraping ${category.name} (Attempt ${attempt}):`, error.message);

            if (attempt > maxRetries) {
                return { category: category.name, success: false, error: error.message, products: [] };
            }
            // If failed, wait before retrying
            await delay(2000);
        } finally {
            // CRITICALLY IMPORTANT: Always close the context for this attempt
            if (context) {
                try {
                    await context.close();
                } catch (e) {
                    console.error(`⚠️ Error closing context for ${category.name}:`, e.message);
                }
            }
        }
    }
}

// ==================== ENDPOINTS ====================

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/jiomartcategoryscrapper', async (req, res) => {
    const { pincode, categories = [], urls = [], maxConcurrentTabs = 3, proxyUrl, store } = req.body;

    // Normalize input: Support `urls` array
    let targetCategories = [...categories];
    if (urls && Array.isArray(urls) && urls.length > 0) {
        urls.forEach(u => {
            targetCategories.push({
                name: 'Unknown Category',
                url: u
            });
        });
    }

    if (!pincode || targetCategories.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid input. Required: pincode, and either categories array or urls array' });
    }

    console.log(`🚀 Starting batch job for Pincode: ${pincode}, Categories: ${targetCategories.length}`);

    // Launch Browser ONE Instance
    // Headless: true with anti-detection args
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certificate-errors',
            '--disable-extensions',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    });

    try {
        // 1. Ensure Pincode Session
        const stateData = await getStorageStateForPincode(browser, pincode, proxyUrl);

        // 2. Prepare Context Options (but don't create context yet)
        let contextOptions = {
            userAgent: USER_AGENTS[0],
            viewport: { width: 1366, height: 768 },
            proxy: parseProxy(proxyUrl)
        };

        if (stateData) {
            contextOptions.storageState = stateData;
        }

        // 3. Process Categories in Batches
        const allProducts = [];
        const results = [];

        for (let i = 0; i < targetCategories.length; i += maxConcurrentTabs) {
            const batch = targetCategories.slice(i, i + maxConcurrentTabs);
            console.log(`📦 Processing batch ${Math.floor(i / maxConcurrentTabs) + 1}/${Math.ceil(targetCategories.length / maxConcurrentTabs)}`);

            // Use independent contexts for each scrape
            const batchPromises = batch.map(cat => scrapeCategory(browser, cat, contextOptions));
            const batchResults = await Promise.all(batchPromises);

            const DATA_FILE = `jiomart_data_${pincode}.json`;

            // Append batch results to file immediately
            try {
                let existingData = { success: true, data: [] };
                try {
                    const fileContent = await fs.readFile(DATA_FILE, 'utf8');
                    existingData = JSON.parse(fileContent);
                } catch (e) {
                    // File doesn't exist or invalid, start fresh
                }

                if (!Array.isArray(existingData.data)) existingData.data = [];

                batchResults.forEach(r => {
                    if (r && r.success) {
                        allProducts.push(...r.products);
                        existingData.data.push(...r.products);
                    }
                    if (r) results.push(r);
                });

                await fs.writeFile(DATA_FILE, JSON.stringify(existingData, null, 2));
                console.log(`💾 Saved ${allProducts.length} total products so far to ${DATA_FILE}`);

            } catch (err) {
                console.error('⚠️ Failed to save partial data:', err);
                // Still update in-memory results if file save fails
                batchResults.forEach(r => {
                    if (r && r.success && !allProducts.includes(r.products[0])) { // Simple check, though ineffective if dupes
                        // verifying we don't double add to allProducts if file write block failed after push
                        // actually allProducts push happened above.
                    }
                });
            }

            // Jitter between batches
            if (i + maxConcurrentTabs < targetCategories.length) {
                await delay(1000, 3000);
            }
        }

        // === APPLY STANDARDIZED FORMAT ===

        // 1. Deduplicate
        const dedupedProducts = deduplicateRawProducts(allProducts);
        console.log(`✨ Deduplicated from ${allProducts.length} to ${dedupedProducts.length} unique products`);

        // 2. Transform and Enrich
        const transformedProducts = dedupedProducts.map((product, index) => {
            const productCategoryUrl = product.categoryUrl || 'N/A';
            const officialCategory = product.name ? 'Unknown' : 'N/A'; // Fallback if needed

            // Enrich
            let categoryMapping = null;
            if (productCategoryUrl !== 'N/A') {
                const enriched = enrichProductWithCategoryMapping({ categoryUrl: productCategoryUrl }, CATEGORY_MAPPINGS);
                if (enriched.categoryMappingFound) {
                    categoryMapping = enriched;
                }
            }

            return transformJiomartProduct(
                product,
                productCategoryUrl,
                officialCategory,
                'N/A', // subCategory
                pincode,
                index + 1, // Rank
                categoryMapping
            );
        });

        const responsePayload = {
            status: 'success',
            pincode,
            totalProducts: transformedProducts.length,
            products: transformedProducts,
            meta: {
                totalCategories: targetCategories.length,
                scrapedAt: new Date().toISOString()
            }
        };

        // === STORAGE LOGIC (NEW) ===
        if (store === true) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `scraped_data_${pincode}_${timestamp}.json`;
            const storageDir = path.join(__dirname, 'scraped_data');

            if (!await fs.stat(storageDir).catch(() => false)) {
                await fs.mkdir(storageDir);
            }

            const filepath = path.join(storageDir, filename);
            await fs.writeFile(filepath, JSON.stringify(responsePayload, null, 2));
            console.log(`[Storage] Saved response to ${filepath}`);
            responsePayload.meta.storedFile = filename;
        }

        res.json(responsePayload);

    } catch (error) {
        console.error('🔥 Critical server error:', error);
        // Only send error response if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message });
        }
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('⚠️ Error closing browser:', e.message);
            }
        }
        console.log('🏁 Batch job completed, browser closed');
    }
});

app.listen(PORT, () => {
    console.log(`🌍 Jiomart Scraper Server running on http://localhost:${PORT}`);
});
