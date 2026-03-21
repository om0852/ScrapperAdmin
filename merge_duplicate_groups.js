import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductGrouping from './models/ProductGrouping.js';

dotenv.config();

async function mergeGroupsByBaseProductId() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        // Get all groups
        const allGroups = await ProductGrouping.find();
        console.log(`Found ${allGroups.length} total groups\n`);

        // Group by category first (groups can only merge within same category)
        const groupsByCategory = {};
        for (const group of allGroups) {
            const cat = group.category;
            if (!groupsByCategory[cat]) {
                groupsByCategory[cat] = {};
            }

            // Extract base productIds from all products in this group
            for (const prod of group.products) {
                const baseId = String(prod.productId).replace(/__.*$/, '');
                if (!groupsByCategory[cat][baseId]) {
                    groupsByCategory[cat][baseId] = [];
                }
                groupsByCategory[cat][baseId].push(group);
            }
        }

        console.log(`Categories found: ${Object.keys(groupsByCategory).length}\n`);

        let totalDuplicatesFound = 0;
        let totalMerged = 0;

        // Check each category
        for (const [category, baseIdMap] of Object.entries(groupsByCategory)) {
            // Find base IDs that have multiple groups
            for (const [baseId, groupsWithThisBase] of Object.entries(baseIdMap)) {
                if (groupsWithThisBase.length > 1) {
                    console.log(`✗ DUPLICATE GROUPS FOUND:`);
                    console.log(`  Category: ${category}`);
                    console.log(`  Base ProductId: ${baseId}`);
                    console.log(`  Groups: ${groupsWithThisBase.length}\n`);
                    totalDuplicatesFound += groupsWithThisBase.length;

                    // Sort by creation date - keep oldest
                    groupsWithThisBase.sort((a, b) => 
                        new Date(a.createdAt || a._id.getTimestamp()) - 
                        new Date(b.createdAt || b._id.getTimestamp())
                    );

                    const primaryGroup = groupsWithThisBase[0];
                    const secondaryGroups = groupsWithThisBase.slice(1);

                    console.log(`  Keeping primary group: ${primaryGroup.groupingId}`);
                    console.log(`  Merging into it: ${secondaryGroups.map(g => g.groupingId).join(', ')}\n`);

                    // Merge products from all secondary groups into primary
                    const allProducts = [...primaryGroup.products];
                    for (const secGroup of secondaryGroups) {
                        for (const prod of secGroup.products) {
                            // Avoid duplicates (same platform + productId)
                            const exists = allProducts.some(
                                p => p.platform === prod.platform && p.productId === prod.productId
                            );
                            if (!exists) {
                                allProducts.push({
                                    platform: prod.platform,
                                    productId: prod.productId
                                });
                            }
                        }
                    }

                    // Update primary group
                    primaryGroup.products = allProducts;
                    primaryGroup.totalProducts = allProducts.length;
                    await primaryGroup.save();

                    console.log(`  Updated primary group with ${allProducts.length} total products`);

                    // Delete secondary groups
                    for (const secGroup of secondaryGroups) {
                        await ProductGrouping.deleteOne({ _id: secGroup._id });
                        console.log(`  Deleted duplicate group: ${secGroup.groupingId}`);
                    }

                    totalMerged += secondaryGroups.length;
                    console.log();
                }
            }
        }

        console.log('\n--- MERGE SUMMARY ---');
        console.log(`Total duplicate groups found: ${totalDuplicatesFound}`);
        console.log(`Groups merged/deleted: ${totalMerged}`);
        console.log(`Remaining groups: ${allGroups.length - totalMerged}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
        process.exit(0);
    }
}

mergeGroupsByBaseProductId();
