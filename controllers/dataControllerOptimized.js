import mongoose from 'mongoose';
import Brand from '../models/Brand.js';
import ProductSnapshot from '../models/ProductSnapshot.js';
import ProductGrouping from '../models/ProductGrouping.js';
import redisCache from '../utils/redisCache.js';
import { categoryMapper } from '../utils/categoryMapper.js';
import { enhanceProductForManualInsertion } from '../utils/manualInsertionHelper.js';

/**
 * Validates productName ensuring it's not a price or invalid value
 */
const isValidProductName = (productName) => {
  if (!productName || productName === 'N/A' || productName.trim() === '') {
    return false;
  }

  const trimmed = String(productName).trim();
  const pricePattern = /^[₹$£€¥₺₽₩₪₫₦]\d+(\.\d{1,2})?$/;
  if (pricePattern.test(trimmed)) {
    return false;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return false;
  }

  return true;
};

/**
 * Convert value to number safely
 */
const toNum = (val) => {
  if (val === null || val === undefined || val === 'N/A' || val === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
};

const normalizeGroupPrimaryName = (name) => {
  if (!name) return name;
  return String(name).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
};

const normalizeBrandName = (name) => {
  if (!name) return null;
  const cleaned = String(name)
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!cleaned) return null;
  return cleaned.replace(/\b\w/g, char => char.toUpperCase());
};

const getBrandId = (brandName) => {
  if (!brandName) return 'N/A';
  return brandName.toLowerCase().replace(/[^a-z0-9]/g, '-');
};

/**
 * Normalize platform name to enum value
 */
const normalizePlatform = (platform) => {
  const PLATFORM_ENUM = ['zepto', 'blinkit', 'jiomart', 'dmart', 'instamart', 'flipkartMinutes'];
  return PLATFORM_ENUM.find(p => p.toLowerCase() === platform.toLowerCase()) || platform.toLowerCase();
};

const buildProductIdWithSuffix = (product) => {
  const officialSubCat = product.officialSubCategory || product.officalSubCategory || '';
  let fullProductId = product.id || product.productId;

  if (officialSubCat && officialSubCat !== 'N/A') {
    const expectedSuffix = '__' + officialSubCat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const rawId = String(fullProductId);
    if (!rawId.endsWith(expectedSuffix)) {
      const baseId = rawId.replace(/__.*$/, '');
      fullProductId = baseId + expectedSuffix;
    }
  }

  return fullProductId;
};

/**
 * Process products in batch with Redis caching and bulk operations
 * ✅ 20-50x FASTER than sequential processing
 */
export const processScrapedDataOptimized = async ({ pincode, platform, category, products, dateOverride }) => {
  const startTime = Date.now();
  const decodedCategory = category.replace(/ _ /g, ' & ');
  const normalizedPlatform = normalizePlatform(platform);

  if (dateOverride) {
    console.log(`⏰ Using date override: ${new Date(dateOverride).toISOString()}`);
  }

  console.log(`🔄 Mapping categories for ${products.length} products from ${platform}...`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 0: MAP CATEGORIES FROM URLs (BEFORE PROCESSING)
  // ═══════════════════════════════════════════════════════════════════
  const mappedProducts = categoryMapper.batchMapProductCategories(products, platform);
  
  let newProductsCount = 0;
  let updatedProductsCount = 0;
  let newGroupsCount = 0;

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: DEDUPLICATE PRODUCTS
  // ═══════════════════════════════════════════════════════════════════
  const seenInBatch = new Set();
  const uniqueProducts = mappedProducts.filter(prod => {
    const subCat = prod.officialSubCategory || prod.officalSubCategory || '';
    const key = `${prod.productId || prod.id}|${subCat}|${prod.scrapedAt || prod.time || ''}`;
    if (seenInBatch.has(key)) return false;
    seenInBatch.add(key);
    return true;
  }).filter(prod => isValidProductName(prod.productName || prod.name));

  console.log(`📦 Processing ${uniqueProducts.length} unique products (Redis optimized)`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: CALCULATE RANKINGS
  // ═══════════════════════════════════════════════════════════════════
  const rankCounters = {};
  uniqueProducts.forEach(prod => {
    const subCat = (prod.officialSubCategory || prod.officalSubCategory || 'Unknown').trim();
    if (!rankCounters[subCat]) rankCounters[subCat] = 1;
    prod.ranking = rankCounters[subCat]++;
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: CACHE LATEST SNAPSHOT DATE FOR CATEGORY
  // ═══════════════════════════════════════════════════════════════════
  const resolvedScrapedAt = dateOverride ? new Date(dateOverride) : (uniqueProducts[0]?.time || uniqueProducts[0]?.scrapedAt || new Date());
  console.log(`📅 Using scrapedAt: ${resolvedScrapedAt.toISOString()}`);
  let latestPreviousSnapshot = await redisCache.getCategoryLatestDate(normalizedPlatform, pincode, decodedCategory);

  if (!latestPreviousSnapshot) {
    // Cache miss - fetch from DB
    const dbSnapshot = await ProductSnapshot.findOne({
      platform: normalizedPlatform,
      pincode: pincode.trim(),
      category: decodedCategory.trim(),
      scrapedAt: { $lt: new Date(resolvedScrapedAt) }
    }).sort({ scrapedAt: -1 }).lean();

    if (dbSnapshot) {
      latestPreviousSnapshot = dbSnapshot.scrapedAt;
      await redisCache.setCategoryLatestDate(normalizedPlatform, pincode, decodedCategory, latestPreviousSnapshot);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: BATCH PREPARE DATA & FETCH REQUIRED INFO
  // ═══════════════════════════════════════════════════════════════════
  const snapshotsToInsert = [];
  const groupingsToUpsert = [];
  const brandsToUpsert = [];
  const productIdMap = new Map(); // Track product ID → group mapping

  // Fetch all brands and snapshots we need in ONE query each
  const allBrandIds = [...new Set(uniqueProducts
    .map(p => normalizeBrandName((p.brand || '').trim() || p.name?.split(' ')[0] || ''))
    .filter(Boolean)
    .map(getBrandId)
  )];

  const existingBrands = await Brand.find({ brandId: { $in: allBrandIds } }).lean();
  const brandMap = new Map(existingBrands.map(b => [b.brandId, b]));

  // Fetch all last snapshots for these products
  const productIds = uniqueProducts.map(p => buildProductIdWithSuffix(p));
  const lastSnapshots = await ProductSnapshot.find({
    productId: { $in: productIds },
    platform: normalizedPlatform,
    pincode: pincode.trim(),
    category: decodedCategory.trim(),
    scrapedAt: latestPreviousSnapshot
  }).lean();

  const snapshotMap = new Map(lastSnapshots.map(s => [s.productId, s]));

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: PROCESS EACH PRODUCT
  // ═══════════════════════════════════════════════════════════════════
  for (const prod of uniqueProducts) {
    const currentPrice = toNum(prod.price || prod.currentPrice) ?? 0;
    const originalPrice = toNum(prod.mrp || prod.originalPrice) ?? currentPrice;
    const discountPercentage = toNum(prod.discountPercent || prod.discountPercentage);

    // ─ Brand handling with caching
    const rawBrandName = (prod.brand || '').trim() || prod.name?.split(' ')[0] || null;
    let brandName = null;
    if (rawBrandName) {
      const normalizedBrandName = normalizeBrandName(rawBrandName);
      const brandId = getBrandId(normalizedBrandName);

      // Check local map first, then Redis cache
      if (!brandMap.has(brandId)) {
        const cachedBrand = await redisCache.getBrand(brandId);
        if (cachedBrand) {
          brandMap.set(brandId, cachedBrand);
        } else {
          brandName = normalizedBrandName;
          // Queue for batch upsert
          brandsToUpsert.push({
            updateOne: {
              filter: { brandId },
              update: { $setOnInsert: { brandName, enabled: true } },
              upsert: true
            }
          });
          brandMap.set(brandId, { brandId, brandName });
        }
      }

      if (!brandName) {
        brandName = brandMap.get(brandId)?.brandName || normalizedBrandName;
      }
    }

    // ─ Handle productId suffix
    const fullProductId = buildProductIdWithSuffix(prod);

    // ─ Create snapshot document
    const isNewProduct = !snapshotMap.has(fullProductId);
    // ✅ Use masterCategory from categories_with_urls.json mapping
    const finalCategory = (prod.masterCategory || prod.category || decodedCategory).trim();
    const finalOfficialCategory = (prod.officialCategory || prod.officalCategory || 'N/A').trim();
    const finalOfficialSubCategory = (prod.officialSubCategory || prod.officalSubCategory || 'N/A').trim();

    const snapshotDoc = {
      category: finalCategory,
      categoryUrl: prod.categoryUrl || 'N/A',
      officialCategory: finalOfficialCategory,
      officialSubCategory: finalOfficialSubCategory,
      pincode: pincode.trim(),
      platform: normalizedPlatform,
      scrapedAt: new Date(resolvedScrapedAt),
      productId: fullProductId,
      productUrl: prod.productUrl || prod.url || '',
      productName: prod.name || prod.productName,
      productImage: prod.image || prod.image_url || prod.productImage || '',
      productWeight: prod.weight || prod.productWeight || '',
      currentPrice,
      originalPrice,
      discountPercentage,
      ranking: prod.rank || prod.ranking || prod.ranking || 999,
      isOutOfStock: prod.outOfStock || prod.isOutOfStock || false,
      isAd: prod.isAd || false,
      deliveryTime: prod.deliveryTime || '',
      brand: brandName,
      quantity: prod.quantity || '',
      combo: prod.combo || '',
      isVariant: prod.isVariant || false,
      comboOf: Array.isArray(prod.comboOf) ? prod.comboOf : [],
      skuId: prod.skuId || 'N/A',
      savings: toNum(prod.savings || 0),
      new: isNewProduct,
      lastComparedWith: snapshotMap.get(fullProductId)?._id || null
    };

    snapshotsToInsert.push(snapshotDoc);

    if (isNewProduct) {
      newProductsCount++;
    } else {
      updatedProductsCount++;
    }

    // ─ Track for grouping operations
    if (isNewProduct) {
      productIdMap.set(fullProductId, {
        platform: normalizedPlatform,
        productId: fullProductId,
        productName: prod.name || prod.productName,
        productImage: prod.image || prod.image_url || prod.productImage || '',
        productWeight: prod.weight || prod.productWeight || prod.quantity || '',
        brand: brandName,
        category: finalCategory  // Use mapped category, not decodedCategory
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: BULK INSERT SNAPSHOTS
  // ═══════════════════════════════════════════════════════════════════
  let insertedCount = 0;
  if (snapshotsToInsert.length > 0) {
    try {
      const result = await ProductSnapshot.insertMany(snapshotsToInsert, { ordered: false });
      insertedCount = result.length;
      console.log(`✅ Bulk inserted ${insertedCount} snapshots`);
    } catch (err) {
      // Handle duplicates gracefully
      if (err.code === 11000) {
        console.warn(`⚠️ Some duplicates detected, inserting individually...`);
        for (const doc of snapshotsToInsert) {
          try {
            await ProductSnapshot.insertOne(doc);
            insertedCount++;
          } catch (e) {
            if (e.code !== 11000) throw e;
          }
        }
      } else {
        throw err;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 7: BULK UPSERT BRANDS
  // ═══════════════════════════════════════════════════════════════════
  if (brandsToUpsert.length > 0) {
    try {
      await Brand.bulkWrite(brandsToUpsert, { ordered: false });
      console.log(`✅ Bulk upserted ${brandsToUpsert.length} brands`);
    } catch (err) {
      console.warn(`⚠️ Brand bulk write had errors:`, err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 8: PROCESS GROUPINGS (LOCAL GROUPING BY BASE ID)
  // ═══════════════════════════════════════════════════════════════════
  if (productIdMap.size > 0) {
    const productsByBaseId = new Map();

    // Group items from the current batch by their baseProductId
    for (const [fullProductId, prodInfo] of productIdMap.entries()) {
      const baseProductId = String(fullProductId).replace(/__.*$/, '');
      if (!productsByBaseId.has(baseProductId)) {
        productsByBaseId.set(baseProductId, {
          productName: prodInfo.productName,
          productImage: prodInfo.productImage,
          productWeight: prodInfo.productWeight,
          brand: prodInfo.brand,
          category: prodInfo.category,
          products: []
        });
      }
      productsByBaseId.get(baseProductId).products.push({
        platform: prodInfo.platform,
        productId: fullProductId
      });
    }

    const groupingOps = [];

    // Process each baseProductId group
    for (const [baseProductId, prodGroup] of productsByBaseId.entries()) {
      // Try to find existing group using a regex that matches baseId with optional suffix
      // Escape special characters in baseProductId for regex safety
      const escapedBaseId = baseProductId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      const existingGroup = await ProductGrouping.findOne({
        category: prodGroup.category,
        "products.productId": { $regex: `^${escapedBaseId}(__[a-z0-9-]*)?$` }
      });

      if (existingGroup) {
        // Filter out products that are already in the group to avoid duplicates
        const newProductsToAdd = prodGroup.products.filter(newProd => 
          !existingGroup.products.some(p => p.productId === newProd.productId && p.platform === newProd.platform)
        );

        if (newProductsToAdd.length > 0) {
          groupingOps.push({
            updateOne: {
              filter: { _id: existingGroup._id },
              update: {
                $push: { products: { $each: newProductsToAdd } },
                $inc: { totalProducts: newProductsToAdd.length }
              }
            }
          });
        }
      } else {
        // No group found in DB - create ONE group for all products with this baseId in the batch
        groupingOps.push({
          insertOne: {
            document: {
              groupingId: new mongoose.Types.ObjectId().toString(),
              category: prodGroup.category,
              primaryName: normalizeGroupPrimaryName(prodGroup.productName),
              primaryImage: prodGroup.productImage,
              primaryWeight: prodGroup.productWeight,
              brand: prodGroup.brand || '',
              brandId: getBrandId(prodGroup.brand),
              products: prodGroup.products,
              totalProducts: prodGroup.products.length
            }
          }
        });
        newGroupsCount++;
      }
    }

    // Execute grouping operations in batches
    if (groupingOps.length > 0) {
      const BATCH_SIZE = 50; 
      for (let i = 0; i < groupingOps.length; i += BATCH_SIZE) {
        const batch = groupingOps.slice(i, i + BATCH_SIZE);
        try {
          await ProductGrouping.bulkWrite(batch, { ordered: false });
          console.log(`✅ Processed grouping batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} operations)`);
        } catch (err) {
          console.warn(`⚠️ Grouping batch error:`, err.message);
        }
      }
    }
  }

  const elapsed = Date.now() - startTime;

  return {
    success: true,
    message: `Processed ${products.length} products in ${elapsed}ms.`,
    stats: {
      new: newProductsCount,
      updated: updatedProductsCount,
      newGroups: newGroupsCount,
      inserted: insertedCount,
      elapsed: `${elapsed}ms`
    }
  };
};

export default processScrapedDataOptimized;
