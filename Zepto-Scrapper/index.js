import { Actor } from 'apify';
import { Dataset, log } from 'crawlee';
import { chromium } from 'playwright';
import fs from 'fs';
import { createMacChromeContext } from './browserFingerprint.js';

// Initialize Actor
await Actor.init();

// Load storage states if available
let STORAGE_MAP = {};
try {
    const storageData = fs.readFileSync('pincodes_storage_map.json', 'utf8');
    STORAGE_MAP = JSON.parse(storageData);
    log.info(`✅ Loaded storage states for pincodes: ${Object.keys(STORAGE_MAP).join(', ')}`);
} catch (e) {
    log.warning('⚠️ Could not load pincodes_storage_map.json. Storage optimization will be disabled.');
}

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
        log.info(`🎯 Setting location to pincode: ${targetPincode}`);

        await page.waitForLoadState('domcontentloaded');
        await delay(1500);

        // Click location button
        let clicked = false;
        for (const selector of SELECTORS.locationButton) {
            try {
                const button = page.locator(selector).first();
                if (await button.count() > 0) {
                    await button.click({ timeout: 3000 });
                    log.info(`✓ Clicked location button: ${selector}`);
                    clicked = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!clicked) {
            log.error('❌ Could not find location button');
            return false;
        }
        await delay(2000);

        // Wait for modal detection
        try {
            await page.waitForSelector(SELECTORS.locationModal, { timeout: 10000 });
            log.info('✓ Location modal opened');
        } catch (e) {
            log.error('❌ Location modal did not appear (timeout)');
            return false;
        }

        await delay(1500);

        const searchInput = page.locator(SELECTORS.searchInput).first();
        if (await searchInput.count() === 0) {
            log.error('❌ Search input not found');
            return false;
        }

        await searchInput.click();
        await delay(300);
        await searchInput.fill('');
        await delay(200);
        await searchInput.fill(targetPincode);
        log.info(`✓ Typed pincode: ${targetPincode}`);
        await delay(2500);

        try {
            await page.waitForSelector(SELECTORS.searchResultItem, { timeout: 8000 });
            log.info('✓ Address results appeared');
        } catch (e) {
            log.error('❌ No address results appeared');
            return false;
        }

        await delay(500);

        const addressResults = page.locator(SELECTORS.searchResultItem);
        const count = await addressResults.count();
        log.info(`✓ Found ${count} address results`);

        if (count > 0) {
            const targetIndex = 0;
            const targetAddress = addressResults.nth(targetIndex);
            const clickableDiv = targetAddress.locator('div.cgG1vl').first();

            log.info(`📍 Attempting to select address #${targetIndex + 1}`);
            let clicked = false;

            try {
                await clickableDiv.click({ timeout: 3000 });
                log.info('✓ Clicked address (inner div)');
                clicked = true;
            } catch (e) {
                log.info('⚠️ Inner div click failed, trying outer container');
                try {
                    await targetAddress.click({ force: true, timeout: 3000 });
                    log.info('✓ Clicked address (outer container)');
                    clicked = true;
                } catch (e2) {
                    log.info('⚠️ Container click failed, trying JS click');
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
                    log.info('✓ Clicked address (JS)');
                    clicked = true;
                }
            }

            if (!clicked) {
                log.error('❌ All click methods failed');
                return false;
            }

            await delay(3000);

            const confirmBtn = page.locator('button:has-text("Confirm Location"), button:has-text("Confirm & Proceed")').first();
            if (await confirmBtn.isVisible()) {
                log.info('ℹ️ Confirm Location button appeared, clicking it...');
                await confirmBtn.click();
                await delay(2000);
            }

            const modalStillOpen = await page.locator(SELECTORS.locationModal).count();
            if (modalStillOpen === 0) {
                log.info('✅ Location set successfully - modal closed');
                return true;
            } else {
                log.error('❌ Modal still open after clicking address');
                log.info('⚠️ Attempting to close modal with Escape...');
                await page.keyboard.press('Escape');
                await delay(1000);

                const addressEl = page.locator('[data-testid="user-address"]');
                const addressText = await addressEl.textContent().catch(() => '');

                if (addressText && addressText.length > 5 && !addressText.toLowerCase().includes('select')) {
                    log.info('✅ Address text appears valid, treating as success');
                    return true;
                }

                if (await page.locator(SELECTORS.locationModal).count() === 0) {
                    log.info('✅ Modal closed after Escape, assuming success');
                    return true;
                }
                return false;
            }
        } else {
            log.error('❌ No address results found to click');
            return false;
        }
    } catch (error) {
        log.error(`❌ Error setting pincode: ${error.message}`);
        return false;
    }
}

async function setPincodeWithRetry(page, targetPincode, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        log.info(`\n🔄 Pincode setting attempt ${attempt}/${maxRetries}`);
        const success = await setPincode(page, targetPincode);
        if (success) {
            log.info(`✅ Pincode set successfully on attempt ${attempt}`);
            return true;
        }
        if (attempt < maxRetries) {
            const waitTime = 2000 * attempt;
            log.info(`⏳ Waiting ${waitTime}ms before retry...`);
            await delay(waitTime);
            log.info('🔄 Reloading page for retry...');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await delay(2000);
        }
    }
    log.error(`❌ Failed to set pincode after ${maxRetries} attempts`);
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
            await delay(2000);

            const newHeight = await page.evaluate('document.body.scrollHeight');

            if (newHeight === previousHeight) {
                noChangeCount++;
                if (noChangeCount === 1) {
                    await page.evaluate(() => window.scrollBy(0, -500));
                    await delay(500);
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await delay(1000);
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
        log.warning(`Auto-scroll failed: ${error.message}`);
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
                    const match = (ratingEl.textContent || '').match(/(\d+\.\d+)/);
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
            } catch (err) { }
        });

        return { products: productCards };
    }, SELECTORS);
}

async function scrapeCategory(context, category, config) {
    const page = await context.newPage();

    try {
        const jitter = Math.floor(Math.random() * 3000) + 1000;
        await delay(jitter);

        log.info(`🔍 Opening category: ${category.name} (delayed ${jitter}ms)`);

        try {
            const response = await page.goto(category.url, {
                waitUntil: 'domcontentloaded',
                timeout: config.navigationTimeout
            });

            if (response && !response.ok()) {
                log.warning(`⚠️ Warning: ${category.name} returned status ${response.status()}`);
            }
        } catch (navError) {
            log.error(`❌ Navigation error for ${category.name}: ${navError.message}`);
            throw navError;
        }

        await delay(2000);

        try {
            const closeBtn = page.locator('button[aria-label*="Close"]').first();
            if (await closeBtn.count() > 0) {
                await closeBtn.click({ timeout: 1500 });
            }
        } catch (e) { }

        const resultsFound = await waitForSearchResults(page);
        if (!resultsFound) {
            log.warning(`⚠️ No results for: ${category.name}`);
            return [];
        }

        await autoScroll(page, config.scrollCount);
        const { products } = await extractProducts(page);

        const enrichedProducts = products
            .slice(0, config.maxProductsPerSearch)
            .map(p => ({
                ...p,
                categoryName: category.name,
                categoryUrl: category.url,
                platform: 'Zepto',
                pincode: config.pincode
            }));

        log.info(`✅ Scraped ${enrichedProducts.length} products from: ${category.name}`);
        return enrichedProducts;

    } catch (error) {
        log.error(`❌ Error scraping ${category.name}: ${error.message}`);
        return [];
    } finally {
        await page.close();
    }
}

async function scrapeCategoryWithRetry(context, category, config, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const results = await scrapeCategory(context, category, config);

        if (results && results.length > 0) {
            if (attempt > 1) log.info(`✅ Category '${category.name}' scraped successfully on attempt ${attempt}`);
            return results;
        }

        if (attempt <= maxRetries) {
            log.warning(`⚠️ Attempt ${attempt} failed for '${category.name}'. Retrying...`);
            await delay(2000);
        } else {
            log.error(`❌ Failed to scrape '${category.name}' after ${maxRetries + 1} attempts`);
        }
    }
    return [];
}


// ==================== ACTOR MAIN ====================

try {
    const input = await Actor.getInput() ?? {};
    const {
        pincode = '411001',
        categories = [],
        scrollCount = null,
        maxProductsPerSearch = 100,
        maxConcurrentTabs = 8,
        headless = true,
        navigationTimeout = 60000,
        proxyUrl = null
    } = input;

    if (!categories || categories.length === 0) {
        log.error('No categories provided. Please provide an array of categories with {name, url} objects');
        await Actor.exit();
    }

    log.info(`🚀 Starting Zepto Scraper Actor for ${categories.length} categories`);
    log.info(`📍 Pincode: ${pincode}`);

    // Launch browser
    const launchOptions = {
        headless,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
        ],
    };

    if (proxyUrl) {
        try {
            const parsedProxy = new URL(proxyUrl);
            launchOptions.proxy = {
                server: `${parsedProxy.protocol}//${parsedProxy.host}`,
                username: parsedProxy.username,
                password: parsedProxy.password
            };
            log.info('🔒 Proxy configured from input URL');
        } catch (e) {
            log.error('❌ Invalid proxy URL format provided in input');
        }
    }

    const browser = await chromium.launch(launchOptions);

    let storageState = undefined;
    let shouldUseStoredState = false;

    if (STORAGE_MAP[pincode]) {
        log.info(`⚡ Found stored state for pincode ${pincode}, skipping manual location set.`);
        storageState = STORAGE_MAP[pincode];
        shouldUseStoredState = true;
    } else {
        log.info(`ℹ️ No stored state for pincode ${pincode}, will set manually.`);
    }

    const { context } = await createMacChromeContext(browser, {
        storageState: storageState,
        httpCredentials: proxyUrl ? {
            username: new URL(proxyUrl).username,
            password: new URL(proxyUrl).password,
        } : undefined
    });

    await context.route('**/*', (route) => {
        const request = route.request();
        const resourceType = request.resourceType();
        const blockedTypes = ['image', 'font', 'media', 'other'];
        if (blockedTypes.includes(resourceType)) return route.abort();
        return route.continue();
    });

    if (!shouldUseStoredState) {
        const setupPage = await context.newPage();
        await setupPage.goto('https://www.zepto.com/', {
            waitUntil: 'domcontentloaded',
            timeout: navigationTimeout
        });

        const pincodeSet = await setPincodeWithRetry(setupPage, pincode, 3);

        if (!pincodeSet) {
            log.error('❌ Failed to set pincode after 3 attempts. Aborting.');
            await setupPage.close();
            await browser.close();
            await Actor.exit();
        }

        await setupPage.reload({ waitUntil: 'domcontentloaded' });
        await delay(2000);
        log.info('✅ Pincode set successfully (Manual)');
        await setupPage.close();
    } else {
        log.info('✅ Used stored storage state for session.');
    }

    const scrapingConfig = { pincode, scrollCount, maxProductsPerSearch, navigationTimeout };
    const allResults = [];
    const totalBatches = Math.ceil(categories.length / maxConcurrentTabs);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * maxConcurrentTabs;
        const endIdx = Math.min(startIdx + maxConcurrentTabs, categories.length);
        const batch = categories.slice(startIdx, endIdx);

        log.info(`\n🔄 Batch ${batchIndex + 1}/${totalBatches} (${batch.length} categories)`);

        const batchPromises = batch.map(category =>
            scrapeCategoryWithRetry(context, category, scrapingConfig, 2)
        );

        const batchResults = await Promise.all(batchPromises);
        allResults.push(...batchResults);

        log.info(`✅ Batch ${batchIndex + 1}/${totalBatches} completed`);

        if (batchIndex < totalBatches - 1) {
            log.info('⏳ Waiting 5s before next batch to avoid rate limiting...');
            await delay(5000);
        }
    }

    await browser.close();

    const allProducts = allResults.flat();
    log.info(`\n✅ Scraping completed. Total products: ${allProducts.length}`);

    await Dataset.pushData(allProducts);

} catch (error) {
    log.error(`❌ Actor Fatal Error: ${error.message}`);
} finally {
    await Actor.exit();
}
