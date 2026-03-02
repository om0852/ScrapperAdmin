
import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

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

// --- API Data Processing Functions ---

/**
 * Extract product from Jiomart API response item
 */
function extractProductFromJiomartApi(item) {
    try {
        const id = item.id || item.sku || '';
        const name = item.name || item.title || '';
        if (!name) return null;

        const currentPrice = parseFloat(item.price || item.offer_price || 0);
        const originalPrice = parseFloat(item.mrp || item.original_price || currentPrice);

        let discount = '';
        if (originalPrice > currentPrice) {
            discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100) + '%';
        }

        const image = item.image_url || item.image || item.thumbnail || '';
        const packSize = item.pack_size || item.unit || item.size || '';
        const isOutOfStock = item.in_stock === false || item.stock_status === 'out_of_stock';
        const rating = item.rating || item.avg_rating || null;
        const isSponsored = item.is_sponsored || item.ad || false;

        // Generate URL from slug or id
        let url = '';
        if (item.slug) {
            url = `https://www.jiomart.com/p/${item.slug}`;
        } else if (id) {
            url = `https://www.jiomart.com/p/product/${id}`;
        }

        return {
            id,
            name,
            currentPrice,
            originalPrice,
            discount,
            image,
            packSize,
            isOutOfStock,
            rating,
            isSponsored,
            url
        };
    } catch (e) {
        return null;
    }
}

/**
 * Process all captured API responses
 */
function processJiomartApiData(apiResponses, logPrefix) {
    const productsMap = new Map();
    let totalProcessed = 0;

    apiResponses.forEach((response, idx) => {
        try {
            // Jiomart API structure: response.data.products or response.products
            const products = response.data?.products || response.products || [];

            if (Array.isArray(products)) {
                products.forEach(item => {
                    const product = extractProductFromJiomartApi(item);
                    if (product && product.id && product.name) {
                        if (!productsMap.has(product.id)) {
                            product.rank = totalProcessed + 1;
                            productsMap.set(product.id, product);
                            totalProcessed++;
                        }
                    }
                });
            }
        } catch (e) {
            console.log(`⚠️ Error processing API response ${idx}: ${e.message}`);
        }
    });

    console.log(`✅ Extracted ${totalProcessed} products from ${apiResponses.length} API responses`);
    return Array.from(productsMap.values());
}


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

        // Extract delivery time from homepage
        let deliveryTime = '';
        try {
            const deliveryEl = await page.locator('.delivery-time, .sla-text, div[class*="delivery"]').first();
            if (await deliveryEl.isVisible({ timeout: 3000 })) {
                deliveryTime = await deliveryEl.textContent();
                deliveryTime = deliveryTime.trim();
                console.log(`✅ Delivery time extracted: ${deliveryTime}`);
            }
        } catch (e) {
            console.log(`⚠️ Could not extract delivery time: ${e.message}`);
        }

        await context.storageState({ path: statePath });

        map[pincode] = stateFileName;
        await fs.writeFile(STORAGE_MAP_FILE, JSON.stringify(map, null, 2));

        console.log(`✅ Session created and saved for ${pincode}`);
        return { statePath, deliveryTime };

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
async function scrapeCategory(browser, category, contextOptions, deliveryTime = '', maxRetries = 2) {
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

            // API Interception Setup
            const capturedApiData = [];
            const apiDumpsDir = path.join(__dirname, 'api_dumps');

            // Create api_dumps directory
            try {
                await fs.mkdir(apiDumpsDir, { recursive: true });
            } catch (e) { }

            // Intercept API responses
            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('/trex/search')) {
                    try {
                        const json = await response.json();
                        capturedApiData.push(json);

                        // Save individual API dump
                        const timestamp = Date.now();
                        const apiIndex = capturedApiData.length;
                        const filename = `api_${category.name.replace(/[^a-z0-9]/gi, '_')}_${apiIndex}_${timestamp}.json`;
                        const filepath = path.join(apiDumpsDir, filename);

                        await fs.writeFile(filepath, JSON.stringify({
                            url: url,
                            timestamp: new Date().toISOString(),
                            responseIndex: apiIndex,
                            data: json
                        }, null, 2));

                        console.log(`📡 [${category.name}] API #${apiIndex} captured & saved`);
                    } catch (e) {
                        console.log(`⚠️ Failed to parse API response: ${e.message}`);
                    }
                }
            });

            // Block heavy resources but allow API and necessary scripts
            await page.route('**/*', route => {
                const url = route.request().url();
                const resourceType = route.request().resourceType();

                // Allow API calls and document
                if (url.includes('/trex/search') || resourceType === 'document' || resourceType === 'fetch' || resourceType === 'xhr') {
                    return route.continue();
                }

                // Allow scripts (needed for page to work)
                if (resourceType === 'script') {
                    return route.continue();
                }

                // Block images, CSS, fonts, media for speed
                if (['font', 'media'].includes(resourceType)) {
                    return route.abort();
                }

                // Allow everything else
                return route.continue();
            });

            console.log(`🚀 [Attempt ${attempt}] processing: ${category.name}`);

            await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Wait for initial page load
            await delay(3000, 5000);

            // Wait for at least one API response (with timeout)
            const maxWaitTime = 30000; // 30 seconds max
            const startTime = Date.now();

            while (capturedApiData.length === 0 && (Date.now() - startTime) < maxWaitTime) {
                await delay(1000);
                console.log(`⏳ Waiting for API responses... (${Math.floor((Date.now() - startTime) / 1000)}s)`);
            }

            if (capturedApiData.length === 0) {
                console.warn(`⚠️ No API responses captured after ${maxWaitTime / 1000}s`);
            } else {
                console.log(`✅ Captured ${capturedApiData.length} API response(s), waiting for more...`);
                // Wait a bit more for additional paginated responses
                await delay(3000, 5000);
            }

            // Process API data (NO DOM SCRAPING)
            const products = processJiomartApiData(capturedApiData, category.name);

            // Add category and delivery time to each product
            products.forEach(p => {
                p.category = category.name;
                p.deliveryTime = deliveryTime || p.deliveryTime || '';
            });

            // Save consolidated API dump
            if (capturedApiData.length > 0) {
                const consolidatedFilename = `api_consolidated_${category.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
                const consolidatedPath = path.join(apiDumpsDir, consolidatedFilename);

                await fs.writeFile(consolidatedPath, JSON.stringify({
                    metadata: {
                        category: category.name,
                        url: category.url,
                        timestamp: new Date().toISOString()
                    },
                    apiData: {
                        totalResponses: capturedApiData.length,
                        responses: capturedApiData
                    },
                    products: products
                }, null, 2));

                console.log(`💾 [${category.name}] Saved consolidated dump with ${products.length} products`);
            }

            if (products.length === 0) {
                console.warn(`⚠️ Extracted 0 items for ${category.name} (Attempt ${attempt})`);
                if (attempt <= maxRetries) {
                    console.log(`🔄 Retrying...`);
                    throw new Error("Zero products extracted");
                }
            }

            console.log(`✅ Extracted ${products.length} items from ${category.name}`);
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
    const { pincode, categories, maxConcurrentTabs = 3, proxyUrl } = req.body;

    if (!pincode || !categories || !Array.isArray(categories)) {
        return res.status(400).json({ success: false, message: 'Invalid input. Required: pincode, categories array' });
    }

    console.log(`🚀 Starting batch job for Pincode: ${pincode}, Categories: ${categories.length}`);

    // Launch Browser ONE Instance
    // Headless: true with anti-detection args
    const browser = await chromium.launch({
        headless: false,
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
        // 1. Ensure Pincode Session and get delivery time
        const sessionData = await getStorageStateForPincode(browser, pincode, proxyUrl);
        const deliveryTime = sessionData.deliveryTime || '';
        const stateData = sessionData.statePath || sessionData;

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

        for (let i = 0; i < categories.length; i += maxConcurrentTabs) {
            const batch = categories.slice(i, i + maxConcurrentTabs);
            console.log(`📦 Processing batch ${Math.floor(i / maxConcurrentTabs) + 1}/${Math.ceil(categories.length / maxConcurrentTabs)}`);

            // Use independent contexts for each scrape, pass deliveryTime
            const batchPromises = batch.map(cat => scrapeCategory(browser, cat, contextOptions, deliveryTime));
            const batchResults = await Promise.all(batchPromises);

            batchResults.forEach(r => {
                if (r && r.success) {
                    allProducts.push(...r.products);
                }
                if (r) results.push(r);
            });

            // Jitter between batches
            if (i + maxConcurrentTabs < categories.length) {
                await delay(1000, 3000);
            }
        }

        res.json({
            success: true,
            metadata: {
                totalProducts: allProducts.length,
                categoriesProcessed: results.length,
                failedCategories: results.filter(r => !r.success).map(r => r.category)
            },
            data: allProducts
        });

        // Cleanup API dumps after sending response
        try {
            const apiDumpsDir = path.join(__dirname, 'api_dumps');
            const files = await fs.readdir(apiDumpsDir);
            for (const file of files) {
                await fs.unlink(path.join(apiDumpsDir, file));
            }
            console.log(`✅ Deleted ${files.length} API dump files`);
        } catch (e) {
            console.log(`⚠️ Failed to cleanup API dumps: ${e.message}`);
        }

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
