# Blinkit API Interception - UPDATED with API Dump Storage

## Updated Change 2: Modify scrapeCategory Function

Replace the inner async function (line 224-274) with this **UPDATED VERSION** that saves API dumps:

```javascript
                (async () => {
                    // API Interception Setup
                    const capturedApiData = [];
                    
                    // Create api_dumps directory if doesn't exist
                    const apiDumpsDir = path.join(__dirname, 'api_dumps');
                    if (!fs.existsSync(apiDumpsDir)) {
                        fs.mkdirSync(apiDumpsDir, { recursive: true });
                    }
                    
                    page.on('response', async (response) => {
                        const url = response.url();
                        // Capture BOTH initial and paginated API calls
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
                                
                                log('info', logPrefix, `📡 Captured & saved API response #${apiIndex}: ${filename}`);
                            } catch (e) {
                                log('warn', logPrefix, `Failed to parse API response: ${e.message}`);
                            }
                        }
                    });
                    
                    // Block resources - SIGNIFICANT SPEEDUP
                    await page.route('**/*', (route) => {
                        const type = route.request().resourceType();
                        if (['font', 'media'].includes(type)) {
                            return route.abort();
                        }
                        return route.continue();
                    });

                    await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

                    // Wait for PLP container or products
                    try {
                        await page.waitForSelector('#plpContainer, div[role="button"][id]', { timeout: 15000 });
                    } catch (e) {
                        log('warn', logPrefix, `Timeout waiting for container: ${e.message}`);
                    }

                    // Click First Product Strategy
                    try {
                        log('info', logPrefix, 'Clicking first product to trigger API...');
                        const firstProduct = page.locator('div[role="button"][id]').first();
                        if (await firstProduct.isVisible({ timeout: 5000 })) {
                            await firstProduct.click();
                            await page.waitForTimeout(2000); // Wait for API calls
                            await page.keyboard.press('Escape'); // Close product details
                            await page.waitForTimeout(1000);
                            log('success', logPrefix, 'First product clicked successfully');
                        }
                    } catch (e) {
                        log('warn', logPrefix, `Click-first-product failed: ${e.message}`);
                    }

                    // Infinite scroll logic
                    await autoScroll(page, logPrefix);

                    // Force lazy images to load
                    await forceImageLoad(page, logPrefix);

                    // Extract products from DOM
                    const domProducts = await extractProducts(page, logPrefix);
                    
                    // Process API data
                    const apiProducts = processApiData(capturedApiData, logPrefix);
                    
                    // Merge DOM and API data
                    const mergedProducts = mergeDomAndApi(domProducts, apiProducts, logPrefix);
                    
                    // Save consolidated API dump with all data
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
                            processedData: {
                                domProductsCount: domProducts.length,
                                apiProductsCount: apiProducts.length,
                                mergedProductsCount: mergedProducts.length
                            },
                            products: mergedProducts
                        }, null, 2));
                        
                        log('success', logPrefix, `💾 Saved consolidated dump: ${consolidatedFilename}`);
                    }
                    
                    // Check for 'try again' or empty content indicators
                    const pageContent = await page.content();
                    const hasTryAgain = /try again/i.test(pageContent);
                    if (mergedProducts.length === 0 && hasTryAgain) {
                        log('warn', logPrefix, `Invalid page detected (try again). Marking URL as failed.`);
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
                        attempts = maxRetries + 1;
                        return [];
                    }
                    return mergedProducts;
                })(),
```

## What This Captures

### 1. Initial API Call
**URL**: `https://blinkit.com/v1/layout/listing_widgets?l0_cat=287&l1_cat=741`
- First products loaded on page
- No offset/limit parameters
- Saved as: `api_Sexual_Wellness_1_<timestamp>.json`

### 2. Paginated API Calls
**URL**: `https://blinkit.com/v1/layout/listing_widgets?offset=60&limit=15&l0_cat=287&l1_cat=741&...`
- Triggered by scrolling
- Each scroll loads more products
- Saved as: `api_Sexual_Wellness_2_<timestamp>.json`, `api_Sexual_Wellness_3_<timestamp>.json`, etc.

### 3. Consolidated Dump
**Filename**: `api_consolidated_Sexual_Wellness_<timestamp>.json`
- Contains ALL API responses
- Includes metadata (category, URL, timestamp)
- Includes processed product counts
- Includes final merged products

## File Structure

```
Blinkit-Scrapper/
├── api_dumps/
│   ├── api_Sexual_Wellness_1_1768382776123.json      # Initial API call
│   ├── api_Sexual_Wellness_2_1768382778456.json      # Scroll 1
│   ├── api_Sexual_Wellness_3_1768382780789.json      # Scroll 2
│   ├── api_Sexual_Wellness_4_1768382783012.json      # Scroll 3
│   └── api_consolidated_Sexual_Wellness_1768382785345.json  # All combined
```

## Individual API Dump Format

```json
{
  "url": "https://blinkit.com/v1/layout/listing_widgets?offset=60&limit=15&...",
  "timestamp": "2026-01-14T10:36:16.123Z",
  "responseIndex": 2,
  "data": {
    "widgets": [
      {
        "data": [
          {
            "product": {...},
            "pricing": {...},
            "inventory": {...}
          }
        ]
      }
    ]
  }
}
```

## Consolidated Dump Format

```json
{
  "metadata": {
    "category": "Sexual Wellness",
    "url": "https://blinkit.com/cn/sexual-wellness/cid/287/741",
    "pincode": "122016",
    "timestamp": "2026-01-14T10:36:25.345Z",
    "scrapedAt": "1/14/2026, 4:06:25 PM"
  },
  "apiData": {
    "totalResponses": 4,
    "responses": [
      {...},  // All API responses
      {...},
      {...},
      {...}
    ]
  },
  "processedData": {
    "domProductsCount": 150,
    "apiProductsCount": 145,
    "mergedProductsCount": 150
  },
  "products": [
    {...},  // Final merged products
    {...}
  ]
}
```

## Update .gitignore

Add this line:
```
/api_dumps
```

## Update .dockerignore

Add this line:
```
api_dumps/
```

## Benefits

1. **Individual Files**: Debug specific API calls
2. **Consolidated File**: Complete picture of scraping session
3. **Metadata**: Know exactly when/where data came from
4. **Comparison**: Compare API vs DOM data
5. **Offline Analysis**: Analyze API structure without re-scraping
6. **Testing**: Use saved dumps for testing data processing

## Logs You'll See

```
[Sexual Wellness] 📡 Captured & saved API response #1: api_Sexual_Wellness_1_1768382776123.json
[Sexual Wellness] 📡 Captured & saved API response #2: api_Sexual_Wellness_2_1768382778456.json
[Sexual Wellness] 📡 Captured & saved API response #3: api_Sexual_Wellness_3_1768382780789.json
[Sexual Wellness] 📡 Captured & saved API response #4: api_Sexual_Wellness_4_1768382783012.json
[Sexual Wellness] ℹ️ Processed 4 API responses, extracted 145 unique products
[Sexual Wellness] ✅ Merged: 150 DOM + 145 API = 150 total products
[Sexual Wellness] 💾 Saved consolidated dump: api_consolidated_Sexual_Wellness_1768382785345.json
```

## Testing

After applying this change:

1. Run scraper via Postman
2. Check `api_dumps/` folder
3. You'll see individual API dumps + consolidated dump
4. Open consolidated dump to see complete scraping session

This gives you complete visibility into what the API returns!
