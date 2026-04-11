
import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { transformJiomartProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../enrich_categories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load mappings once at startup
const CATEGORY_MAPPINGS = loadCategoryMappings(path.join(__dirname, '..', 'categories_with_urls.json'));

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

const safeFilePart = (value) => {
    const cleaned = String(value || 'unknown')
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    return cleaned || 'unknown';
};

/**
 * Set pincode with retry logic and progressive timeout increase
 * Attempt 1: 10s, Attempt 2: 20s, Attempt 3: 30s
 */
async function setPincodeWithRetry(page, pincode, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Progressive timeout: 10s, 20s, 30s
            const timeout = 10000 * attempt;
            console.log(`ðŸ”„ Attempt ${attempt}/${maxRetries} to set pincode (timeout: ${timeout}ms)...`);
            
            const input = page.locator('input[id="rel_pincode"], input[placeholder*="pincode"], input[type="tel"]').first();
            await input.waitFor({ state: 'visible', timeout });
            
            await input.fill(pincode);
            await delay(500, 1000);
            
            const applyBtn = page.getByText('Apply').first();
            await applyBtn.click();
            
            console.log(`âœ… Pincode set successfully on attempt ${attempt}`);
            return true;
        } catch (error) {
            console.warn(`âš ï¸ Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
            
            if (attempt < maxRetries) {
                const waitTime = 2000 * attempt;
                console.log(`â³ Waiting ${waitTime}ms before retry...`);
                await delay(waitTime, waitTime + 1000);
            } else {
                throw error;
            }
        }
    }
}

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
        console.warn('âš ï¸ Invalid proxy URL format, using as-is');
        return { server: proxyUrl };
    }
};

/**
 * Helper to get or create storage state for a pincode
 */
async function getStorageStateForPincode(browser, pincode, proxyUrl) {
    if (PRELOADED_SESSIONS[pincode]) {
        console.log(`âœ… Using preloaded session for ${pincode}`);
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
            console.log(`âœ… Found existing session for pincode ${pincode}`);
            return statePath;
        } catch (e) {
            console.log(`âš ï¸ Map entry exists but file missing for ${pincode}, recreating...`);
        }
    }

    console.log(`ðŸ”„ Creating new session for pincode ${pincode}`);
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

        // âš¡ Use retry logic with progressive timeout increase (10s, 20s, 30s)
        await setPincodeWithRetry(page, pincode, 3);

        await delay(3000, 5000);

        await context.storageState({ path: statePath });

        map[pincode] = stateFileName;
        await fs.writeFile(STORAGE_MAP_FILE, JSON.stringify(map, null, 2));

        console.log(`âœ… Session created and saved for ${pincode}`);
        return statePath;

    } catch (error) {
        console.error(`âŒ Failed to set pincode ${pincode}:`, error.message);
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
    const maxScrolls = 100; // Reduced from 250 for timeout efficiency
    const scrollStep = 1500; // Increased from 800 for faster scrolling
    const scrollDelay = 1500; // Reduced from 2000-4000 for efficiency

    for (let i = 0; i < maxScrolls; i++) {
        // Scroll down incrementally
        await page.evaluate((step) => {
            window.scrollBy(0, step);
        }, scrollStep);

        // Wait for potential content load (reduced from 2-4s)
        await delay(scrollDelay, scrollDelay + 1000);

        const newHeight = await page.evaluate('document.body.scrollHeight');
        const atBottom = await page.evaluate(() => (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 50);

        if (newHeight === previousHeight) {
            noChangeCount++;
            console.log(`[${logPrefix}] No height change (${noChangeCount}/10). At bottom: ${atBottom}`);

            // Wiggle logic: Scroll up and down to trigger stubborn lazy loaders
            if (noChangeCount > 2) {
                console.log(`[${logPrefix}] Wiggling to trigger lazy load...`);
                await page.evaluate(() => window.scrollBy(0, -800));
                await delay(800, 1000);
                await page.evaluate(() => window.scrollBy(0, 800));
                await delay(800, 1000);
            }

            if (atBottom || noChangeCount >= 6) {
                console.log(`[${logPrefix}] Checking for 'Show More' buttons...`);

                // Try clicking "Show More"
                try {
                    const showMore = page.locator('button:has-text("Show More"), button:has-text("Load More"), .load-more-btn, text="Show More"').first();
                    if (await showMore.isVisible({ timeout: 3000 })) {
                        console.log(`[${logPrefix}] Found 'Show More' button, clicking...`);
                        await showMore.click({ force: true });
                        await delay(2000, 3000);
                        noChangeCount = 0;
                        continue;
                    }
                } catch (e) { }

                if (noChangeCount >= 10) {
                    console.log(`[${logPrefix}] Reached stability limit. Stopping scroll.`);
                    break;
                }
            }
        } else {
            console.log(`[${logPrefix}] Height changed: ${previousHeight} -> ${newHeight}`);
            noChangeCount = 0;
            previousHeight = newHeight;
        }

        if (i % 20 === 0 && i > 0) console.log(`[${logPrefix}] Scroll progress: ${i}/${maxScrolls}`);
    }
}

/**
 * Scrape a single category using an existing context with Retry Logic
 */
/**
 * Scrape a single category using an isolated context with Retry Logic
 */
async function scrapeCategory(browser, category, contextOptions, maxRetries = 2) {
    const API_ENDPOINT = 'https://www.jiomart.com/trex/search';
    const ADS_ENDPOINT = 'https://ads.jiomart.com/ads/ad-server/getAds';
    const apiDumpsDir = path.join(__dirname, 'api_dumps');
    let attempt = 0;

    while (attempt <= maxRetries) {
        let context = null;
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
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                window.chrome = { runtime: {} };
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ? Promise.resolve({ state: 'denied' }) : originalQuery(parameters)
                );
            });

            const page = await context.newPage();
            console.log(`Starting direct API scrape [Attempt ${attempt}] for: ${category.name}`);
            const capturedItems = [];
            const interceptedIds = new Set();
            const capturedHeaders = {};
            const capturedAdHeaders = {};
            const apiResponses = [];
            const adResponses = [];
            let requestTemplateBody = null;
            let adsRequestTemplateBody = null;
            const sponsoredProductMap = new Map();
            const wantedHeaders = [
                'accept',
                'accept-language',
                'content-type',
                'origin',
                'referer',
                'sec-ch-ua',
                'sec-ch-ua-mobile',
                'sec-ch-ua-platform',
                'user-agent'
            ];
            const wantedAdHeaders = [
                'accept',
                'accept-language',
                'content-type',
                'origin',
                'referer',
                'sec-ch-ua',
                'sec-ch-ua-mobile',
                'sec-ch-ua-platform',
                'user-agent',
                'authorization'
            ];

            const pushResults = (payload, pageNumber = 1) => {
                if (!payload || !Array.isArray(payload.results)) return 0;
                let added = 0;
                const results = payload.results;
                const resultsLen = results.length;
                const capturedLen = capturedItems.length;
                
                for (let idx = 0; idx < resultsLen; idx += 1) {
                    const item = results[idx];
                    if (!item || typeof item !== 'object') continue;
                    
                    // Fast key extraction - prioritize item.id (most common case)
                    const key = item.id || item.product?.name || item.product?.title || `idx_${capturedLen + added}`;
                    if (interceptedIds.has(key)) continue;
                    interceptedIds.add(key);

                    // Pre-calculate candidate IDs for later ad annotation
                    const candidateIds = new Set();
                    const id = item.id;
                    if (id) {
                        candidateIds.add(id);
                        if (String(id).endsWith('_P')) {
                            candidateIds.add(String(id).slice(0, -2));
                        }
                    }
                    const productName = item.product?.name;
                    if (productName) {
                        const pathId = productName.split('/').pop();
                        if (pathId) candidateIds.add(pathId);
                    }

                    // Preserve exact listing order from trex/search.
                    item.__pageNumber = pageNumber;
                    item.__positionInPage = idx + 1;
                    item.__websitePosition = capturedLen + added + 1;
                    item.__candidateIds = candidateIds; // Cache for ad annotation

                    capturedItems.push(item);
                    added += 1;
                }
                return added;
            };

            const extractSponsoredFromAdsPayload = (payload) => {
                const asi = payload?.result?.asi;
                if (!asi || typeof asi !== 'object') return 0;

                let newIds = 0;
                for (const slotData of Object.values(asi)) {
                    const adsList = slotData?.adsList;
                    if (!Array.isArray(adsList)) continue;

                    for (const adEntry of adsList) {
                        const product = adEntry?.product || {};
                        const productId = String(product.productId || '').trim();
                        if (!productId) continue;

                        if (!sponsoredProductMap.has(productId)) {
                            newIds += 1;
                        }

                        sponsoredProductMap.set(productId, {
                            tag: product.tag || 'sponsored',
                            brand: product.brand || 'N/A',
                            campaignId: adEntry?.config?.c || 'N/A',
                            adGroupId: adEntry?.config?.adg || 'N/A',
                            cid: adEntry?.config?.cid || 'N/A'
                        });
                    }
                }

                return newIds;
            };

            const resolveCandidateProductIds = (item) => {
                const ids = new Set();

                const addId = (value) => {
                    const raw = String(value || '').trim();
                    if (!raw) return;
                    ids.add(raw);
                    if (raw.endsWith('_P')) {
                        ids.add(raw.replace(/_P$/i, ''));
                    }
                };

                addId(item?.id);

                const productPathId = String(item?.product?.name || '').split('/').pop();
                addId(productPathId);

                const variantInfo = item?.product?.attributes?.variant_info?.text;
                if (Array.isArray(variantInfo)) {
                    variantInfo.forEach(addId);
                }

                const rollupVariantIds = item?.variantRollupValues?.variantId;
                if (Array.isArray(rollupVariantIds)) {
                    rollupVariantIds.forEach(addId);
                }

                const variants = Array.isArray(item?.product?.variants) ? item.product.variants : [];
                for (const variant of variants) {
                    addId(variant?.id);
                    const variantPathId = String(variant?.name || '').split('/').pop();
                    addId(variantPathId);
                }

                return Array.from(ids);
            };

            const annotateCapturedItemsWithAds = () => {
                let adTaggedCount = 0;

                for (const item of capturedItems) {
                    // Use cached candidate IDs from pushResults
                    const candidateIds = item.__candidateIds || new Set();
                    const matchedId = Array.from(candidateIds).find((id) => sponsoredProductMap.has(id));

                    if (matchedId) {
                        const adMeta = sponsoredProductMap.get(matchedId) || {};
                        item.__isAd = true;
                        item.__adTag = adMeta.tag || 'sponsored';
                        item.__adProductId = matchedId;
                        item.__adMeta = adMeta;
                        adTaggedCount += 1;
                    } else if (typeof item.__isAd !== 'boolean') {
                        item.__isAd = false;
                    }
                }

                return adTaggedCount;
            };

            const captureTemplateFromRequest = (request) => {
                const url = request.url();
                if (request.method() !== 'POST') return;

                if (url.includes('/trex/search')) {
                    const headers = request.headers();
                    for (const key of wantedHeaders) {
                        const value = headers[key];
                        if (value !== undefined && value !== '') {
                            capturedHeaders[key] = value;
                        }
                    }

                    if (!requestTemplateBody) {
                        try {
                            const postData = request.postData();
                            if (postData && postData.length > 2) {
                                requestTemplateBody = JSON.parse(postData);
                            }
                        } catch (_) {
                            requestTemplateBody = null;
                        }
                    }
                    return;
                }

                if (url.includes('/ads/ad-server/getAds')) {
                    const headers = request.headers();
                    for (const key of wantedAdHeaders) {
                        const value = headers[key];
                        if (value !== undefined && value !== '') {
                            capturedAdHeaders[key] = value;
                        }
                    }

                    if (!adsRequestTemplateBody) {
                        try {
                            const postData = request.postData();
                            if (postData && postData.length > 2) {
                                adsRequestTemplateBody = JSON.parse(postData);
                            }
                        } catch (_) {
                            adsRequestTemplateBody = null;
                        }
                    }
                }
            };

            page.on('request', captureTemplateFromRequest);

            const initialRequestPromise = page.waitForRequest(
                (request) => request.url().includes('/trex/search') && request.method() === 'POST',
                { timeout: 25000 }
            );

            const initialResponsePromise = page.waitForResponse(
                (response) => response.url().includes('/trex/search') && response.request().method() === 'POST' && response.status() === 200,
                { timeout: 25000 }
            );
            const initialAdsResponsePromise = page.waitForResponse(
                (response) => response.url().includes('/ads/ad-server/getAds') && response.request().method() === 'POST' && response.status() === 200,
                { timeout: 5000 }
            ).catch(() => null);

            await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            const [initialRequest, initialResponse] = await Promise.all([initialRequestPromise, initialResponsePromise]);
            if (initialRequest) {
                captureTemplateFromRequest(initialRequest);
            }

            let initialData = null;
            try {
                initialData = await initialResponse.json();
            } catch (e) {
                throw new Error(`Failed to parse initial trex/search response: ${e.message}`);
            }

            const initialAdded = pushResults(initialData, 1);
            const totalSize = Number(initialData?.totalSize || 0);
            console.log(`Initial trex/search page captured: +${initialAdded} items${totalSize > 0 ? ` (totalSize=${totalSize})` : ''}`);
            apiResponses.push({
                pageNumber: 1,
                pageTokenUsed: null,
                response: initialData
            });

            const initialAdsResponse = await initialAdsResponsePromise;
            if (initialAdsResponse) {
                try {
                    const adsData = await initialAdsResponse.json();
                    adResponses.push({
                        source: 'page-load',
                        response: adsData
                    });
                    const sponsoredFound = extractSponsoredFromAdsPayload(adsData);
                    if (sponsoredFound > 0) {
                        console.log(`Captured sponsored ads: +${sponsoredFound} product ids`);
                    }
                } catch (e) {
                    console.warn(`Failed to parse initial ads response: ${e.message}`);
                }
            }

            const requestBodyBase = requestTemplateBody && typeof requestTemplateBody === 'object'
                ? { ...requestTemplateBody }
                : {};

            if (!requestBodyBase.pageSize || Number(requestBodyBase.pageSize) <= 0) {
                requestBodyBase.pageSize = 50;
            }

            const extraHeaders = {
                'content-type': capturedHeaders['content-type'] || 'application/json',
                accept: capturedHeaders.accept || '*/*'
            };

            const optionalHeaderKeys = ['accept-language', 'origin', 'referer', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'user-agent'];
            for (const key of optionalHeaderKeys) {
                if (capturedHeaders[key]) {
                    extraHeaders[key] = capturedHeaders[key];
                }
            }

            if (sponsoredProductMap.size === 0 && adsRequestTemplateBody && typeof adsRequestTemplateBody === 'object') {
                const adsHeaders = {
                    'content-type': capturedAdHeaders['content-type'] || 'application/json',
                    accept: capturedAdHeaders.accept || 'application/json'
                };

                for (const key of optionalHeaderKeys) {
                    if (capturedAdHeaders[key]) {
                        adsHeaders[key] = capturedAdHeaders[key];
                    }
                }
                if (capturedAdHeaders.authorization) {
                    adsHeaders.authorization = capturedAdHeaders.authorization;
                }

                for (let retry = 1; retry <= 2; retry += 1) {
                    const adsResult = await page.evaluate(
                        async ({ endpoint, headers, body }) => {
                            try {
                                const res = await fetch(endpoint, {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers,
                                    body: JSON.stringify(body)
                                });

                                const raw = await res.text();
                                let data = null;
                                if (raw) {
                                    try {
                                        data = JSON.parse(raw);
                                    } catch (_) {
                                        data = null;
                                    }
                                }

                                return {
                                    ok: res.ok,
                                    status: res.status,
                                    data,
                                    error: res.ok ? null : raw.slice(0, 240)
                                };
                            } catch (error) {
                                return {
                                    ok: false,
                                    status: 0,
                                    data: null,
                                    error: error.message
                                };
                            }
                        },
                        { endpoint: ADS_ENDPOINT, headers: adsHeaders, body: adsRequestTemplateBody }
                    );

                    if (adsResult.ok && adsResult.data) {
                        adResponses.push({
                            source: 'direct-call',
                            response: adsResult.data
                        });
                        const sponsoredFound = extractSponsoredFromAdsPayload(adsResult.data);
                        if (sponsoredFound > 0) {
                            console.log(`Direct ads API captured: +${sponsoredFound} sponsored product ids`);
                        }
                        break;
                    }

                    const retriable = adsResult.status === 0 || adsResult.status === 429 || adsResult.status >= 500;
                    if (!retriable || retry === 2) {
                        console.warn(`Ads API call failed for ${category.name}: ${adsResult.status || 0} ${adsResult.error || 'unknown error'}`);
                        break;
                    }

                    await delay(350 * (2 ** (retry - 1)), 450 * (2 ** (retry - 1)));
                }
            }

            let nextPageToken = initialData?.nextPageToken || null;
            const seenTokens = new Set();
            if (nextPageToken) seenTokens.add(nextPageToken);

            let pageCount = 1;
            let tokensToFetch = [nextPageToken]; // Queue of tokens for parallel fetching

            while (tokensToFetch.length > 0 && pageCount < 200) {
                // Prepare up to 2 concurrent API calls (dual parallel mode)
                const currentBatch = tokensToFetch.splice(0, 2).filter(Boolean);
                
                const fetchPromises = currentBatch.map(async (token) => {
                    const requestBody = {
                        ...requestBodyBase,
                        pageToken: token
                    };

                    let result = null;
                    for (let retry = 1; retry <= 3; retry += 1) {
                        result = await page.evaluate(
                            async ({ endpoint, headers, body }) => {
                                try {
                                    const res = await fetch(endpoint, {
                                        method: 'POST',
                                        credentials: 'include',
                                        headers,
                                        body: JSON.stringify(body)
                                    });

                                    const raw = await res.text();
                                    let data = null;
                                    if (raw) {
                                        try {
                                            data = JSON.parse(raw);
                                        } catch (_) {
                                            data = null;
                                        }
                                    }

                                    return {
                                        ok: res.ok,
                                        status: res.status,
                                        data,
                                        error: res.ok ? null : raw.slice(0, 240)
                                    };
                                } catch (error) {
                                    return {
                                        ok: false,
                                        status: 0,
                                        data: null,
                                        error: error.message
                                    };
                                }
                            },
                            { endpoint: API_ENDPOINT, headers: extraHeaders, body: requestBody }
                        );

                        if (result.ok && result.data) break;

                        const retriable = result.status === 0 || result.status === 429 || result.status >= 500;
                        if (!retriable || retry === 3) break;
                        await delay(200 * (2 ** (retry - 1)), 300 * (2 ** (retry - 1)));
                    }

                    return { result, token };
                });

                // Execute both API calls in parallel
                const results = await Promise.all(fetchPromises);

                for (const { result, token } of results) {
                    if (!result || !result.ok || !result.data) {
                        console.warn(`Pagination API call failed for ${category.name}: ${result?.status || 0} ${result?.error || 'unknown error'}`);
                        continue;
                    }

                    pageCount += 1;
                    const added = pushResults(result.data, pageCount);
                    console.log(`Page ${pageCount}: +${added} items (total ${capturedItems.length})`);
                    apiResponses.push({
                        pageNumber: pageCount,
                        pageTokenUsed: token,
                        response: result.data
                    });

                    const candidateToken = result.data?.nextPageToken || null;
                    if (candidateToken && !seenTokens.has(candidateToken) && pageCount < 200 && (totalSize <= 0 || capturedItems.length < totalSize)) {
                        seenTokens.add(candidateToken);
                        tokensToFetch.push(candidateToken);
                    }
                }

                if (totalSize > 0 && capturedItems.length >= totalSize) {
                    break;
                }

                // Reduced delay between batches
                if (tokensToFetch.length > 0) {
                    await delay(100, 150);
                }
            }

            if (capturedItems.length === 0) {
                console.warn(`Extracted 0 items via direct API for ${category.name} (Attempt ${attempt})`);
                if (attempt <= maxRetries) {
                    throw new Error('Zero products extracted via direct API pagination');
                }
            }

            const adTaggedCount = annotateCapturedItemsWithAds();
            console.log(`Extracted ${capturedItems.length} items from ${category.name} using direct API pagination.`);
            console.log(`Sponsored mapping: ${sponsoredProductMap.size} sponsored ids, ${adTaggedCount} items tagged isAd=true`);

            capturedItems.forEach((p) => {
                p.categoryUrl = category.url;
            });

            // Persist direct API responses for debugging/audit.
            await fs.mkdir(apiDumpsDir, { recursive: true });
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const catSlug = safeFilePart(category.name || 'unknown_category');
            const dumpFile = `jiomart_api_dump_${catSlug}_${ts}_${Math.random().toString(36).slice(2, 8)}.json`;
            const dumpPath = path.join(apiDumpsDir, dumpFile);
            await fs.writeFile(
                dumpPath,
                JSON.stringify(
                    {
                        metadata: {
                            category: category.name || 'Unknown Category',
                            categoryUrl: category.url,
                            attempt,
                            method: 'direct-api-pagination',
                            endpoint: API_ENDPOINT,
                            adsEndpoint: ADS_ENDPOINT,
                            scrapedAt: new Date().toISOString(),
                            totalApiResponses: apiResponses.length,
                            totalAdResponses: adResponses.length,
                            totalItemsCaptured: capturedItems.length,
                            totalSponsoredIds: sponsoredProductMap.size,
                            adTaggedItems: adTaggedCount,
                            totalSize
                        },
                        requestTemplate: {
                            headers: capturedHeaders,
                            body: requestTemplateBody,
                            ads: {
                                headers: capturedAdHeaders,
                                body: adsRequestTemplateBody
                            }
                        },
                        responses: apiResponses,
                        adsResponses: adResponses,
                        sponsoredProducts: Array.from(sponsoredProductMap.entries()).map(([productId, meta]) => ({
                            productId,
                            ...meta
                        }))
                    },
                    null,
                    2
                )
            );
            console.log(`Saved API dump: ${dumpPath}`);

            return { category: category.name, success: true, products: capturedItems, apiDumpFile: dumpFile };
        } catch (error) {
            console.error(`Error scraping ${category.name} (Attempt ${attempt}):`, error.message);

            if (attempt > maxRetries) {
                return { category: category.name, success: false, error: error.message, products: [] };
            }

            await delay(2000, 2800);
        } finally {
            if (context) {
                try {
                    await context.close();
                } catch (_) { }
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

    console.log(`ðŸš€ Starting batch job for Pincode: ${pincode}, Categories: ${targetCategories.length}`);

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
            console.log(`ðŸ“¦ Processing batch ${Math.floor(i / maxConcurrentTabs) + 1}/${Math.ceil(targetCategories.length / maxConcurrentTabs)}`);

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
                console.log(`ðŸ’¾ Saved ${allProducts.length} total products so far to ${DATA_FILE}`);

            } catch (err) {
                console.error('âš ï¸ Failed to save partial data:', err);
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

        // 1. Transform and Enrich first (suffix gets added here)
        // Extract category name from first successful result
        let officialCategory = 'Uncategorized';
        for (let result of results) {
            if (result && result.success && result.category && result.category !== 'Unknown Category') {
                officialCategory = result.category;
                break;
            }
        }
        
        const transformedProducts = allProducts.map((product, index) => {
            const productCategoryUrl = product.categoryUrl || 'N/A';

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
                'N/A',
                pincode,
                index + 1,
                categoryMapping
            );
        });

        // 2. Deduplicate AFTER transform (suffix is now part of the unique key)
        const seenIds = new Set();
        const dedupedProducts = transformedProducts.filter(p => {
            const key = p.productId || p.productName;
            if (!key || seenIds.has(key)) return false;
            seenIds.add(key);
            return true;
        });

        // Keep ranking as website position from trex/search order.

        console.log(`âœ¨ Raw: ${allProducts.length}, After transform+dedup: ${dedupedProducts.length} unique products`);

        const responsePayload = {
            status: 'success',
            pincode,
            totalProducts: dedupedProducts.length,
            products: dedupedProducts,
            meta: {
                totalCategories: targetCategories.length,
                scrapedAt: new Date().toISOString()
            }
        };

        // === STORAGE LOGIC (NEW) ===
        // Always store the dump file
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

        res.json(responsePayload);

    } catch (error) {
        console.error('ðŸ”¥ Critical server error:', error);
        // Only send error response if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message });
        }
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('âš ï¸ Error closing browser:', e.message);
            }
        }
        console.log('ðŸ Batch job completed, browser closed');
    }
});

// ============ ASYNC POLLING SYSTEM ============
// In-memory job tracker
const jobTracker = new Map();

// Generate unique job ID
function generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Save data to scraped_data folder with proper format (with atomic writes)
async function saveScrapedDataToFolder(data, pincode, categoryName = 'Uncategorized') {
    try {
        const dataFolder = path.join(__dirname, '..', 'scraped_data', categoryName);
        
        // Create category folder if doesn't exist
        await fs.mkdir(dataFolder, { recursive: true });
        
        // Format: Jiomart_400703_2026-03-21T07-44-29-019Z.json
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
        const filename = `Jiomart_${pincode}_${timestamp}.json`;
        const filepath = path.join(dataFolder, filename);
        
        // Write to temp file first, then rename (atomic operation)
        const tempPath = filepath + '.tmp';
        await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
        await fs.rename(tempPath, filepath); // Atomic rename
        
        console.log(`ðŸ’¾ [SAVED] ${categoryName}/${filename} (${data.products?.length || 0} products)`);
        
        return { filename, filepath, directory: categoryName };
    } catch (error) {
        console.error('âŒ Error saving to folder:', error);
        throw error;
    }
}

// Async scraping job with polling
app.post('/jiomartcategoryscrapper-async', async (req, res) => {
    const { pincode, categories, urls, proxyUrl = '', maxConcurrentTabs = 3 } = req.body;
    
    if (!pincode || (!categories?.length && !urls?.length)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Required: pincode, categories array or urls array' 
        });
    }
    
    const jobId = generateJobId();
    console.log(`ðŸ“‹ New job created: ${jobId} for pincode ${pincode}`);
    
    // Initialize job state
    jobTracker.set(jobId, {
        jobId,
        pincode,
        status: 'initializing',
        progress: 0,
        totalProducts: 0,
        products: [],
        startTime: new Date(),
        lastSavedTime: new Date(),
        error: null,
        category: 'Uncategorized'
    });
    
    // Return immediately to client
    res.json({ 
        success: true, 
        jobId, 
        message: 'Scraping job started. Use /jiomartcategoryscrapper-status/:jobId to check progress',
        statusEndpoint: `/jiomartcategoryscrapper-status/${jobId}`
    });
    
    // Run scraper in background (don't await here!)
    (async () => {
        const job = jobTracker.get(jobId);
        let allProducts = []; // Define OUTSIDE try block so catch can access it
        let browser = null;
        let targetCategories = [];
        let checkpointInterval = null; // For periodic saves
        
        try {
            job.status = 'running';
            
            targetCategories = [...(categories || [])];
            if (urls && Array.isArray(urls) && urls.length > 0) {
                urls.forEach(u => {
                    targetCategories.push({ name: 'Unknown Category', url: u });
                });
            }
            
            // Extract actual category name from first target (for file naming)
            if (targetCategories.length > 0) {
                const firstCatName = targetCategories[0].name;
                if (firstCatName && firstCatName !== 'Unknown Category') {
                    job.category = firstCatName;
                }
            }
            
            // ðŸ”„ START CHECKPOINT INTERVAL: Save to disk every 10 seconds
            checkpointInterval = setInterval(async () => {
                if (allProducts.length > 0) {
                    try {
                        const transformedProducts = allProducts.map((product, index) => {
                            const productCategoryUrl = product.categoryUrl || 'N/A';
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
                                job.category || 'Uncategorized',
                                'N/A',
                                pincode,
                                index + 1,
                                categoryMapping
                            );
                        });
                        
                        const seenIds = new Set();
                        const dedupedProducts = transformedProducts.filter(p => {
                            const key = p.productId || p.productName;
                            if (!key || seenIds.has(key)) return false;
                            seenIds.add(key);
                            return true;
                        });
                        
                        const checkpointPayload = {
                            status: 'in_progress',
                            pincode,
                            totalProducts: dedupedProducts.length,
                            products: dedupedProducts,
                            meta: {
                                scrapedAt: new Date().toISOString(),
                                checkpoint: true,
                                progress: job.progress
                            }
                        };
                        
                        const saved = await saveScrapedDataToFolder(checkpointPayload, pincode, job.category || 'Uncategorized');
                        job.savedFile = saved.filename;
                        console.log(`â¸ï¸  [${jobId}] Checkpoint: ${dedupedProducts.length} products saved`);
                    } catch (err) {
                        console.error(`âš ï¸ [${jobId}] Checkpoint save error:`, err.message);
                    }
                }
            }, 10000); // Every 10 seconds
            
            browser = await chromium.launch({
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
            
            // Get pincode session
            const stateData = await getStorageStateForPincode(browser, pincode, proxyUrl);
            let contextOptions = {
                userAgent: USER_AGENTS[0],
                viewport: { width: 1366, height: 768 },
                proxy: parseProxy(proxyUrl)
            };
            
            if (stateData) {
                contextOptions.storageState = stateData;
            }
            
            // Process categories in batches
            for (let i = 0; i < targetCategories.length; i += maxConcurrentTabs) {
                const batch = targetCategories.slice(i, i + maxConcurrentTabs);
                job.progress = Math.round((i / targetCategories.length) * 100);
                
                console.log(`ðŸ“¦ [${jobId}] Batch ${Math.floor(i / maxConcurrentTabs) + 1}/${Math.ceil(targetCategories.length / maxConcurrentTabs)}`);
                
                try {
                    const batchPromises = batch.map(cat => scrapeCategory(browser, cat, contextOptions));
                    const batchResults = await Promise.all(batchPromises);
                    
                    // Update job with batch results
                    batchResults.forEach(r => {
                        if (r && r.success) {
                            allProducts.push(...r.products);
                            // Use category from batch result
                            if (r.category && r.category !== 'Unknown Category') {
                                job.category = r.category;
                            }
                        }
                    });
                } catch (batchError) {
                    console.warn(`âš ï¸ [${jobId}] Batch error (continuing with collected data):`, batchError.message);
                }
                
                job.totalProducts = allProducts.length;
                job.products = allProducts.slice();
                
                // Delay between batches
                if (i + maxConcurrentTabs < targetCategories.length) {
                    await delay(1000, 3000);
                }
            }
            
            // Stop checkpoint interval before final save
            if (checkpointInterval) {
                clearInterval(checkpointInterval);
                console.log(`âœ… [${jobId}] Checkpoint interval stopped`);
            }
            
            // Final save with all data
            if (allProducts.length > 0) {
                console.log(`ðŸŽ¯ [${jobId}] Scraping complete, performing final save...`);
                
                const transformedProducts = allProducts.map((product, index) => {
                    const productCategoryUrl = product.categoryUrl || 'N/A';
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
                        job.category || 'Uncategorized',
                        'N/A',
                        pincode,
                        index + 1,
                        categoryMapping
                    );
                });
                
                const seenIds = new Set();
                const dedupedProducts = transformedProducts.filter(p => {
                    const key = p.productId || p.productName;
                    if (!key || seenIds.has(key)) return false;
                    seenIds.add(key);
                    return true;
                });
                
                // Keep ranking as website position from trex/search order.
                
                const finalPayload = {
                    status: 'success',
                    pincode,
                    totalProducts: dedupedProducts.length,
                    products: dedupedProducts,
                    meta: {
                        totalCategories: targetCategories.length,
                        scrapedAt: new Date().toISOString(),
                        duration: `${Math.round((Date.now() - job.startTime.getTime()) / 1000)}s`
                    }
                };
                
                // Final save
                const saved = await saveScrapedDataToFolder(finalPayload, pincode, job.category);
                job.savedFile = saved.filename;
                job.totalProducts = dedupedProducts.length;
                job.products = dedupedProducts.slice();
            }
            
            job.status = 'completed';
            job.progress = 100;
            job.endTime = new Date();
            console.log(`âœ¨ [${jobId}] Job completed successfully. Products: ${job.totalProducts}`);
            
        } catch (error) {
            console.error(`ðŸ”¥ [${jobId}] Background job error:`, error.message);
            
            // âš ï¸ CRITICAL: Stop checkpoint before error save
            if (checkpointInterval) {
                clearInterval(checkpointInterval);
                console.log(`âœ… [${jobId}] Checkpoint interval stopped (error recovery)`);
            }
            
            // Save whatever data was collected (checkpoint may have already saved, but do final save anyway)
            if (allProducts.length > 0) {
                try {
                    console.log(`ðŸ’¾ [${jobId}] ERROR RECOVERY: Saving ${allProducts.length} collected products...`);
                    
                    const transformedProducts = allProducts.map((product, index) => {
                        const productCategoryUrl = product.categoryUrl || 'N/A';
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
                            job.category || 'Uncategorized',
                            'N/A',
                            pincode,
                            index + 1,
                            categoryMapping
                        );
                    });
                    
                    const seenIds = new Set();
                    const dedupedProducts = transformedProducts.filter(p => {
                        const key = p.productId || p.productName;
                        if (!key || seenIds.has(key)) return false;
                        seenIds.add(key);
                        return true;
                    });
                    
                    // Keep ranking as website position from trex/search order.
                    
                    const errorPayload = {
                        status: 'partial',
                        pincode,
                        totalProducts: dedupedProducts.length,
                        products: dedupedProducts,
                        meta: {
                            scrapedAt: new Date().toISOString(),
                            error: error.message,
                            errorRecovery: true,
                            duration: `${Math.round((Date.now() - job.startTime.getTime()) / 1000)}s`
                        }
                    };
                    
                    const saved = await saveScrapedDataToFolder(errorPayload, pincode, job.category);
                    job.savedFile = saved.filename;
                    job.totalProducts = dedupedProducts.length;
                    job.products = dedupedProducts.slice();
                    
                    console.log(`âœ… [${jobId}] ERROR RECOVERY SUCCESS: Saved ${dedupedProducts.length} products`);
                } catch (recoveryError) {
                    console.error(`âŒ [${jobId}] ERROR RECOVERY FAILED:`, recoveryError.message);
                }
            }
            
            job.status = 'failed';
            job.error = error.message;
            job.endTime = new Date();
            
        } finally {
            // Clear checkpoint interval
            if (checkpointInterval) clearInterval(checkpointInterval);
            
            if (browser) {
                try {
                    await browser.close();
                } catch (e) {
                    console.error(`âš ï¸ [${jobId}] Error closing browser:`, e.message);
                }
            }
        }
    })(); // Self-invoking async function - runs in background
});

// Check job status and get current data
app.get('/jiomartcategoryscrapper-status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobTracker.get(jobId);
    
    if (!job) {
        return res.status(404).json({ 
            success: false, 
            message: `Job ${jobId} not found` 
        });
    }
    
    res.json({
        success: true,
        jobId,
        status: job.status,
        progress: job.progress,
        totalProducts: job.totalProducts,
        startTime: job.startTime,
        lastSavedTime: job.lastSavedTime,
        endTime: job.endTime || null,
        error: job.error,
        category: job.category,
        savedFile: job.savedFile || null,
        products: job.status === 'completed' ? job.products : [], // Only return full products when completed
        message: `Job is ${job.status} - ${job.progress}% complete (${job.totalProducts} products collected)`
    });
});

const server = app.listen(PORT, () => {
    console.log(`ðŸŒ Jiomart Scraper Server running on http://localhost:${PORT}`);
});
server.setTimeout(0); // Unlimited timeout

// ============ GRACEFUL SHUTDOWN - SAVE DATA BEFORE EXIT ============
async function saveAllPendingJobs() {
    console.log('\nðŸ’¾ [SHUTDOWN] Saving all pending jobs before exit...');
    
    for (const [jobId, job] of jobTracker.entries()) {
        if ((job.status === 'running' || job.status === 'initializing') && job.totalProducts > 0) {
            console.log(`âš ï¸ [SHUTDOWN] Found running job: ${jobId} with ${job.totalProducts} products`);
            
            try {
                // Force save current state
                if (job.products.length > 0) {
                    const savePayload = {
                        status: 'partial',
                        pincode: job.pincode,
                        totalProducts: job.products.length,
                        products: job.products,
                        meta: {
                            scrapedAt: new Date().toISOString(),
                            shutdownSave: true,
                            progressPercent: job.progress,
                            error: 'Process interrupted during scraping'
                        }
                    };
                    
                    const saved = await saveScrapedDataToFolder(savePayload, job.pincode, job.category);
                    console.log(`âœ… [SHUTDOWN] Saved ${job.products.length} products from job ${jobId}`);
                }
            } catch (error) {
                console.error(`âŒ [SHUTDOWN] Failed to save job ${jobId}:`, error.message);
            }
        }
    }
    
    console.log('âœ… [SHUTDOWN] All pending jobs saved. Exiting gracefully...\n');
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('\nðŸ›‘ [SIGTERM] Received shutdown signal. Saving data...');
    await saveAllPendingJobs();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\nðŸ›‘ [SIGINT] Received interrupt signal. Saving data...');
    await saveAllPendingJobs();
    process.exit(0);
});

process.on('exit', async () => {
    console.log('ðŸ Process exiting...');
});

