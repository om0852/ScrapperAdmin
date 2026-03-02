import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset, log } from 'crawlee';

// Initialize Actor
await Actor.init();

// ==================== INPUT CONFIGURATION ====================
const input = await Actor.getInput() ?? {};
const {
    pincode = '120001', // Default to Mumbai
    searchQueries = ['kurkure'],
    searchUrls = [],
    maxProductsPerSearch = 100,
    maxRequestRetries = 3,
    navigationTimeout = 60000,
    headless = false,
    proxyConfiguration = { useApifyProxy: false },
} = input;

// ==================== CONSTANTS & SELECTORS ====================
const SELECTORS = {
    // Location / Pincode
    locationPopup: 'div.alcohol-popup',
    locationCloseBtn: ['button#btn_location_close_icon', 'button.close-privacy', 'button.close-icon'],
    locationManualBtn: 'button#select_location_popup',

    headerPincodeBtn: ['button#btn_pin_code_delivery', 'button.header-main-pincode-address', 'span#delivery_city_pincode'],
    deliveryPopup: 'div#delivery_popup',
    enterPincodeBtn: 'button#btn_enter_pincode',
    pincodeInputWrapper: 'div#delivery_enter_pincode',
    pincodeInput: 'input#rel_pincode',
    applyPincodeBtn: 'button#btn_pincode_submit',
    locationSuccessMsg: 'div#delivery_pin_msg.field-success',
    closeDeliveryPopup: 'button#close_delivery_popup',

    // Products
    productItem: 'li.ais-InfiniteHits-item',
    productLink: 'a.plp-card-wrapper',
    productName: 'div.plp-card-details-name',
    productImage: 'img.lazyloaded, img.lazyautosizes',
    currentPrice: 'span.jm-heading-xxs',
    originalPrice: 'span.line-through',
    discountBadge: 'span.jm-badge',
    addToCartBtn: 'button.addtocartbtn',
    vegIcon: 'img[src*="icon-veg"]',

    // Search / Listing
    searchResultsContainer: 'ul.ais-InfiniteHits-list',
    noResults: 'div.no-results', // Hypothetical selector, adjust if known
};

// ==================== HELPER FUNCTIONS ====================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Close the initial location popup if it appears.
 */
async function closeLocationPopup(page, log) {
    try {
        const popup = page.locator(SELECTORS.locationPopup).first();
        if (await popup.count() === 0) return;

        log.info('🔔 Location popup detected. Attempting to close...');

        // Try close buttons with reduced timeout
        for (const selector of SELECTORS.locationCloseBtn) {
            const btn = page.locator(selector).first();
            if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
                await btn.click();
                log.info(`✓ Closed popup using ${selector}`);
                return;
            }
        }

        // Try manual select button as fallback
        const manualBtn = page.locator(SELECTORS.locationManualBtn).first();
        if (await manualBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await manualBtn.click();
            log.info('✓ Closed popup using "Select Location Manually"');
        }
    } catch (error) {
        log.warning(`⚠️ Failed to close location popup: ${error.message}`);
    }
}

/**
 * Set the pincode to ensure correct pricing and availability.
 */
async function setPincode(page, log, targetPincode) {
    log.info(`📍 Setting pincode to: ${targetPincode}`);

    try {
        // 1. Open Delivery Popup
        let opened = false;
        for (const selector of SELECTORS.headerPincodeBtn) {
            const btn = page.locator(selector).first();
            if (await btn.isVisible()) {
                await btn.click();
                opened = true;
                break;
            }
        }
        if (!opened) throw new Error('Could not find header location button');

        await page.waitForSelector(SELECTORS.deliveryPopup, { timeout: 5000 });

        // 2. Click "Enter Pincode" if needed (sometimes it shows saved addresses)
        const enterBtn = page.locator(SELECTORS.enterPincodeBtn).first();
        if (await enterBtn.isVisible()) {
            await enterBtn.click();
        }

        // 3. Enter Pincode
        await page.waitForSelector(SELECTORS.pincodeInput, { timeout: 5000 });
        const input = page.locator(SELECTORS.pincodeInput).first();
        await input.fill(targetPincode);

        // Trigger events to ensure validation logic runs
        await input.evaluate(e => {
            e.dispatchEvent(new Event('input', { bubbles: true }));
            e.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // 4. Apply
        const applyBtn = page.locator(SELECTORS.applyPincodeBtn).first();
        await applyBtn.waitFor({ state: 'visible' });

        // Check if disabled, sometimes needs a moment
        if (await applyBtn.isDisabled()) {
            await delay(300);
        }
        await applyBtn.click();

        // 5. Verify Success (reduced timeout)
        try {
            await page.waitForSelector(SELECTORS.locationSuccessMsg, { timeout: 3000 });
            log.info('✅ Pincode applied successfully.');
        } catch (e) {
            log.warning('⚠️ Success message not seen, but continuing...');
        }

        // 6. Close Popup (if it doesn't auto-close)
        if (await page.locator(SELECTORS.deliveryPopup).isVisible({ timeout: 1000 }).catch(() => false)) {
            const closeBtn = page.locator(SELECTORS.closeDeliveryPopup).first();
            if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) await closeBtn.click();
            else await page.keyboard.press('Escape');
        }

        // Wait for page to update with new location (reduced from 2000ms)
        await delay(500);

    } catch (error) {
        log.error(`❌ Failed to set pincode: ${error.message}`);
        // We continue even if this fails, as we might still get some data
    }
}

/**
 * Scroll a fixed number of times to load products - OPTIMIZED.
 */
async function autoScroll(page, log, iterations = 10) {
    log.info(`🔄 Auto-scrolling ${iterations} times...`);

    await page.evaluate(async (iterations) => {
        const distance = 800; // Increased distance per scroll
        const delay = 300; // Reduced from 1000ms to 300ms

        for (let i = 0; i < iterations; i++) {
            window.scrollBy(0, distance);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Scroll to bottom occasionally to trigger infinite scroll
            if (i % 4 === 0) {
                window.scrollTo(0, document.body.scrollHeight);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Final scroll to bottom to ensure all products loaded
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(resolve => setTimeout(resolve, 500));
    }, iterations);

    log.info('✓ Auto-scroll finished');
}

// ==================== CRAWLER SETUP ====================

const proxyConfig = proxyConfiguration?.useApifyProxy
    ? await Actor.createProxyConfiguration(proxyConfiguration)
    : undefined;

// Track if pincode has been set for this session
let pincodeSet = false;

const crawler = new PlaywrightCrawler({
    proxyConfiguration: proxyConfig,
    maxRequestRetries,
    navigationTimeoutSecs: navigationTimeout / 1000,
    headless,
    maxConcurrency: 2, // Allow parallel processing of multiple queries

    // Browser launch options
    launchContext: {
        launchOptions: {
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage',
            ],
        }
    },

    async requestHandler({ page, request, log }) {
        log.info(`Processing ${request.url}`);

        // Only handle location setup once per session
        if (!pincodeSet) {
            await closeLocationPopup(page, log);
            await setPincode(page, log, pincode);
            pincodeSet = true;

            // Wait for page to stabilize after location change
            await delay(800);
        }

        // Wait for results with reduced timeout
        try {
            await page.waitForSelector(SELECTORS.productItem, { timeout: 10000 });
        } catch (e) {
            log.warning('⚠️ No products found or timeout waiting for selector.');
            // Quick check for no results
            const noResultsVisible = await page.locator(SELECTORS.noResults).isVisible({ timeout: 1000 }).catch(() => false);
            if (noResultsVisible) {
                log.info('No results found for this query.');
                return;
            }
        }

        await autoScroll(page, log, 10);

        // Extract Data
        const products = await page.$$eval(SELECTORS.productItem, (items, { selectors, requestData }) => {
            return items.map(item => {
                try {
                    const linkEl = item.querySelector(selectors.productLink);
                    const nameEl = item.querySelector(selectors.productName);
                    const imgEl = item.querySelector(selectors.productImage);
                    const priceEl = item.querySelector(selectors.currentPrice);
                    const origPriceEl = item.querySelector(selectors.originalPrice);
                    const discountEl = item.querySelector(selectors.discountBadge);
                    const addBtn = item.querySelector(selectors.addToCartBtn);
                    const vegIcon = item.querySelector(selectors.vegIcon);

                    // Helper to clean price
                    const parsePrice = (txt) => {
                        if (!txt) return null;
                        const match = txt.match(/[\d,.]+/);
                        return match ? parseFloat(match[0].replace(/,/g, '')) : null;
                    };

                    const rawPrice = priceEl?.textContent?.trim();
                    const rawOrigPrice = origPriceEl?.textContent?.trim();
                    const currentPrice = parsePrice(rawPrice);
                    const originalPrice = parsePrice(rawOrigPrice) || currentPrice;

                    // Calculate discount
                    let discountPercentage = 0;
                    if (discountEl) {
                        const match = discountEl.textContent.trim().match(/(\d+)%/);
                        discountPercentage = match ? parseInt(match[1]) : 0;
                    } else if (originalPrice && currentPrice && originalPrice > currentPrice) {
                        discountPercentage = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
                    }

                    const productName = nameEl?.textContent?.trim() || linkEl?.getAttribute('title') || '';

                    // Extract weight from name
                    let productWeight = null;
                    const weightMatch = productName.match(/(\d+\s*(?:g|kg|ml|l|gm|pack|pcs|piece))/i);
                    if (weightMatch) {
                        productWeight = weightMatch[1];
                    }

                    // Try to get brand from GTM data if available
                    const gtmData = item.querySelector('.gtmEvents');
                    const brand = gtmData?.getAttribute('data-manu') || 'JioMart'; // Default or extract

                    return {
                        productId: linkEl?.getAttribute('data-objid') || '',
                        productName,
                        productImage: imgEl?.src || imgEl?.getAttribute('data-src') || '',
                        currentPrice,
                        originalPrice,
                        discountPercentage,
                        productWeight,
                        brand,
                        isVegetarian: !!vegIcon,
                        isOutOfStock: addBtn ? addBtn.hasAttribute('disabled') : false,
                        productUrl: linkEl ? linkEl.href : '',
                        url: linkEl ? linkEl.href : '',
                        scrapedAt: new Date().toISOString(),
                        searchQuery: requestData.query,
                        searchUrl: window.location.href,
                        platform: "JioMart",
                        pincode: requestData.pincode
                    };
                } catch (e) {
                    return null;
                }
            }).filter(p => p && p.productName && p.currentPrice); // Filter invalid items
        }, { selectors: SELECTORS, requestData: request.userData });

        log.info(`Found ${products.length} products.`);

        // Push to dataset
        await Dataset.pushData(products);
    },

    failedRequestHandler({ request, log }) {
        log.error(`Request ${request.url} failed too many times.`);
    },
});

// ==================== EXECUTION ====================

const startUrls = [
    ...searchQueries.map(query => ({
        url: `https://www.jiomart.com/search?q=${encodeURIComponent(query)}`,
        userData: {
            query,
            pincode
        }
    })),
    ...searchUrls.map(url => ({
        url,
        userData: {
            query: 'direct_url',
            pincode
        }
    }))
];

log.info(`Starting crawler for ${startUrls.length} queries...`);
await crawler.run(startUrls);
log.info('Crawler finished.');

// Exit Actor
await Actor.exit();
