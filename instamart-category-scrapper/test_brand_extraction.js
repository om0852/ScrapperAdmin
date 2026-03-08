const fs = require('fs');
const path = require('path');

// Mock specific parts (NO IMPORTS from server.js as it's not a module)

function findProductInJson(obj, foundProducts = []) {
    if (!obj || typeof obj !== 'object') return;
    if ((obj.product_id || obj.productId) && (obj.name || obj.displayName) && (obj.price || obj.variations)) {
        foundProducts.push(obj);
        return;
    }
    if (Array.isArray(obj)) {
        obj.forEach(item => findProductInJson(item, foundProducts));
    } else if (typeof obj === 'object') {
        Object.values(obj).forEach(value => findProductInJson(value, foundProducts));
    }
}

function processCapturedJson_Test(json) {
    const rawProducts = [];
    findProductInJson(json, rawProducts);

    return rawProducts.map(item => {
        try {
            const pid = item.productId || item.product_id;
            const name = item.displayName || item.name;
            let variant = item;
            if (item.variations && item.variations.length > 0) {
                variant = item.variations[0];
            }

            const brand = variant.brandName || item.brand || item.brandName || 'N/A';

            return {
                productId: pid,
                productName: name,
                brand: brand
            };
        } catch (e) { return null; }
    }).filter(p => p !== null);
}

// --- TEST EXECUTION ---
const dumpPath = path.join(__dirname, 'api_dumps', 'dump_400706_filter_api_https___www_swiggy_com_instama_1770519972009.json');

if (!fs.existsSync(dumpPath)) {
    console.error(`❌ Dump file not found at ${dumpPath}`);
    process.exit(1);
}

const dumpData = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
const processed = processCapturedJson_Test(dumpData);

console.log(`Found ${processed.length} products.`);

if (processed.length > 0) {
    console.log('Sample Products:');
    processed.slice(0, 5).forEach(p => {
        console.log(`- [${p.brand}] ${p.productName} (${p.productId})`);
    });

    // Verification Check
    const brandsFound = processed.every(p => p.brand !== 'N/A');
    if (brandsFound) {
        console.log('✅ ALL Sample products have a brand extracted.');
    } else {
        console.log('⚠️ Some products are missing brand information.');
        const missing = processed.filter(p => p.brand === 'N/A');
        console.log(`Missing count: ${missing.length}`);
        if (missing.length < processed.length) console.log('✅ Extraction is working for at least some items.');
    }
} else {
    console.log('❌ No products found in dump.');
}
