const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR);
}

// Ensure output dir exists (optional, mostly for debugging dumps)
const DATA_DIR = path.join(__dirname, 'scraped_data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// API Dumps storage directory
const API_DUMPS_DIR = path.join(__dirname, 'api_dumps');
if (!fs.existsSync(API_DUMPS_DIR)) {
    fs.mkdirSync(API_DUMPS_DIR);
}

// Function to save API dumps
function saveApiDump(pincode, url, jsonData, dumpType = 'response') {
    try {
        const timestamp = Date.now();
        const urlHash = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const filename = `dump_${pincode}_${dumpType}_${urlHash}_${timestamp}.json`;
        const filepath = path.join(API_DUMPS_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(jsonData, null, 2));
        log(`✓ API dump saved: ${filename}`, 'SUCCESS');
        return filename;
    } catch (err) {
        log(`✗ Failed to save API dump: ${err.message}`, 'ERROR');
        return null;
    }
}

/**
 * Enhanced Logger
 */
function log(msg, type = 'INFO') {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    let color = '';
    const reset = '\x1b[0m';

    switch (type) {
        case 'INFO': color = '\x1b[36m'; break; // Cyan
        case 'SUCCESS': color = '\x1b[32m'; break; // Green
        case 'WARN': color = '\x1b[33m'; break; // Yellow
        case 'ERROR': color = '\x1b[31m'; break; // Red
        default: color = '\x1b[37m'; // White
    }

    const logString = `[${timestamp}] ${color}[${type}]${reset} ${msg}`;
    console.log(logString);
    fs.appendFileSync('scraper_service.log', logString + '\n');
}

/**
 * Resource interception logic: Block Images & Media, Allow CSS & Scripts
 */
async function interceptResources(page) {
    await page.route('**/*', async (route) => {
        const resourceType = route.request().resourceType();
        // Block heavy media but ALLOW CSS for proper rendering
        if (['image', 'media', 'font'].includes(resourceType)) {
            await route.abort();
        } else {
            await route.continue();
        }
    });
}

/**
 * Ensures a valid session exists for the given pincode.
 * If not, it launches a browser to perform the setup.
 */
async function setupSession(pincode) {
    if (!pincode) throw new Error('Pincode is required for setup.');

    const sessionFile = path.join(SESSION_DIR, `flipkart_session_${pincode}.json`);

    // Check if session exists AND is valid (file size > 100 bytes)
    if (fs.existsSync(sessionFile)) {
        const stats = fs.statSync(sessionFile);
        if (stats.size > 100) {
            log(`Session already exists for pincode ${pincode} (${stats.size} bytes)`, 'INFO');
            return { sessionFile, status: 'serviceable' };
        } else {
            log(`Session file exists but is too small (${stats.size} bytes). Re-creating for ${pincode}`, 'WARN');
        }
    }

    log(`Starting Session Setup for Pincode: ${pincode}`, 'INFO');
    const browser = await chromium.launch({
        headless: true, // Changed to true for stability
        executablePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-client-side-phishing-detection',
            '--disable-default-apps',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-sync',
            '--metrics-recording-only',
            '--no-first-run',
            '--no-default-browser-check',
            '--password-store=basic',
            '--use-mock-keychain',
            '--disable-domain-reliability'
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });

    // Add stealth scripts
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    // DON'T block resources during session setup - need full page rendering for interaction
    // await interceptResources(page);

    try {
        log('Navigating to Flipkart Homepage first...', 'INFO');
        await page.goto('https://www.flipkart.com/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        log('Navigating to Location Setup Page...', 'INFO');
        const TARGET_URL = 'https://www.flipkart.com/rv/checkout/changeShippingAddress/add?marketplace=HYPERLOCAL&source=entry&originalUrl=%2Fflipkart-minutes-store%3Fmarketplace%3DHYPERLOCAL&hideAddressForm=true&isMap=true&addressBSTouchpoint=ENTER_LOCATION_MANUALLY';

        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);

        // Check for Block
        if (await page.getByText('Something is not right', { exact: false }).count() > 0) {
            log('Caught Bot Detection Screen on Setup!', 'ERROR');
            await page.screenshot({ path: 'setup_blocked.png' });
            throw new Error('Blocked by Flipkart during session setup');
        }

        const searchInput = page.locator('input#search, input[placeholder*="pincode"], input[placeholder*="location"]');
        await searchInput.first().waitFor({ state: 'visible', timeout: 10000 });
        await searchInput.first().click();
        await searchInput.first().clear();
        await page.waitForTimeout(500);
        await searchInput.first().pressSequentially(pincode, { delay: 150 });
        await page.waitForTimeout(1000);

        const suggestionItem = page.locator('li._2APc3k, div._2APc3k, .suggestion-item');
        await suggestionItem.first().waitFor({ state: 'visible', timeout: 8000 });

        // Select logic
        const correctSuggestion = suggestionItem.filter({ hasText: pincode }).first();
        if (await correctSuggestion.isVisible()) {
            await correctSuggestion.click();
        } else {
            if (await suggestionItem.count() > 1) await suggestionItem.nth(1).click();
            else await suggestionItem.first().click();
        }
        await page.waitForTimeout(2000);

        // Check for Serviceability Error (Try again / Not available)
        const unserviceableMsg = page.getByText('Not serviceable', { exact: false }).first();
        const tryAgainBtn = page.getByRole('button', { name: /Try Again|Retry/i }).first();

        if (await unserviceableMsg.isVisible() || await tryAgainBtn.isVisible()) {
            log(`[Setup] Location ${pincode} appears to be UNSERVICEABLE. Aborting setup.`, 'ERROR');
            throw new Error(`Location ${pincode} is not serviceable on Flipkart Minutes.`);
        }

        // Confirm
        const confirmBtn = page.getByRole('button', { name: /Confirm|Save|Proceed/i }).first();
        let confirmed = false;
        if (await confirmBtn.isVisible({ timeout: 5000 })) {
            await confirmBtn.click();
            confirmed = true;
        } else {
            const textBtn = page.getByText('Confirm', { exact: false });
            if (await textBtn.count() > 0) {
                await textBtn.first().click();
                confirmed = true;
            }
        }

        if (!confirmed) {
            log('[Setup] Warning: Could not find Confirm button. Checking if already redirected...', 'WARN');
        }

        await page.waitForTimeout(3000); // Wait for session cookie to set

        await context.storageState({ path: sessionFile });
        log(`Session saved: ${sessionFile}`, 'SUCCESS');
        await browser.close();
        return { sessionFile, status: 'serviceable' };

    } catch (e) {
        log(`Error in setupSession: ${e.message}`, 'ERROR');
        await browser.close();

        // Check specifically for unserviceable error
        if (e.message.includes('not serviceable')) {
            return { sessionFile: null, status: 'unserviceable' };
        }

        // Ensure we don't leave a partial/bad session file
        if (fs.existsSync(sessionFile)) {
            try { fs.unlinkSync(sessionFile); } catch (err) { }
        }
        throw e;
    }
}

/**
 * Internal function to scrape a single URL given a browser context.
 * Used by both scrape() and scrapeMultiple().
 */
async function scrapeUrlInContext(context, url, pincode) {
    const page = await context.newPage();

    // DON'T block resources during scraping - causes pages to not load properly
    // await interceptResources(page);

    try {
        // Setup API intercept
        const collectedData = [];
        const collectedPIDs = new Set();
        const API_ENDPOINT_PART = '/api/4/page/fetch';

        await page.route(`**${API_ENDPOINT_PART}*`, async route => {
            // NOTE: We must NOT block API requests here, so we wrap in try-catch
            // and fallback to standard fetch if our interceptLogic is complex.
            // But since 'interceptResources' handles images/fonts globally, 
            // we just need to handle the specific API interception here.

            // Wait: interceptResources uses page.route('**/*')... 
            // Playwright routing: specific routes should be defined BEFORE global catch-alls if priority matters,
            // OR we rely on how Playwright handles overrides.
            // Actually, declaring `page.route` multiple times works, the matching order is LIFO (last registered matches first).
            // So we register API interception LAST (effectively first priority for this specific URL pattern).

            try {
                const response = await route.fetch();
                try {
                    const json = await response.json();
                    collectedData.push(json);
                    // Save API dump
                    saveApiDump(pincode, url, json, 'api_response');
                } catch (e) { }
                await route.fulfill({ response });
            } catch (err) {
                // Handle socket hangup or network failures gracefully
                try { await route.continue(); } catch (e) { }
            }
        });

        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        // Click-and-Back Strategy
        try {
            const firstProduct = page.locator('a[href*="/p/"]').first();
            if (await firstProduct.count() > 0) {
                await firstProduct.click();
                await page.waitForTimeout(2000);
                await page.goBack({ waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(2000);
            }
        } catch (e) { log(`[${url}] Click-and-back skipped/failed: ${e.message}`, 'WARN'); }

        // Scroll Logic
        let previousHeight = 0;
        let sameHeightCount = 0;
        const maxSameHeight = 10;
        const scrollSelector = '.lQLKCP';

        while (true) {
            // Scrape DOM IDs
            const currentPIDs = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href*="pid="]'));
                return anchors.map(a => {
                    const href = a.getAttribute('href') || '';
                    const match = href.match(/pid=([^&]+)/);
                    return match ? match[1] : null;
                }).filter(id => id !== null);
            });
            currentPIDs.forEach(pid => collectedPIDs.add(pid));

            // Scroll
            const containerExists = await page.locator(scrollSelector).count() > 0;
            let currentScrollHeight;

            if (containerExists) {
                currentScrollHeight = await page.evaluate((selector) => {
                    const el = document.querySelector(selector);
                    if (el) { el.scrollTop = el.scrollHeight; return el.scrollHeight; }
                    return 0;
                }, scrollSelector);
            } else {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                currentScrollHeight = await page.evaluate(() => document.body.scrollHeight);
            }
            // Double tap window scroll
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

            if (currentScrollHeight === previousHeight) {
                sameHeightCount++;
                if (sameHeightCount >= maxSameHeight) break;
            } else {
                sameHeightCount = 0;
                previousHeight = currentScrollHeight;
            }
            await page.waitForTimeout(1500);
        }

        // Scrape Unavailable Items explicitly
        const unavailableItems = await page.evaluate(() => {
            const items = [];
            const headers = Array.from(document.querySelectorAll('div')).filter(el =>
                el.textContent && el.textContent.trim().includes('Few items are unavailable')
            );

            if (headers.length === 0) return items;

            const header = headers[0];
            const allParentCtrs = Array.from(document.querySelectorAll('#_parentCtr_'));

            // Find the _parentCtr_ that follows the header
            const container = allParentCtrs.find(ctr =>
                header.compareDocumentPosition(ctr) & 4 // Node.DOCUMENT_POSITION_FOLLOWING = 4
            );

            if (container) {
                const productCards = Array.from(container.children).filter(c => c.querySelector('img'));
                productCards.forEach((card, idx) => {
                    const img = card.querySelector('img');
                    if (!img) return;
                    const imageUrl = img.src || '';
                    const textLines = card.innerText.split('\n').filter(t => t.trim().length > 0);
                    const title = textLines.find(l => l.length >= 25 && !l.includes('₹')) || textLines[2] || 'Unknown Title';
                    const priceLine = textLines.find(l => l.includes('₹'));
                    const price = priceLine ? priceLine.replace(/[^0-9]/g, '') : null;
                    const imgIdMatch = imageUrl.match(/original-([a-zA-Z0-9]+)\./);
                    const domId = imgIdMatch ? imgIdMatch[1] : `unavailable_${idx}`;
                    items.push({
                        productId: domId,
                        productName: title,
                        productImage: imageUrl,
                        productWeight: "",
                        quantity: "",
                        deliveryTime: "N/A",
                        isAd: false,
                        rating: 0,
                        currentPrice: price ? parseFloat(price) : 0,
                        originalPrice: price ? parseFloat(price) : 0,
                        discountPercentage: 0,
                        isOutOfStock: true,
                        productUrl: null,
                        platform: "flipkart_minutes",
                        ranking: 9999 + idx
                    });
                });
            }
            return items;
        });

        log(`[${url}] Scrape Complete. API Pages: ${collectedData.length}, DOM IDs: ${collectedPIDs.size}, Unavailable Items: ${unavailableItems.length}`, 'SUCCESS');

        // Check extraction result
        let finalProducts = extractData(collectedData, Array.from(collectedPIDs), unavailableItems);

        // Add categoryUrl to each product
        finalProducts.forEach(p => p.categoryUrl = url);

        return finalProducts;

    } catch (e) {
        log(`Error scraping ${url}: ${e.message}`, 'ERROR');
        return [];
    } finally {
        await page.close();
    }
}

/**
 * Extracts delivery time from the main store page
 */
async function getDeliveryTime(context) {
    const page = await context.newPage();
    const STORE_URL = 'https://www.flipkart.com/flipkart-minutes-store?marketplace=HYPERLOCAL';
    let deliveryTime = "N/A";

    try {
        log(`Navigating to store page to Extract Delivery Time...`, 'INFO');
        await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Check for Block
        if (await page.getByText('Something is not right', { exact: false }).count() > 0) {
            console.log('[Delivery] Caught Bot Detection Screen!');
            // Dump verify
            const fs = require('fs');
            fs.writeFileSync('debug_blocked_delivery.html', await page.content());
            return "BLOCKED";
        }

        // Strategy: Look for specific time patterns in the full page text
        // formats: "12 mins", "15 min", "Delivery in 10 mins"
        const bodyText = await page.innerText('body');

        // Regex for "X min"
        const timeRegex = /(\d+(?:-\d+)?)\s*(?:mins?|minutes?)/i;
        const match = bodyText.match(timeRegex);

        if (match) {
            deliveryTime = `${match[1]} min`;
        } else {
            // Fallback: Look for "Tomorrow" or "Today"
            if (/tomorrow/i.test(bodyText)) deliveryTime = "Tomorrow";
            else if (/today/i.test(bodyText)) deliveryTime = "Today";

            if (deliveryTime === 'N/A') {
                log('Regex failed. Dumping body text for debugging...', 'WARN');
                const fs = require('fs');
                fs.writeFileSync('debug_body_text.txt', bodyText);
            }
        }

        log(`Extracted Delivery Time: ${deliveryTime}`, 'SUCCESS');

    } catch (e) {
        log(`Failed to extract delivery time: ${e.message}`, 'WARN');
    } finally {
        await page.close();
    }
    return deliveryTime;
}

/**
 * Main Scrape Function (Single URL)
 */
async function scrape(url, pincode) {
    if (!url) throw new Error('URL is required');
    if (!pincode) throw new Error('Pincode is required');

    // 1. Session Management
    let sessionRes;
    try {
        sessionRes = await setupSession(pincode);
    } catch (e) {
        log(`Failed to setup session for ${pincode}: ${e.message}`, 'ERROR');
        return [];
    }

    if (sessionRes.status === 'unserviceable') {
        log(`Pincode ${pincode} is unserviceable. Returning empty.`, 'WARN');
        return [];
    }
    const sessionFile = sessionRes.sessionFile;

    // 2. Launch Scraper
    log(`Scraping URL: ${url} with Pincode: ${pincode}`, 'INFO');
    const browser = await chromium.launch({
        headless: true, // Changed to true for stability
        executablePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-client-side-phishing-detection',
            '--disable-sync',
            '--metrics-recording-only',
            '--no-first-run',
            '--no-default-browser-check'
        ]
    });

    try {
        const context = await browser.newContext({ storageState: sessionFile });

        // Skipped delivery time extraction as requested
        const globalDeliveryTime = "N/A";

        const finalProducts = await scrapeUrlInContext(context, url, pincode);

        // Inject Delivery Time
        if (finalProducts) finalProducts.forEach(p => p.deliveryTime = globalDeliveryTime);

        // Fallback logic specific to single scrape (retained for backward compatibility)
        if (finalProducts.length === 0) {
            log('No products extracted. Retrying with explicit location check...', 'WARN');
            const page = await context.newPage();
            // Don't block resources for location setup - need full rendering
            // await interceptResources(page);

            const locationFixed = await ensureLocation(page, pincode);

            if (locationFixed) {
                // **CRITICAL UPDATE**: Save the fixed session immediately!
                log('Location updated successfully. Saving session...', 'SUCCESS');
                await context.storageState({ path: sessionFile });
            }

            await page.close();

            if (locationFixed) {
                log('Retrying scrape after location update...', 'INFO');
                const retryProducts = await scrapeUrlInContext(context, url, pincode);
                if (retryProducts) retryProducts.forEach(p => p.deliveryTime = globalDeliveryTime);

                await browser.close();
                return retryProducts;
            }
        }
        await browser.close();
        return finalProducts;

    } catch (e) {
        await browser.close();
        throw e;
    }
}

/**
 * Scrape Multiple URLs concurrently
 */
async function scrapeMultiple(urls, pincode) {
    if (!urls || urls.length === 0) throw new Error('URLs array is required');
    if (!pincode) throw new Error('Pincode is required');

    // 1. Session Management (Single Check)
    let sessionRes;
    try {
        sessionRes = await setupSession(pincode);
    } catch (e) {
        log(`Failed to setup session for ${pincode}: ${e.message}`, 'ERROR');
        return urls.map(() => []); // Fail all
    }

    if (sessionRes.status === 'unserviceable') {
        log(`Pincode ${pincode} is unserviceable. Returning empty for all URLs.`, 'WARN');
        return urls.map(() => []);
    }
    const sessionFile = sessionRes.sessionFile;

    // 2. Process concurrently with limit and retry
    log(`Starting parallel scrape for ${urls.length} URLs with Pincode: ${pincode}`, 'INFO');

    try {
        const globalDeliveryTime = "N/A";
        const CONCURRENCY_LIMIT = 2; // Reduced from 4 to prevent browser crashes
        const results = new Array(urls.length);
        const queue = urls.map((url, index) => ({ url, index }));

        log(`Processing ${urls.length} URLs with concurrency ${CONCURRENCY_LIMIT}...`, 'INFO');

        const workers = Array(Math.min(urls.length, CONCURRENCY_LIMIT)).fill().map(async () => {
            let workerBrowser = null;

            const ensureBrowser = async () => {
                if (!workerBrowser || !workerBrowser.isConnected()) {
                    if (workerBrowser) {
                        try { await workerBrowser.close(); } catch (e) {}
                    }
                    workerBrowser = await chromium.launch({
                        headless: true,
                        executablePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-gpu',
                            '--disable-blink-features=AutomationControlled',
                            '--disable-web-security',
                            '--disable-features=IsolateOrigins,site-per-process,InProductHelp',
                            '--disable-site-isolation-trials',
                            '--disable-extensions',
                            '--disable-background-networking',
                            '--disable-background-timer-throttling',
                            '--disable-client-side-phishing-detection',
                            '--disable-sync',
                            '--metrics-recording-only',
                            '--no-first-run',
                            '--no-default-browser-check'
                        ]
                    });
                    workerBrowser.on('disconnected', () => {
                        log('DEBUG: Worker browser disconnected!', 'WARN');
                    });
                }
                return workerBrowser;
            };

            while (queue.length > 0) {
                const { url, index } = queue.shift();
                let attempts = 0;
                let success = false;
                let products = [];
                const maxAttempts = 2;

                while (attempts < maxAttempts && !success) {
                    attempts++;
                    try {
                        // Small staggered delay
                        await new Promise(r => setTimeout(r, index * 1000));

                        const currentBrowser = await ensureBrowser();

                        const context = await currentBrowser.newContext({
                            storageState: sessionFile,
                            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                        });
                        await context.addInitScript(() => {
                            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                        });

                        products = await scrapeUrlInContext(context, url, pincode);

                        if (products && products.length > 0) {
                            success = true;
                            products.forEach(p => p.deliveryTime = globalDeliveryTime);
                        } else {
                            log(`[${url}] Attempt ${attempts} returned 0 products.`, 'WARN');
                            if (attempts < maxAttempts) {
                                log('Attempting location fix during retry...', 'INFO');
                                const fixPage = await context.newPage();
                                const fixed = await ensureLocation(fixPage, pincode);
                                if (fixed) {
                                    log('Location fix in worker successful. Saving session...', 'SUCCESS');
                                    await context.storageState({ path: sessionFile });
                                }
                                await fixPage.close();
                            }
                        }
                        await context.close();
                    } catch (e) {
                        log(`[${url}] Attempt ${attempts} failed: ${e.message}`, 'ERROR');
                        // Force browser recreation on next attempt to recover from fatal hangs/crashes
                        if (workerBrowser) {
                            try { await workerBrowser.close(); } catch (err) {}
                            workerBrowser = null;
                        }
                    }
                }

                // Add categoryUrl (safeguard)
                if (products) products.forEach(p => {
                    p.categoryUrl = url;
                    if (!p.deliveryTime) p.deliveryTime = globalDeliveryTime;
                });

                results[index] = products || [];
            }

            // Cleanup worker browser
            if (workerBrowser) {
                try { await workerBrowser.close(); } catch (e) {}
            }
        });

        await Promise.all(workers);
        return results;

    } catch (e) {
        log(`Fatal error in scrapeMultiple: ${e.message}`, 'ERROR');
        throw e;
    }
}

/**
 * Fallback to ensure location is set if strict product check fails
 */
async function ensureLocation(page, pincode) {
    log(`Ensuring location is set to ${pincode}...`, 'INFO');
    // Try a simpler URL first if possible, but keeping the known working one for now
    const TARGET_URL = 'https://www.flipkart.com/rv/checkout/changeShippingAddress/add?marketplace=HYPERLOCAL&source=entry&originalUrl=%2Fflipkart-minutes-store%3Fmarketplace%3DHYPERLOCAL&hideAddressForm=true&isMap=true&addressBSTouchpoint=ENTER_LOCATION_MANUALLY';

    try {
        const originalUrl = page.url();
        log(`Navigating to location setup page...`, 'INFO');
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);

        // Try multiple selectors for the input
        const searchInput = page.locator('input#search, input[placeholder*="pincode"], input[placeholder*="location"]');
        if (await searchInput.first().isVisible({ timeout: 10000 })) {
            log('Found search input, typing pincode...', 'INFO');
            await searchInput.first().click(); // ensure focus
            await searchInput.first().clear();
            await page.waitForTimeout(500);
            await searchInput.first().pressSequentially(pincode, { delay: 200 }); // slower typing
            await page.waitForTimeout(1500);

            log('Waiting for suggestions...', 'INFO');
            const suggestionItem = page.locator('li._2APc3k, div._2APc3k, .suggestion-item'); // broader selector
            await suggestionItem.first().waitFor({ state: 'visible', timeout: 8000 });

            log(`Found ${await suggestionItem.count()} suggestions. Selecting best match...`, 'INFO');
            const correctSuggestion = suggestionItem.filter({ hasText: pincode }).first();
            if (await correctSuggestion.isVisible()) {
                log('Clicking exact match...', 'INFO');
                await correctSuggestion.click();
            } else {
                log('Exact match not found, clicking first/second option...', 'WARN');
                if (await suggestionItem.count() > 1) await suggestionItem.nth(1).click();
                else await suggestionItem.first().click();
            }
            await page.waitForTimeout(2000);

            // Check for Serviceability Error (Try again / Not available)
            const unserviceableMsg = page.getByText('Not serviceable', { exact: false }).first();
            const tryAgainBtn = page.getByRole('button', { name: /Try Again|Retry/i }).first();

            if (await unserviceableMsg.isVisible() || await tryAgainBtn.isVisible()) {
                log(`Location ${pincode} appears to be UNSERVICEABLE. Aborting.`, 'ERROR');
                return false;
            }

            log('Checking for Confirm button...', 'INFO');
            const confirmBtn = page.getByRole('button', { name: /Confirm|Save|Proceed/i }).first();
            if (await confirmBtn.isVisible({ timeout: 5000 })) {
                log('Clicking Confirm button...', 'INFO');
                await confirmBtn.click();
            } else {
                const textBtn = page.getByText('Confirm', { exact: false });
                if (await textBtn.count() > 0) {
                    log('Clicking Confirm text button...', 'INFO');
                    await textBtn.first().click();
                } else {
                    log('No explicit confirm button found (maybe auto-submitted?)', 'WARN');
                }
            }
            await page.waitForTimeout(4000); // reduced wait

            log(`Navigating back to ${originalUrl}`, 'INFO');
            await page.goto(originalUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            return true;
        } else {
            log('Search input NOT visible on location page.', 'WARN');
        }
        return false;
    } catch (e) {
        log(`Error ensuring location: ${e.message}`, 'ERROR');
        try { await page.goto(originalUrl); } catch (err) { }
        return false;
    }
}

/**
 * Extraction Logic (In-Memory)
 */
function extractData(pages, domIds, unavailableItems = []) {
    const productMap = new Map();
    const seenIds = new Set();
    const domIdSet = new Set(domIds);

    // Helper functions (Same as before, but scoped inside)
    function extractFromContext(ctx) {
        const id = ctx.productId;
        const product = extractProductData(ctx, id);
        if (product) productMap.set(id, product);
    }

    function extractFromProduct(rawProduct) {
        const productInfo = rawProduct.productInfo;
        if (!productInfo) return;
        const value = productInfo.value;
        if (!value) return;

        // Main
        if (value.id) {
            const product = extractProductData(value, value.id);
            if (product && !productMap.has(value.id)) {
                productMap.set(value.id, product);
                seenIds.add(value.id);
            }
        }
        // Variants
        if (value.productSwatch && value.productSwatch.products) {
            Object.keys(value.productSwatch.products).forEach(vId => {
                const vData = value.productSwatch.products[vId];
                const cleanId = vData.id || vId;
                const vProd = extractProductData(vData, cleanId);
                if (vProd && !productMap.has(cleanId)) {
                    productMap.set(cleanId, vProd);
                    seenIds.add(cleanId);
                }
            });
        }
    }

    function extractFromComponent(comp) {
        const value = comp.value;
        if (!value) return;
        if (value.id) {
            const product = extractProductData(value, value.id);
            if (product && !productMap.has(value.id)) {
                productMap.set(value.id, product);
                seenIds.add(value.id);
            }
        }
    }

    // Process Pages
    pages.forEach(page => {
        if (page.RESPONSE && page.RESPONSE.pageData && page.RESPONSE.pageData.pageContext) {
            const ctx = page.RESPONSE.pageData.pageContext;
            if (ctx.productId) extractFromContext(ctx);
        }
        const slots = page.RESPONSE?.slots || [];
        slots.forEach(slot => {
            const widget = slot.widget;
            if (widget && widget.data) {
                if (widget.data.products) {
                    widget.data.products.forEach(p => extractFromProduct(p));
                }
                if (widget.data.renderableComponents) {
                    widget.data.renderableComponents.forEach(c => extractFromComponent(c));
                }
            }
        });
    });

    // Reconstruct Order
    let allProducts = [];
    const processedIds = new Set();

    // 1. Follow DOM Order
    domIds.forEach((id, index) => {
        if (productMap.has(id)) {
            const prod = productMap.get(id);
            prod.ranking = index + 1;
            allProducts.push(prod);
            processedIds.add(id);
        }
    });

    // 2. Append Orphans
    let orphans = [];
    for (const [id, prod] of productMap) {
        if (!processedIds.has(id)) {
            prod.ranking = allProducts.length + orphans.length + 1;
            orphans.push(prod);
        }
    }

    // 3. Append Unavailable Items (Dedup check)
    // Map existing products for quick lookup to avoid dupes if API actually HAD them
    const existingIds = new Set(allProducts.concat(orphans).map(p => p.productId));

    unavailableItems.forEach((item, idx) => {
        if (!existingIds.has(item.productId)) {
            item.ranking = allProducts.length + orphans.length + idx + 1;
            orphans.push(item);
        }
    });

    return allProducts.concat(orphans);
}

function extractProductData(data, id) {
    if (!id) return null;

    let imageUrl = '';
    if (data.media && data.media.images && data.media.images.length > 0) {
        imageUrl = data.media.images[0].url;
    } else if (data.imageUrl) {
        imageUrl = data.imageUrl;
    }

    if (imageUrl) {
        imageUrl = imageUrl.replace(/{@width}/g, '400')
            .replace(/{@height}/g, '400')
            .replace('{@quality}', '70');
    }

    const pricing = data.pricing || {};
    const finalPrice = pricing.finalPrice?.value;
    const mrpObj = pricing.prices?.find(p => p.priceType === 'MRP');
    const mrp = mrpObj ? mrpObj.value : finalPrice;
    const discount = pricing.totalDiscount || 0;

    const titles = data.titles || {};
    const title = titles.title || data.title;
    const subtitle = titles.subtitle || data.subTitle;
    const brand = data.productBrand || data.brand;

    // Reject products whose name resolves to a plain number — this means the API
    // returned incomplete data and something like a discount % was mistaken for a title.
    if (!title || /^\d+$/.test(String(title).trim())) {
        return null;
    }

    let prodUrl = '/p/' + id;
    if (data.baseUrl) prodUrl = data.baseUrl;
    else if (data.smartUrl) prodUrl = data.smartUrl.replace('https://dl.flipkart.com/dl', '');

    if (!prodUrl.startsWith('http') && !prodUrl.startsWith('/')) prodUrl = '/' + prodUrl;
    if (!prodUrl.startsWith('http')) prodUrl = 'https://www.flipkart.com' + prodUrl;

    // Extract Quantity intelligently
    const quantityRegex = /(\d+(?:\.\d+)?\s*(?:g|kg|ml|l|pc|pcs|pack|units?|gms?)\b)/i;
    let extractedQty = '';
    let subT = subtitle || '';

    // 1. Try regex on subtitle
    let qMatch = (subT || '').match(quantityRegex);
    if (qMatch) {
        extractedQty = qMatch[0];
    } else {
        // 2. Try regex on title
        qMatch = (title || '').match(quantityRegex);
        if (qMatch) {
            extractedQty = qMatch[0];
        } else {
            // 3. Fallback: Use subtitle if it's NOT just text (likely a color)
            // If subtitle starts with a number, assume it's relevant
            if (subT && /^\d/.test(subT)) {
                extractedQty = subT;
            }
        }
    }

    // Attempt to extract category (vertical)
    let extractedCategory = 'N/A';
    // Check common locations for category in Flipkart data
    if (data.analyticsData) {
        extractedCategory = data.analyticsData.category || data.analyticsData.vertical || 'N/A';
    } else if (data.tracking) {
        extractedCategory = data.tracking.category || data.tracking.vertical || 'N/A';
    }

    // NOTE: offerTags (Bank Offer, Special Price, etc.) are regular discounts, NOT ads
    // isAd should only be true for actual sponsored/promotional products
    // Flipkart Hyperlocal API doesn't have a specific sponsored indicator, so default to false

    return {
        productId: id,
        productName: title,
        productImage: imageUrl,
        productWeight: subtitle || "N/A",
        quantity: subtitle || "N/A",
        deliveryTime: "N/A",
        isAd: false,
        rating: data.rating?.average || 0,
        currentPrice: finalPrice,
        originalPrice: mrp,
        discountPercentage: discount,
        inStock: data.availability?.displayState === 'IN_STOCK',
        productUrl: prodUrl,
        platform: "flipkart_minutes",
        categoryName: extractedCategory // Return extracted category
    };
}


module.exports = { scrape, scrapeMultiple, setupSession, scrapeUrlInContext, ensureLocation };
