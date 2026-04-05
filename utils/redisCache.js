import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL || 'https://engaging-prawn-49473.upstash.io',
  token: process.env.UPSTASH_REDIS_TOKEN || 'AcFBAAIncDI3OTE1Y2U0ZDI4YWU0MzlkOTdmZDc1ODQ1NjQxZjJlOXAyNDk0NzM',
});

// Dedicated Redis for product-id indexes used by the `new` field comparison flow.
const productIndexRedis = new Redis({
  url: process.env.UPSTASH_PRODUCT_INDEX_REDIS_URL || 'https://free-buzzard-92684.upstash.io',
  token: process.env.UPSTASH_PRODUCT_INDEX_REDIS_TOKEN || 'gQAAAAAAAWoMAAIncDEwZjkyMGYzNGQ2ZGI0YTQzOWJjNjNjZmY0MDQxNDJjZHAxOTI2ODQ',
});

const CACHE_TTL = {
  BRAND: 3600,           // 1 hour
  SNAPSHOT: 1800,        // 30 minutes
  CATEGORY: 3600,        // 1 hour
  PRODUCT_PATTERN: 1800, // 30 minutes
  CATEGORY_PRODUCT_INDEX: 2592000 // 30 days
};

const parseCachedJson = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  return value;
};

const buildCategoryProductIndexKey = (platform, pincode, category) => {
  const normalizedPlatform = String(platform || '').trim();
  const normalizedPincode = String(pincode || '').trim();
  const normalizedCategory = encodeURIComponent(String(category || '').trim().toLowerCase());
  return `cat_products:${normalizedPlatform}:${normalizedPincode}:${normalizedCategory}`;
};

export const redisCache = {
  // ═══════════════════════════════════════════════════════════
  // BRAND CACHING
  // ═══════════════════════════════════════════════════════════
  async getBrand(brandId) {
    try {
      const cached = await redis.get(`brand:${brandId}`);
      return parseCachedJson(cached);
    } catch (err) {
      console.error(`[Redis] Error getting brand ${brandId}:`, err.message);
      return null;
    }
  },

  async setBrand(brandId, brandData) {
    try {
      await redis.setex(`brand:${brandId}`, CACHE_TTL.BRAND, JSON.stringify(brandData));
    } catch (err) {
      console.error(`[Redis] Error setting brand ${brandId}:`, err.message);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // SNAPSHOT CACHING (Latest snapshots per category/platform)
  // ═══════════════════════════════════════════════════════════
  async getLastSnapshot(platform, pincode, category, productId) {
    try {
      const key = `snapshot:${platform}:${pincode}:${category}:${productId}`;
      const cached = await redis.get(key);
      return parseCachedJson(cached);
    } catch (err) {
      console.error(`[Redis] Error getting snapshot:`, err.message);
      return null;
    }
  },

  async setLastSnapshot(platform, pincode, category, productId, snapshotData) {
    try {
      const key = `snapshot:${platform}:${pincode}:${category}:${productId}`;
      await redis.setex(key, CACHE_TTL.SNAPSHOT, JSON.stringify(snapshotData));
    } catch (err) {
      console.error(`[Redis] Error setting snapshot:`, err.message);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // CATEGORY LATEST DATE CACHING
  // ═══════════════════════════════════════════════════════════
  async getCategoryLatestDate(platform, pincode, category) {
    try {
      const key = `cat_date:${platform}:${pincode}:${category}`;
      const cached = await redis.get(key);
      return cached ? new Date(cached) : null;
    } catch (err) {
      console.error(`[Redis] Error getting category date:`, err.message);
      return null;
    }
  },

  async setCategoryLatestDate(platform, pincode, category, date) {
    try {
      const key = `cat_date:${platform}:${pincode}:${category}`;
      await redis.setex(key, CACHE_TTL.CATEGORY, date.toISOString());
    } catch (err) {
      console.error(`[Redis] Error setting category date:`, err.message);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // PRODUCT GROUPING PATTERN CACHE
  // ═══════════════════════════════════════════════════════════
  async getProductGroupPattern(category, baseProductId) {
    try {
      const key = `pattern:${category}:${baseProductId}`;
      const cached = await redis.get(key);
      return parseCachedJson(cached);
    } catch (err) {
      console.error(`[Redis] Error getting product pattern:`, err.message);
      return null;
    }
  },

  async setProductGroupPattern(category, baseProductId, patternData) {
    try {
      const key = `pattern:${category}:${baseProductId}`;
      await redis.setex(key, CACHE_TTL.PRODUCT_PATTERN, JSON.stringify(patternData));
    } catch (err) {
      console.error(`[Redis] Error setting product pattern:`, err.message);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // BATCH OPERATION TRACKING
  // ═══════════════════════════════════════════════════════════
  async trackBatchOperation(batchId, operation) {
    try {
      await redis.setex(`batch:${batchId}`, 300, JSON.stringify(operation));
    } catch (err) {
      console.error(`[Redis] Error tracking batch:`, err.message);
    }
  },

  async getBatchOperation(batchId) {
    try {
      const cached = await redis.get(`batch:${batchId}`);
      return parseCachedJson(cached);
    } catch (err) {
      console.error(`[Redis] Error getting batch:`, err.message);
      return null;
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY PRODUCT INDEX CACHE
  // Stores latest inserted snapshot date + productIds for platform/pincode/category
  // Used to compute the `new` field without re-querying DB on every ingestion.
  // ═══════════════════════════════════════════════════════════════════════════
  async getCategoryProductIndex(platform, pincode, category) {
    try {
      const key = buildCategoryProductIndexKey(platform, pincode, category);
      const cached = await productIndexRedis.get(key);
      const parsed = parseCachedJson(cached);

      if (!parsed) {
        return null;
      }

      return {
        scrapedAt: parsed.scrapedAt ? new Date(parsed.scrapedAt) : null,
        productIds: Array.isArray(parsed.productIds) ? parsed.productIds : [],
        count: Array.isArray(parsed.productIds) ? parsed.productIds.length : 0,
        updatedAt: parsed.updatedAt || null
      };
    } catch (err) {
      console.error(`[Redis] Error getting category product index:`, err.message);
      return null;
    }
  },

  async setCategoryProductIndex(platform, pincode, category, { scrapedAt, productIds = [] }) {
    try {
      const key = buildCategoryProductIndexKey(platform, pincode, category);
      const uniqueProductIds = [...new Set(
        productIds
          .map(id => String(id || '').trim())
          .filter(Boolean)
      )];

      const payload = {
        scrapedAt: new Date(scrapedAt).toISOString(),
        productIds: uniqueProductIds,
        updatedAt: new Date().toISOString()
      };

      await productIndexRedis.setex(key, CACHE_TTL.CATEGORY_PRODUCT_INDEX, JSON.stringify(payload));
    } catch (err) {
      console.error(`[Redis] Error setting category product index:`, err.message);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // CACHE INVALIDATION
  // ═══════════════════════════════════════════════════════════
  async invalidateCategory(platform, pincode, category) {
    try {
      const dateKey = `cat_date:${platform}:${pincode}:${category}`;
      const productIndexKey = buildCategoryProductIndexKey(platform, pincode, category);
      await redis.del(dateKey);
      await productIndexRedis.del(productIndexKey);
    } catch (err) {
      console.error(`[Redis] Error invalidating category:`, err.message);
    }
  },

  async invalidateSnapshots(platform, pincode, category) {
    try {
      // Since Redis doesn't have pattern deletion in free tier, we track keys
      const pattern = `snapshot:${platform}:${pincode}:${category}:*`;
      // In production, use Redis scan or keep a list of keys
    } catch (err) {
      console.error(`[Redis] Error invalidating snapshots:`, err.message);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════════════════════
  async healthCheck() {
    try {
      await Promise.all([
        redis.ping(),
        productIndexRedis.ping()
      ]);
      return true;
    } catch (err) {
      console.error(`[Redis] Health check failed:`, err.message);
      return false;
    }
  }
};

export default redisCache;
