import express from 'express';
import { chromium } from 'playwright';
import cors from 'cors';
import bodyParser from 'body-parser';
import UserAgent from 'user-agents';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = express();
const PORT = process.env.PORT || 3088;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- Performance Optimization Config ---
const PERFORMANCE_CONFIG = {
    LOW_MEMORY_MODE: process.env.LOW_MEMORY === 'true',
    SLOW_NETWORK_MODE: process.env.SLOW_NETWORK === 'true',
    // Adjust based on available resources
    MAX_CONCURRENT_TABS: process.env.MAX_TABS ? parseInt(process.env.MAX_TABS) : 4,
    API_DUMP_ON_ERROR_ONLY: true,  // Don't dump every API response
    CACHE_RESULTS: false,            // Don't cache intermediate results
};

// --- Helper Functions ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

    console.log(`${colors.dim}[${timestamp}]${colors.reset} ${colors.bright}[${prefix}]${colors.reset} ${icon} ${color}${message}${colors.reset}`);
};

// --- Optimized API Data Processing ---
function extractProductFromWidget(item) {
    try {
        const cartItem = item.atc_action?.add_to_cart?.cart_item;
        if (!cartItem) return null;

        const id = cartItem.product_id?.toString() || '';
        const name = cartItem.product_name || cartItem.display_name || '';

        // Skip if invalid
        if (!id || !name) return null;

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

        // Generate URL only once
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const url = `https://blinkit.com/prn/${slug}/prid/${id}`;

        return {
            id,
            name,
            url,
            image: image || undefined,  // Remove empty strings
            price: price.toString(),
            originalPrice: originalPrice.toString(),
            discount: discount || undefined,
            quantity: quantity || undefined,
            deliveryTime: deliveryTime || undefined,
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

    // Early return if no data
    if (!apiResponses || apiResponses.length === 0) {
        return [];
    }

    for (let idx = 0; idx < apiResponses.length; idx++) {
        try {
            const response = apiResponses[idx];
            const snippets = response.response?.snippets || response.snippets || [];

            if (!Array.isArray(snippets)) continue;

            for (const snippet of snippets) {
                if (snippet.data) {
                    const product = extractProductFromWidget(snippet.data);
                    if (product && !productsMap.has(product.id)) {
                        product.rank = totalProcessed + 1;
                        productsMap.set(product.id, product);
                        totalProcessed++;
                    }
                }
            }
        } catch (e) {
            // Silent fail
        }
    }

    log('success', logPrefix, `Extracted ${totalProcessed} products from ${apiResponses.length} API responses`);
    return Array.from(productsMap.values());
}

// --- Optimized Core Scraping Logic ---
async function setupLocation(context, pincode, logPrefix = 'Setup') {
    const page = await context.newPage();
    try {
        // Faster navigation timeout
        const timeout = PERFORMANCE_CONFIG.SLOW_NETWORK_MODE ? 45000 : 30000;
        await page.goto('https://blinkit.com/', { waitUntil: 'domcontentloaded', timeout });

        // Check existing location
        try {
            const el = await page.waitForSelector('div[class*="LocationBar__Subtitle"]', { timeout: 3000 });
            const text = await el.textContent();

            if (text && text.includes(pincode)) {
                log('success', logPrefix, `Location already set to ${pincode}`);
                await page.close();
                return true;
            }
        } catch (e) {
            // Continue with setup
        }

        // Retry loop
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const inputSelectors = [
                    'input[name="select-locality"]',
                    'input.LocationSearchBox__InputSelect-sc-1k8u6a6-0'
                ];

                let input = null;

                for (const sel of inputSelectors) {
                    try {
                        input = await page.locator(sel).first().elementHandle({ timeout: 1000 });
                        if (input) break;
                    } catch (e) {
                        // Try next selector
                    }
                }

                if (!input) {
                    // Click location bar
                    await page.locator('div[class*="LocationBar"]').first().click().catch(() => { });
                    await page.waitForTimeout(500);

                    for (const sel of inputSelectors) {
                        try {
                            input = await page.locator(sel).first().elementHandle({ timeout: 1000 });
                            if (input) break;
                        } catch (e) {
                            // Continue
                        }
                    }
                }

                if (!input) throw new Error("Location input not found");

                // Fill pincode
                await page.locator(inputSelectors[0]).first().fill(pincode).catch(() => { });
                await page.waitForTimeout(200);

                // Press Enter to search
                await page.keyboard.press('Enter');
                await page.waitForTimeout(1000);

                // Check if location updated
                const locationEl = page.locator('div[class*="LocationBar__Subtitle"]').first();
                const locationText = await locationEl.textContent().catch(() => '');

                if (locationText && locationText.toLowerCase() !== 'select location' && locationText.length > 3) {
                    log('success', logPrefix, `Location set: ${locationText}`);
                    await page.close();
                    return true;
                }

            } catch (e) {
                log('warn', logPrefix, `Setup attempt ${attempt} failed: ${e.message}`);
                if (attempt === 2) throw e;
                await page.reload().catch(() => { });
                await page.waitForTimeout(1000);
            }
        }
    } catch (e) {
        log('error', logPrefix, `Location setup failed: ${e.message}`);
        await page.close();
        return false;
    }
    return false;
}

async function scrapeCategory(context, category, pincode, proxyConfig, deliveryTime = '', maxRetries = 1) {
    const logPrefix = category.name || 'Unknown';
    const randomDelay = Math.floor(Math.random() * 1000) + 300;
    await sleep(randomDelay);

    let products = [];
    let attempts = 0;
    const failedApiData = [];

    while (attempts <= maxRetries) {
        // First: Check for error/sorry messages
        const checkPage = await context.newPage();
        let hasSorryMessage = false;

        try {
            const timeout = PERFORMANCE_CONFIG.SLOW_NETWORK_MODE ? 40000 : 25000;
            await checkPage.goto(category.url, { waitUntil: 'domcontentloaded', timeout }).catch(() => { });
            await checkPage.waitForTimeout(1000);

            // Get page text to check for errors
            const pageText = (await checkPage.evaluate(() => document.body.innerText).catch(() => '')).toLowerCase();

            const sorryPatterns = [
                'sorry',
                'not available',
                'unavailable',
                'out of service',
                'coming soon',
                'not in your area',
                'service not available',
                'no products',
                'something went wrong',
                'service under maintenance'
            ];

            hasSorryMessage = sorryPatterns.some(pattern => pageText.includes(pattern));

            if (hasSorryMessage) {
                log('warn', logPrefix, `⚠️ "Sorry" message found - storing as invalid`);
                await checkPage.close();
                addInvalidUrl(category.url, logPrefix, 'sorry_message');
                return [];
            }
        } catch (e) {
            log('debug', logPrefix, `Pre-check error: ${e.message}`);
        } finally {
            await checkPage.close();
        }

        const page = await context.newPage();
        try {
            log('start', logPrefix, `Starting scrape... (Attempt ${attempts + 1}/${maxRetries + 1})`);

            products = await Promise.race([
                (async () => {
                    const capturedApiData = [];
                    let apiCount = 0;

                    // Intercept API responses
                    page.on('response', async (response) => {
                        const url = response.url();
                        if (url.includes('/v1/layout/listing_widgets')) {
                            try {
                                const json = await response.json();
                                capturedApiData.push(json);
                                apiCount++;
                            } catch (e) {
                                // Silent fail
                            }
                        }
                    });

                    // OPTIMIZED: Block MORE resources to reduce bandwidth
                    await page.route('**/*', (route) => {
                        const type = route.request().resourceType();
                        const url = route.request().url();

                        // Block heavy resources
                        if (['font', 'image', 'media', 'stylesheet'].includes(type)) {
                            return route.abort();
                        }

                        // Block trackers and analytics
                        if (url.includes('analytics') || url.includes('tracking') ||
                            url.includes('facebook') || url.includes('google-analytics')) {
                            return route.abort();
                        }

                        return route.continue();
                    });

                    // Navigate with shorter timeout
                    const timeout = PERFORMANCE_CONFIG.SLOW_NETWORK_MODE ? 40000 : 25000;
                    await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout });

                    // Short wait
                    await page.waitForTimeout(1500);

                    // Click first product to trigger API (optional for slow networks)
                    if (!PERFORMANCE_CONFIG.SLOW_NETWORK_MODE) {
                        try {
                            const firstProduct = page.locator('div[role="button"][id]').first();
                            if (await firstProduct.isVisible({ timeout: 2000 })) {
                                await firstProduct.click();
                                await page.waitForTimeout(1500);
                                await page.keyboard.press('Escape');
                                await page.waitForTimeout(500);
                            }
                        } catch (e) {
                            // Skip if click fails
                        }
                    }

                    // OPTIMIZED: Faster scrolling with early exit
                    await autoScrollOptimized(page, logPrefix);

                    // Short wait for final API calls
                    await page.waitForTimeout(1500);

                    // Process API data
                    const products = processApiData(capturedApiData, logPrefix);

                    if (products.length === 0) {
                        // Store for error dump
                        failedApiData.push(...capturedApiData);
                        return [];
                    }

                    // Add metadata
                    products.forEach(p => {
                        p.category = logPrefix;
                        p.deliveryTime = deliveryTime || p.deliveryTime;
                    });

                    return products;
                })(),
                new Promise((_, reject) => {
                    const timeLimit = PERFORMANCE_CONFIG.SLOW_NETWORK_MODE ? 180000 : 120000;
                    setTimeout(() => reject(new Error('Scraping timeout')), timeLimit);
                })
            ]);

            if (products.length > 0) {
                log('success', logPrefix, `Extracted ${products.length} products`);
                return products;
            }

        } catch (e) {
            log('error', logPrefix, `Error: ${e.message}`);

            // Save API dump only on final failure
            if (attempts === maxRetries && failedApiData.length > 0) {
                try {
                    const apiDumpsDir = path.join(process.cwd(), 'api_dumps_errors');
                    if (!fs.existsSync(apiDumpsDir)) {
                        fs.mkdirSync(apiDumpsDir, { recursive: true });
                    }
                    const filename = `error_${logPrefix.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
                    fs.writeFileSync(path.join(apiDumpsDir, filename), JSON.stringify({
                        category: logPrefix,
                        url: category.url,
                        timestamp: new Date().toISOString(),
                        data: failedApiData
                    }, null, 2));
                } catch (dumpError) {
                    // Ignore dump errors
                }
            }
        } finally {
            if (!page.isClosed()) await page.close();
        }

        attempts++;
        if (attempts <= maxRetries) {
            await sleep(1000);
        }
    }

    // Record failed URL
    try {
        const failedPath = path.resolve('failed_urls.json');
        let failed = [];
        try {
            failed = JSON.parse(fs.readFileSync(failedPath, 'utf-8'));
        } catch (e) { }
        if (!failed.includes(category.url)) {
            failed.push(category.url);
            fs.writeFileSync(failedPath, JSON.stringify(failed, null, 2));
        }
    } catch (e) {
        // Ignore
    }

    log('error', logPrefix, `Failed to extract products`);
    return [];
}

// Helper: Store invalid URLs with reason
function addInvalidUrl(url, reason, errorType = 'unknown') {
    try {
        const invalidPath = path.resolve('invalid_urls.json');
        let invalid = [];

        try {
            const content = fs.readFileSync(invalidPath, 'utf-8');
            if (content.trim()) {
                invalid = JSON.parse(content);
            }
        } catch (e) {
            // Start fresh
        }

        // Check if URL already exists
        const exists = invalid.some(item => item.url === url);
        if (!exists) {
            invalid.push({
                url: url,
                category: reason,
                errorType: errorType,
                timestamp: new Date().toISOString(),
                dateAdded: new Date().toLocaleString()
            });

            fs.writeFileSync(invalidPath, JSON.stringify(invalid, null, 2));
            log('info', 'Invalid', `Added: ${reason}`);
        }
    } catch (e) {
        log('warn', 'Invalid', `Failed to store: ${e.message}`);
    }
}

// OPTIMIZED: Faster scroll detection with end detection
async function autoScrollOptimized(page, logPrefix) {
    log('info', logPrefix, `Loading products...`);
    const selector = '#plpContainer';

    let lastItemCount = 0;
    let noChangeCount = 0;
    const maxNoChange = PERFORMANCE_CONFIG.SLOW_NETWORK_MODE ? 5 : 3;
    let scrollAttempts = 0;
    const maxScrollAttempts = PERFORMANCE_CONFIG.SLOW_NETWORK_MODE ? 15 : 10;

    while (noChangeCount < maxNoChange && scrollAttempts < maxScrollAttempts) {
        scrollAttempts++;

        try {
            const result = await page.evaluate(async (sel) => {
                const container = document.querySelector(sel);
                if (!container) return { status: 'no_container' };

                const prevTop = container.scrollTop;
                container.scrollTop = container.scrollHeight;

                // Better bottom detection
                const scrollTop = container.scrollTop;
                const scrollHeight = container.scrollHeight;
                const clientHeight = container.clientHeight;
                const atBottom = (scrollHeight - scrollTop - clientHeight) < 50;

                return {
                    status: 'scrolled',
                    itemCount: document.querySelectorAll('div[role="button"].tw-flex-col').length,
                    atBottom: atBottom
                };
            }, selector);

            if (result.status === 'no_container') {
                await page.evaluate(() => window.scrollBy(0, 800));
                await page.waitForTimeout(800);
                continue;
            }

            // Faster wait for slow networks
            const waitTime = PERFORMANCE_CONFIG.SLOW_NETWORK_MODE ? 1200 : 800;
            await page.waitForTimeout(waitTime);

            const currentItemCount = await page.evaluate(() =>
                document.querySelectorAll('div[role="button"].tw-flex-col').length
            );

            if (currentItemCount > lastItemCount) {
                noChangeCount = 0;
                lastItemCount = currentItemCount;
            } else {
                noChangeCount++;

                // Exit if at bottom
                if (result.atBottom) {
                    log('info', logPrefix, `Reached bottom of page`);
                    break;
                }
            }
        } catch (e) {
            log('warn', logPrefix, `Scroll error: ${e.message}`);
            break;
        }
    }

    log('info', logPrefix, `Loaded ${lastItemCount} products (${scrollAttempts} scrolls)`);
}

// --- API Endpoints ---
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        performance: {
            lowMemoryMode: PERFORMANCE_CONFIG.LOW_MEMORY_MODE,
            slowNetworkMode: PERFORMANCE_CONFIG.SLOW_NETWORK_MODE,
            maxConcurrentTabs: PERFORMANCE_CONFIG.MAX_CONCURRENT_TABS
        }
    });
});

app.post('/blinkitcategoryscrapper', async (req, res) => {
    const { url, urls, pincode, categories, maxConcurrentTabs, proxyUrl } = req.body;

    if (!pincode || (!url && (!urls || urls.length === 0) && (!categories || categories.length === 0))) {
        return res.status(400).json({ error: 'Invalid input' });
    }

    let targets = [];
    const createTarget = (u, index) => {
        try {
            const parts = u.split('/');
            const cnIndex = parts.indexOf('cn');
            if (cnIndex !== -1 && parts[cnIndex + 1]) {
                const cleanName = parts[cnIndex + 1].replace(/-/g, ' ');
                return {
                    name: cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    url: u
                };
            }
        } catch (e) { }
        return { name: `Target ${index + 1}`, url: u };
    };

    if (url) targets.push(createTarget(url, 0));
    if (urls && Array.isArray(urls)) targets = targets.concat(urls.map((u, i) => createTarget(u, targets.length + i)));
    if (categories && Array.isArray(categories)) targets = targets.concat(categories);

    const concurrency = maxConcurrentTabs || PERFORMANCE_CONFIG.MAX_CONCURRENT_TABS;
    log('info', 'API', `Request: ${pincode}, ${targets.length} targets, ${concurrency} concurrent`);

    let browser = null;
    let context = null;

    try {
        const launchOptions = {
            headless: true,  // OPTIMIZED: headless mode is faster
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-web-resources',
                '--no-first-run',
                '--no-default-browser-check'
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

        // Session handling
        const sessionPath = `sessions/${pincode}.json`;
        let contextOptions = {
            userAgent: getRandomUserAgent(),
            viewport: { width: 1280, height: 800 }
        };

        if (fs.existsSync(sessionPath)) {
            try {
                const sessionContent = fs.readFileSync(sessionPath, 'utf8');
                if (sessionContent.trim().length > 0) {
                    const sessionData = JSON.parse(sessionContent);
                    contextOptions.storageState = sessionData;
                    log('info', 'Session', `Loaded session for ${pincode}`);
                }
            } catch (e) {
                log('warn', 'Session', `Session load failed: ${e.message}`);
            }
        }

        if (proxyConfig?.username && proxyConfig?.password) {
            contextOptions.httpCredentials = {
                username: proxyConfig.username,
                password: proxyConfig.password
            };
        }

        context = await browser.newContext(contextOptions);

        // Setup location
        log('info', 'Setup', `Verifying location...`);
        const locationOk = await setupLocation(context, pincode, 'Setup');

        if (locationOk) {
            try {
                fs.mkdirSync('sessions', { recursive: true });
                const newState = await context.storageState();
                fs.writeFileSync(sessionPath, JSON.stringify(newState, null, 2));
                log('success', 'Session', `Saved session`);
            } catch (e) {
                log('warn', 'Session', `Session save failed`);
            }
        }

        // Scrape in batches
        const allProducts = [];
        const chunks = [];
        for (let i = 0; i < targets.length; i += concurrency) {
            chunks.push(targets.slice(i, i + concurrency));
        }

        for (const [index, chunk] of chunks.entries()) {
            log('info', 'Batch', `Batch ${index + 1}/${chunks.length} (${chunk.length} categories)...`);
            const promises = chunk.map(cat => scrapeCategory(context, cat, pincode, proxyConfig, '', 1));
            const results = await Promise.all(promises);
            results.forEach(res => allProducts.push(...res));

            // Memory cleanup
            if (PERFORMANCE_CONFIG.LOW_MEMORY_MODE) {
                await sleep(500);
            }
        }

        log('success', 'Summary', `Total: ${allProducts.length} products`);

        res.json({
            status: 'success',
            pincode,
            totalProducts: allProducts.length,
            products: allProducts
        });

    } catch (error) {
        log('error', 'API', `Error: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: error.message,
            products: []
        });
    } finally {
        if (context) await context.close();
        if (browser) await browser.close();
    }
});

app.listen(PORT, () => {
    console.log(`${colors.green}Blinkit Scraper running on port ${PORT}${colors.reset}`);
    console.log(`${colors.cyan}Low Memory: ${PERFORMANCE_CONFIG.LOW_MEMORY_MODE} | Slow Network: ${PERFORMANCE_CONFIG.SLOW_NETWORK_MODE}${colors.reset}`);
});
