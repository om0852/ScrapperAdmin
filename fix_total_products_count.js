import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductGrouping from './models/ProductGrouping.js';

dotenv.config();

async function fixTotalProductsCounts() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all groups
        const allGroups = await ProductGrouping.find().lean();
        console.log(`\nFound ${allGroups.length} groups to check/fix...\n`);

        let correctedCount = 0;
        let alreadyCorrectCount = 0;

        for (const group of allGroups) {
            const actualProductCount = group.products ? group.products.length : 0;
            const storedTotalProducts = group.totalProducts || 0;

            if (actualProductCount !== storedTotalProducts) {
                console.log(`⚠️  Group ${group.groupingId}`);
                console.log(`    Category: ${group.category}`);
                console.log(`    Primary: ${group.primaryName}`);
                console.log(`    Stored totalProducts: ${storedTotalProducts}`);
                console.log(`    Actual product count: ${actualProductCount}`);

                // Update totalProducts to match actual count
                await ProductGrouping.updateOne(
                    { _id: group._id },
                    { $set: { totalProducts: actualProductCount } }
                );

                console.log(`    ✓ Fixed to: ${actualProductCount}\n`);
                correctedCount++;
            } else {
                alreadyCorrectCount++;
            }
        }

        console.log('\n--- Summary ---');
        console.log(`Total groups: ${allGroups.length}`);
        console.log(`Already correct: ${alreadyCorrectCount}`);
        console.log(`Fixed: ${correctedCount}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
        process.exit(0);
    }
}

fixTotalProductsCounts();
