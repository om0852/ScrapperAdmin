import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PINCODE = '400706';
const URLS_FILE = [
    "https://www.zepto.com/cn/fragrances-grooming/luxury-fragrances/cid/875671b0-ec18-42c7-9749-c2cf165509fa/scid/1edd780e-d291-4846-98d4-3193d769caaa",
    "https://www.zepto.com/cn/fragrances-grooming/perfumes/cid/875671b0-ec18-42c7-9749-c2cf165509fa/scid/a7129b9a-4466-4935-957f-f91eff2130b7",
    "https://www.zepto.com/cn/fragrances-grooming/deos-roll-ons/cid/875671b0-ec18-42c7-9749-c2cf165509fa/scid/7a424911-0459-44d5-a7bb-6ff7a8542579",
    "https://www.zepto.com/cn/fragrances-grooming/attar/cid/875671b0-ec18-42c7-9749-c2cf165509fa/scid/c4290703-015a-43a0-bf65-b04180be4a7b",
    "https://www.zepto.com/cn/fragrances-grooming/shaving-needs/cid/875671b0-ec18-42c7-9749-c2cf165509fa/scid/5e106a20-23e1-443a-ae1e-6aed199581a6",
    "https://www.zepto.com/cn/fragrances-grooming/body-mist/cid/875671b0-ec18-42c7-9749-c2cf165509fa/scid/11d1a58e-fc30-421a-a323-cf37549afefc",
    "https://www.zepto.com/cn/fragrances-grooming/hair-removal/cid/875671b0-ec18-42c7-9749-c2cf165509fa/scid/0d277dd3-84d4-4ff2-9b21-fa47902a13db",
    "https://www.zepto.com/cn/fragrances-grooming/mens-grooming/cid/875671b0-ec18-404c-9a51-ae8cdc9eb93d/scid/2e690ea0-ed16-404c-9a51-ae8cdc9eb93d",

    "https://www.zepto.com/cn/feminine-hygiene/hair-removal-for-women/cid/72066480-9851-4263-89b6-50dd7525edc1/scid/56983fec-fd04-4190-9587-20e0a6fc4642",
    "https://www.zepto.com/cn/feminine-hygiene/sanitary-pads/cid/72066480-9851-4263-89b6-50dd7525edc1/scid/4ec95583-3060-4d3a-95ed-757a6728b32a",
    "https://www.zepto.com/cn/feminine-hygiene/period-panties/cid/72066480-9851-4263-89b6-50dd7525edc1/scid/dade758f-54cb-4d2f-840d-6e07f746c43a",
    "https://www.zepto.com/cn/feminine-hygiene/intimate-care/cid/72066480-9851-4263-89b6-50dd7525edc1/scid/76ac0334-0106-41ed-8a8f-0d79d3d9f3d8",
    "https://www.zepto.com/cn/feminine-hygiene/panty-liners/cid/72066480-9851-4263-89b6-50dd7525edc1/scid/7f3cf7ca-13ab-4f5b-8754-3cfabdab9a95",
    "https://www.zepto.com/cn/feminine-hygiene/tampons-menstrual-cups/cid/72066480-9851-4263-89b6-50dd7525edc1/scid/4cc8598b-edbc-44df-96f7-a1c61e1a18dd",
    "https://www.zepto.com/cn/feminine-hygiene/toilet-hygiene/cid/72066480-9851-4263-89b6-50dd7525edc1/scid/9e10cc4e-4d4a-458f-9c47-e75fcfe09b72",
    "https://www.zepto.com/cn/feminine-hygiene/period-pain-relief/cid/72066480-9851-4263-89b6-50dd7525edc1/scid/3b093fa7-c594-42ca-a630-5433b8576c89",
    "https://www.zepto.com/cn/feminine-hygiene/personal-safety/cid/72066480-9851-4263-89b6-50dd7525edc1/scid/5e6c1e19-a951-4f60-b6b2-b33b7a513673",
    "https://www.zepto.com/cn/feminine-hygiene/mom-care/cid/72066480-9851-4263-89b6-50dd7525edc1/scid/e14b3456-11a5-4d00-86aa-994aae57ba52",

    "https://www.zepto.com/pip/makeup-beauty/27819",

    "https://www.zepto.com/cn/baby-care/baby-diapering/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/b998e39c-6948-42f2-84bb-947f07f2ceca",
    "https://www.zepto.com/cn/baby-care/baby-bath/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/656132b1-c0cd-44ae-afb2-62d3fe3d70fd",
    "https://www.zepto.com/cn/baby-care/baby-skin-hair-care/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/3b386054-f215-4dfb-97f1-ac2a4c1d369e",
    "https://www.zepto.com/cn/baby-care/baby-wipes/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/2b24bfa9-6ef9-41a4-8bf9-694ef4d01a44",
    "https://www.zepto.com/cn/baby-care/baby-feeding/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/60dbf0e6-6a76-4aa6-ab0c-7d1cce7165b9",
    "https://www.zepto.com/cn/baby-care/baby-oral-care/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/9a5aa128-beb4-4af6-92af-eea149911420",
    "https://www.zepto.com/cn/baby-care/baby-hygiene/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/88c0c306-f192-4387-bfb1-3e7c810a7af0",
    "https://www.zepto.com/cn/baby-care/baby-mom-gifting/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/67e4dc8d-b2dc-4ae3-bf90-ff00ea1d5149",
    "https://www.zepto.com/cn/baby-care/mom-care/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/26f826a6-a1a3-4b87-b33f-4f80781077fc",
    "https://www.zepto.com/cn/baby-care/baby-health/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/8ec78ab7-9493-4bf8-aca8-fc4ee691acff",
    "https://www.zepto.com/cn/baby-care/baby-nursery/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/06bd4eb6-05cb-4937-9334-11317471f881",
    "https://www.zepto.com/cn/baby-care/infant-clothing/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/b0941916-af2f-4ee7-b94b-261c28f3dc56",
    "https://www.zepto.com/cn/baby-care/baby-gear/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/f1af24d2-e5ea-4de5-a577-bfb332dda2ea",
    "https://www.zepto.com/cn/baby-care/baby-safety/cid/0118c4f5-750c-4929-a734-b4ef454e265b/scid/98759147-826f-4831-9880-8e2c717ed312",

    "https://www.zepto.com/cn/masala-dry-fruits-more/powders-pastes/cid/0c2ccf87-e32c-4438-9560-8d9488fc73e0/scid/80f4308e-91ad-4cc4-b804-57783fe4c667",
    "https://www.zepto.com/cn/masala-dry-fruits-more/dry-fruits-nuts/cid/0c2ccf87-e32c-4438-9560-8d9488fc73e0/scid/dee4d0bc-0348-492c-9fa3-e55b7e2a44b3",
    "https://www.zepto.com/cn/masala-dry-fruits-more/dates-seeds/cid/0c2ccf87-e32c-4438-9560-8d9488fc73e0/scid/fd487995-4d2b-4b23-a6ef-831bc118dedb",
    "https://www.zepto.com/cn/masala-dry-fruits-more/whole-spices-seasonings/cid/0c2ccf87-e32c-4438-9560-8d9488fc73e0/scid/bd6ea174-5b9a-4071-aae1-a7807615351e",
    "https://www.zepto.com/cn/masala-dry-fruits-more/salt-sugar-jaggery/cid/0c2ccf87-e32c-4438-9560-8d9488fc73e0/scid/b5826992-5cfc-4554-8075-a3f33709ddf2",
    "https://www.zepto.com/cn/masala-dry-fruits-more/dehydrated-dried/cid/0c2ccf87-e32c-4438-9560-8d9488fc73e0/scid/9dfe488f-ee38-43e2-99c6-78d6d17676d2",

    "https://www.zepto.com/cn/ice-creams-more/tubs/cid/65ee1b69-4e24-45b9-ac84-aace3c0854d8/scid/21c1011a-c677-4007-ac20-abc1542cb89c",
    "https://www.zepto.com/cn/ice-creams-more/sticks/cid/65ee1b69-4e24-45b9-ac84-aace3c0854d8/scid/ce577733-e375-48f8-9009-97f5c9a5e68f",
    "https://www.zepto.com/cn/ice-creams-more/cones/cid/65ee1b69-4e24-45b9-ac84-aace3c0854d8/scid/b7093ed5-7170-408a-99f0-c8d0bd21b25a",
    "https://www.zepto.com/cn/ice-creams-more/gourmet-ice-creams/cid/65ee1b69-4e24-45b9-ac84-aace3c0854d8/scid/b8398286-03ba-412b-be33-434b31b11abc",
    "https://www.zepto.com/cn/ice-creams-more/cups/cid/65ee1b69-4e24-45b9-ac84-aace3c0854d8/scid/32173cd6-b8e4-497e-8e95-9c1ff04ae46b",
    "https://www.zepto.com/cn/ice-creams-more/guilt-free/cid/65ee1b69-4e24-45b9-ac84-aace3c0854d8/scid/6cace257-c35d-44f8-bfbb-b88f285e67fa",
    "https://www.zepto.com/cn/ice-creams-more/cakes-sandwiches-more/cid/65ee1b69-4e24-45b9-ac84-aace3c0854d8/scid/30e08b20-9431-4f46-9636-521a33015bae",
    "https://www.zepto.com/cn/ice-creams-more/kulfi/cid/65ee1b69-4e24-45b9-ac84-aace3c0854d8/scid/7aab08ec-9f55-4b8c-ab0e-0af011e900a1",
    "https://www.zepto.com/cn/ice-creams-more/ice-cubes-ice-pops/cid/65ee1b69-4e24-45b9-ac84-aace3c0854d8/scid/bef8a1a8-889e-4703-9df9-2cff145f18ff"
]

const OUTPUT_FILE = path.join(__dirname, 'zepto_bulk_results.json');
const CONCURRENCY = 3;

// ==================== HELPER FUNCTIONS (Copied from server.js) ====================

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
        await delay(1500);

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
            } catch (e) { continue; }
        }

        if (!clicked) {
            console.error('❌ Could not find location button');
            return false;
        }
        await delay(2000);

        try {
            await page.waitForSelector(SELECTORS.locationModal, { timeout: 10000 });
            console.log('✓ Location modal opened');
        } catch (e) {
            console.error('❌ Location modal did not appear (timeout)');
            return false;
        }

        await delay(1500);
        const searchInput = page.locator(SELECTORS.searchInput).first();
        if (await searchInput.count() === 0) {
            console.error('❌ Search input not found');
            return false;
        }

        await searchInput.click();
        await delay(300);
        await searchInput.fill('');
        await delay(200);
        await searchInput.fill(targetPincode);
        console.log(`✓ Typed pincode: ${targetPincode}`);
        await delay(2500);

        try {
            await page.waitForSelector(SELECTORS.searchResultItem, { timeout: 8000 });
            console.log('✓ Address results appeared');
        } catch (e) {
            console.error('❌ No address results appeared');
            return false;
        }

        await delay(500);
        const addressResults = page.locator(SELECTORS.searchResultItem);
        const count = await addressResults.count();
        console.log(`✓ Found ${count} address results`);

        if (count > 0) {
            const targetIndex = 0;
            const targetAddress = addressResults.nth(targetIndex);
            const clickableDiv = targetAddress.locator('div.cgG1vl').first();

            console.log(`📍 Attempting to select address #${targetIndex + 1}`);
            let clicked = false;
            try {
                await clickableDiv.click({ timeout: 3000 });
                console.log('✓ Clicked address (inner div)');
                clicked = true;
            } catch (e) {
                console.log('⚠️ Inner div click failed, trying outer container');
                try {
                    await targetAddress.click({ force: true, timeout: 3000 });
                    console.log('✓ Clicked address (outer container)');
                    clicked = true;
                } catch (e2) {
                    console.log('⚠️ Container click failed, trying JS click');
                    await page.evaluate((index) => {
                        const items = document.querySelectorAll('div[data-testid="address-search-item"]');
                        if (items[index]) {
                            const clickable = items[index].querySelector('div.cgG1vl');
                            if (clickable) clickable.click();
                            else items[index].click();
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

            await delay(3000);
            const confirmBtn = page.locator('button:has-text("Confirm Location"), button:has-text("Confirm & Proceed")').first();
            if (await confirmBtn.isVisible()) {
                console.log('ℹ️ Confirm Location button appeared, clicking it...');
                await confirmBtn.click();
                await delay(2000);
            }

            const modalStillOpen = await page.locator(SELECTORS.locationModal).count();
            if (modalStillOpen === 0) {
                console.log('✅ Location set successfully - modal closed');
                return true;
            } else {
                console.error('❌ Modal still open after clicking address');
                console.log('⚠️ Attempting to close modal with Escape...');
                await page.keyboard.press('Escape');
                await delay(1000);
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

async function setPincodeWithRetry(page, targetPincode, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`\n🔄 Pincode setting attempt ${attempt}/${maxRetries}`);
        const success = await setPincode(page, targetPincode);
        if (success) {
            console.log(`✅ Pincode set successfully on attempt ${attempt}`);
            return true;
        }
        if (attempt < maxRetries) {
            const waitTime = 2000 * attempt;
            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
            await delay(waitTime);
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

async function scrapeCategory(context, url, pincode) {
    const page = await context.newPage();
    try {
        const jitter = Math.floor(Math.random() * 2000) + 500;
        await delay(jitter);

        console.log(`🔍 Opening URL: ${url} (delayed ${jitter}ms)`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(1000);

        try {
            const closeBtn = page.locator('button[aria-label*="Close"]').first();
            if (await closeBtn.count() > 0) {
                await closeBtn.click({ timeout: 1500 });
            }
        } catch (e) { }

        const resultsFound = await waitForSearchResults(page);
        if (!resultsFound) {
            console.warn(`⚠️ No results for: ${url}`);
            return [];
        }

        await autoScroll(page, 15); // Default scroll count
        const { products } = await extractProducts(page);

        return products.map(p => ({
            ...p,
            categoryUrl: url,
            platform: 'Zepto',
            pincode: pincode
        }));

    } catch (error) {
        console.error(`❌ Error scraping ${url}: ${error.message}`);
        return [];
    } finally {
        await page.close();
    }
}

// ==================== MAIN EXECUTION ====================

async function runBulkScrape() {
    console.log(`Starting Zepto bulk scrape for Pincode: ${PINCODE}`);

    // Load URLs

    const rawUrls = ["https://www.zepto.com/cn/fruits-vegetables/cuts-sprouts/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/6eb7a384-5edf-4a68-aa99-a1c2b30c2f19",
        "https://www.zepto.com/cn/atta-rice-oil-dals/healthy-picks/cid/2f7190d0-7c40-458b-b450-9a1006db3d95/scid/abf23f54-66e4-4ae3-ac97-1bc907260f38",
        "https://www.zepto.com/cn/atta-rice-oil-dals/olive-cold-press-oil/cid/2f7190d0-7c40-458b-b450-9a1006db3d95/scid/98cf88c0-6895-459a-ad43-ffeb1ceee2e0",
        "https://www.zepto.com/cn/atta-rice-oil-dals/healthy-atta-millets/cid/2f7190d0-7c40-458b-b450-9a1006db3d95/scid/443bc767-1e82-46fb-a87a-3d4a2e8f6c4b",
        "https://www.zepto.com/cn/atta-rice-oil-dals/healthy-ghee/cid/2f7190d0-7c40-458b-b450-9a1006db3d95/scid/f41a399c-d3ae-4b5f-8097-790b156c8ccc",
        "https://www.zepto.com/cn/atta-rice-oil-dals/healthy-dal/cid/2f7190d0-7c40-458b-b450-9a1006db3d95/scid/edb9057a-8790-4adc-8353-1fd69ff2bd0e",
        "https://www.zepto.com/cn/atta-rice-oil-dals/healthy-rice/cid/2f7190d0-7c40-458b-b450-9a1006db3d95/scid/fe4ab0c9-94cc-4d4a-839c-9b51f6248651",
        "https://www.zepto.com/cn/masala-dry-fruits-more/top-picks/cid/0c2ccf87-e32c-4438-9560-8d9488fc73e0/scid/8b44cef2-1bab-407e-aadd-29254e6778fa",
        "https://www.zepto.com/cn/masala-dry-fruits-more/premium/cid/0c2ccf87-e32c-4438-9560-8d9488fc73e0/scid/fa2240dd-671a-4644-bf01-2229ccb6392a",
        "https://www.zepto.com/cn/breakfast-sauces/top-picks/cid/f804bccc-c565-4879-b6ab-1b964bb1ed41/scid/68922181-4e0e-4a6b-9862-cf1a02ba240e",
        "https://www.zepto.com/cn/breakfast-sauces/zepto-cafe/cid/f804bccc-c565-4879-b6ab-1b964bb1ed41/scid/60a35530-9491-4baf-9ec9-462add14e112",
        "https://www.zepto.com/cn/packaged-food/top-picks/cid/5736ad99-f589-4d58-a24b-a12222320a37/scid/dbb39a86-256b-4664-81ed-6668418a5436",
        "https://www.zepto.com/cn/tea-coffee-more/top-picks/cid/d7e98d87-6850-4cf9-a37c-e4fa34ae302c/scid/e6763c2d-0bf3-4332-82e4-0c8df1c94cad",
        "https://www.zepto.com/cn/breakfast-sauces/zepto-cafe/cid/f804bccc-c565-4879-b6ab-1b964bb1ed41/scid/60a35530-9491-4baf-9ec9-462add14e112",
        "https://www.zepto.com/cn/cough-cold-fever/balm/cid/609a5619-af1d-4bdc-b6e1-44be2d7c9ce8/scid/e7345856-3a5a-481d-ab06-526620f16e54",
        "https://www.zepto.com/cn/cough-cold-fever/cold-cough/cid/609a5619-af1d-4bdc-b6e1-44be2d7c9ce8/scid/8f4a27a5-d3b6-44a4-bce6-504f5c30a7f8",
        "https://www.zepto.com/cn/cough-cold-fever/prescription-medicines/cid/609a5619-af1d-4bdc-b6e1-44be2d7c9ce8/scid/5151c98e-c84a-4ca3-bf42-6fe2c6c59c12",
        "https://www.zepto.com/cn/cough-cold-fever/fever-headache/cid/609a5619-af1d-4bdc-b6e1-44be2d7c9ce8/scid/34de19df-a2c0-4db4-94cb-0a91b63863ae",
        "https://www.zepto.com/cn/cough-cold-fever/inhaler/cid/609a5619-af1d-4bdc-b6e1-44be2d7c9ce8/scid/5ffa384b-40bb-4cf6-b6a8-e748da19dbee",
        "https://www.zepto.com/cn/cough-cold-fever/lozenges/cid/609a5619-af1d-4bdc-b6e1-44be2d7c9ce8/scid/d718b901-786d-456f-9638-5f3176e8dfed",
        "https://www.zepto.com/cn/cough-cold-fever/nasal-spray/cid/609a5619-af1d-4bdc-b6e1-44be2d7c9ce8/scid/d292da5e-a008-43d8-b976-c42637de8174",
        "https://www.zepto.com/cn/cough-cold-fever/steam-pod/cid/609a5619-af1d-4bdc-b6e1-44be2d7c9ce8/scid/001ad22a-52ff-4da5-b273-48e46945cdfb",
        "https://www.zepto.com/cn/cough-cold-fever/masks/cid/609a5619-af1d-4bdc-b6e1-44be2d7c9ce8/scid/635b060f-a666-41cd-b01e-b03f39ebdb7a",
        "https://www.zepto.com/pip/protein-nutrition/30619",
        "https://www.zepto.com/cn/sweet-cravings/top-picks/cid/adab2f81-7140-4fe9-b8cf-3d809f40e38a/scid/002a4a04-fbc0-4fd9-a259-eb95158f8067",
        "https://www.zepto.com/cn/sweet-cravings/premium-chocolates/cid/adab2f81-7140-4fe9-b8cf-3d809f40e38a/scid/fda4043f-c6b5-4edb-bc74-9173c334499a",
        "https://www.zepto.com/cn/cold-drinks-juices/milk-drinks/cid/947a72ae-b371-45cb-ad3a-778c05b64399/scid/c5638eba-30c0-4a40-8c63-c9947fd22c16",
        "https://www.zepto.com/cn/cold-drinks-juices/vegan-drinks/cid/947a72ae-b371-45cb-ad3a-778c05b64399/scid/dcfd1067-a597-4ef0-81d6-9a3d1b9a2891",
        "https://www.zepto.com/cn/cold-drinks-juices/instant-drink-mixes/cid/947a72ae-b371-45cb-ad3a-778c05b64399/scid/4d088b94-ba43-4bf0-a881-a573862aa0a1",
        "https://www.zepto.com/cn/cold-drinks-juices/kombucha/cid/947a72ae-b371-45cb-ad3a-778c05b64399/scid/db4916f2-c2f7-456d-9d3e-69bfc9703da0",
        "https://www.zepto.com/cn/cold-drinks-juices/zepto-cafe/cid/947a72ae-b371-45cb-ad3a-778c05b64399/scid/d7b1c36b-25fc-450c-a2f4-84fd5a68f996",
        "https://www.zepto.com/cn/munchies/top-picks/cid/d2c2a144-43cd-43e5-b308-92628fa68596/scid/d648ea7c-18f0-4178-a202-4751811b086b",
        "https://www.zepto.com/cn/biscuits/top-picks/cid/2552acf2-2f77-4714-adc8-e505de3985db/scid/3a10723e-ba14-4e5c-bdeb-a4dce2c1bec4",
        "https://www.zepto.com/cn/bath-body/top-deals/cid/26e64367-19ad-4f80-a763-42599d4215ee/scid/b493b1f8-c617-45e6-8a73-95239637bd5c",
        "https://www.zepto.com/pip/hair-care/20135"];
    console.log(`Loaded ${rawUrls.length} total URLs.`);

    // Load existing results to resume
    let allResults = [];
    let scrapedUrls = new Set();
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            allResults = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            console.log(`Parsed ${allResults.length} existing results from ${OUTPUT_FILE}`);
            allResults.forEach(p => {
                if (p.categoryUrl) scrapedUrls.add(p.categoryUrl);
            });
            console.log(`Found data for ${scrapedUrls.size} unique URLs already scraped.`);
        } catch (e) {
            console.log('Existing output file is invalid or empty, starting fresh.');
        }
    }

    const urlsToScrape = rawUrls.filter(u => !scrapedUrls.has(u));
    console.log(`Resuming scrape with ${urlsToScrape.length} remaining URLs.`);

    if (urlsToScrape.length === 0) {
        console.log('All URLs already scraped.');
        return;
    }

    // Launch Browser
    const browser = await chromium.launch({
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
        ],
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata'
    });

    // Block resources
    await context.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (['image', 'font', 'media'].includes(resourceType)) return route.abort();
        return route.continue();
    });

    // Setup Session (Set Pincode)
    const setupPage = await context.newPage();
    await setupPage.goto('https://www.zepto.com/', { waitUntil: 'domcontentloaded' });
    const pincodeSet = await setPincodeWithRetry(setupPage, PINCODE, 3);
    await setupPage.close();

    if (!pincodeSet) {
        console.error('Failed to set pincode. Aborting.');
        await browser.close();
        return;
    }

    // Worker Pool
    const queue = urlsToScrape.map((url, index) => ({ url, index }));
    let completedCount = 0;
    const totalToScrape = urlsToScrape.length;

    const saveResults = () => {
        try {
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
        } catch (e) { console.error('Error saving results:', e.message); }
    };

    const worker = async () => {
        while (queue.length > 0) {
            const { url, index } = queue.shift();
            // console.log(`[${completedCount + 1}/${totalToScrape}] Scraping: ${url}`); // Too noisy for parallel
            console.log(`Scraping: ${url}`);

            const products = await scrapeCategory(context, url, PINCODE);

            if (products.length > 0) {
                allResults.push(...products);
                console.log(`  -> Found ${products.length} products for ${url}`);
            } else {
                console.log(`  -> No products found for ${url}`);
            }

            completedCount++;
            console.log(`Progress: ${completedCount}/${totalToScrape}`);
            saveResults();
        }
    };

    const workers = Array(CONCURRENCY).fill().map(() => worker());
    await Promise.all(workers);

    console.log('Bulk scrape completed.');
    await browser.close();
}

runBulkScrape().catch(console.error);
