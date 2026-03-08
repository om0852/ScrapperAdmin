import mongoose from 'mongoose';
import Brand from '../models/Brand.js';
import ProductSnapshot from '../models/ProductSnapshot.js';
import ProductGrouping from '../models/ProductGrouping.js';

export const processScrapedData = async ({ pincode, platform, category, products }) => {
    // Decode folder-name sanitization: Windows replaces & with _ in directory names.
    // " _ " surrounded by spaces is the tell-tale sign (e.g. "Fruits _ Vegetables").
    const decodedCategory = category.replace(/ _ /g, ' & ');

    let newProductsCount = 0;
    let updatedProductsCount = 0;
    let newGroupsCount = 0;

    // Deduplicate within this batch: a true duplicate is the same productId AND same
    // officialSubCategory (same final suffixed ID) with the same scrapedAt.
    // Products with the same base ID but DIFFERENT officialSubCategory are distinct products
    // (they'll get different suffixes like __fresh-vegetables vs __fresh-fruits) — keep both.
    const seenInBatch = new Set();
    const uniqueProducts = products.filter(prod => {
        const subCat = prod.officialSubCategory || prod.officalSubCategory || '';
        const key = `${prod.productId || prod.id}|${subCat}|${prod.scrapedAt || prod.time || ''}`;
        if (seenInBatch.has(key)) return false;
        seenInBatch.add(key);
        return true;
    });

    for (const prod of uniqueProducts) {
        // ── Suffix Safety Net ──────────────────────────────────────────────
        // Ensure productId always carries the __<officialSubCategory> suffix.
        // This runs for every product regardless of where it came from, so
        // scraper bugs or missing orchestrator fixes can't pollute the DB.
        const officialSubCat = prod.officialSubCategory || prod.officalSubCategory || '';
        if (officialSubCat && officialSubCat !== 'N/A') {
            const expectedSuffix = '__' + officialSubCat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const rawId = String(prod.productId || prod.id || '');
            if (!rawId.endsWith(expectedSuffix)) {
                // Strip any existing __suffix then re-apply the correct one
                const baseId = rawId.replace(/__.*$/, '');
                prod.productId = baseId + expectedSuffix;
            }
        }
        // ───────────────────────────────────────────────────────────────────

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

        // Normalize platform name to match enum (case-insensitive lookup).
        // Must be done BEFORE the lastSnapshot query so we search DB with the
        // exact same value that was stored (e.g. 'flipkartMinutes' not 'flipkartminutes').
        const PLATFORM_ENUM = ['zepto', 'blinkit', 'jiomart', 'dmart', 'instamart', 'flipkartMinutes'];
        const normalizedPlatform = PLATFORM_ENUM.find(p => p.toLowerCase() === platform.toLowerCase()) || platform.toLowerCase();

        // 3. Find Last Snapshot (to calculate 'new' and price changes)
        const lastSnapshot = await ProductSnapshot.findOne({
            productId: prod.id || prod.productId,
            platform: normalizedPlatform,
            pincode: pincode.trim(),
            category: (prod.category || decodedCategory).trim()
        }).sort({ scrapedAt: -1 }); // Get the most recent one

        const isNewProduct = !lastSnapshot;

        if (lastSnapshot) {
            updatedProductsCount++;
        } else {
            newProductsCount++;
        }

        // Normalize platform name to match enum (already computed above).

        // 4. Create New Snapshot
        // Use the product's own category if available (already correctly mapped
        // e.g. "Fruits & Vegetables"), otherwise fall back to the decoded arg.
        const finalCategory = (prod.category || decodedCategory).trim();
        // Resolve the scrape timestamp — prefer explicit fields over the schema default.
        // prod.time  = set by orchestrator when a dateOverride is applied
        // prod.scrapedAt = set by scrapers in the JSON output
        // prod.date  = legacy fallback field
        const resolvedScrapedAt = prod.time || prod.scrapedAt || prod.date || new Date();

        const newSnapshot = new ProductSnapshot({
            category: finalCategory,
            categoryUrl: prod.categoryUrl || 'N/A',
            officialCategory: prod.officialCategory || 'N/A',
            officialSubCategory: prod.officialSubCategory || prod.officalSubCategory || 'N/A',
            pincode: pincode.trim(),
            platform: normalizedPlatform,
            scrapedAt: new Date(resolvedScrapedAt),

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

        try {
            await newSnapshot.save();
        } catch (saveErr) {
            if (saveErr.code === 11000) {
                // Duplicate key — this exact snapshot already exists (same scrapedAt + productId).
                // Treat as "updated" (already in DB) and continue processing remaining products.
                if (isNewProduct) {
                    newProductsCount--;      // revert the new count
                    updatedProductsCount++;  // count as updated instead
                }
                continue;
            }
            throw saveErr; // re-throw unexpected errors
        }

        if (isNewProduct) {
            const existingGroup = await ProductGrouping.findOne({
                "products.productId": prod.id || prod.productId,
                category: finalCategory
            });

            if (!existingGroup) {
                const newGroup = new ProductGrouping({
                    groupingId: new mongoose.Types.ObjectId().toString(),
                    category: finalCategory,
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
