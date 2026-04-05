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

const fetchSnapshotRowsForDate = async ({ platform, pincode, category, scrapedAt }) => {
  if (!scrapedAt) {
    return [];
  }

  return ProductSnapshot.find({
    platform,
    pincode: pincode.trim(),
    category: category.trim(),
    scrapedAt
  }).select({ productId: 1, _id: 1 }).lean();
};

/**
 * Process products in batch with Redis caching and bulk operations
 * ✅ 20-50x FASTER than sequential processing
 */
export const processScrapedDataOptimized = async ({ pincode, platform, category, products, dateOverride }) => {
  const startTime = Date.now();
  const decodedCategory = category.replace(/ _ /g, ' & ');
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedPincode = pincode.trim();
  const normalizedCategory = decodedCategory.trim();

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
    const existingRanking = Number(prod.rank ?? prod.ranking);
    if (Number.isFinite(existingRanking) && existingRanking > 0) {
      prod.ranking = existingRanking;
      return;
    }

    const subCat = (prod.officialSubCategory || prod.officalSubCategory || 'Unknown').trim();
    if (!rankCounters[subCat]) rankCounters[subCat] = 1;
    prod.ranking = rankCounters[subCat]++;
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: CACHE LATEST SNAPSHOT DATE FOR CATEGORY
  // ═══════════════════════════════════════════════════════════════════
  const resolvedScrapedAt = new Date(
    dateOverride || uniqueProducts[0]?.time || uniqueProducts[0]?.scrapedAt || Date.now()
  );

  if (Number.isNaN(resolvedScrapedAt.getTime())) {
    throw new Error(`Invalid scrapedAt/dateOverride provided for ${normalizedPlatform}/${normalizedCategory}`);
  }

  console.log(`📅 Using scrapedAt: ${resolvedScrapedAt.toISOString()}`);

  const cachedCategoryIndex = await redisCache.getCategoryProductIndex(
    normalizedPlatform,
    normalizedPincode,
    normalizedCategory
  );

  let latestKnownSnapshotDate = cachedCategoryIndex?.scrapedAt || null;
  let latestPreviousSnapshot = null;
  let previousProductIdSet = new Set();
  let previousSnapshotIdMap = new Map();
  let comparisonSource = 'none';

  const applyComparisonRows = (rows, snapshotDate, source) => {
    latestPreviousSnapshot = snapshotDate;
    previousProductIdSet = new Set(rows.map(row => row.productId));
    previousSnapshotIdMap = new Map(rows.map(row => [row.productId, row._id]));
    comparisonSource = source;
  };

  if (!latestKnownSnapshotDate) {
    const latestSnapshotDoc = await ProductSnapshot.findOne({
      platform: normalizedPlatform,
      pincode: normalizedPincode,
      category: normalizedCategory
    }).sort({ scrapedAt: -1 }).select({ scrapedAt: 1 }).lean();

    if (latestSnapshotDoc?.scrapedAt) {
      latestKnownSnapshotDate = latestSnapshotDoc.scrapedAt;

      const latestSnapshotRows = await fetchSnapshotRowsForDate({
        platform: normalizedPlatform,
        pincode: normalizedPincode,
        category: normalizedCategory,
        scrapedAt: latestKnownSnapshotDate
      });

      await redisCache.setCategoryProductIndex(normalizedPlatform, normalizedPincode, normalizedCategory, {
        scrapedAt: latestKnownSnapshotDate,
        productIds: latestSnapshotRows.map(row => row.productId)
      });
      await redisCache.setCategoryLatestDate(
        normalizedPlatform,
        normalizedPincode,
        normalizedCategory,
        latestKnownSnapshotDate
      );

      if (latestKnownSnapshotDate < resolvedScrapedAt) {
        applyComparisonRows(latestSnapshotRows, latestKnownSnapshotDate, 'db-latest-cache-prime');
      }
    }
  } else if (latestKnownSnapshotDate < resolvedScrapedAt) {
    latestPreviousSnapshot = latestKnownSnapshotDate;
    previousProductIdSet = new Set(cachedCategoryIndex.productIds);
    comparisonSource = 'redis-product-index';
  }

  if (!latestPreviousSnapshot) {
    const latestPreviousSnapshotDoc = await ProductSnapshot.findOne({
      platform: normalizedPlatform,
      pincode: normalizedPincode,
      category: normalizedCategory,
      scrapedAt: { $lt: resolvedScrapedAt }
    }).sort({ scrapedAt: -1 }).select({ scrapedAt: 1 }).lean();

    if (latestPreviousSnapshotDoc?.scrapedAt) {
      const previousSnapshotRows = await fetchSnapshotRowsForDate({
        platform: normalizedPlatform,
        pincode: normalizedPincode,
        category: normalizedCategory,
        scrapedAt: latestPreviousSnapshotDoc.scrapedAt
      });

      applyComparisonRows(previousSnapshotRows, latestPreviousSnapshotDoc.scrapedAt, 'db-previous-snapshot');
    }
  }

  console.log(
    `🧠 Previous snapshot source: ${comparisonSource}, snapshot: ${latestPreviousSnapshot ? latestPreviousSnapshot.toISOString() : 'none'}, ids: ${previousProductIdSet.size}`
  );

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: BATCH PREPARE DATA & FETCH REQUIRED INFO
  // ═══════════════════════════════════════════════════════════════════
  const snapshotsToInsert = [];
  const groupingsToUpsert = [];
  const brandsToUpsert = [];
  const productIdMap = new Map(); // Track product ID → group mapping

  // Fetch all brands and snapshots we need in ONE query each
  const normalizedBrandNames = [...new Set(uniqueProducts
    .map(p => normalizeBrandName((p.brand || '').trim() || p.name?.split(' ')[0] || ''))
    .filter(Boolean)
  )];

  const allBrandIds = [...new Set(normalizedBrandNames.map(getBrandId))];

  const existingBrands = await Brand.find({
    $or: [
      { brandId: { $in: allBrandIds } },
      { brandName: { $in: normalizedBrandNames } }
    ]
  }).lean();
  const brandMap = new Map(existingBrands.map(b => [b.brandId, b]));
  const brandNameMap = new Map(
    existingBrands
      .filter(brand => brand?.brandName)
      .map(brand => [String(brand.brandName).toLowerCase(), brand])
  );

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
      const existingBrandByName = brandNameMap.get(normalizedBrandName.toLowerCase());

      // Check local map first, then Redis cache
      if (!brandMap.has(brandId)) {
        if (existingBrandByName) {
          brandMap.set(brandId, existingBrandByName);
        } else {
          const cachedBrand = await redisCache.getBrand(brandId);
          if (cachedBrand) {
            brandMap.set(brandId, cachedBrand);
            if (cachedBrand.brandName) {
              brandNameMap.set(String(cachedBrand.brandName).toLowerCase(), cachedBrand);
            }
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
            const pendingBrand = { brandId, brandName };
            brandMap.set(brandId, pendingBrand);
            brandNameMap.set(normalizedBrandName.toLowerCase(), pendingBrand);
          }
        }
      }

      if (!brandName) {
        brandName = brandMap.get(brandId)?.brandName || normalizedBrandName;
      }

      if (brandName) {
        brandNameMap.set(String(brandName).toLowerCase(), { brandId, brandName });
      }
    }

    // ─ Handle productId suffix
    const fullProductId = buildProductIdWithSuffix(prod);

    // ─ Create snapshot document
    const isNewProduct = !previousProductIdSet.has(fullProductId);
    // ✅ Use masterCategory from categories_with_urls.json mapping
    const finalCategory = (prod.masterCategory || prod.category || decodedCategory).trim();
    const finalOfficialCategory = (prod.officialCategory || prod.officalCategory || 'N/A').trim();
    const finalOfficialSubCategory = (prod.officialSubCategory || prod.officalSubCategory || 'N/A').trim();

    const snapshotDoc = {
      category: finalCategory,
      categoryUrl: prod.categoryUrl || 'N/A',
      officialCategory: finalOfficialCategory,
      officialSubCategory: finalOfficialSubCategory,
      pincode: normalizedPincode,
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
      lastComparedWith: previousSnapshotIdMap.get(fullProductId) || null
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

  const shouldRefreshLatestIndex = (() => {
    if (!snapshotsToInsert.length) {
      return false;
    }

    if (!latestKnownSnapshotDate) {
      return true;
    }

    return resolvedScrapedAt >= latestKnownSnapshotDate;
  })();

  if (shouldRefreshLatestIndex) {
    const currentProductIds = snapshotsToInsert.map(doc => doc.productId);

    await redisCache.setCategoryProductIndex(normalizedPlatform, normalizedPincode, normalizedCategory, {
      scrapedAt: resolvedScrapedAt,
      productIds: currentProductIds
    });
    await redisCache.setCategoryLatestDate(
      normalizedPlatform,
      normalizedPincode,
      normalizedCategory,
      resolvedScrapedAt
    );
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
