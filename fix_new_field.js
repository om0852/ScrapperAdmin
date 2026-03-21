import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductSnapshot from './models/ProductSnapshot.js';

dotenv.config();

const SCRAPE_DATE_TO_FIX = new Date('2026-03-10T02:30:00.000+00:00'); // 10 March
const PREVIOUS_SCRAPE_DATE = new Date('2026-03-01T02:30:00.000+00:00'); // 1 March

console.log(`🔧 Fixing 'new' field for scrape date: ${SCRAPE_DATE_TO_FIX.toISOString()}`);
console.log(`📅 Comparing with previous scrape: ${PREVIOUS_SCRAPE_DATE.toISOString()}\n`);

async function fixNewField() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get all products from the target scrape date (10 March)
        const productsToFix = await ProductSnapshot.find({
            scrapedAt: SCRAPE_DATE_TO_FIX
        });

        console.log(`📊 Found ${productsToFix.length} products to fix for 10 March\n`);

        let fixedCount = 0;
        let alreadyCorrect = 0;

        // Process each product
        for (let i = 0; i < productsToFix.length; i++) {
            const product = productsToFix[i];

            // Check if product exists in previous scrape (1 March)
            const previousSnapshot = await ProductSnapshot.findOne({
                productId: product.productId,
                platform: product.platform,
                pincode: product.pincode,
                category: product.category,
                scrapedAt: PREVIOUS_SCRAPE_DATE  // ONLY check in 1 March
            });

            // Determine if it should be new or not
            const shouldBeNew = !previousSnapshot;

            // If the current 'new' field is different from what it should be, fix it
            if (product.new !== shouldBeNew) {
                await ProductSnapshot.updateOne(
                    { _id: product._id },
                    {
                        $set: {
                            new: shouldBeNew,
                            lastComparedWith: previousSnapshot ? previousSnapshot._id : null
                        }
                    }
                );

                fixedCount++;

                const status = shouldBeNew ? '🆕 NEW' : '🔄 UPDATED';
                console.log(`[${i + 1}/${productsToFix.length}] ${status} | ${product.productName} (${product.platform})`);
            } else {
                alreadyCorrect++;
            }
        }

        console.log(`\n✅ Fix Summary:`);
        console.log(`   Fixed: ${fixedCount}`);
        console.log(`   Already Correct: ${alreadyCorrect}`);
        console.log(`   Total: ${productsToFix.length}`);

        await mongoose.connection.close();
        console.log('\n🎉 Done! Disconnected from MongoDB');

    } catch (error) {
        console.error('❌ Error fixing new field:', error);
        process.exit(1);
    }
}

fixNewField();
