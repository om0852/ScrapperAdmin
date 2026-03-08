import express from 'express';
import { chromium } from 'playwright';
import cors from 'cors';
import bodyParser from 'body-parser';
import UserAgent from 'user-agents';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3088;

app.use(cors());
app.use(bodyParser.json());

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

    // Format: [12:00:00] [Prefix] Icon Message
    console.log(`${colors.dim}[${timestamp}]${colors.reset} ${colors.bright}[${prefix}]${colors.reset} ${icon} ${color}${message}${colors.reset}`);
};

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
                const inputSelectors = [
                    'input[name="select-locality"]',
                    'input.LocationSearchBox__InputSelect-sc-1k8u6a6-0',
                    'input[placeholder*="search delivery location"]'
                ];

                let input = null;
                let modalOpen = false;

                // Check visibility of input first
                for (const sel of inputSelectors) {
                    if (await page.locator(sel).first().isVisible({ timeout: 2000 })) {
                        input = page.locator(sel).first();
                        modalOpen = true;
                        break;
                    }
                }

                // 2. If not open, click the Location Bar
                if (!modalOpen) {
                    const locationBarSelectors = [
                        'div[class*="LocationBar__Container"]',
                        'div[class*="LocationBar"]',
                        'div.LocationBar__Subtitle-sc-x8ezho-10'
                    ];

                    for (const sel of locationBarSelectors) {
                        if (await page.locator(sel).first().isVisible()) {
                            await page.locator(sel).first().click();
                            await page.waitForTimeout(1000); // Wait for animation
                            break;
                        }
                    }

                    // Re-check input
                    for (const sel of inputSelectors) {
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
                    await page.close(); // Close setup page
                    return true;
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
async function scrapeCategory(context, category, pincode, proxyConfig, maxRetries = 2) {
    const logPrefix = category.name;

    // Stagger start time
    const randomDelay = Math.floor(Math.random() * 2000) + 500;
    await sleep(randomDelay);

    let products = [];
    let attempts = 0;

    while (attempts <= maxRetries) {
        const page = await context.newPage();
        try {
            log('start', logPrefix, `Starting scrape... (Attempt ${attempts + 1}/${maxRetries + 1})`);

            products = await Promise.race([
                (async () => {
                    // Block resources - SIGNIFICANT SPEEDUP
                    await page.route('**/*', (route) => {
                        const type = route.request().resourceType();
                        // ** MODIFIED: ALLOW images so tags are present **
                        if (['font', 'media'].includes(type)) {
                            return route.abort();
                        }
                        return route.continue();
                    });

                    await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

                    // Wait for PLP container or products - Reduced timeout
                    try {
                        await page.waitForSelector('#plpContainer, div[role="button"][id]', { timeout: 15000 });
                    } catch (e) {
                        log('warn', logPrefix, `Timeout waiting for container: ${e.message}`);
                    }

                    // Infinite scroll logic
                    await autoScroll(page, logPrefix);

                    // ** FORCE LAZY IMAGES TO LOAD ** (User reported missing images)
                    await forceImageLoad(page, logPrefix);

                    // Extract products
                    const extracted = await extractProducts(page, logPrefix);
                    // Check for 'try again' or empty content indicators
                    const pageContent = await page.content();
                    const hasTryAgain = /try again/i.test(pageContent);
                    if (extracted.length === 0 && hasTryAgain) {
                        log('warn', logPrefix, `Invalid page detected (try again). Marking URL as failed.`);
                        // Record failed URL
                        const failedPath = path.resolve('failed_urls.json');
                        let failed = [];
                        try {
                            const data = fs.readFileSync(failedPath, 'utf-8');
                            failed = JSON.parse(data);
                        } catch (e) {
                            // file may not exist or be invalid, start fresh
                        }
                        if (!failed.includes(category.url)) {
                            failed.push(category.url);
                            fs.writeFileSync(failedPath, JSON.stringify(failed, null, 2));
                        }
                        // Prevent further retries for this URL
                        attempts = maxRetries + 1;
                        return [];
                    }
                    return extracted;
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
            // ** MODIFIED: Close PAGE only, not context **
            if (!page.isClosed()) await page.close();
        }

        attempts++;
        if (attempts <= maxRetries) {
            log('info', logPrefix, `Retrying in 2s...`);
            await sleep(2000);
        }
    }
    // Record URL as failed after all retries
    const failedPath = path.resolve('failed_urls.json');
    let failed = [];
    try {
        const data = fs.readFileSync(failedPath, 'utf-8');
        failed = JSON.parse(data);
    } catch (e) {
        // ignore
    }
    if (!failed.includes(category.url)) {
        failed.push(category.url);
        fs.writeFileSync(failedPath, JSON.stringify(failed, null, 2));
    }
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
    const maxNoChange = 8; // ** MODIFIED: Reduced from 15 to 8 **

    while (noChangeCount < maxNoChange) {
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
            await page.waitForTimeout(500);
            continue;
        }

        await page.waitForTimeout(1500 + Math.random() * 1000);

        const currentItemCount = await page.evaluate(() => document.querySelectorAll('div[role="button"].tw-flex-col').length);

        if (currentItemCount > lastItemCount) {
            // log('info', logPrefix, `Items loaded: ${currentItemCount} (+${currentItemCount - lastItemCount})`);
            noChangeCount = 0;
            lastItemCount = currentItemCount;
        } else {
            noChangeCount++;
            // log('debug', logPrefix, `No change (${noChangeCount}/${maxNoChange}). Items: ${currentItemCount}`);

            if (noChangeCount >= 2) {
                // log('debug', logPrefix, `Wiggle...`);
                await page.evaluate((sel) => {
                    const c = document.querySelector(sel);
                    if (c) c.scrollTop = Math.max(0, c.scrollTop - 300);
                }, selector);
                await page.waitForTimeout(800);
            }
        }
    }
    log('info', logPrefix, `Scroll finished. Found ${lastItemCount} items.`);
}

async function extractProducts(page, logPrefix) {

    return await page.evaluate((logPrefix) => {
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
                // Fallback name
                if (!name) name = getText(card, 'div[class*="tw-text-300"][class*="tw-font-semibold"]');

                let url = '';
                if (id && name) {
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    url = `https://blinkit.com/prn/${slug}/prid/${id}`;
                }

                let image = getAttr(card, 'img', 'src');
                if (!image) {
                    image = getAttr(card, 'img', 'data-src');
                }

                // Removed debug logging for clean production output

                let priceText = getText(card, 'div.tw-text-200.tw-font-semibold');
                let price = priceText.replace(/[^\d.]/g, '');

                let origPriceText = getText(card, 'div.tw-line-through');
                let origPrice = origPriceText.replace(/[^\d.]/g, '');

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
                    const match = optionsText.match(/(\d+)\s+options?/i);
                    if (match) {
                        combo = match[1];
                    }
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
    }, logPrefix);
}

// --- API Endpoints ---

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', services: { scraper: 'up' } });
});

app.post('/blinkitcategoryscrapper', async (req, res) => {
    const { pincode, categories, maxConcurrentTabs = 8, proxyUrl } = req.body;

    if (!pincode || !categories || !Array.isArray(categories)) {
        return res.status(400).json({ error: 'Invalid input. Pincode and categories array are required.' });
    }

    log('info', 'API', `Received request: Pincode ${pincode}, ${categories.length} categories.`);

    let browser = null;
    let context = null;

    try {
        const launchOptions = {
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
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

        if (fs.existsSync(sessionPath)) {
            try {
                const sessionContent = fs.readFileSync(sessionPath, 'utf8');
                if (sessionContent.trim().length > 0) {
                    const sessionData = JSON.parse(sessionContent);
                    if (sessionData.origins) {
                        sessionData.origins.forEach(origin => {
                            if (origin.localStorage) {
                                origin.localStorage = origin.localStorage.filter(item => {
                                    const name = item.name.toLowerCase();
                                    const blockList = ['user', 'useragent', 'featureflags', 'topicslastreferencetime', 'secretsatnapersistedstate'];
                                    return !blockList.includes(name) && !name.includes('auth') && !name.includes('token') && !name.includes('apikey');
                                });
                            }
                        });
                    }
                    log('info', 'Session', `Loaded session for ${pincode}`);
                    contextOptions.storageState = sessionData;
                }
            } catch (e) { log('warn', 'Session', `Error loading session: ${e.message}`); }
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
        log('info', 'Setup', `Checking location configuration...`);
        const locationSet = await setupLocation(context, pincode, 'Setup');

        // If we want to capture state after setup:
        if (locationSet) {
            const newState = await context.storageState();
            // Save it for future
            try {
                fs.mkdirSync('sessions', { recursive: true });
                fs.writeFileSync(sessionPath, JSON.stringify(newState, null, 2));
                log('success', 'Session', `Saved session to ${sessionPath}`);
            } catch (e) { log('error', 'Session', `Error saving session: ${e.message}`); }
        }

        // 2. Process Categories in Batches
        const allProducts = [];
        const chunks = [];
        for (let i = 0; i < categories.length; i += maxConcurrentTabs) {
            chunks.push(categories.slice(i, i + maxConcurrentTabs));
        }

        for (const [index, chunk] of chunks.entries()) {
            log('info', 'Batch', `Processing batch ${index + 1}/${chunks.length} (${chunk.length} categories)...`);
            // ** MODIFIED: Pass SHARED 'context' **
            const promises = chunk.map(cat => scrapeCategory(context, cat, pincode, proxyConfig));
            const results = await Promise.all(promises);
            results.forEach(res => allProducts.push(...res));
        }

        log('success', 'Summary', `Total products extracted: ${allProducts.length}`);

        const responsePayload = {
            status: 'success',
            pincode,
            totalProducts: allProducts.length,
            products: allProducts
        };

        res.json(responsePayload);

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
