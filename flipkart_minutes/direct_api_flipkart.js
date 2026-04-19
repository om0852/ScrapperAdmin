/**
 * Direct API Flipkart Minutes Scraper
 * 
 * Bypasses browser automation by calling Flipkart's API endpoints directly
 * Handles pagination, retries, and session management
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

// === CUSTOM HTTP CLIENT (uses built-in https module) ===
/**
 * Make HTTPS request (replaces node-fetch with built-in https module)
 */
function makeHttpsRequest(url, method = 'GET', body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url);
            
            // Prepare request headers
            let requestHeaders = {
                ...headers,
                'Host': urlObj.hostname
            };
            
            // If sending body, set Content-Length
            let bodyString = null;
            if (body) {
                bodyString = JSON.stringify(body);
                requestHeaders['Content-Length'] = Buffer.byteLength(bodyString);
            }
            
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: method,
                headers: requestHeaders,
                timeout: 30000,
                // Try HTTP/2 for better compatibility with Rome API
                ALPNProtocols: ['h2', 'http/1.1']
            };

            const req = https.request(options, (res) => {
                let data = '';
                let decompressed = res;

                // Log protocol info for debugging
                if (!req._protocolLogged) {
                    req._protocolLogged = true;
                    if (req.getProtocol) {
                        console.log(`[DEBUG] Protocol: ${req.getProtocol()}`);
                    }
                }

                // Handle gzip/brotli/deflate compression
                if (res.headers['content-encoding'] === 'gzip') {
                    decompressed = res.pipe(zlib.createGunzip());
                } else if (res.headers['content-encoding'] === 'deflate') {
                    decompressed = res.pipe(zlib.createInflate());
                } else if (res.headers['content-encoding'] === 'br') {
                    // Brotli not supported in older Node, just treat as plain
                    decompressed = res;
                }

                decompressed.on('data', (chunk) => {
                    data += chunk;
                });

                decompressed.on('end', () => {
                    resolve({
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        headers: res.headers,
                        data: data,
                        ok: res.statusCode >= 200 && res.statusCode < 300
                    });
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (bodyString) {
                req.write(bodyString);
            }

            req.end();
        } catch (err) {
            reject(err);
        }
    });
}

const SESSION_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR);
}

const API_DUMPS_DIR = path.join(__dirname, 'api_dumps');
if (!fs.existsSync(API_DUMPS_DIR)) {
    fs.mkdirSync(API_DUMPS_DIR);
}

/**
 * Save API response dumps for debugging
 */
function saveApiDump(pincode, url, jsonData, dumpType = 'response') {
    try {
        const timestamp = Date.now();
        const urlHash = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const filename = `dump_${pincode}_${dumpType}_${urlHash}_${timestamp}.json`;
        const filepath = path.join(API_DUMPS_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(jsonData, null, 2));
        console.log(`✓ API dump saved: ${filename}`);
        return filename;
    } catch (err) {
        console.error(`✗ Failed to save API dump: ${err.message}`);
        return null;
    }
}

/**
 * Save session cookie to disk
 */
function saveSession(pincode, cookies, headers) {
    try {
        const sessionFile = path.join(SESSION_DIR, `session_${pincode}.json`);
        fs.writeFileSync(sessionFile, JSON.stringify({
            cookies,
            headers,
            timestamp: new Date().toISOString()
        }));
        console.log(`✓ Session saved for pincode ${pincode}`);
        return sessionFile;
    } catch (err) {
        console.error(`✗ Failed to save session: ${err.message}`);
        return null;
    }
}

/**
 * Load session from disk if available
 */
function loadSession(pincode) {
    try {
        const sessionFile = path.join(SESSION_DIR, `session_${pincode}.json`);
        if (!fs.existsSync(sessionFile)) {
            return null;
        }
        const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        console.log(`✓ Session loaded for pincode ${pincode}`);
        return session;
    } catch (err) {
        console.error(`✗ Failed to load session: ${err.message}`);
        return null;
    }
}

/**
 * Extract cookies from Set-Cookie headers
 */
function extractCookies(setCookieHeaders) {
    if (!setCookieHeaders) return '';
    
    if (Array.isArray(setCookieHeaders)) {
        return setCookieHeaders
            .map(header => header.split(';')[0])
            .join('; ');
    }
    
    return setCookieHeaders.split(';')[0];
}

/**
 * Build request headers for API calls
 * Headers must match what Flipkart API expects
 */
function buildHeaders(sessionCookies = '') {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Ch-Ua': '"Google Chrome";v="146", "Chromium";v="146", ";Not A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Content-Type': 'application/json',
        'Origin': 'https://www.flipkart.com',
        'Referer': 'https://www.flipkart.com/',
        'Cookie': sessionCookies,
        'X-User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 FKUA/website/desktop/5.0.0/desktop',
        'X-Request-Id': generateRequestId(),
        'Dnt': '1',
        'Upgrade-Insecure-Requests': '1',
        'Connection': 'keep-alive'
    };
}

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Call Flipkart API with retry logic
 */
async function callFlipkartAPI(url, pincode, method = 'GET', body = null, cookies = '') {
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const headers = buildHeaders(cookies);
            
            console.log(`[Attempt ${attempt}/${maxRetries}] Calling ${url.substring(0, 80)}...`);
            
            // Debug: Log headers being sent (avoid logging sensitive data)
            if (attempt === 1) {
                console.log(`[DEBUG] Headers keys: ${Object.keys(headers).join(', ')}`);
                console.log(`[DEBUG] Request method: ${method}`);
                if (body) {
                    console.log(`[DEBUG] Request body keys: ${Object.keys(body).join(', ')}`);
                }
            }
            
            // Make HTTPS request using built-in https module
            const response = await makeHttpsRequest(url, method, body, headers);
            
            // Check if we got set-cookie headers for session persistence
            const setCookie = response.headers['set-cookie'];
            if (setCookie) {
                const newCookies = extractCookies(setCookie);
                if (newCookies) {
                    console.log(`✓ New session cookie received`);
                    saveSession(pincode, newCookies, headers);
                    cookies = newCookies;
                }
            }
            
            if (!response.ok) {
                // Log response details for debugging
                console.log(`[DEBUG] HTTP ${response.status} Response:`);
                console.log(`[DEBUG] Content-Type: ${response.headers['content-type']}`);
                
                if (response.data) {
                    try {
                        const parsed = JSON.parse(response.data);
                        console.log(`[DEBUG] Error Response:`, JSON.stringify(parsed, null, 2).substring(0, 500));
                    } catch (e) {
                        console.log(`[DEBUG] Response Body:`, response.data.substring(0, 500));
                    }
                }
                
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            // Parse JSON response
            let data;
            try {
                data = JSON.parse(response.data);
            } catch (parseErr) {
                console.error(`✗ Failed to parse JSON response: ${parseErr.message}`);
                throw new Error(`Invalid JSON response: ${parseErr.message}`);
            }
            
            // Save API dump for analysis
            saveApiDump(pincode, url, data, 'successful_response');
            
            return { data, cookies };
            
        } catch (error) {
            lastError = error;
            console.warn(`✗ Attempt ${attempt} failed: ${error.message}`);
            
            if (attempt < maxRetries) {
                const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                console.log(`  Retrying in ${delayMs}ms...`);
                await new Promise(r => setTimeout(r, delayMs));
            }
        }
    }
    
    throw new Error(`Failed after ${maxRetries} retries: ${lastError.message}`);
}

/**
 * Extract products from API response
 */
function extractProductsFromResponse(response) {
    const products = [];
    
    if (!response || !response.RESPONSE || !response.RESPONSE.slots) {
        return products;
    }
    
    const slots = response.RESPONSE.slots;
    
    slots.forEach(slot => {
        if (!slot.widget || !slot.widget.data) {
            return;
        }
        
        const widgetData = slot.widget.data;
        
        // Extract from products array (common format)
        if (widgetData.products && Array.isArray(widgetData.products)) {
            widgetData.products.forEach(productOuter => {
                if (productOuter.productInfo && productOuter.productInfo.value) {
                    const productData = productOuter.productInfo.value;
                    
                    // Extract main product
                    if (productData.id && productData.titles && productData.titles.title) {
                        const imageUrl = extractImageUrl(productData);
                        products.push({
                            productId: productData.id,
                            productName: productData.titles.title,
                            productImage: imageUrl || constructFallbackImageUrl(productData),
                            brand: productData.brand || 'N/A',
                            currentPrice: extractPrice(productData),
                            originalPrice: extractMRP(productData),
                            discountPercentage: extractDiscount(productData),
                            rating: extractRating(productData),
                            quantity: extractQuantity(productData),
                            isOutOfStock: !isInStock(productData),
                            isAd: false,
                            productUrl: extractProductUrl(productData),
                            platform: 'flipkart_minutes',
                            scrapedAt: new Date().toISOString()
                        });
                    }
                    
                    // Extract variant products if available
                    if (productData.productSwatch && productData.productSwatch.products) {
                        Object.entries(productData.productSwatch.products).forEach(([variantId, variantData]) => {
                            if (variantData.id && variantData.titles && variantData.titles.title) {
                                const varImageUrl = extractImageUrl(variantData);
                                products.push({
                                    productId: variantData.id,
                                    productName: variantData.titles.title,
                                    productImage: varImageUrl || constructFallbackImageUrl(variantData),
                                    brand: variantData.brand || 'N/A',
                                    currentPrice: extractPrice(variantData),
                                    originalPrice: extractMRP(variantData),
                                    discountPercentage: extractDiscount(variantData),
                                    rating: extractRating(variantData),
                                    quantity: extractQuantity(variantData),
                                    isOutOfStock: !isInStock(variantData),
                                    isAd: false,
                                    productUrl: extractProductUrl(variantData),
                                    platform: 'flipkart_minutes',
                                    scrapedAt: new Date().toISOString()
                                });
                            }
                        });
                    }
                }
            });
        }
    });
    
    return products;
}

/**
 * Helper: Construct a fallback image URL if extraction fails
 * Uses product ID to generate a placeholder or cached image URL
 */
function constructFallbackImageUrl(data) {
    if (!data) return '';

    // Try to construct a URL from available data
    const productId = data.id || '';
    const itemId = data.itemId || '';
    
    // Fallback: Use a placeholder CDN URL with product ID
    if (productId) {
        return `https://rukminim1.flixcart.com/image/300/300/xif0q/placeholder/{productId}.jpeg?q=70`;
    }
    
    // Last resort: Return empty string to indicate no image
    return '';
}

/**
 * Helper: Extract image URL
 * Checks multiple possible locations for image URLs
 * Returns: { url, source } object for debugging
 */
function extractImageUrl(data) {
    if (!data) return null;

    let imageUrl = null;
    let source = null;

    // Try primary location: media.images array
    if (data.media && data.media.images && data.media.images.length > 0) {
        imageUrl = data.media.images[0].url;
        source = 'media.images[0].url';
    }
    // Fallback 1: direct imageUrl property
    else if (data.imageUrl) {
        imageUrl = data.imageUrl;
        source = 'data.imageUrl';
    }
    // Fallback 2: images array at root level
    else if (data.images && Array.isArray(data.images) && data.images.length > 0) {
        imageUrl = data.images[0].url || data.images[0];
        source = 'data.images[0]';
    }
    // Fallback 3: thumbnailImage property
    else if (data.thumbnailImage) {
        imageUrl = data.thumbnailImage;
        source = 'data.thumbnailImage';
    }
    // Fallback 4: image property
    else if (data.image) {
        imageUrl = data.image;
        source = 'data.image';
    }
    // Fallback 5: Look in value nested object if exists
    else if (data.value && data.value.media && data.value.media.images && data.value.media.images.length > 0) {
        imageUrl = data.value.media.images[0].url;
        source = 'data.value.media.images[0].url';
    }
    // Fallback 6: value.images
    else if (data.value && data.value.images && Array.isArray(data.value.images) && data.value.images.length > 0) {
        imageUrl = data.value.images[0].url || data.value.images[0];
        source = 'data.value.images[0]';
    }

    if (!imageUrl) {
        return null;
    }

    // Replace placeholders in URL
    imageUrl = imageUrl.replace(/{@width}/g, '400')
                      .replace(/{@height}/g, '400')
                      .replace(/{@quality}/g, '70')
                      .replace(/{@quality}/gi, '70');

    // Return just the URL (simplified for backward compatibility)
    return imageUrl;
}

/**
 * Helper: Extract current price
 */
function extractPrice(data) {
    if (data.pricing && data.pricing.finalPrice && data.pricing.finalPrice.value) {
        return parseFloat(data.pricing.finalPrice.value);
    }
    return 0;
}

/**
 * Helper: Extract MRP (original price)
 */
function extractMRP(data) {
    if (data.pricing && data.pricing.prices) {
        const mrpObj = data.pricing.prices.find(p => p.priceType === 'MRP');
        if (mrpObj) {
            return parseFloat(mrpObj.value);
        }
    }
    // Fallback to final price if MRP not found
    return extractPrice(data);
}

/**
 * Helper: Extract discount percentage
 */
function extractDiscount(data) {
    if (data.pricing && data.pricing.totalDiscount) {
        return parseInt(data.pricing.totalDiscount);
    }
    return 0;
}

/**
 * Helper: Extract rating
 */
function extractRating(data) {
    if (data.rating && data.rating.average) {
        return parseFloat(data.rating.average);
    }
    return 0;
}

/**
 * Helper: Extract quantity/weight
 */
function extractQuantity(data) {
    if (data.titles && data.titles.subtitle) {
        return data.titles.subtitle;
    }
    return 'N/A';
}

/**
 * Helper: Check if product is in stock
 */
function isInStock(data) {
    if (data.inventory && typeof data.inventory.inStock === 'boolean') {
        return data.inventory.inStock;
    }
    return true; // Default to in stock if not specified
}

/**
 * Helper: Extract product URL
 */
function extractProductUrl(data) {
    if (data.productUrl) {
        if (!data.productUrl.startsWith('http')) {
            return 'https://www.flipkart.com' + data.productUrl;
        }
        return data.productUrl;
    }
    if (data.id) {
        return `https://www.flipkart.com/p/${data.id}`;
    }
    return null;
}

/**
 * Bootstrap session by making initial request to get cookies
 * Many APIs require an initial "setup" request to establish session
 */
async function bootstrapSession(pincode) {
    console.log(`[Bootstrap] Initializing session for pincode ${pincode}...`);
    try {
        // Try to fetch a basic page to establish session
        const bootstrapUrl = 'https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false';
        const bootstrapPayload = {
            pageContext: {
                pageId: 'PAGE_SEARCH',
                catalogId: null,
                pageNumber: 1,
                pageSize: 1
            },
            requestContext: {
                marketPlace: 'HYPERLOCAL',
                clientContext: {
                    appVersion: '146.0.0.0',
                    entryPoint: 'HYPERLOCAL_BROWSE'
                }
            }
        };
        
        const headers = buildHeaders('');
        console.log(`[Bootstrap] Making bootstrap request to Rome API...`);
        
        const response = await makeHttpsRequest(bootstrapUrl, 'POST', bootstrapPayload, headers);
        
        // Check for Set-Cookie headers
        const setCookie = response.headers['set-cookie'];
        if (setCookie) {
            const cookies = extractCookies(setCookie);
            console.log(`✓ [Bootstrap] Session established with cookies`);
            saveSession(pincode, cookies, headers);
            return cookies;
        } else {
            console.log(`ℹ [Bootstrap] No cookies received in response`);
        }
        
        return '';
    } catch (error) {
        console.warn(`⚠ [Bootstrap] Warning: ${error.message}`);
        return '';
    }
}

/**
 * Scrape a single category URL via direct API
 */
async function scrapeDirectAPI(categoryUrl, pincode) {
    console.log(`\n🌐 Scraping: ${categoryUrl}`);
    console.log(`📍 Pincode: ${pincode}`);
    
    const allProducts = [];
    let sessionCookies = '';
    let pageNumber = 0;
    const maxPages = 50; // Prevent infinite loops
    let hasMorePages = true;
    
    try {
        // Load existing session if available
        const savedSession = loadSession(pincode);
        if (savedSession && savedSession.cookies) {
            sessionCookies = savedSession.cookies;
            console.log(`✓ Using saved session with cookies`);
        } else {
            console.log(`ℹ No saved session, attempting to bootstrap...`);
            // Try to bootstrap a new session
            sessionCookies = await bootstrapSession(pincode);
        }
        
        // Paginate through results
        while (hasMorePages && pageNumber < maxPages) {
            pageNumber++;
            console.log(`\n📄 Fetching page ${pageNumber}...`);
            
            // Build API request body with pagination
            // This payload structure matches Flipkart's actual API expectations
            const apiPayload = {
                pageContext: {
                    pageId: 'PAGE_SEARCH',
                    catalogId: null,
                    pageNumber: pageNumber,
                    pageSize: 40 // Standard page size
                },
                requestContext: {
                    marketPlace: 'HYPERLOCAL',
                    clientContext: {
                        appVersion: '146.0.0.0',
                        entryPoint: 'HYPERLOCAL_BROWSE'
                    }
                }
            };
            
            // CORRECT API ENDPOINT: Flipkart uses dedicated Rome API servers
            // The endpoint is hardcoded, NOT derived from category URL
            const apiEndpoint = 'https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false';
            
            try {
                const { data, cookies: newCookies } = await callFlipkartAPI(
                    apiEndpoint, 
                    pincode, 
                    'POST', 
                    apiPayload, 
                    sessionCookies
                );
                
                // Update session if we got new cookies
                if (newCookies) {
                    sessionCookies = newCookies;
                }
                
                // Extract products from this page
                const pageProducts = extractProductsFromResponse(data);
                console.log(`✓ Extracted ${pageProducts.length} products from page ${pageNumber}`);
                
                allProducts.push(...pageProducts);
                
                // Check if there are more pages
                if (data.RESPONSE && data.RESPONSE.pageMeta) {
                    hasMorePages = data.RESPONSE.pageMeta.hasNextPage !== false;
                } else {
                    hasMorePages = false;
                }
                
                // Break if no products found
                if (pageProducts.length === 0) {
                    hasMorePages = false;
                }
                
                // Rate limiting: wait between pages
                if (hasMorePages) {
                    console.log(`⏳ Waiting before next page...`);
                    await new Promise(r => setTimeout(r, 2000));
                }
                
            } catch (error) {
                console.error(`✗ Error fetching page ${pageNumber}: ${error.message}`);
                // Continue with what we have if we got some products
                hasMorePages = false;
            }
        }
        
        // Save final session
        if (sessionCookies) {
            saveSession(pincode, sessionCookies, buildHeaders(sessionCookies));
        }
        
        console.log(`\n✅ Scraping complete: ${allProducts.length} total products`);
        return allProducts;
        
    } catch (error) {
        console.error(`❌ Scrape failed: ${error.message}`);
        return [];
    }
}

/**
 * Scrape multiple URLs with concurrency control
 */
async function scrapeMultipleDirectAPI(urls, pincode, maxConcurrentRequests = 2) {
    console.log(`\n🚀 Starting direct API scrape for ${urls.length} URLs`);
    console.log(`📍 Pincode: ${pincode}`);
    console.log(`⚡ Concurrency: ${maxConcurrentRequests}`);
    
    const results = [];
    const queue = urls.map((url, index) => ({ url, index }));
    
    // Worker function for concurrent processing
    const worker = async () => {
        while (queue.length > 0) {
            const { url, index } = queue.shift();
            try {
                const products = await scrapeDirectAPI(url, pincode);
                results[index] = products;
            } catch (error) {
                console.error(`✗ Failed to scrape URL ${index}: ${error.message}`);
                results[index] = [];
            }
        }
    };
    
    // Create and run concurrent workers
    const workers = Array(Math.min(urls.length, maxConcurrentRequests))
        .fill()
        .map(() => worker());
    
    await Promise.all(workers);
    
    return results;
}

module.exports = {
    scrapeDirectAPI,
    scrapeMultipleDirectAPI,
    saveApiDump,
    saveSession,
    loadSession
};
