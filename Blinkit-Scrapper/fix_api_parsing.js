// Quick fix for Blinkit API parsing
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// Fix 1: Replace extractProductFromWidget function
const oldExtract = /function extractProductFromWidget\(item\) \{[\s\S]*?\n\}/m;
const newExtract = `function extractProductFromWidget(item) {
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
            url = \`https://blinkit.com/prn/\${slug}/prid/\${id}\`;
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
}`;

// Fix 2: Replace processApiData function
const oldProcess = /function processApiData\(apiResponses, logPrefix\) \{[\s\S]*?\n\}/m;
const newProcess = `function processApiData(apiResponses, logPrefix) {
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
            log('warn', logPrefix, \`Error processing API response \${idx}: \${e.message}\`);
        }
    });
    
    log('success', logPrefix, \`Extracted \${totalProcessed} products from \${apiResponses.length} API responses\`);
    return Array.from(productsMap.values());
}`;

content = content.replace(oldExtract, newExtract);
content = content.replace(oldProcess, newProcess);

fs.writeFileSync(serverPath, content, 'utf8');
console.log('✅ Fixed API parsing functions!');
console.log('📝 Restart server to test: npm start');
