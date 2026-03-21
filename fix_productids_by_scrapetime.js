import mongoose from 'mongoose';
import ProductSnapshot from './models/ProductSnapshot.js';
import dotenv from 'dotenv';

dotenv.config();

const SCRAPED_AT = new Date('2026-03-11T02:30:00.000Z');

async function fixProductIdsByScrapeTime() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);

        console.log(`🔍 Finding all products scraped at ${SCRAPED_AT.toISOString()}...`);

        // Find all products with the specific scrapedAt time
        const products = await ProductSnapshot.find({
            scrapedAt: SCRAPED_AT
        });

        console.log(`✅ Found ${products.length} products to update\n`);

        if (products.length === 0) {
            console.log('No products found for this scrape time.');
            await mongoose.connection.close();
            return;
        }

        let updated = 0;
        let errors = 0;
        const updateResults = {};

        // Process each product
        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            try {
                const oldProductId = product.productId;
                
                // Extract base product ID (remove existing suffix if any)
                const baseProductId = String(product.productId || '').replace(/__.*$/, '');
                
                // Build new suffix from officialSubCategory
                const officialSubCategory = product.officialSubCategory || 'N/A';
                const subCatSuffix = (officialSubCategory && officialSubCategory !== 'N/A')
                    ? '__' + officialSubCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                    : '';
                
                const newProductId = baseProductId + subCatSuffix;

                // Only update if productId changed
                if (oldProductId !== newProductId) {
                    await ProductSnapshot.updateOne(
                        { _id: product._id },
                        { productId: newProductId }
                    );

                    updated++;

                    // Track by platform
                    const platform = product.platform || 'unknown';
                    if (!updateResults[platform]) {
                        updateResults[platform] = [];
                    }
                    updateResults[platform].push({
                        oldProductId,
                        newProductId,
                        officialSubCategory,
                        category: product.category
                    });
                }
                
                // Progress indicator
                if ((i + 1) % 1000 === 0) {
                    console.log(`   ⏳ Processed ${i + 1}/${products.length} products...`);
                }

            } catch (err) {
                errors++;
                console.error(`❌ Error updating product ${i} (${product._id}):`, err.message);
                if (errors > 10) {
                    console.error('Too many errors. Stopping...');
                    break;
                }
            }
        }

        // Print results by platform
        console.log(`\n📊 Update Summary:`);
        console.log(`   Total Updated: ${updated}`);
        console.log(`   Errors: ${errors}`);
        console.log(`   No Change: ${products.length - updated - errors}\n`);

        // Show sample updates per platform
        for (const [platform, results] of Object.entries(updateResults)) {
            console.log(`\n🔧 ${platform.toUpperCase()} (${results.length} updated):`);
            results.slice(0, 5).forEach(r => {
                console.log(`   OLD: ${r.oldProductId}`);
                console.log(`   NEW: ${r.newProductId}`);
                console.log(`   Category: ${r.category} | SubCategory: ${r.officialSubCategory}`);
                console.log('');
            });
            if (results.length > 5) {
                console.log(`   ... and ${results.length - 5} more\n`);
            }
        }

        console.log(`\n✨ Fix completed successfully!`);

    } catch (error) {
        console.error('💥 Fatal error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
    }
}

fixProductIdsByScrapeTime();
