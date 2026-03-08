import { Actor } from 'apify';
import { Dataset, log } from 'crawlee';
import { chromium } from 'playwright';

// Initialize Actor
await Actor.init();

// ==================== INPUT CONFIGURATION ====================
const input = await Actor.getInput() ?? {};
const {
    pincode = '411001',
    categories = [],           // NEW: Array of {name, url} objects
    searchQueries = [],        // Deprecated: kept for backward compatibility
    searchUrls = [],           // Deprecated: kept for backward compatibility
    maxProductsPerSearch = 100,
    maxRequestRetries = 3,
    navigationTimeout = 60000,
    headless = true,
    proxyConfiguration = { useApifyProxy: false },
    proxyUrl = null,
    scrollCount = null, // null = scroll until no new products
} = input;

// ==================== BACKWARD COMPATIBILITY ====================
// Convert old format (searchQueries, searchUrls) to new format (categories)
const categoriesToScrape = categories.length > 0
    ? categories
    : [
        ...searchQueries.map(q => ({
            name: `Search: ${q}`,
            url: `https://www.zepto.com/search?query=${encodeURIComponent(q)}`
        })),
        ...searchUrls.map((url, i) => ({
            name: `Direct URL ${i + 1}`,
            url
        }))
    ];

if (categoriesToScrape.length === 0) {
    log.error('❌ No categories, search queries, or URLs provided!');
    await Actor.exit();
}

// ==================== CONSTANTS & SELECTORS ====================
const SELECTORS = {
    // Location / Pincode
    locationButton: [
        'button[aria-label="Select Location"]',
        'button.__4y7HY',
        'div.a0Ppr button'
    ],
    locationModal: 'div[data-testid="address-modal"]',
    searchInput: 'div[data-testid="address-search-input"] input[type="text"]',
    searchResultItem: 'div[data-testid="address-search-item"]',

    // Products
    productLink: 'a.B4vNQ',
    productCard: 'div.cTH4Df',

    // Product Details (Inside card)
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

    // Search / Listing
    searchResultsContainer: 'div.grid',
};

// ==================== HELPER FUNCTIONS ====================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sets the pincode location on the page.
 */
async function setPincode(page, targetPincode) {
    try {
        log.info(`🎯 Setting location to pincode: ${targetPincode}`);

        await page.waitForLoadState('domcontentloaded');
        await delay(1500);

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
            log.warning('⚠️ Location button not found');
            return false;
        }

        await delay(1000);

        try {
            await page.waitForSelector(SELECTORS.locationModal, { timeout: 5000 });
        } catch (e) {
            log.warning('⚠️ Location modal not detected');
            return false;
        }

        await delay(800);

        const searchInput = page.locator(SELECTORS.searchInput).first();

        if (await searchInput.count() === 0) {
            log.error('❌ Search input not found in modal');
            return false;
        }

        await searchInput.focus();
        await delay(200);
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await delay(200);
        await searchInput.type(targetPincode, { delay: 80 });

        await delay(1500);

        try {
            await page.waitForSelector(SELECTORS.searchResultItem, { timeout: 5000 });
        } catch (e) {
            log.error('❌ No address results appeared');
            return false;
        }

        const firstAddress = page.locator(SELECTORS.searchResultItem).first();

        if (await firstAddress.count() > 0) {
            await firstAddress.click({ force: true });
            await delay(1500);

            const modalStillOpen = await page.locator(SELECTORS.locationModal).count();
            if (modalStillOpen === 0) {
                log.info('✅ Location set successfully');
                return true;
            }
        }

        return false;
    } catch (error) {
        log.error(`❌ Error setting pincode: ${error.message}`);
        return false;
    }
}

/**
 * Auto-scrolls the page to load dynamic content.
 * If maxScrolls is null, scrolls until no new content appears.
 */
async function autoScroll(page, maxScrolls = null) {
    try {
        const isInfiniteScroll = maxScrolls === null;
        log.info(isInfiniteScroll
            ? '🔄 Auto-scrolling until no more products...'
            : `🔄 Auto-scrolling up to ${maxScrolls} times...`);

        let previousHeight = await page.evaluate('document.body.scrollHeight');
        let noChangeCount = 0;
        let scrollIteration = 0;

        while (true) {
            scrollIteration++;

            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await delay(2000); // Wait for content to load

            const newHeight = await page.evaluate('document.body.scrollHeight');

            if (newHeight === previousHeight) {
                noChangeCount++;
                // Try scrolling up a bit and back down to trigger observers
                if (noChangeCount === 1) {
                    await page.evaluate(() => window.scrollBy(0, -500));
                    await delay(500);
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await delay(1000);
                }

                if (noChangeCount >= 3) {
                    log.info(`✓ Reached bottom or no new content after ${scrollIteration} scrolls`);
                    break;
                }
            } else {
                noChangeCount = 0;
                previousHeight = newHeight;
                log.info(`  - Scroll ${scrollIteration}: Content loaded (Height: ${newHeight})`);
            }

            // Break if max scrolls reached (when not infinite scroll)
            if (!isInfiniteScroll && scrollIteration >= maxScrolls) {
                log.info(`✓ Reached max scroll count: ${maxScrolls}`);
                break;
            }
        }

        // Scroll back to top to ensure all elements are rendered/hydrated if needed
        await page.evaluate(() => window.scrollTo(0, 0));
        await delay(500);

    } catch (error) {
        log.warning(`Auto-scroll failed: ${error.message}`);
    }
}

/**
 * Waits for search results to appear on the page.
 */
async function waitForSearchResults(page) {
    try {
        try {
            await page.waitForSelector(SELECTORS.productLink, { timeout: 20000 });
            const count = await page.locator(SELECTORS.productLink).count();
            if (count > 0) {
                await delay(500);
                return true;
            }
        } catch (e) {
            // Fallback check
            try {
                const bodyText = await page.evaluate(() => document.body.innerText || '');
                if (bodyText.includes('₹') || /\bADD\b/i.test(bodyText)) {
                    return true;
                }
            } catch (err) {
                // Ignore
            }
        }

        log.warning('No search results found');
        return false;
    } catch (error) {
        log.warning(`Error in waitForSearchResults: ${error.message}`);
        return false;
    }
}

/**
 * Extracts product data from a category page.
 */
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

                // Name extraction
                let productName = null;
                for (const sel of selectors.productName) {
                    const el = card.querySelector(sel);
                    if (el && textOrNull(el)) {
                        productName = textOrNull(el);
                        break;
                    }
                }
                if (!productName) {
                    productName = link.getAttribute('title') ||
                        link.querySelector('img')?.alt || null;
                }

                // Image
                const imgEl = card.querySelector(selectors.productImage) || link.querySelector('img');
                const productImage = imgEl?.src || imgEl?.getAttribute('data-src') || null;

                // Price
                let currentPrice = null;
                const spans = Array.from(card.querySelectorAll(selectors.priceSpan));
                for (const s of spans) {
                    const match = (s.textContent || '').match(/₹\s*(\d+(?:,\d+)*(?:\.\d+)?)/);
                    if (match) {
                        currentPrice = parseFloat(match[1].replace(/,/g, ''));
                        break;
                    }
                }

                // Original price
                let originalPrice = null;
                const origSpan = spans.find(s =>
                    /(MRP|strike|original|cx3iWL)/i.test(s.className || '')
                );
                if (origSpan) {
                    const match = (origSpan.textContent || '').match(/₹\s*(\d+(?:,\d+)*(?:\.\d+)?)/);
                    if (match) originalPrice = parseFloat(match[1].replace(/,/g, ''));
                }

                // Discount
                let discountPercentage = null;
                if (currentPrice && originalPrice && originalPrice > currentPrice) {
                    discountPercentage = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
                }

                // Pack size -> Quantity
                const packSizeEl = card.querySelector(selectors.packSize);
                const quantity = packSizeEl ? textOrNull(packSizeEl) : null;

                // Rating
                let rating = null;
                const ratingEl = card.querySelector(selectors.rating);
                if (ratingEl) {
                    const match = (ratingEl.textContent || '').match(/(\d+\.\d+)/);
                    if (match) rating = parseFloat(match[1]);
                }

                // isAd
                const isAd = !!card.querySelector(selectors.sponsorTag);

                // Delivery Time
                const etaEl = card.querySelector(selectors.eta);
                const deliveryTime = etaEl ? textOrNull(etaEl) : null;

                const isOutOfStock = card.getAttribute?.('data-is-out-of-stock') === 'true';

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
                // console.error(`Error processing product ${index}:`, err);
            }
        });

        return { products: productCards };
    }, SELECTORS);
}

/**
 * Scrapes a single category in its own tab.
 */
async function scrapeCategory(context, category, config) {
    const page = await context.newPage();

    try {
        log.info(`🔍 Opening category: ${category.name}`);
        await page.goto(category.url, {
            waitUntil: 'domcontentloaded',
            timeout: config.navigationTimeout
        });
        await delay(2000);

        // Close popups
        try {
            const closeBtn = page.locator('button[aria-label*="Close"]').first();
            if (await closeBtn.count() > 0) {
                await closeBtn.click({ timeout: 1500 });
            }
        } catch (e) {
            // No popup
        }

        // Wait for results
        const resultsFound = await waitForSearchResults(page);
        if (!resultsFound) {
            log.warning(`⚠️ No results for: ${category.name}`);
            return [];
        }

        // Scroll to load all products
        await autoScroll(page, config.scrollCount);

        // Extract products
        const { products } = await extractProducts(page);

        // Add category metadata
        const enrichedProducts = products
            .slice(0, config.maxProductsPerSearch)
            .map(p => ({
                ...p,
                categoryName: category.name,
                categoryUrl: category.url,
                platform: 'Zepto',
                pincode: config.pincode,
                searchQuery: category.name, // For backward compatibility
                searchUrl: category.url      // For backward compatibility
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

// ==================== MAIN EXECUTION ====================

log.info(`🚀 Starting Zepto Scraper with ${categoriesToScrape.length} categories`);
log.info(`📍 Pincode: ${pincode}`);
log.info(`📜 Scroll mode: ${scrollCount === null ? 'Infinite (until no new products)' : `Fixed (${scrollCount} scrolls)`}`);

// Setup proxy configuration
const customProxyUrl = (!proxyConfiguration?.useApifyProxy && (typeof proxyUrl === 'string' && proxyUrl.trim() !== ''))
    ? proxyUrl.trim()
    : null;

// Launch browser
const browser = await chromium.launch({
    headless,
    args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-extensions',
    ],
    ...(customProxyUrl ? { proxy: { server: customProxyUrl } } : {}),
    ignoreHTTPSErrors: true,
});

try {
    // Create browser context with anti-detection
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata',
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.google.com/',
            'Upgrade-Insecure-Requests': '1',
        }
    });

    // STEP 1: Set pincode using first category URL
    log.info('📍 Step 1: Setting up pincode...');
    const firstCategory = categoriesToScrape[0];
    const setupPage = await context.newPage();

    await setupPage.goto(firstCategory.url, {
        waitUntil: 'domcontentloaded',
        timeout: navigationTimeout
    });

    const pincodeSet = await setPincode(setupPage, pincode);

    if (!pincodeSet) {
        log.error('❌ Failed to set pincode. Aborting scraping.');
        await setupPage.close();
        await browser.close();
        await Actor.exit();
    }

    // Reload to ensure pincode takes effect
    await setupPage.reload({ waitUntil: 'domcontentloaded' });
    await delay(2000);

    log.info('✅ Pincode set successfully. Browser context is ready.');

    // STEP 2: Scrape all categories in parallel
    log.info(`📊 Step 2: Scraping ${categoriesToScrape.length} categories in parallel...`);

    const scrapingConfig = {
        pincode,
        scrollCount,
        maxProductsPerSearch,
        navigationTimeout
    };

    // Scrape all categories concurrently
    const scrapingPromises = categoriesToScrape.map(category =>
        scrapeCategory(context, category, scrapingConfig)
    );

    const allResults = await Promise.all(scrapingPromises);

    // Flatten and save all products
    const allProducts = allResults.flat();

    if (allProducts.length > 0) {
        await Dataset.pushData(allProducts);
        log.info(`✅ SCRAPING COMPLETED!`);
        log.info(`📦 Total products scraped: ${allProducts.length}`);
        log.info(`📂 Categories processed: ${categoriesToScrape.length}`);

        // Summary per category
        categoriesToScrape.forEach((cat, i) => {
            const count = allResults[i].length;
            log.info(`   - ${cat.name}: ${count} products`);
        });
    } else {
        log.warning('⚠️ No products were scraped from any category');
    }

} catch (error) {
    log.error(`❌ Fatal error: ${error.message}`);
    throw error;
} finally {
    await browser.close();
    log.info('🔒 Browser closed');
}

// Exit Actor
await Actor.exit();
