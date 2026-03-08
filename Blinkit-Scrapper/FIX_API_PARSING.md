# Fix Blinkit API Parsing - Quick Manual Update

## Problem
The API data is being captured correctly, but `extractProductFromWidget` and `processApiData` functions are looking for the wrong data structure.

## Solution
Replace these 2 functions in `server.js`:

---

## Function 1: extractProductFromWidget (around line 71)

**Find this function** and replace it entirely:

```javascript
function extractProductFromWidget(item) {
    try {
        // Blinkit API structure: product data is in atc_action.add_to_cart.cart_item
        const cartItem = item.atc_action?.add_to_cart?.cart_item;
        if (!cartItem) return null;
        
        const id = cartItem.product_id?.toString() || '';
        const name = cartItem.product_name || cartItem.display_name || '';
        const image = cartItem.image_url || item.image?.url || '';
        
        const price = cartItem.price || 0;
        const originalPrice = cartItem.mrp || price;
        
        let discount = '';
        if (originalPrice > price) {
            discount = Math.round(((originalPrice - price) / originalPrice) * 100) + '%';
        }
        
        const quantity = cartItem.unit || item.variant?.text || '';
        const isOutOfStock = item.inventory === 0 || cartItem.inventory === 0;
        const deliveryTime = item.eta_tag?.title?.text || '';
        const combo = item.cta?.button_data?.subtext || '1';
        const isAd = item.tracking?.common_attributes?.badge === 'AD';
        
        let url = '';
        if (id && name) {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            url = `https://blinkit.com/prn/${slug}/prid/${id}`;
        }
        
        return {
            id,
            name,
            url,
            image,
            price: price.toString(),
            originalPrice: originalPrice.toString(),
            discount,
            quantity,
            deliveryTime,
            combo,
            isOutOfStock,
            isAd
        };
    } catch (e) {
        return null;
    }
}
```

---

## Function 2: processApiData (around line 121)

**Find this function** and replace it entirely:

```javascript
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
                        const product = extractProductFromWidget(snippet.data);
                        if (product && product.id && product.name) {
                            if (!productsMap.has(product.id)) {
                                product.rank = totalProcessed + 1;
                                productsMap.set(product.id, product);
                                totalProcessed++;
                            }
                        }
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

## Steps:

1. Open `server.js`
2. Find `function extractProductFromWidget` (around line 71)
3. Select the entire function and replace with Function 1 above
4. Find `function processApiData` (around line 121)
5. Select the entire function and replace with Function 2 above
6. Save the file
7. Restart server: `npm start`

## Expected Result:

After fixing, you should see:
```
[Sexual Wellness] 📡 API #1 captured & saved
[Sexual Wellness] 📡 API #2 captured & saved
...
[Sexual Wellness] ✅ Extracted 150+ products from 14 API responses
[Sexual Wellness] 💾 Saved consolidated dump with 150+ products
```

## Key Changes:

**extractProductFromWidget**:
- Changed from `item.product` to `item.atc_action.add_to_cart.cart_item`
- This is where Blinkit stores the actual product data

**processApiData**:
- Changed from `response.widgets` to `response.response.snippets`
- This is the correct path in Blinkit's API structure
