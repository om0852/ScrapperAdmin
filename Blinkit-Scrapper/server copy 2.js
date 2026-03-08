import express from 'express';
import { chromium } from 'playwright';
import cors from 'cors';
import bodyParser from 'body-parser';
import UserAgent from 'user-agents';
import fs from 'fs';
import path from 'path';
import { transformBlinkitProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../enrich_categories.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load mappings once at startup
const CATEGORY_MAPPINGS = loadCategoryMappings('./categories_with_urls.json');

const app = express();
const PORT = process.env.PORT || 3088;

app.use(cors());
app.use(bodyParser.json());

// --- Constants ---
const API_DUMPS_DIR = path.join(process.cwd(), 'api_dumps');
const SESSIONS_DIR = 'sessions';
const FAILED_URLS_FILE = 'failed_urls.json';
const INPUT_SELECTORS = [
    'input[name="select-locality"]',
    'input.LocationSearchBox__InputSelect-sc-1k8u6a6-0',
    'input[placeholder*="search delivery location"]'
];
const LOCATION_BAR_SELECTORS = [
    'div[class*="LocationBar__Container"]',
    'div[class*="LocationBar"]',
    'div.LocationBar__Subtitle-sc-x8ezho-10'
];
const SESSION_BLOCKLIST = ['user', 'useragent', 'featureflags', 'topicslastreferencetime', 'secretsatnapersistedstate'];
const BLOCKED_RESOURCE_TYPES = ['font', 'media', 'image'];

// Memoized regex patterns for reduced CPU usage
const REGEX_PATTERNS = {
    slug: /[^a-z0-9]+/g,
    slugTrim: /^-+|-+$/g,
    numbers: /[^\d.]/g,
    sanitize: /[^a-z0-9]/gi,
    options: /(\d+)\s+options?/i
};

// --- Helper Functions ---

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const recordFailedUrl = (url) => {
    try {
        const failedPath = path.resolve(FAILED_URLS_FILE);
        let failed = [];
        try {
            const data = fs.readFileSync(failedPath, 'utf-8');
            failed = JSON.parse(data);
        } catch (e) {
            // ignore
        }
        if (!failed.includes(url)) {
            failed.push(url);
            fs.writeFileSync(failedPath, JSON.stringify(failed, null, 2));
        }
    } catch (e) {
        log('warn', 'FailedUrls', `Failed to record failed URL: ${e.message}`);
    }
};

const parseProxyUrl = (proxyUrl) => {
    if (!proxyUrl) return null;
    try {
        const u = new URL(proxyUrl);
        return {
            server: `${u.protocol}//${u.hostname}:${u.port}`,
            username: decodeURIComponent(u.username),
            password: decodeURIComponent(u.password)
        };
    } catch (e) {
        console.error('Invalid proxy URL:', e.message);
        return null;
    }
};

const getRandomUserAgent = () => {
    return new UserAgent({ deviceCategory: 'desktop' }).toString();
};

// --- Logging Helper ---
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m"
};

const log = (type, prefix, message) => {
    const timestamp = new Date().toLocaleTimeString();
    let icon = '';
    let color = colors.reset;

    switch (type) {
        case 'info': icon = 'ℹ️'; color = colors.cyan; break;
        case 'success': icon = '✅'; color = colors.green; break;
        case 'warn': icon = '⚠️'; color = colors.yellow; break;
        case 'error': icon = '❌'; color = colors.red; break;
        case 'debug': icon = '🐛'; color = colors.dim; break;
        case 'start': icon = '🚀'; color = colors.magenta; break;
    }

    // Format: [12:00:00] [Prefix] Icon Message
    console.log(`${colors.dim}[${timestamp}]${colors.reset} ${colors.bright}[${prefix}]${colors.reset} ${icon} ${color}${message}${colors.reset}`);
};

// --- API Data Processing Functions ---

function extractProductFromWidget(item) {
    try {
        // Blinkit API structure: product data is in atc_action.add_to_cart.cart_item
        const cartItem = item.atc_action?.add_to_cart?.cart_item;
        if (!cartItem) return null;

        const id = cartItem.product_id?.toString() || '';
        const name = cartItem.product_name || cartItem.display_name || '';
        const image = cartItem.image_url || item.image?.url || '';

        const price = cartItem.price || 0;
        const originalPrice = cartItem.mrp || price;

        let discount = '';
        if (originalPrice > price) {
            discount = Math.round(((originalPrice - price) / originalPrice) * 100) + '%';
        }

        const quantity = cartItem.unit || item.variant?.text || '';
        const isOutOfStock = item.inventory === 0 || cartItem.inventory === 0;
        const deliveryTime = item.eta_tag?.title?.text || '';
        const combo = item.cta?.button_data?.subtext || '1';
        const isAd = item.tracking?.common_attributes?.badge === 'AD';

        let url = '';
        if (id && name) {
            const slug = name.toLowerCase().replace(REGEX_PATTERNS.slug, '-').replace(REGEX_PATTERNS.slugTrim, '');
            url = `https://blinkit.com/prn/${slug}/prid/${id}`;
        }

        return {
            id,
            name,
            url,
            image,
            price: price.toString(),
            originalPrice: originalPrice.toString(),
            discount,
            quantity,
            deliveryTime,
            combo,
            isOutOfStock,
            isAd
        };
    } catch (e) {
        return null;
    }
}

function processApiData(apiResponses, logPrefix) {
    const productsMap = new Map();
    let totalProcessed = 0;

    apiResponses.forEach((response, idx) => {
        try {
            // Blinkit API structure: response.response.snippets is an array
            const snippets = response.response?.snippets || response.snippets || [];

            if (Array.isArray(snippets)) {
                snippets.forEach(snippet => {
                    // Each snippet has data object with product info
                    if (snippet.data) {
                        const product = extractProductFromWidget(snippet.data);
                        if (product && product.id && product.name) {
                            if (!productsMap.has(product.id)) {
                                product.rank = totalProcessed + 1;
                                productsMap.set(product.id, product);
                                totalProcessed++;
                            }
                        }
                    }
                });
            }
        } catch (e) {
            log('warn', logPrefix, `Error processing API response ${idx}: ${e.message}`);
        }
    });

    log('success', logPrefix, `Extracted ${totalProcessed} products from ${apiResponses.length} API responses`);
    return Array.from(productsMap.values());
}

// --- Core Scraping Logic ---

async function setupLocation(context, pincode, logPrefix = 'Setup') {
    const page = await context.newPage();
    try {
        await page.goto('https://blinkit.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // ** CHECK EXISTING LOCATION FIRST **
        try {
            const el = await page.waitForSelector('div[class*="LocationBar__Subtitle"]', { timeout: 5000 });
            const text = await el.textContent();

            if (text && text.includes(pincode)) {
                log('success', logPrefix, `Location already matches pincode ${pincode}. Skipping setup.`);
                await page.close();
                return true;
            }
        } catch (e) {
            log('info', logPrefix, `Verifying location...`);
        }

        // Retry loop for setting location
        for (let attempt = 1; attempt <= 3; attempt++) {
            log('info', logPrefix, `Attempt ${attempt}/3 to set location.`);
            try {
                // 1. Check if input is already visible (modal open by default)

                let input = null;
                let modalOpen = false;

                // Check visibility of input first
                for (const sel of INPUT_SELECTORS) {
                    if (await page.locator(sel).first().isVisible({ timeout: 2000 })) {
                        input = page.locator(sel).first();
                        modalOpen = true;
                        break;
                    }
                }

                // 2. If not open, click the Location Bar
                if (!modalOpen) {
                    for (const sel of LOCATION_BAR_SELECTORS) {
                        if (await page.locator(sel).first().isVisible()) {
                            await page.locator(sel).first().click();
                            await page.waitForTimeout(1000); // Wait for animation
                            break;
                        }
                    }

                    // Re-check input
                    for (const sel of INPUT_SELECTORS) {
                        if (await page.locator(sel).first().isVisible()) {
                            input = page.locator(sel).first();
                            break;
                        }
                    }
                }

                if (!input) {
                    throw new Error("Location input not found");
                }

                // 3. Fill Pincode
                await input.click();
                await page.waitForTimeout(300);
                await input.fill(pincode);

                // Wait for suggestions
                const suggestionSelector = 'div[class*="LocationSearchList__LocationListContainer"]';
                try {
                    await page.waitForSelector(suggestionSelector, { timeout: 5000 });
                } catch (e) {
                    log('warn', logPrefix, `Suggestions did not appear for ${pincode}`);
                }

                // 4. Select Suggestion
                const firstSuggestion = page.locator(suggestionSelector).first();
                if (await firstSuggestion.isVisible()) {
                    await firstSuggestion.click();
                } else {
                    log('warn', logPrefix, `No suggestions found, pressing Enter...`);
                    await page.keyboard.press('Enter');
                }

                // 5. Verification
                try {
                    await page.waitForFunction(() => {
                        const el = document.querySelector('div[class*="LocationBar__Subtitle"]');
                        const text = el ? el.textContent.trim().toLowerCase() : '';
                        return text.length > 5 && text !== 'select location' && !text.includes('detect');
                    }, null, { timeout: 10000 });
                } catch (e) {
                    log('warn', logPrefix, `Timed out waiting for location text update.`);
                }

                // Final check
                const locationTextEl = page.locator('div[class*="LocationBar__Subtitle"]').first();
                const locationText = await locationTextEl.textContent().catch(() => '');

                if (locationText && locationText.toLowerCase() !== 'select location' && locationText.length > 5) {
                    log('success', logPrefix, `Location verified: ${locationText}`);

                    // Extract delivery time from homepage
                    let deliveryTime = '';
                    try {
                        const deliveryEl = await page.locator('div[class*="DeliveryInfo"], div[class*="eta"], span[class*="delivery"]').first().textContent({ timeout: 3000 }).catch(() => '');
                        if (deliveryEl) {
                            deliveryTime = deliveryEl.trim();
                            log('success', logPrefix, `Delivery time: ${deliveryTime}`);
                        }
                    } catch (e) {
                        log('warn', logPrefix, `Could not extract delivery time: ${e.message}`);
                    }

                    await page.close(); // Close setup page
                    return deliveryTime || true;
                } else {
                    // Check if modal is stuck
                    if (await page.locator('input[name="select-locality"]').isVisible()) {
                        await page.mouse.click(100, 100);
                        await page.keyboard.press('Escape');
                    }
                    throw new Error(`Location not updated. Text: ${locationText}`);
                }

            } catch (e) {
                log('warn', logPrefix, `Location setup failed (Attempt ${attempt}): ${e.message}`);
                if (attempt === 3) throw e;
                await page.reload();
                await page.waitForTimeout(3000);
            }
        }
    } catch (e) {
        log('error', logPrefix, `Critical: Failed to set location. ${e.message}`);
        await page.close();
        return false;
    }
    return false;
}

// ** MODIFIED: Accepts 'context' directly **
async function scrapeCategory(context, category, pincode, proxyConfig, deliveryTime = '', maxRetries = 2) {
    const logPrefix = category.name || category.url.split('/').pop() || 'Unknown';

    // Stagger start time
    const randomDelay = Math.floor(Math.random() * 2000) + 500;
    await sleep(randomDelay);

    let products = [];
    let attempts = 0;

    while (attempts <= maxRetries) {
        const page = await context.newPage();
        let responseHandler = null;
        let routeHandler = null;
        
        try {
            log('start', logPrefix, `Starting scrape... (Attempt ${attempts + 1}/${maxRetries + 1})`);

            products = await Promise.race([
                (async () => {
                    // API Interception Setup - OPTIMIZED: Keep only summary, not full data
                    const capturedStats = { count: 0, timestamp: Date.now() };
                    const apiDumpsDir = API_DUMPS_DIR;

                    // Intercept API responses (stripped down for memory efficiency)
                    responseHandler = async (response) => {
                        const url = response.url();
                        if (url.includes('/v1/layout/listing_widgets')) {
                            try {
                                const json = await response.json();
                                capturedStats.count++;
                                // DON'T store full JSON in memory - process directly
                                const prods = processApiData([json], logPrefix);
                                if (prods.length > 0 && !capturedStats.firstProductTime) {
                                    capturedStats.firstProductTime = Date.now();
                                }
                            } catch (e) {
                                log('warn', logPrefix, `Failed to parse API response: ${e.message}`);
                            }
                        }
                    };
                    page.on('response', responseHandler);

                    // Block unnecessary resources for speed (reduced CPU from parsing)
                    routeHandler = (route) => {
                        const type = route.request().resourceType();
                        if (BLOCKED_RESOURCE_TYPES.includes(type)) {
                            return route.abort();
                        }
                        return route.continue();
                    };
                    await page.route('**/*', routeHandler);

                    await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

                    // Wait for page to load
                    await page.waitForTimeout(3000);

                    // Click First Product to trigger initial API call
                    try {
                        log('info', logPrefix, 'Clicking first product to trigger API...');
                        const firstProduct = page.locator('div[role="button"][id]').first();
                        if (await firstProduct.isVisible({ timeout: 5000 })) {
                            await firstProduct.click();
                            await page.waitForTimeout(2000);
                            await page.keyboard.press('Escape');
                            await page.waitForTimeout(1000);
                            log('success', logPrefix, 'First product clicked');
                        }
                    } catch (e) {
                        log('warn', logPrefix, `Click-first-product failed: ${e.message}`);
                    }

                    // Scroll to trigger paginated API calls
                    log('info', logPrefix, 'Scrolling to load all products via API...');
                    await autoScroll(page, logPrefix);

                    // Wait for final API calls
                    await page.waitForTimeout(3000);

                    // Capture final products via evaluation (not stored API data)
                    const finalProducts = await page.evaluate(() => {
                        return document.querySelectorAll('div[role="button"].tw-flex-col').length;
                    });

                    if (finalProducts === 0) {
                        log('warn', logPrefix, `No products found on page.`);
                        recordFailedUrl(category.url);
                        attempts = maxRetries + 1;
                        return [];
                    }

                    // Extract products only once at the end
                    const products = await extractProducts(page, logPrefix);
                    
                    // Add category and delivery time to each product
                    products.forEach(p => {
                        p.category = logPrefix;
                        p.categoryUrl = category.url;
                        p.deliveryTime = deliveryTime || p.deliveryTime;
                    });

                    log('success', logPrefix, `📦 Extracted ${products.length} products (Captured ${capturedStats.count} API responses)`);
                    return products;
                })(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Scraping operation timed out after 2 minutes')), 120000))
            ]);

            if (products.length > 0) {
                const missingImages = products.filter(p => !p.image).length;
                log('success', logPrefix, `Extracted ${products.length} products. (Missing imgs: ${missingImages})`);
                return products;
            } else {
                throw new Error("No products extracted");
            }

        } catch (e) {
            log('error', logPrefix, `Error scraping: ${e.message}`);
        } finally {
            // Clean up listeners to prevent memory leaks
            if (responseHandler) page.removeListener('response', responseHandler);
            if (routeHandler) await page.unroute('**/*', routeHandler);
            if (!page.isClosed()) await page.close();
        }

        attempts++;
        if (attempts <= maxRetries) {
            log('info', logPrefix, `Retrying in 2s...`);
            await sleep(2000);
        }
    }
    recordFailedUrl(category.url);
    log('error', logPrefix, `Failed to extract products after retries.`);
    return [];
}

async function forceImageLoad(page, logPrefix) {
    log('info', logPrefix, `Sweeping page for lazy images...`);
    await page.evaluate(async () => {
        const container = document.querySelector('#plpContainer') || document.body;
        const totalHeight = container.scrollHeight;
        const viewportHeight = window.innerHeight;
        // Scroll down in chunks
        for (let position = 0; position < totalHeight; position += viewportHeight) {
            window.scrollTo(0, position);
            // Also try scrolling container if it's the scrollable one
            if (container !== document.body) container.scrollTop = position;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        // Scroll back up quickly to be safe
        window.scrollTo(0, 0);
    });
    // Give a final moment for network requests
    await page.waitForTimeout(2000);
}

async function autoScroll(page, logPrefix) {
    log('info', logPrefix, `Auto-scrolling...`);
    const selector = '#plpContainer';

    let lastItemCount = 0;
    let noChangeCount = 0;
    const maxNoChange = 5; // ** REDUCED from 8 for faster completion **
    const maxIterations = 20; // ** NEW: Prevent infinite scrolling **
    let iterations = 0;

    while (noChangeCount < maxNoChange && iterations < maxIterations) {
        iterations++;
        const result = await page.evaluate(async (sel) => {
            const container = document.querySelector(sel);
            if (!container) return { status: 'no_container' };

            let parent = container.parentElement;
            while (parent) {
                if (parent.scrollTop > 0) parent.scrollTop = 0;
                parent = parent.parentElement;
            }
            window.scrollTo(0, 0);

            const prevTop = container.scrollTop;
            container.scrollTop = container.scrollHeight;

            return {
                status: 'scrolled',
                scrollHeight: container.scrollHeight,
                scrollTop: container.scrollTop,
                prevTop: prevTop,
                itemCount: document.querySelectorAll('div[role="button"].tw-flex-col').length
            };
        }, selector);

        if (result.status === 'no_container') {
            await page.evaluate(() => window.scrollBy(0, 1000));
            await page.waitForTimeout(300); // ** REDUCED from 500 **
            continue;
        }

        await page.waitForTimeout(1000 + Math.random() * 800); // ** REDUCED from 1500 **

        const currentItemCount = await page.evaluate(() => document.querySelectorAll('div[role="button"].tw-flex-col').length);

        if (currentItemCount > lastItemCount) {
            noChangeCount = 0;
            lastItemCount = currentItemCount;
        } else {
            noChangeCount++;

            if (noChangeCount >= 2) {
                await page.evaluate((sel) => {
                    const c = document.querySelector(sel);
                    if (c) c.scrollTop = Math.max(0, c.scrollTop - 200);
                }, selector);
                await page.waitForTimeout(500); // ** REDUCED from 800 **
            }
        }
    }
    log('info', logPrefix, `Scroll finished. Found ${lastItemCount} items (${iterations} iterations).`);
}

async function extractProducts(page, logPrefix) {

    return await page.evaluate((logPrefix, patterns) => {
        const items = [];
        const getText = (parent, selector) => {
            const el = parent.querySelector(selector);
            return el ? (el.innerText || el.textContent || '').trim() : '';
        };
        const getAttr = (parent, selector, attr) => {
            const el = selector ? parent.querySelector(selector) : parent;
            return el ? (el.getAttribute(attr) || '') : '';
        };

        let productCards = Array.from(document.querySelectorAll('div[id][role="button"].tw-flex-col'));
        if (productCards.length === 0) {
            productCards = Array.from(document.querySelectorAll('div[role="button"].tw-flex-col'));
        }

        productCards.forEach((card, index) => {
            try {
                const id = card.getAttribute('id') || `generated-${index}`;

                let name = getText(card, 'div.tw-text-300.tw-font-semibold');
                if (!name) name = getText(card, 'div[class*="tw-text-300"][class*="tw-font-semibold"]');

                let url = '';
                if (id && name) {
                    const slug = name.toLowerCase().replace(patterns.slug, '-').replace(patterns.slugTrim, '');
                    url = `https://blinkit.com/prn/${slug}/prid/${id}`;
                }

                let image = getAttr(card, 'img', 'src');
                if (!image) image = getAttr(card, 'img', 'data-src');

                let priceText = getText(card, 'div.tw-text-200.tw-font-semibold');
                let price = priceText.replace(patterns.numbers, '');

                let origPriceText = getText(card, 'div.tw-line-through');
                let origPrice = origPriceText.replace(patterns.numbers, '');

                let discount = '';
                if (price && origPrice) {
                    const p = parseFloat(price);
                    const op = parseFloat(origPrice);
                    if (op > p) {
                        discount = Math.round(((op - p) / op) * 100) + '%';
                    }
                }

                let quantity = getText(card, 'div.tw-text-200.tw-font-medium');
                let deliveryTime = getText(card, 'div.tw-text-050.tw-font-bold.tw-uppercase');

                const cardText = (card.innerText || '').toLowerCase();
                const isOutOfStock = cardText.includes('out of stock');

                let combo = '1';
                const optionsNode = card.querySelector('div.tw-text-050.tw-font-050');
                if (optionsNode) {
                    const optionsText = (optionsNode.innerText || '').trim();
                    const match = optionsText.match(patterns.options);
                    if (match) combo = match[1];
                }

                const hasAdImage = !!card.querySelector('img[src*="ad_without_bg.png"]');
                const hasAdBadge = Array.from(card.querySelectorAll('div')).some(div => {
                    const s = div.style;
                    return (s.position === 'absolute' && s.top === '6px' && s.right === '6px');
                });
                const isAd = hasAdImage || hasAdBadge;

                if (name && (price || isOutOfStock)) {
                    items.push({
                        rank: items.length + 1,
                        id, name, url, image, price, discount, originalPrice: origPrice,
                        quantity, deliveryTime, combo, isOutOfStock, isAd, category: logPrefix
                    });
                }
            } catch (err) {
                // Silent error in production
            }
        });

        return items;
    }, logPrefix, REGEX_PATTERNS);
}

// --- API Endpoints ---

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', services: { scraper: 'up' } });
});

app.post('/blinkitcategoryscrapper', async (req, res) => {
    const { url, urls, pincode, categories, maxConcurrentTabs = 6, proxyUrl, store } = req.body;

    if (!pincode || (!url && (!urls || urls.length === 0) && (!categories || categories.length === 0))) {
        return res.status(400).json({ error: 'Invalid input. Pincode and either url, urls array, or categories array are required.' });
    }

    // Normalize input to categories array
    let targets = [];

    // Helper to create target object from URL
    const createTarget = (u, index) => {
        try {
            const parts = u.split('/');
            // typical url: https://blinkit.com/cn/category-name/cid/13/123
            // find 'cn' and take next part
            const cnIndex = parts.indexOf('cn');
            if (cnIndex !== -1 && parts[cnIndex + 1]) {
                const cleanName = parts[cnIndex + 1].replace(/-/g, ' ');
                // Capitalize
                return {
                    name: cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    url: u
                };
            }
        } catch (e) { }
        return { name: `Target ${index + 1}`, url: u };
    };

    if (url) {
        targets.push(createTarget(url, 0));
    }

    if (urls && Array.isArray(urls)) {
        const newTargets = urls.map((u, i) => createTarget(u, targets.length + i));
        targets = targets.concat(newTargets);
    }

    if (categories && Array.isArray(categories)) {
        targets = targets.concat(categories);
    }

    log('info', 'API', `Received request: Pincode ${pincode}, ${targets.length} targets.`);

    let browser = null;
    let context = null;

    try {
        const launchOptions = {
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        };

        const proxyConfig = parseProxyUrl(proxyUrl);
        if (proxyConfig) {
            launchOptions.proxy = {
                server: proxyConfig.server,
                username: proxyConfig.username,
                password: proxyConfig.password
            };
        }

        browser = await chromium.launch(launchOptions);

        // --- Session Logic Start ---
        const sessionPath = `sessions/${pincode}.json`;
        const fs = await import('fs');
        let contextOptions = {
            userAgent: getRandomUserAgent(),
            viewport: { width: 1280, height: 800 }
        };

        let sessionLoaded = false;
        if (fs.existsSync(sessionPath)) {
            try {
                const sessionContent = fs.readFileSync(sessionPath, 'utf8');
                if (sessionContent.trim().length > 0) {
                    const sessionData = JSON.parse(sessionContent);
                    // Cleanup sensitive session data
                    if (sessionData.origins) {
                        sessionData.origins.forEach(origin => {
                            if (origin.localStorage) {
                                origin.localStorage = origin.localStorage.filter(item => {
                                    const name = item.name.toLowerCase();
                                    return !SESSION_BLOCKLIST.includes(name) && !name.includes('auth') && !name.includes('token') && !name.includes('apikey');
                                });
                            }
                        });
                    }
                    contextOptions.storageState = sessionData;
                    sessionLoaded = true;
                    log('info', 'Session', `✅ Loaded existing session for ${pincode}`);
                }
            } catch (e) {
                log('warn', 'Session', `Error loading session: ${e.message}. Will create new one.`);
            }
        } else {
            log('info', 'Session', `⚠️ No session found for ${pincode}. Initiating pincode setup...`);
        }

        if (proxyConfig && proxyConfig.username && proxyConfig.password) {
            contextOptions.httpCredentials = {
                username: proxyConfig.username,
                password: proxyConfig.password
            };
        }

        // ** MODIFIED: Create SINGLE shared context **
        context = await browser.newContext(contextOptions);

        // --- Session Logic End ---

        // 1. Setup Session/Location (ONCE using shared context)
        // If session was loaded, this checks if it's still valid.
        // If session was NOT loaded, this performs the pincode entry.
        log('info', 'Setup', `Verifying location configuration...`);
        let deliveryTime = await setupLocation(context, pincode, 'Setup');

        // If setupLocation returned a valid result (meaning we are at the right location)
        // AND we didn't have a session loaded originally (or it was invalid and setupLocation fixed it)
        // then we save the new state.
        if (deliveryTime) {
            const newState = await context.storageState();
            // Check if we need to save (if it was a new session OR if the old one was invalid/updated)
            // For simplicity, we can overwrite if we just performed a setup action that wasn't a "skip".
            // However, setupLocation returns 'true' (or string) if successful. 
            // We should check if the file exists to avoid unnecessary writes, OR just overwrite to be safe and fresh.

            // Save session state (new or refreshed)
            try {
                fs.mkdirSync(SESSIONS_DIR, { recursive: true });
                fs.writeFileSync(sessionPath, JSON.stringify(newState, null, 2));
                const msgType = sessionLoaded ? 'Updated' : 'Saved NEW';
                log('success', 'Session', `💾 ${msgType} session to ${sessionPath}`);
            } catch (e) {
                log('error', 'Session', `Error saving session: ${e.message}`);
            }
        }

        // 2. Process Categories in Batches
        const allProducts = [];
        const chunks = [];
        for (let i = 0; i < targets.length; i += maxConcurrentTabs) {
            chunks.push(targets.slice(i, i + maxConcurrentTabs));
        }

        for (const [index, chunk] of chunks.entries()) {
            log('info', 'Batch', `Processing batch ${index + 1}/${chunks.length} (${chunk.length} categories)...`);
            // ** MODIFIED: Pass SHARED 'context' and deliveryTime **
            const promises = chunk.map(cat => scrapeCategory(context, cat, pincode, proxyConfig, deliveryTime));
            const results = await Promise.all(promises);
            results.forEach(res => allProducts.push(...res));
        }

        log('success', 'Summary', `Total products extracted: ${allProducts.length}`);

        // === APPLY STANDARDIZED FORMAT ===
        let transformedProducts = [];

        // 1. Deduplicate Raw Products First
        const dedupedProducts = deduplicateRawProducts(allProducts);
        log('info', 'Transform', `Deduplicated from ${allProducts.length} to ${dedupedProducts.length} unique products`);

        // 2. Transform and Enrich
        transformedProducts = dedupedProducts.map((product, index) => {
            const productCategoryUrl = product.categoryUrl || 'N/A';
            const officialCategory = product.category || 'N/A'; // LogPrefix was stored here

            // Enrich with category mapping
            let categoryMapping = null;
            if (productCategoryUrl !== 'N/A') {
                const enriched = enrichProductWithCategoryMapping({ categoryUrl: productCategoryUrl }, CATEGORY_MAPPINGS);
                if (enriched.categoryMappingFound) {
                    categoryMapping = enriched;
                }
            }

            return transformBlinkitProduct(
                product,
                productCategoryUrl,
                officialCategory,
                'N/A', // officialSubCategory initial default
                pincode,
                index + 1, // Ranking
                categoryMapping
            );
        });

        log('success', 'Transform', `Applied standardized format to ${transformedProducts.length} products (${allProducts.length} before dedup)`);

        const responsePayload = {
            status: 'success',
            pincode,
            totalProducts: transformedProducts.length,
            products: transformedProducts,
            meta: {
                total_urls: targets.length,
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
        }

        res.json(responsePayload);

        // DO NOT save dumps - memory optimization
        // Cleanup directory if exists
        try {
            if (fs.existsSync(API_DUMPS_DIR)) {
                const files = fs.readdirSync(API_DUMPS_DIR);
                files.forEach(file => {
                    try {
                        fs.unlinkSync(path.join(API_DUMPS_DIR, file));
                    } catch (e) { }
                });
                if (fs.readdirSync(API_DUMPS_DIR).length === 0) {
                    fs.rmdirSync(API_DUMPS_DIR);
                }
            }
        } catch (e) {
            // Ignore cleanup errors
        }

    } catch (error) {
        log('error', 'API', `Workflow error: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: error.message,
            partialData: []
        });
    } finally {
        // Close context and browser
        if (context) await context.close();
        if (browser) await browser.close();
    }
});

app.listen(PORT, () => {
    console.log(`${colors.green}Blinkit Scraper API running on port ${PORT}${colors.reset}`);
});
