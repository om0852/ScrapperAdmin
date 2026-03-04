import mongoose from 'mongoose';
import Brand from '../models/Brand.js';
import ProductSnapshot from '../models/ProductSnapshot.js';
import ProductGrouping from '../models/ProductGrouping.js';

export const processScrapedData = async ({ pincode, platform, category, products }) => {
    let newProductsCount = 0;
    let updatedProductsCount = 0;
    let newGroupsCount = 0;

    for (const prod of products) {
        // 1. Extract and Upsert Brand
        let brandName = null;
        if (prod.brand && prod.brand.trim() !== '') {
            brandName = prod.brand.trim();
        } else if (prod.name) {
            // Very basic heuristic: first word of product is often brand if brand is missing
            brandName = prod.name.split(' ')[0];
        }

        if (brandName) {
            const brandId = brandName.toLowerCase().replace(/[^a-z0-9]/g, '-');
            await Brand.findOneAndUpdate(
                { brandId },
                {
                    $setOnInsert: { brandName, enabled: true }
                },
                { upsert: true, returnDocument: 'after' }
            );
        }

        // 2. Map payload to Schema format — sanitize "N/A" strings to null for numeric fields
        const toNum = (val) => {
            if (val === null || val === undefined || val === 'N/A' || val === '') return null;
            const n = parseFloat(val);
            return isNaN(n) ? null : n;
        };

        const currentPrice = toNum(prod.price || prod.currentPrice) ?? 0;
        const originalPrice = toNum(prod.mrp || prod.originalPrice) ?? currentPrice;
        const discountPercentage = toNum(prod.discountPercent || prod.discountPercentage);

        // 3. Find Last Snapshot (to calculate 'new' and price changes)
        const lastSnapshot = await ProductSnapshot.findOne({
            productId: prod.id || prod.productId,
            platform: platform.toLowerCase(),
            pincode: pincode.trim(),
            category: category.trim()
        }).sort({ scrapedAt: -1 }); // Get the most recent one

        const isNewProduct = !lastSnapshot;

        if (lastSnapshot) {
            updatedProductsCount++;
        } else {
            newProductsCount++;
        }

        // Normalize platform name to match enum (case-insensitive lookup)
        const PLATFORM_ENUM = ['zepto', 'blinkit', 'jiomart', 'dmart', 'instamart', 'flipkartMinutes'];
        const normalizedPlatform = PLATFORM_ENUM.find(p => p.toLowerCase() === platform.toLowerCase()) || platform.toLowerCase();

        // 4. Create New Snapshot
        const newSnapshot = new ProductSnapshot({
            category: category.trim(),
            categoryUrl: prod.categoryUrl || 'N/A',
            officialCategory: prod.officialCategory || 'N/A',
            pincode: pincode.trim(),
            platform: normalizedPlatform,

            productId: prod.id || prod.productId,
            productName: prod.name || prod.productName,
            productImage: prod.image || prod.image_url || prod.productImage || '',
            productWeight: prod.weight || prod.productWeight || '',
            currentPrice: currentPrice,
            originalPrice: originalPrice,
            discountPercentage: discountPercentage,
            ranking: prod.rank || prod.ranking || 999,

            isOutOfStock: prod.outOfStock || prod.isOutOfStock || false,
            isAd: prod.isAd || false,
            deliveryTime: prod.deliveryTime || '',
            brand: brandName,

            new: isNewProduct,
            lastComparedWith: lastSnapshot ? lastSnapshot._id : null
        });

        await newSnapshot.save();

        if (isNewProduct) {
            const existingGroup = await ProductGrouping.findOne({
                "products.productId": prod.id || prod.productId,
                category: category.trim()
            });

            if (!existingGroup) {
                const newGroup = new ProductGrouping({
                    groupingId: new mongoose.Types.ObjectId().toString(),
                    category: category.trim(),
                    primaryName: prod.name || prod.productName,
                    primaryImage: prod.image || prod.image_url || prod.productImage || '',
                    primaryWeight: prod.weight || prod.productWeight || prod.quantity || '',
                    products: [{
                        platform: normalizedPlatform,
                        productId: prod.id || prod.productId
                    }],
                    totalProducts: 1
                });
                await newGroup.save();
                newGroupsCount++;
            }
        }
    }

    return {
        success: true,
        message: `Processed ${products.length} products.`,
        stats: {
            new: newProductsCount,
            updated: updatedProductsCount,
            newGroups: newGroupsCount
        }
    };
};
