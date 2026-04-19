/**
 * Debug utility to test image URL extraction from API dumps
 * Run: node test_image_extraction.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Image extraction function (same as in direct_api_flipkart.js)
function extractImageUrl(data) {
    if (!data) return null;

    let imageUrl = null;
    let source = null;

    if (data.media && data.media.images && data.media.images.length > 0) {
        imageUrl = data.media.images[0].url;
        source = 'media.images[0].url';
    }
    else if (data.imageUrl) {
        imageUrl = data.imageUrl;
        source = 'data.imageUrl';
    }
    else if (data.images && Array.isArray(data.images) && data.images.length > 0) {
        imageUrl = data.images[0].url || data.images[0];
        source = 'data.images[0]';
    }
    else if (data.thumbnailImage) {
        imageUrl = data.thumbnailImage;
        source = 'data.thumbnailImage';
    }
    else if (data.image) {
        imageUrl = data.image;
        source = 'data.image';
    }
    else if (data.value && data.value.media && data.value.media.images && data.value.media.images.length > 0) {
        imageUrl = data.value.media.images[0].url;
        source = 'data.value.media.images[0].url';
    }

    if (!imageUrl) {
        return { url: null, source: 'NO_IMAGE_FOUND' };
    }

    imageUrl = imageUrl.replace(/{@width}/g, '400')
                      .replace(/{@height}/g, '400')
                      .replace(/{@quality}/g, '70');

    return { url: imageUrl, source };
}

// Main test
async function testImageExtraction() {
    const apiDumpDir = path.join(__dirname, 'api_dumps');
    
    if (!fs.existsSync(apiDumpDir)) {
        console.log('❌ api_dumps directory not found');
        return;
    }

    console.log('🔍 Testing image extraction from API dumps...\n');

    const dumpFiles = fs.readdirSync(apiDumpDir)
        .filter(f => f.startsWith('dump_') && f.endsWith('.json'))
        .slice(0, 3); // Test first 3 dumps

    let totalProducts = 0;
    let productsWithImages = 0;
    let imageSourceStats = {};

    dumpFiles.forEach(file => {
        console.log(`\n📄 Reading: ${file}`);
        const filePath = path.join(apiDumpDir, file);

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            let data;

            try {
                data = JSON.parse(content);
            } catch (e) {
                console.log(`⚠️  Failed to parse JSON from ${file}`);
                return;
            }

            // Handle different dump formats
            let products = [];

            if (Array.isArray(data)) {
                // Direct array of products (raw response format)
                products = data;
            } else if (data.responses && Array.isArray(data.responses)) {
                // Direct API format with responses array
                data.responses.forEach(response => {
                    if (response.pageData && response.pageData.elementData) {
                        // Extract products from response structure
                        extractProductsFromDump(response.pageData.elementData, products);
                    } else if (response.RESPONSE && response.RESPONSE.slots) {
                        extractProductsFromSlots(response.RESPONSE.slots, products);
                    }
                });
            }

            if (products.length === 0) {
                console.log('   ⚠️  No products found');
                return;
            }

            console.log(`   📦 Found ${products.length} products`);

            let fileProductsWithImages = 0;
            const fileSources = {};

            products.slice(0, 10).forEach((product, idx) => {
                const result = extractImageUrl(product);
                
                if (result.url) {
                    fileProductsWithImages++;
                    fileSources[result.source] = (fileSources[result.source] || 0) + 1;
                    imageSourceStats[result.source] = (imageSourceStats[result.source] || 0) + 1;

                    if (idx < 3) {
                        console.log(`     ✓ [${idx + 1}] ${product.productName || product.titles?.title || 'Unknown'}`);
                        console.log(`        Source: ${result.source}`);
                        console.log(`        URL: ${result.url.substring(0, 80)}...`);
                    }
                } else {
                    if (idx < 3) {
                        console.log(`     ✗ [${idx + 1}] ${product.productName || product.titles?.title || 'Unknown'} - NO IMAGE`);
                    }
                }
            });

            const percentage = ((fileProductsWithImages / Math.min(10, products.length)) * 100).toFixed(0);
            console.log(`   📊 Images found: ${fileProductsWithImages}/${Math.min(10, products.length)} (${percentage}%)`);
            console.log(`   Sources: ${JSON.stringify(fileSources)}`);

            totalProducts += products.length;
            productsWithImages += fileProductsWithImages;

        } catch (err) {
            console.error(`   ❌ Error: ${err.message}`);
        }
    });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📌 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total products sampled: ${totalProducts}`);
    console.log(`Products with images: ${productsWithImages}`);
    if (totalProducts > 0) {
        const successRate = ((productsWithImages / totalProducts) * 100).toFixed(1);
        console.log(`Success rate: ${successRate}%`);
    }
    
    if (Object.keys(imageSourceStats).length > 0) {
        console.log(`\nImage sources found:`);
        Object.entries(imageSourceStats).forEach(([source, count]) => {
            console.log(`  • ${source}: ${count}`);
        });
    }

    console.log('\n💡 Recommendation:');
    if (productsWithImages === 0) {
        console.log('   No images found! Check if API dump contains media.images or alternative paths.');
    } else if (productsWithImages < totalProducts * 0.5) {
        console.log('   Less than 50% images found. May need additional fallback paths.');
    } else {
        console.log('   ✓ Image extraction working well!');
    }
}

function extractProductsFromDump(elementData, products) {
    // Handle raw response format
    if (Array.isArray(elementData)) {
        products.push(...elementData);
    }
}

function extractProductsFromSlots(slots, products) {
    slots.forEach(slot => {
        if (slot.widget && slot.widget.data && slot.widget.data.products) {
            slot.widget.data.products.forEach(productOuter => {
                if (productOuter.productInfo && productOuter.productInfo.value) {
                    products.push(productOuter.productInfo.value);
                }
            });
        }
    });
}

testImageExtraction().catch(console.error);
