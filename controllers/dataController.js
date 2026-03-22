import mongoose from 'mongoose';
import Brand from '../models/Brand.js';
import ProductSnapshot from '../models/ProductSnapshot.js';
import ProductGrouping from '../models/ProductGrouping.js';

/**
 * Validates productName to ensure it's not a price or invalid value.
 * Skips products where productName is empty, "N/A", or looks like a price (₹XX, $XX, etc.)
 */
const isValidProductName = (productName) => {
    if (!productName || productName === 'N/A' || productName.trim() === '') {
        return false;
    }
    
    const trimmed = String(productName).trim();
    
    // Check if it looks like a price (currency symbol + numbers)
    const pricePattern = /^[₹$£€¥₺₽₩₪₫₦]\d+(\.\d{1,2})?$/;
    if (pricePattern.test(trimmed)) {
        return false;
    }
    
    // Check if it's purely numeric (like just "62")
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return false;
    }
    
    return true;
};

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

    // ── Calculate Rankings ─────────────────────────────────────────────
    // Calculate rankings dynamically per subcategory based on order of appearance.
    // This ensures accurate 1-N ranking even on manual insertion or messy scrape data.
    const rankCounters = {};
    for (const prod of uniqueProducts) {
        const subCat = (prod.officialSubCategory || prod.officalSubCategory || 'Unknown').trim();
        if (!rankCounters[subCat]) {
            rankCounters[subCat] = 1;
        }
        prod.ranking = rankCounters[subCat];
        rankCounters[subCat]++;
    }
    // ───────────────────────────────────────────────────────────────────

    for (const prod of uniqueProducts) {
        // ── Skip products with invalid productName ─────────────────────
        if (!isValidProductName(prod.productName || prod.name)) {
            console.warn(`[DataController] Skipping product with invalid productName: "${prod.productName || prod.name}"`);
            continue;
        }
        // ─────────────────────────────────────────────────────────────────

        // ── Suffix Safety Net ──────────────────────────────────────────────
        // Ensure productId always carries the __<officialSubCategory> suffix.
        // This runs for every product regardless of where it came from, so
        // scraper bugs or missing orchestrator fixes can't pollute the DB.
        const officialSubCat = prod.officialSubCategory || prod.officalSubCategory || '';
        if (officialSubCat && officialSubCat !== 'N/A') {
            // Keep hyphens to differentiate multi-word categories (e.g., fresh-vegetables, not freshvegetables)
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
            try {
                await Brand.findOneAndUpdate(
                    { brandId },
                    {
                        $setOnInsert: { brandName, enabled: true }
                    },
                    { upsert: true, returnDocument: 'after' }
                );
            } catch (err) {
                if (err.code !== 11000) {
                    throw err;
                }
                // Ignore E11000 duplicate key error for concurrent brand insertions
            }
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

        // Skip checking for previously scraped product — new field will be set during manual insertion
        // Resolve the scraped timestamp
        const resolvedScrapedAt = prod.time || prod.scrapedAt || prod.date || new Date();

        // 4. Create New Snapshot
        // Use the product's own category if available (already correctly mapped
        // e.g. "Fruits & Vegetables"), otherwise fall back to the decoded arg.
        const finalCategory = (prod.category || decodedCategory).trim();

        const newSnapshot = new ProductSnapshot({
            category: finalCategory,
            categoryUrl: prod.categoryUrl || 'N/A',
            officialCategory: prod.officialCategory || 'N/A',
            officialSubCategory: prod.officialSubCategory || prod.officalSubCategory || 'N/A',
            pincode: pincode.trim(),
            platform: normalizedPlatform,
            scrapedAt: new Date(resolvedScrapedAt),

            productId: prod.id || prod.productId,
            productUrl: prod.productUrl || prod.url || '',
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
            quantity: prod.quantity || '',
            combo: prod.combo || '',
            skuId: prod.skuId || 'N/A',
            savings: toNum(prod.savings || 0),

            new: false
            // new field will be set to true during manual insertion via updateIsNewField logic
        });

        try {
            await newSnapshot.save();
        } catch (saveErr) {
            if (saveErr.code === 11000) {
                // Duplicate key — this exact snapshot already exists (same scrapedAt + productId).
                // Treat as "updated" (already in DB) and continue processing remaining products.

                // If we are re-ingesting the exact same file, patch the newly added `productUrl` and corrected `ranking` field
                await ProductSnapshot.updateOne(
                    {
                        scrapedAt: newSnapshot.scrapedAt,
                        category: newSnapshot.category,
                        platform: newSnapshot.platform,
                        pincode: newSnapshot.pincode,
                        productId: newSnapshot.productId
                    },
                    {
                        $set: {
                            productUrl: newSnapshot.productUrl,
                            ranking: newSnapshot.ranking
                        }
                    }
                );

                if (isNewProduct) {
                    newProductsCount--;      // revert the new count
                    updatedProductsCount++;  // count as updated instead
                }
                continue;
            }
            throw saveErr; // re-throw unexpected errors
        }

        if (isNewProduct) {
            const fullProductId = prod.id || prod.productId;
            const baseProductId = String(fullProductId).replace(/__.*$/, '');
            
            // Step 1: Check if group exists with FULL productId (with suffix)
            let targetGroup = await ProductGrouping.findOne({
                "products.productId": fullProductId,
                category: finalCategory
            });
            
            if (targetGroup) {
                // Group with full productId found → Add product to it
                const productExists = targetGroup.products.some(
                    p => p.productId === fullProductId && p.platform === normalizedPlatform
                );
                
                if (!productExists) {
                    targetGroup.products.push({
                        platform: normalizedPlatform,
                        productId: fullProductId
                    });
                    targetGroup.totalProducts = targetGroup.products.length;
                    await targetGroup.save();
                }
            } else {
                // Step 2: Find group with BASE productId (suffix removed)
                // Note: Duplicate groups have been consolidated, so only one should exist per base productId
                // Pattern matches base ID with or without suffix (including variants without hyphens)
                const baseGroup = await ProductGrouping.findOne({
                    category: finalCategory,
                    "products.productId": {
                        $regex: `^${baseProductId}(__[a-z0-9]*)?$`  // Match base ID with optional suffix (no hyphens pattern)
                    }
                });
                
                if (baseGroup) {
                    // Group found with base productId → Add product to it
                    const productExists = baseGroup.products.some(
                        p => p.productId === fullProductId && p.platform === normalizedPlatform
                    );
                    
                    if (!productExists) {
                        baseGroup.products.push({
                            platform: normalizedPlatform,
                            productId: fullProductId
                        });
                        baseGroup.totalProducts = baseGroup.products.length;
                        await baseGroup.save();
                    }
                } else {
                    // Step 3: No group found (full or base) → Create new group
                    const newGroup = new ProductGrouping({
                        groupingId: new mongoose.Types.ObjectId().toString(),
                        category: finalCategory,
                        primaryName: prod.name || prod.productName,
                        primaryImage: prod.image || prod.image_url || prod.productImage || '',
                        primaryWeight: prod.weight || prod.productWeight || prod.quantity || '',
                        brand: prod.brand || '',
                        brandId: (prod.brand || '').toLowerCase().replace(/[^a-z0-9]/g, '-') || 'N/A',
                        products: [{
                            platform: normalizedPlatform,
                            productId: fullProductId
                        }],
                        totalProducts: 1
                    });
                    await newGroup.save();
                    newGroupsCount++;
                }
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
