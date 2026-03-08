# Quick Manual Steps to Complete API-Only Implementation

## ✅ Already Done
1. ✅ Added API processing functions (`extractProductFromWidget` and `processApiData`)
2. ✅ Enabled headless mode
3. ✅ Added Render-compatible browser arguments

## 🔄 Remaining Step: Update scrapeCategory Function

You need to replace lines **306-357** in `server.js` with the API-only logic.

### Find This Code (lines 306-357):
```javascript
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
```

### Replace With This (API-Only Code):
```javascript
                (async () => {
                    // API Interception Setup
                    const capturedApiData = [];
                    
                    // Create api_dumps directory
                    const apiDumpsDir = path.join(process.cwd(), 'api_dumps');
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
                    
                    // Block unnecessary resources for speed
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

## How to Do It:

1. **Open** `server.js` in your editor
2. **Find** line 306 (search for "Block resources - SIGNIFICANT SPEEDUP")
3. **Select** lines 306-357 (the entire async function)
4. **Delete** the selected lines
5. **Paste** the new API-only code
6. **Save** the file
7. **Restart** the server: `npm start`

## Expected Logs After Update:

```
[Sexual Wellness] 🚀 Starting scrape...
[Sexual Wellness] ℹ️ Clicking first product to trigger API...
[Sexual Wellness] ✅ First product clicked
[Sexual Wellness] 📡 API #1 captured & saved
[Sexual Wellness] ℹ️ Scrolling to load all products via API...
[Sexual Wellness] 📡 API #2 captured & saved
[Sexual Wellness] 📡 API #3 captured & saved
[Sexual Wellness] ✅ Extracted 150 products from 3 API responses
[Sexual Wellness] 💾 Saved consolidated dump with 150 products
```

## API Dumps Location:

```
Blinkit-Scrapper/
└── api_dumps/
    ├── api_Sexual_Wellness_1_<timestamp>.json
    ├── api_Sexual_Wellness_2_<timestamp>.json
    ├── api_Sexual_Wellness_3_<timestamp>.json
    └── api_consolidated_Sexual_Wellness_<timestamp>.json
```

That's it! Once you make this one change, the API-only implementation will be complete! 🚀
