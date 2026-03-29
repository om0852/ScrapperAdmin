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
const CATEGORY_MAPPINGS = loadCategoryMappings(path.join(__dirname, '..', 'categories_with_urls.json'));

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
        case 'info': icon = 'â„¹ï¸'; color = colors.cyan; break;
        case 'success': icon = 'âœ…'; color = colors.green; break;
        case 'warn': icon = 'âš ï¸'; color = colors.yellow; break;
        case 'error': icon = 'âŒ'; color = colors.red; break;
        case 'debug': icon = 'ðŸ›'; color = colors.dim; break;
        case 'start': icon = 'ðŸš€'; color = colors.magenta; break;
    }

    // Format: [12:00:00] [Prefix] Icon Message
    console.log(`${colors.dim}[${timestamp}]${colors.reset} ${colors.bright}[${prefix}]${colors.reset} ${icon} ${color}${message}${colors.reset}`);
};

// --- API Data Processing Functions ---

function getCartItemFromNode(node) {
    if (!node || typeof node !== 'object') return null;
    return (
        node.atc_action?.add_to_cart?.cart_item ||
        node.rfc_action?.remove_from_cart?.cart_item ||
        node.cart_item ||
        null
    );
}

function toNumericPrice(value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^0-9.]/g, '');
        if (!cleaned) return fallback;
        const num = Number(cleaned);
        if (Number.isFinite(num)) return num;
    }
    return fallback;
}

function extractBrandName(item, cartItem) {
    const candidateValues = [
        cartItem?.brand_name,
        cartItem?.brand,
        cartItem?.brandName,
        cartItem?.seller_name,
        item?.brand_name?.text,
        item?.brand_name,
        item?.brand?.text,
        item?.brand?.name,
        typeof item?.brand === 'string' ? item.brand : '',
        item?.seller_name
    ];

    for (const value of candidateValues) {
        const cleaned = String(value || '').trim();
        if (cleaned) return cleaned;
    }

    return 'N/A';
}

function extractProductsWithVariants(item) {
    try {
        // Blinkit API structure: product data is in atc_action.add_to_cart.cart_item
        const cartItem = getCartItemFromNode(item);
        if (!cartItem) return [];

        const id = cartItem.product_id?.toString() || '';
        const name = cartItem.product_name || cartItem.display_name || '';
        const image = cartItem.image_url || item.image?.url || '';

        const price = toNumericPrice(cartItem.price, 0);
        const originalPrice = toNumericPrice(cartItem.mrp, price);

        let discount = '';
        if (originalPrice > price) {
            discount = Math.round(((originalPrice - price) / originalPrice) * 100) + '%';
        }

        const quantity = cartItem.unit || item.variant?.text || '';
        const isOutOfStock = item.inventory === 0 || cartItem.inventory === 0;
        
        // ðŸ” Format delivery time - extract just the time part
        let deliveryTime = item.eta_tag?.title?.text || '';
        if (deliveryTime && deliveryTime.includes('mins')) {
            // Extract time like "14 mins" from "14 minsAmul Gold Full Cream Milk500 mlâ‚¹35ADD"
            const match = deliveryTime.match(/(\d+\s*mins?)/i);
            if (match) {
                deliveryTime = match[1];
            }
        }

        const brand = extractBrandName(item, cartItem);

        const isAd = item.tracking?.common_attributes?.badge === 'AD';

        let url = '';
        if (id && name) {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            url = `https://blinkit.com/prn/${slug}/prid/${id}`;
        }

        const familyKey = String(
            cartItem.group_id ||
            item.group_id ||
            item.meta?.group_id ||
            cartItem.category_id ||
            item.category_id ||
            'unknown'
        );

        const makeProductId = (pid, weight) => `${String(pid)}__${familyKey}__${weight}`;

        // Base product info
        const baseProduct = {
            id,
            name,
            url,
            image,
            price: price.toString(),
            originalPrice: originalPrice.toString(),
            discount,
            quantity,
            deliveryTime,
            brand,
            brandName: brand,
            isOutOfStock,
            isAd
        };

        // Collect possible variant nodes from all known Blinkit locations
        const variantNodes = [];
        if (Array.isArray(item.options)) variantNodes.push(...item.options);
        if (Array.isArray(cartItem.variants)) variantNodes.push(...cartItem.variants);
        if (Array.isArray(item.variant_list)) variantNodes.push(...item.variant_list);

        // Always include current product as main.
        const products = [];
        const seenProductIds = new Set();
        const productWeight = extractProductWeight(quantity);
        const mainProductId = makeProductId(id, productWeight);
        const mainProduct = {
            ...baseProduct,
            productId: mainProductId,
            productWeight,
            combo: 1,
            isVariant: false,
            variantOf: null,
            comboOf: null
        };
        products.push(mainProduct);
        seenProductIds.add(mainProductId);

        // Add variant rows (supports variant_list entries where each node has .data)
        variantNodes.forEach((variantNode, idx) => {
            try {
                const variantData = variantNode?.data || variantNode;
                const variantCartItem = getCartItemFromNode(variantData) || variantNode?.cart_item || null;

                const variantId = String(
                    variantCartItem?.product_id ||
                    variantData?.identity?.id ||
                    variantNode?.product_id ||
                    `${id}-var-${idx}`
                );

                const variantName = (
                    variantCartItem?.product_name ||
                    variantCartItem?.display_name ||
                    variantData?.name?.text ||
                    variantData?.display_name?.text ||
                    baseProduct.name
                );

                const variantQuantity = (
                    variantCartItem?.unit ||
                    variantData?.variant?.text ||
                    variantNode?.unit ||
                    variantNode?.display_string ||
                    quantity
                );

                const variantWeight = extractProductWeight(variantQuantity);
                const variantProductId = makeProductId(variantId, variantWeight);

                if (seenProductIds.has(variantProductId)) {
                    return;
                }

                const variantPrice = toNumericPrice(
                    variantCartItem?.price ?? variantNode?.price ?? variantNode?.product_price,
                    price
                );
                const variantOriginalPrice = toNumericPrice(
                    variantCartItem?.mrp ?? variantNode?.mrp ?? variantNode?.original_price,
                    originalPrice
                );

                let variantDiscount = '';
                if (variantOriginalPrice > variantPrice) {
                    variantDiscount = Math.round(((variantOriginalPrice - variantPrice) / variantOriginalPrice) * 100) + '%';
                }

                const variantBrand = extractBrandName(variantData, variantCartItem) || baseProduct.brand;
                const variantDelivery = variantData?.eta_tag?.title?.text || baseProduct.deliveryTime;
                const variantOutOfStock = variantData?.is_sold_out === true || variantData?.inventory === 0 || variantCartItem?.inventory === 0;
                const slug = String(variantName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                const variantUrl = variantId && slug ? `https://blinkit.com/prn/${slug}/prid/${variantId}` : baseProduct.url;

                const variantProduct = {
                    ...baseProduct,
                    id: variantId,
                    name: variantName || baseProduct.name,
                    url: variantUrl,
                    price: String(variantPrice),
                    originalPrice: String(variantOriginalPrice),
                    discount: variantDiscount,
                    quantity: variantQuantity,
                    productId: variantProductId,
                    productWeight: variantWeight,
                    deliveryTime: variantDelivery,
                    brand: variantBrand,
                    brandName: variantBrand,
                    isOutOfStock: variantOutOfStock,
                    isVariant: true,
                    variantOf: mainProductId,
                    comboOf: mainProductId
                };

                products.push(variantProduct);
                seenProductIds.add(variantProductId);
            } catch (e) {
                // Skip malformed variants
            }
        });

        const comboSize = products.length;
        products.forEach((product) => {
            product.combo = comboSize;
            if (!product.isVariant) {
                product.comboOf = null;
            }
        });

        return products;

    } catch (e) {
        return [];
    }
}

// Helper function to extract weight/size from quantity string
function extractProductWeight(quantityStr) {
    if (!quantityStr) return 'default';
    
    // Try to extract numeric weight with unit
    // e.g., "500 g" -> "500g", "2 x 1 kg" -> "2kg"
    const match = quantityStr.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|pc|pcs|pack)?/i);
    if (match) {
        const number = match[1];
        const unit = (match[2] || '').toLowerCase();
        return `${number}${unit}`;
    }
    
    return quantityStr.toLowerCase().replace(/\s+/g, '');
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
                        // ðŸ” NEW: Extract variants - returns array of products
                        const products = extractProductsWithVariants(snippet.data);
                        
                        products.forEach(product => {
                            if (product && product.id && product.name) {
                                // Use productId as key to avoid duplicates (includes weight now)
                                const key = product.productId || product.id;
                                if (!productsMap.has(key)) {
                                    product.rank = totalProcessed + 1;
                                    productsMap.set(key, product);
                                    totalProcessed++;
                                }
                            }
                        });
                    }
                });
            }
        } catch (e) {
            log('warn', logPrefix, `Error processing API response ${idx}: ${e.message}`);
        }
    });

    log('success', logPrefix, `Extracted ${totalProcessed} products (including variants) from ${apiResponses.length} API responses`);
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

// ** MODIFIED: Uses in-browser fetch pagination instead of scrolling **
async function scrapeCategory(context, category, pincode, proxyConfig, deliveryTime = '', maxRetries = 4) {
    const logPrefix = category.name || category.url.split('/').pop() || 'Unknown';
    const listingEndpoint = 'https://blinkit.com/v1/layout/listing_widgets';

    // Stagger start time
    const delayTime = Math.floor(Math.random() * 2000) + 500;
    await sleep(delayTime);

    let products = [];
    let attempts = 0;

    while (attempts <= maxRetries) {
        const page = await context.newPage();
        try {
            log('start', logPrefix, `Starting scrape... (Attempt ${attempts + 1}/${maxRetries + 1})`);

            products = await Promise.race([
                (async () => {
                    // Create api_dumps directory
                    const apiDumpsDir = path.join(process.cwd(), 'api_dumps');
                    if (!fs.existsSync(apiDumpsDir)) {
                        fs.mkdirSync(apiDumpsDir, { recursive: true });
                    }

                    const capturedHeaders = {};
                    let capturedRequestBody = null;
                    const wantedHeaders = [
                        'auth_key',
                        'session_uuid',
                        'device_id',
                        'lat',
                        'lon',
                        'access_token',
                        'app_client',
                        'app_version',
                        'web_app_version',
                        'rn_bundle_version',
                        'platform',
                        'x-age-consent-granted',
                        'authorization',
                        'cookie'
                    ];

                    const captureTemplateFromRequest = (request) => {
                        const requestUrl = request.url();
                        if (!requestUrl.includes('/v1/layout/listing_widgets')) return;

                        const h = request.headers();
                        for (const key of wantedHeaders) {
                            if (h[key] !== undefined && h[key] !== '') {
                                capturedHeaders[key] = h[key];
                            }
                        }

                        if (!capturedRequestBody) {
                            try {
                                const postData = request.postData();
                                if (postData && postData.length > 2) {
                                    capturedRequestBody = postData;
                                }
                            } catch (_) {
                                // Keep fallback body
                            }
                        }
                    };

                    page.on('request', captureTemplateFromRequest);

                    // Block unnecessary resources for speed
                    await page.route('**/*', (route) => {
                        const type = route.request().resourceType();
                        if (['font', 'media', 'image'].includes(type)) {
                            return route.abort();
                        }
                        return route.continue();
                    });

                    // Extract category IDs from URL (e.g., /cid/1487/1489)
                    const categoryMatch = category.url.match(/\/cid\/(\d+)\/(\d+)/);
                    const l0_cat = categoryMatch ? categoryMatch[1] : '1487';
                    const l1_cat = categoryMatch ? categoryMatch[2] : '1489';
                    log('info', logPrefix, `Category IDs extracted: l0_cat=${l0_cat}, l1_cat=${l1_cat}`);

                    // Prepare warmup capture before navigation so we don't miss first request
                    const initialRequestPromise = page.waitForRequest(
                        (request) => {
                            if (!request.url().includes('/v1/layout/listing_widgets')) return false;
                            captureTemplateFromRequest(request);
                            return true;
                        },
                        { timeout: 25000 }
                    );

                    const initialResponsePromise = page.waitForResponse(
                        (response) => response.url().includes('/v1/layout/listing_widgets') && response.status() === 200,
                        { timeout: 25000 }
                    );

                    // Navigate to category and capture initial payload
                    await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    const [initialRequest, initialResponse] = await Promise.all([initialRequestPromise, initialResponsePromise]);
                    if (initialRequest) {
                        captureTemplateFromRequest(initialRequest);
                    }

                    let initialData = null;
                    try {
                        initialData = await initialResponse.json();
                    } catch (e) {
                        throw new Error(`Failed to parse initial listing response: ${e.message}`);
                    }

                    const initialSnippets = initialData?.response?.snippets || [];
                    log('info', logPrefix, `Initial response captured with ${initialSnippets.length} items`);

                    const allApiResponses = [initialData];
                    const debugLog = [];

                    const requestBodyObject = (() => {
                        if (!capturedRequestBody) return {};
                        try {
                            return JSON.parse(capturedRequestBody);
                        } catch (_) {
                            return {};
                        }
                    })();

                    const extraHeaders = {};
                    const headerTemplate = {
                        access_token: capturedHeaders.access_token || 'null',
                        app_client: capturedHeaders.app_client || 'consumer_web',
                        app_version: capturedHeaders.app_version || '1010101010',
                        auth_key: capturedHeaders.auth_key || '',
                        device_id: capturedHeaders.device_id || '',
                        lat: capturedHeaders.lat || '28.5355',
                        lon: capturedHeaders.lon || '77.3910',
                        session_uuid: capturedHeaders.session_uuid || '',
                        web_app_version: capturedHeaders.web_app_version || '1008010016',
                        rn_bundle_version: capturedHeaders.rn_bundle_version || '1009003012',
                        platform: capturedHeaders.platform || 'mobile_web',
                        'x-age-consent-granted': capturedHeaders['x-age-consent-granted'] || 'true',
                        'cache-control': 'no-cache',
                        pragma: 'no-cache'
                    };

                    for (const [k, v] of Object.entries(headerTemplate)) {
                        if (v !== undefined && v !== null && v !== '') extraHeaders[k] = v;
                    }

                    const resolveRequestUrl = (urlOrPath) => {
                        if (!urlOrPath) return null;
                        if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) return urlOrPath;
                        if (urlOrPath.startsWith('/')) return `https://blinkit.com${urlOrPath}`;
                        if (urlOrPath.startsWith('?')) return `${listingEndpoint}${urlOrPath}`;
                        return `${listingEndpoint}?${urlOrPath}`;
                    };

                    const normalizeUrl = (urlOrPath) => {
                        const absolute = resolveRequestUrl(urlOrPath);
                        if (!absolute) return '';
                        try {
                            const parsed = new URL(absolute);
                            const entries = Array.from(parsed.searchParams.entries()).sort((a, b) => {
                                const ak = `${a[0]}=${a[1]}`;
                                const bk = `${b[0]}=${b[1]}`;
                                return ak.localeCompare(bk);
                            });
                            return `${parsed.origin}${parsed.pathname}?${new URLSearchParams(entries).toString()}`;
                        } catch (_) {
                            return absolute;
                        }
                    };

                    let nextUrl = initialData?.response?.pagination?.next_url || null;
                    let pageCount = 1;
                    let totalCollected = initialSnippets.length;
                    const visitedUrls = new Set();

                    if (nextUrl) {
                        visitedUrls.add(normalizeUrl(nextUrl));
                    }

                    debugLog.push(`Starting pagination from next_url: ${nextUrl || 'none'}`);

                    while (nextUrl && pageCount < 80) {
                        const requestUrl = resolveRequestUrl(nextUrl);
                        if (!requestUrl) break;

                        let result = null;
                        for (let retry = 1; retry <= 3; retry += 1) {
                            result = await page.evaluate(
                                async ({ requestUrl, extraHeaders, requestBodyObject }) => {
                                    try {
                                        const res = await fetch(requestUrl, {
                                            method: 'POST',
                                            credentials: 'include',
                                            headers: {
                                                'content-type': 'application/json',
                                                accept: '*/*',
                                                ...extraHeaders
                                            },
                                            body: JSON.stringify(requestBodyObject)
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
                                            requestUrl: res.url || requestUrl,
                                            data,
                                            error: res.ok ? null : raw.slice(0, 240)
                                        };
                                    } catch (error) {
                                        return {
                                            ok: false,
                                            status: 0,
                                            requestUrl,
                                            data: null,
                                            error: error.message
                                        };
                                    }
                                },
                                { requestUrl, extraHeaders, requestBodyObject }
                            );

                            if (result.ok && result.data) break;

                            const retriable = result.status === 0 || result.status === 429 || result.status >= 500;
                            if (!retriable || retry === 3) break;
                            await sleep(400 * (2 ** (retry - 1)));
                        }

                        if (!result || !result.ok || !result.data) {
                            debugLog.push(`Pagination stopped: fetch failed (${result?.status || 0}) ${result?.error || 'unknown'}`);
                            break;
                        }

                        const snippets = result.data?.response?.snippets || [];
                        allApiResponses.push(result.data);
                        pageCount += 1;
                        totalCollected += snippets.length;
                        debugLog.push(`Page ${pageCount}: snippets=${snippets.length}`);

                        const candidateNext = result.data?.response?.pagination?.next_url || null;
                        if (!candidateNext) break;

                        const loopGuard = normalizeUrl(candidateNext);
                        if (visitedUrls.has(loopGuard)) {
                            debugLog.push('Pagination stopped: repeated next_url detected');
                            break;
                        }

                        visitedUrls.add(loopGuard);
                        nextUrl = candidateNext;
                        await sleep(Math.floor(Math.random() * 350) + 200);
                    }

                    log('success', logPrefix, `Fetched ${allApiResponses.length} API pages with ${totalCollected} snippets`);
                    debugLog.forEach((msg) => log('info', logPrefix, `Pagination: ${msg}`));

                    // Extract products from full API responses
                    const extracted = processApiData(allApiResponses, logPrefix);

                    // Add category and delivery time
                    extracted.forEach(p => {
                        p.category = logPrefix;
                        p.categoryUrl = category.url;
                        if (typeof deliveryTime === 'string' && deliveryTime.trim()) {
                            p.deliveryTime = deliveryTime.trim();
                        }
                    });

                    // Check if we have products
                    if (extracted.length > 0) {
                        // Save raw API response sample (for analysis)
                        if (allApiResponses.length > 0) {
                            const sampleRawFilename = `raw_api_sample_${logPrefix.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
                            const sampleRawPath = path.join(apiDumpsDir, sampleRawFilename);

                            const sampleRawResponses = allApiResponses.slice(0, 2);
                            fs.writeFileSync(sampleRawPath, JSON.stringify({
                                metadata: {
                                    category: logPrefix,
                                    url: category.url,
                                    pincode: pincode,
                                    timestamp: new Date().toISOString(),
                                    note: 'Raw API responses - inspect for variant data in snippets[].data structure'
                                },
                                totalRawResponses: allApiResponses.length,
                                sampleResponses: sampleRawResponses
                            }, null, 2));

                            log('info', logPrefix, `Saved raw API sample: ${sampleRawFilename}`);
                        }

                        // Save consolidated API dump
                        const consolidatedFilename = `api_consolidated_${logPrefix.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
                        const consolidatedPath = path.join(apiDumpsDir, consolidatedFilename);

                        fs.writeFileSync(consolidatedPath, JSON.stringify({
                            metadata: {
                                category: logPrefix,
                                url: category.url,
                                pincode: pincode,
                                timestamp: new Date().toISOString(),
                                method: 'in-browser-fetch-next-url',
                                attempt: attempts + 1
                            },
                            totalApiResponses: allApiResponses.length,
                            totalExtracted: extracted.length,
                            products: extracted
                        }, null, 2));

                        log('success', logPrefix, `Saved ${extracted.length} products`);
                        return extracted;
                    }

                    throw new Error('No products extracted from this category');
                })(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Scraping operation timed out after 3 minutes')), 180000))
            ]);

            if (products.length > 0) {
                log('success', logPrefix, `Extracted ${products.length} products`);
                return products;
            }

            throw new Error('No products extracted');
        } catch (e) {
            log('error', logPrefix, `Attempt ${attempts + 1} failed: ${e.message}`);
        } finally {
            // Always close the page
            try {
                if (!page.isClosed()) await page.close();
            } catch (err) {
                log('warn', logPrefix, `Error closing page: ${err.message}`);
            }
        }

        attempts++;

        // Retry logic with exponential backoff
        if (attempts <= maxRetries) {
            const backoffDelay = Math.pow(2, attempts) * 1000 + Math.random() * 2000; // 2s, 4s, 8s + random
            log('warn', logPrefix, `Retrying in ${(backoffDelay / 1000).toFixed(1)}s... (Attempt ${attempts + 1}/${maxRetries + 1})`);
            await sleep(backoffDelay);
        }
    }

    // All retries exhausted - record as failed
    const failedPath = path.resolve('failed_urls.json');
    let failed = [];
    try {
        const data = fs.readFileSync(failedPath, 'utf-8');
        failed = JSON.parse(data);
    } catch (e) { }

    if (!failed.includes(category.url)) {
        failed.push(category.url);
        fs.writeFileSync(failedPath, JSON.stringify(failed, null, 2));
    }

    log('error', logPrefix, `Failed after ${maxRetries + 1} attempts. Category URL: ${category.url}`);
    return [];
}
// Helper: Random delay for human-like behavior
const randomDelay = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1)) + min);

// --- API Endpoints ---

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', services: { scraper: 'up' } });
});

app.post('/blinkitcategoryscrapper', async (req, res) => {
    const { url, urls, pincode, categories, maxConcurrentTabs = 2, proxyUrl, store } = req.body;

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
                    // Minimal cleanup of the session data before using
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
                    contextOptions.storageState = sessionData;
                    sessionLoaded = true;
                    log('info', 'Session', `âœ… Loaded existing session for ${pincode}`);
                }
            } catch (e) {
                log('warn', 'Session', `Error loading session: ${e.message}. Will create new one.`);
            }
        } else {
            log('info', 'Session', `âš ï¸ No session found for ${pincode}. Initiating pincode setup...`);
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
        const setupResult = await setupLocation(context, pincode, 'Setup');
        const setupSucceeded = Boolean(setupResult);
        const deliveryTime = (typeof setupResult === 'string') ? setupResult.trim() : '';

        // If setupLocation returned a valid result (meaning we are at the right location)
        // AND we didn't have a session loaded originally (or it was invalid and setupLocation fixed it)
        // then we save the new state.
        if (setupSucceeded) {
            const newState = await context.storageState();
            // Check if we need to save (if it was a new session OR if the old one was invalid/updated)
            // For simplicity, we can overwrite if we just performed a setup action that wasn't a "skip".
            // However, setupLocation returns 'true' (or string) if successful. 
            // We should check if the file exists to avoid unnecessary writes, OR just overwrite to be safe and fresh.

            // If we entered pincode, we definitely want to save.
            if (!sessionLoaded) {
                try {
                    fs.mkdirSync('sessions', { recursive: true });
                    fs.writeFileSync(sessionPath, JSON.stringify(newState, null, 2));
                    log('success', 'Session', `ðŸ’¾ Saved NEW session to ${sessionPath}`);
                } catch (e) { log('error', 'Session', `Error saving session: ${e.message}`); }
            } else {
                // Even if session existed, maybe cookies refreshed? Optional: update it.
                // let's update it to keep it fresh.
                try {
                    fs.writeFileSync(sessionPath, JSON.stringify(newState, null, 2));
                    // log('info', 'Session', `Updated existing session file.`); 
                } catch (e) { }
            }
        }

        // 2. Process Categories SEQUENTIALLY (one at a time) for testing
        const allProducts = [];
        
        log('info', 'Scrape', `Processing ${targets.length} categories sequentially (one at a time)...`);
        
        for (let i = 0; i < targets.length; i++) {
            const category = targets[i];
            log('info', 'Batch', `[${i + 1}/${targets.length}] Scraping: ${category.name}`);
            
            // Scrape ONE category at a time, wait for completion before moving to next
            const result = await scrapeCategory(context, category, pincode, proxyConfig, deliveryTime);
            
            if (result && result.length > 0) {
                allProducts.push(...result);
                log('success', 'Batch', `[${i + 1}/${targets.length}] âœ… Got ${result.length} products`);
            } else {
                log('warn', 'Batch', `[${i + 1}/${targets.length}] âš ï¸ No products extracted`);
            }
            
            // Small delay between categories to avoid overwhelming the API
            if (i < targets.length - 1) {
                const delayMs = Math.random() * 2000 + 3000;  // 3-5 seconds between categories
                log('info', 'Batch', `Waiting ${(delayMs / 1000).toFixed(1)}s before next category...`);
                await sleep(delayMs);
            }
        }

        log('success', 'Summary', `Total products extracted: ${allProducts.length}`);
        console.log('[DEBUG] allProducts sample:', allProducts.slice(0, 2));

        // === APPLY STANDARDIZED FORMAT ===

        // 0. Strip any stray fields that raw scraper data may have injected
        //    (subCategory, new, rank, category slug text etc.)
        //    so they don't pollute the transformed output.
        allProducts.forEach(p => {
            delete p.subCategory;
            delete p.new;
        });

        // 1. Transform and Enrich first (suffix gets added here)
        let transformedProducts = [];
        try {
            transformedProducts = allProducts.map((product, index) => {
                const productCategoryUrl = product.categoryUrl || 'N/A';
                const officialCategory = product.category || 'N/A';

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
                    'N/A',
                    pincode,
                    index + 1,
                    categoryMapping
                );
            });
        } catch (transformError) {
            log('error', 'Transform', `Transformation failed: ${transformError.message}`);
            console.log('[DEBUG] Transform error:', transformError);
            throw transformError;
        }

        console.log('[DEBUG] transformedProducts count:', transformedProducts.length);
        console.log('[DEBUG] transformedProducts sample:', transformedProducts.slice(0, 2));

        // 2. Deduplicate AFTER transform, but keep same product across different category scopes.
        // Treat same product in different categoryUrl/officialSubCategory as distinct entries.
        const seenIds = new Set();
        const dedupedProducts = transformedProducts.filter((p) => {
            const baseKey = p.productId || p.productName || 'unknown_product';
            const categoryScope = p.categoryUrl || 'N/A';
            const subCategoryScope = p.officialSubCategory || 'N/A';
            const key = `${baseKey}||${categoryScope}||${subCategoryScope}`;

            if (seenIds.has(key)) return false;
            seenIds.add(key);
            return true;
        });

        console.log('[DEBUG] dedupedProducts count:', dedupedProducts.length);

        log('info', 'Transform', `Raw: ${allProducts.length}, After transform+dedup: ${dedupedProducts.length} unique products`);

        // 3. Ranking per officialSubCategory, but variants share rank with their main product.
        const subCatRankCounters = new Map();
        const rankByGroupAndSubCat = new Map();

        dedupedProducts.forEach((p) => {
            const subCat = p.officialSubCategory || '__unknown__';
            const groupProductId = (p.comboOf || p.variantOf || p.productId || p.productName || '__unknown_product__');
            const groupKey = `${subCat}||${groupProductId}`;

            if (!rankByGroupAndSubCat.has(groupKey)) {
                const nextRank = (subCatRankCounters.get(subCat) || 0) + 1;
                subCatRankCounters.set(subCat, nextRank);
                rankByGroupAndSubCat.set(groupKey, nextRank);
            }

            p.ranking = rankByGroupAndSubCat.get(groupKey);
        });

        const responsePayload = {
            status: 'success',
            pincode,
            totalProducts: dedupedProducts.length,
            products: dedupedProducts,
            meta: {
                total_urls: targets.length,
                scrapedAt: new Date().toISOString()
            }
        };

        // === STORAGE LOGIC (NEW) ===
        if (store) {
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

        // API dumps are preserved in api_dumps/ directory for analysis
        log('info', 'Storage', `API dump files saved and retained for analysis`);

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

const server = app.listen(PORT, () => {
    console.log(`${colors.green}Blinkit Scraper API running on port ${PORT}${colors.reset}`);
});
server.setTimeout(0);

