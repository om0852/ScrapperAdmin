# Blinkit API-Only Scraping Implementation

## Overview

**100% API-based scraping** - No HTML/DOM parsing. All product data comes from the `/v1/layout/listing_widgets` API endpoint.

---

## Change 1: Add API Processing Functions (After line 67)

```javascript
// --- API Data Processing Functions ---

function extractProductFromWidget(item) {
    try {
        const product = item.product || item;
        const pricing = item.pricing || product.pricing || {};
        const inventory = item.inventory || product.inventory || {};
        
        const id = product.id || product.product_id || '';
        const name = product.name || product.product_name || '';
        
        let image = '';
        if (product.image_url) {
            image = product.image_url;
        } else if (product.images && Array.isArray(product.images) && product.images.length > 0) {
            image = product.images[0];
        }
        
        const price = pricing.price || pricing.offer_price || pricing.final_price || 0;
        const originalPrice = pricing.mrp || pricing.original_price || price;
        
        let discount = '';
        if (originalPrice > price) {
            discount = Math.round(((originalPrice - price) / originalPrice) * 100) + '%';
        }
        
        const quantity = product.unit || product.quantity || product.weight || '';
        const isOutOfStock = inventory.in_stock === false || inventory.available === false;
        const deliveryTime = product.delivery_time || item.delivery_time || '';
        const combo = product.variant_count || product.options_count || '1';
        const isAd = item.is_sponsored || product.is_sponsored || false;
        
        let url = '';
        if (id && name) {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            url = `https://blinkit.com/prn/${slug}/prid/${id}`;
        }
        
        return {
            id, name, url, image,
            price: price.toString(),
            originalPrice: originalPrice.toString(),
            discount, quantity, deliveryTime,
            combo: combo.toString(),
            isOutOfStock, isAd
        };
    } catch (e) {
        return null;
    }
}

function processApiData(apiResponses, logPrefix) {
    const productsMap = new Map();
    let totalProcessed = 0;
    
    apiResponses.forEach((response, idx) => {
        try {
            if (response.widgets && Array.isArray(response.widgets)) {
                response.widgets.forEach(widget => {
                    if (widget.data && Array.isArray(widget.data)) {
                        widget.data.forEach((item, index) => {
                            const product = extractProductFromWidget(item);
                            if (product && product.id && product.name) {
                                if (!productsMap.has(product.id)) {
                                    // Add ranking based on API order
                                    product.rank = totalProcessed + 1;
                                    productsMap.set(product.id, product);
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
    
    log('success', logPrefix, `Extracted ${totalProcessed} products from ${apiResponses.length} API responses`);
    return Array.from(productsMap.values());
}
```

---

## Change 2: Replace scrapeCategory Function (API-Only Version)

Replace the entire inner async function (lines 224-274) with this **API-ONLY** version:

```javascript
                (async () => {
                    // API Interception Setup
                    const capturedApiData = [];
                    
                    // Create api_dumps directory
                    const apiDumpsDir = path.join(__dirname, 'api_dumps');
                    if (!fs.existsSync(apiDumpsDir)) {
                        fs.mkdirSync(apiDumpsDir, { recursive: true });
                    }
                    
                    // Intercept API responses
                    page.on('response', async (response) => {
                        const url = response.url();
                        if (url.includes('/v1/layout/listing_widgets')) {
                            try {
                                const json = await response.json();
                                capturedApiData.push(json);
                                
                                // Save individual API dump
                                const timestamp = Date.now();
                                const apiIndex = capturedApiData.length;
                                const filename = `api_${logPrefix.replace(/[^a-z0-9]/gi, '_')}_${apiIndex}_${timestamp}.json`;
                                const filepath = path.join(apiDumpsDir, filename);
                                
                                fs.writeFileSync(filepath, JSON.stringify({
                                    url: url,
                                    timestamp: new Date().toISOString(),
                                    responseIndex: apiIndex,
                                    data: json
                                }, null, 2));
                                
                                log('info', logPrefix, `📡 API #${apiIndex} captured & saved`);
                            } catch (e) {
                                log('warn', logPrefix, `Failed to parse API response: ${e.message}`);
                            }
                        }
                    });
                    
                    // Block unnecessary resources
                    await page.route('**/*', (route) => {
                        const type = route.request().resourceType();
                        if (['font', 'media', 'image'].includes(type)) {
                            return route.abort();
                        }
                        return route.continue();
                    });

                    await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

                    // Wait for page to load
                    await page.waitForTimeout(3000);

                    // Click First Product to trigger initial API call
                    try {
                        log('info', logPrefix, 'Clicking first product to trigger API...');
                        const firstProduct = page.locator('div[role="button"][id]').first();
                        if (await firstProduct.isVisible({ timeout: 5000 })) {
                            await firstProduct.click();
                            await page.waitForTimeout(2000);
                            await page.keyboard.press('Escape');
                            await page.waitForTimeout(1000);
                            log('success', logPrefix, 'First product clicked');
                        }
                    } catch (e) {
                        log('warn', logPrefix, `Click-first-product failed: ${e.message}`);
                    }

                    // Scroll to trigger paginated API calls
                    log('info', logPrefix, 'Scrolling to load all products via API...');
                    await autoScroll(page, logPrefix);

                    // Wait for final API calls
                    await page.waitForTimeout(3000);

                    // Process API data (NO DOM SCRAPING)
                    const products = processApiData(capturedApiData, logPrefix);
                    
                    // Add category to each product
                    products.forEach(p => p.category = logPrefix);
                    
                    // Save consolidated API dump
                    if (capturedApiData.length > 0) {
                        const consolidatedFilename = `api_consolidated_${logPrefix.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
                        const consolidatedPath = path.join(apiDumpsDir, consolidatedFilename);
                        
                        fs.writeFileSync(consolidatedPath, JSON.stringify({
                            metadata: {
                                category: logPrefix,
                                url: category.url,
                                pincode: pincode,
                                timestamp: new Date().toISOString(),
                                scrapedAt: new Date().toLocaleString()
                            },
                            apiData: {
                                totalResponses: capturedApiData.length,
                                responses: capturedApiData
                            },
                            products: products
                        }, null, 2));
                        
                        log('success', logPrefix, `💾 Saved consolidated dump with ${products.length} products`);
                    }
                    
                    // Check for errors
                    if (products.length === 0) {
                        log('warn', logPrefix, `No products extracted from API. Check API dumps.`);
                        const failedPath = path.resolve('failed_urls.json');
                        let failed = [];
                        try {
                            const data = fs.readFileSync(failedPath, 'utf-8');
                            failed = JSON.parse(data);
                        } catch (e) {}
                        if (!failed.includes(category.url)) {
                            failed.push(category.url);
                            fs.writeFileSync(failedPath, JSON.stringify(failed, null, 2));
                        }
                        attempts = maxRetries + 1;
                        return [];
                    }
                    
                    return products;
                })(),
```

---

## Change 3: Update Browser Launch Options (Line 512-515)

```javascript
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        };
```

---

## What's Different (API-Only Approach)

### ❌ Removed
- DOM scraping (`extractProducts` function)
- Image loading (`forceImageLoad` function)
- DOM/API merge logic (`mergeDomAndApi` function)
- Image resource loading (blocked for speed)

### ✅ Kept/Added
- API interception
- API data processing
- API dump storage (individual + consolidated)
- Scroll logic (to trigger paginated API calls)
- Click-first-product (to trigger initial API)

---

## Benefits of API-Only

1. **Faster**: No DOM parsing overhead
2. **More Reliable**: API structure is consistent
3. **Complete Data**: API has all product details
4. **Less Code**: Simpler implementation
5. **Better Images**: Full-resolution URLs from API
6. **Accurate Ranking**: Based on API response order

---

## Expected Logs

```
[Sexual Wellness] 🚀 Starting scrape...
[Sexual Wellness] ℹ️ Clicking first product to trigger API...
[Sexual Wellness] ✅ First product clicked
[Sexual Wellness] 📡 API #1 captured & saved
[Sexual Wellness] ℹ️ Scrolling to load all products via API...
[Sexual Wellness] 📡 API #2 captured & saved
[Sexual Wellness] 📡 API #3 captured & saved
[Sexual Wellness] 📡 API #4 captured & saved
[Sexual Wellness] ✅ Extracted 150 products from 4 API responses
[Sexual Wellness] 💾 Saved consolidated dump with 150 products
```

---

## Testing

After applying changes, test with Postman. You should see:
- Individual API dumps in `api_dumps/`
- Consolidated dump with all products
- Response with 100% API-sourced products
- No DOM scraping logs

This is much cleaner and faster! 🚀
