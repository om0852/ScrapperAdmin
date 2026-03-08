# COPY-PASTE THESE TWO FUNCTIONS

## Instructions:
1. Open `server.js`
2. Find line 71: `function extractProductFromWidget(item) {`
3. Select from line 71 to line 118 (the entire function including closing brace)
4. Delete and paste **Function 1** below
5. Find line 120: `function processApiData(apiResponses, logPrefix) {`
6. Select from line 120 to line 149 (the entire function including closing brace)
7. Delete and paste **Function 2** below
8. Save and restart: `npm start`

---

## Function 1: extractProductFromWidget (Replace lines 71-118)

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

## Function 2: processApiData (Replace lines 120-149)

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

## After Applying, You Should See:

```
[Sexual Wellness] 📡 API #1 captured & saved
[Sexual Wellness] 📡 API #2 captured & saved
...
[Sexual Wellness] 📡 API #25 captured & saved
[Sexual Wellness] ✅ Extracted 150+ products from 25 API responses  ← This will change!
[Sexual Wellness] 💾 Saved consolidated dump with 150+ products    ← This will change!
```

The key changes:
- `item.product` → `item.atc_action.add_to_cart.cart_item`
- `response.widgets` → `response.response.snippets`
