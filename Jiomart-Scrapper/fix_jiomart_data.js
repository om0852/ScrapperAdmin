const fs = require('fs');
const path = require('path');

const pincodes = [
    '122016',
    '201014',
    '201303',
    '400070',
    '400703',
    '400706',
    '401101',
    '401202'
];

const baseDir = __dirname;

function toTitleCase(str) {
    return str
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function processPincode(pincode) {
    const rawDataFile = path.join(baseDir, `jiomart_data_${pincode}.json`);
    const processedFile = path.join(baseDir, `jiomart_processed_${pincode}.json`);

    if (!fs.existsSync(processedFile)) {
        console.warn(`Processed file not found for ${pincode}: ${processedFile}`);
        return;
    }

    console.log(`Processing pincode: ${pincode}`);

    // dictionary for product images: productId -> image URL
    const imageMap = {};

    if (fs.existsSync(rawDataFile)) {
        try {
            const rawContent = fs.readFileSync(rawDataFile, 'utf8');
            if (!rawContent.trim()) {
                console.warn(`Raw data file is empty: ${rawDataFile}`);
            } else {
                let rawData;
                try {
                    rawData = JSON.parse(rawContent);
                } catch (parseError) {
                    console.error(`Error parsing JSON in ${rawDataFile}: ${parseError.message}`);
                }

                if (rawData) {
                    const items = rawData.success && Array.isArray(rawData.data) ? rawData.data : [];

                    items.forEach(item => {
                        if (item.id && item.product && item.product.variants && item.product.variants.length > 0) {
                            const variant = item.product.variants[0];
                            if (variant.images && variant.images.length > 0) {
                                imageMap[item.id] = variant.images[0].uri;
                            }
                        }
                    });
                    console.log(`Loaded ${Object.keys(imageMap).length} images from raw data map for ${pincode}.`);
                }
            }

        } catch (e) {
            console.error(`Error reading raw data for ${pincode}:`, e.message);
        }
    } else {
        console.warn(`Raw data file not found for ${pincode}, skipping image recovery.`);
    }

    try {
        const processedData = JSON.parse(fs.readFileSync(processedFile, 'utf8'));
        let updatedCount = 0;

        // Group by categoryUrl for ranking
        const productsByCategory = {};

        // First pass: Organize by categoryUrl and update details
        processedData.forEach(product => {
            // 1. Fix Category Logic
            if (product.categoryUrl) {
                const urlParts = product.categoryUrl.split('/');
                // Usually the last part is ID, second to last is subcat or name
                // Example: .../fruits-vegetables/fresh-fruits/220 -> 'fresh-fruits'
                let categorySlug = urlParts[urlParts.length - 2];
                // Fallback validation if slug is a number
                if (!isNaN(categorySlug)) {
                    categorySlug = urlParts[urlParts.length - 3];
                }

                if (categorySlug) {
                    const formattedCategory = toTitleCase(categorySlug);
                    // Update only if N/A or generic
                    if (product.category === 'N/A' || product.category === 'Unknown Category') {
                        product.category = formattedCategory;
                    }
                    if (product.officialCategory === 'Unknown Category' || product.officialCategory === 'N/A') {
                        product.officialCategory = formattedCategory;
                    }
                }
            }

            // 2. Fix Image
            if ((product.productImage === 'N/A' || !product.productImage) && product.productId) {
                if (imageMap[product.productId]) {
                    product.productImage = imageMap[product.productId];
                    updatedCount++;
                }
            } else if (product.productImage === 'N/A' && !product.productId) {
                // Try to recover ID from URL if productId is missing but URL exists
                // productUrl: https://www.jiomart.com/p/.../590000097_P
                const urlMatch = product.productUrl.match(/\/(\d+_P)$/);
                if (urlMatch) {
                    const inferredId = urlMatch[1];
                    product.productId = inferredId;
                    if (imageMap[inferredId]) {
                        product.productImage = imageMap[inferredId];
                        updatedCount++;
                    }
                }
            }

            // Grouping for ranking
            const catKey = product.categoryUrl || 'uncategorized';
            if (!productsByCategory[catKey]) {
                productsByCategory[catKey] = [];
            }
            productsByCategory[catKey].push(product);
        });

        // 3. Fix Ranking (and flatten back to array)
        let finalArray = [];
        for (const catUrl in productsByCategory) {
            const categoryProducts = productsByCategory[catUrl];
            // Sort by original order or keep as is? JSON parse order is generally preserved.
            // We assume input order is roughly correct for rank, just needs resetting.
            categoryProducts.forEach((prod, index) => {
                prod.ranking = index + 1;
                finalArray.push(prod);
            });
        }

        fs.writeFileSync(processedFile, JSON.stringify(finalArray, null, 2), 'utf8');
        console.log(`Saved ${processedFile}. Updated images for ${updatedCount} products.`);

    } catch (e) {
        console.error(`Error processing file ${processedFile}:`, e.message);
    }
}

pincodes.forEach(processPincode);
