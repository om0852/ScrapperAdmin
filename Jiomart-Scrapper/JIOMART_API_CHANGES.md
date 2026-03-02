# Jiomart API-Only Implementation - Remaining Changes

## ✅ Completed
- Added `extractProductFromJiomartApi()` function
- Added `processJiomartApiData()` function

## 🔄 Remaining Changes

### Change 1: Update getStorageStateForPincode to Extract Delivery Time

**Location**: Lines 168-253  
**Find**: The return statement at the end of the function  
**Replace**: Extract delivery time before returning

```javascript
        await delay(3000, 5000);

        // Extract delivery time from homepage
        let deliveryTime = '';
        try {
            const deliveryEl = await page.locator('.delivery-time, .sla-text, div[class*="delivery"]').first();
            if (await deliveryEl.isVisible({ timeout: 3000 })) {
                deliveryTime = await deliveryEl.textContent();
                deliveryTime = deliveryTime.trim();
                console.log(`✅ Delivery time extracted: ${deliveryTime}`);
            }
        } catch (e) {
            console.log(`⚠️ Could not extract delivery time: ${e.message}`);
        }

        await context.storageState({ path: statePath });

        map[pincode] = stateFileName;
        await fs.writeFile(STORAGE_MAP_FILE, JSON.stringify(map, null, 2));

        console.log(`✅ Session created and saved for ${pincode}`);
        return { statePath, deliveryTime };  // Return both

    } catch (error) {
        console.error(`❌ Failed to set pincode ${pincode}:`, error.message);
        throw error;
    } finally {
        await context.close();
    }
}
```

### Change 2: Update scrapeCategory Function Signature

**Location**: Line 287  
**Find**: `async function scrapeCategory(browser, category, contextOptions, maxRetries = 2) {`  
**Replace**: `async function scrapeCategory(browser, category, contextOptions, deliveryTime = '', maxRetries = 2) {`

### Change 3: Replace scrapeCategory Logic with API Interception

**Location**: Lines 330-448 (inside the try block)  
**Replace entire scraping logic** with:

```javascript
            page = await context.newPage();

            // API Interception Setup
            const capturedApiData = [];
            const apiDumpsDir = path.join(__dirname, 'api_dumps');
            
            // Create api_dumps directory
            try {
                await fs.mkdir(apiDumpsDir, { recursive: true });
            } catch (e) {}

            // Intercept API responses
            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('/trex/search')) {
                    try {
                        const json = await response.json();
                        capturedApiData.push(json);
                        
                        // Save individual API dump
                        const timestamp = Date.now();
                        const apiIndex = capturedApiData.length;
                        const filename = `api_${category.name.replace(/[^a-z0-9]/gi, '_')}_${apiIndex}_${timestamp}.json`;
                        const filepath = path.join(apiDumpsDir, filename);
                        
                        await fs.writeFile(filepath, JSON.stringify({
                            url: url,
                            timestamp: new Date().toISOString(),
                            responseIndex: apiIndex,
                            data: json
                        }, null, 2));
                        
                        console.log(`📡 [${category.name}] API #${apiIndex} captured & saved`);
                    } catch (e) {
                        console.log(`⚠️ Failed to parse API response: ${e.message}`);
                    }
                }
            });

            // Block heavy resources
            await page.route('**/*.{png,jpg,jpeg,gif,svg,font,woff,woff2}', route => route.abort());

            console.log(`🚀 [Attempt ${attempt}] processing: ${category.name}`);

            await page.goto(category.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Wait for API calls to complete
            await delay(5000, 8000);

            // Process API data (NO DOM SCRAPING)
            const products = processJiomartApiData(capturedApiData, category.name);
            
            // Add category and delivery time to each product
            products.forEach(p => {
                p.category = category.name;
                p.deliveryTime = deliveryTime || p.deliveryTime || '';
            });

            // Save consolidated API dump
            if (capturedApiData.length > 0) {
                const consolidatedFilename = `api_consolidated_${category.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
                const consolidatedPath = path.join(apiDumpsDir, consolidatedFilename);
                
                await fs.writeFile(consolidatedPath, JSON.stringify({
                    metadata: {
                        category: category.name,
                        url: category.url,
                        timestamp: new Date().toISOString()
                    },
                    apiData: {
                        totalResponses: capturedApiData.length,
                        responses: capturedApiData
                    },
                    products: products
                }, null, 2));
                
                console.log(`💾 [${category.name}] Saved consolidated dump with ${products.length} products`);
            }

            if (products.length === 0) {
                console.warn(`⚠️ Extracted 0 items for ${category.name} (Attempt ${attempt})`);
                if (attempt <= maxRetries) {
                    console.log(`🔄 Retrying...`);
                    throw new Error("Zero products extracted");
                }
            }

            console.log(`✅ Extracted ${products.length} items from ${category.name}`);
            return { category: category.name, success: true, products };
```

### Change 4: Update Main Endpoint to Use Delivery Time

**Location**: Lines 520-530  
**Find**: `const stateData = await getStorageStateForPincode(browser, pincode, proxyUrl);`  
**Replace**:

```javascript
        // 1. Ensure Pincode Session and get delivery time
        const sessionData = await getStorageStateForPincode(browser, pincode, proxyUrl);
        const deliveryTime = sessionData.deliveryTime || '';
        const stateData = sessionData.statePath || sessionData;
```

**Then find**: `const batchPromises = batch.map(cat => scrapeCategory(browser, cat, contextOptions));`  
**Replace**: `const batchPromises = batch.map(cat => scrapeCategory(browser, cat, contextOptions, deliveryTime));`

### Change 5: Add API Dump Cleanup

**Location**: After `res.json({...})` around line 565  
**Add**:

```javascript
        res.json({
            success: true,
            metadata: {
                totalProducts: allProducts.length,
                categoriesProcessed: results.length,
                failedCategories: results.filter(r => !r.success).map(r => r.category)
            },
            data: allProducts
        });

        // Cleanup API dumps after sending response
        try {
            const apiDumpsDir = path.join(__dirname, 'api_dumps');
            const files = await fs.readdir(apiDumpsDir);
            for (const file of files) {
                await fs.unlink(path.join(apiDumpsDir, file));
            }
            console.log(`✅ Deleted ${files.length} API dump files`);
        } catch (e) {
            console.log(`⚠️ Failed to cleanup API dumps: ${e.message}`);
        }
```

### Change 6: Update .gitignore

Add to `.gitignore`:
```
/api_dumps
```

---

## Summary of Changes

1. ✅ API processing functions added
2. 🔄 Extract delivery time from homepage
3. 🔄 Update scrapeCategory signature
4. 🔄 Replace DOM scraping with API interception
5. 🔄 Pass delivery time through pipeline
6. 🔄 Add API dump cleanup
7. 🔄 Update .gitignore

Would you like me to apply these changes automatically?
