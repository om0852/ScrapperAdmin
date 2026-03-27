import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ═══════════════════════════════════════════════════════════════
 * MANUAL INSERTION UTILITY
 * Ensures all manually inserted products have correct:
 * - category (from folder name)
 * - officialCategory & officialSubCategory (from categoryUrl + categories_with_urls.json)
 * - productId (base_id__subcategory-slug)
 * ═══════════════════════════════════════════════════════════════
 */

let categoriesCache = null;

/**
 * Load categories mapping from categories_with_urls.json
 */
function loadCategoriesMapping() {
  if (categoriesCache) return categoriesCache;
  
  const categoriesPath = path.join(__dirname, '../categories_with_urls.json');
  const rawData = fs.readFileSync(categoriesPath, 'utf-8');
  categoriesCache = JSON.parse(rawData);
  return categoriesCache;
}

/**
 * Extract masterCategory from folder name
 * "Tea_ Coffee _ More" → "Tea, Coffee & More"
 * "Fruits_Vegetables" → "Fruits & Vegetables"
 */
export function extractCategoryFromFolder(folderPath) {
  // Get the last folder name
  const folderName = path.basename(folderPath);
  
  // Handle specific patterns
  // "Tea_ Coffee _ More" → "Tea, Coffee & More"
  if (folderName === 'Tea_ Coffee _ More' || folderName === 'Tea_Coffee_More') {
    return 'Tea, Coffee & More';
  }
  
  // For other folder names with underscores (single underscore)
  // "Fruits_Vegetables" → "Fruits & Vegetables"
  if (folderName.includes('_') && !folderName.includes('_ ')) {
    const parts = folderName.split('_');
    return parts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' & ');
  }
  
  // Fallback: just title case and replace underscores with spaces
  return folderName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Extract URL slug based on platform type
 * Different platforms use different URL structures
 */
function extractSlugFromUrl(urlString, platform) {
  if (!urlString) return null;
  
  const platformLower = (platform || '').toLowerCase();
  
  // Instamart: /sc/[slug] or /l/[slug]
  if (platformLower.includes('instamart')) {
    const match = urlString.match(/\/(sc|l)\/([^\/\?&]+)/);
    return match ? match[2].toLowerCase() : null;
  }
  
  // JioMart: /c/[L1]/[L2]/[slug]/[id]
  if (platformLower.includes('jio')) {
    const match = urlString.match(/\/c\/[^\/]+\/[^\/]+\/([^\/]+)/);
    return match ? match[1].toLowerCase() : null;
  }
  
  // Flipkart: pl_[id] or other patterns
  if (platformLower.includes('flipkart')) {
    // Try to extract from path
    const pathMatch = urlString.match(/\/([^\/\?]+)(?:\?|$)/);
    return pathMatch ? pathMatch[1].toLowerCase() : null;
  }
  
  // Zepto: Try to extract from query params or path
  if (platformLower.includes('zepto')) {
    // Extract from path like /cn/category-name/...
    const match = urlString.match(/\/cn\/([^\/]+)/);
    return match ? match[1].toLowerCase() : null;
  }
  
  return null;
}

/**
 * Find category mapping from categoryUrl
 * PRIORITY: 1. Exact URL match 2. Slug match (platform-aware) 3. No match
 * Returns { officialCategory, officialSubCategory, masterCategory }
 */
export function mapCategoryFromUrl(categoryUrl, platform = 'Instamart') {
  if (!categoryUrl) return null;
  
  const categories = loadCategoriesMapping();
  
  // 🔧 FIX #1: Get platform key with case-insensitive lookup
  const platformKey = Object.keys(categories).find(
    key => key.toLowerCase() === (platform || '').toLowerCase()
  );
  
  if (!platformKey) {
    console.warn(`⚠️  Platform "${platform}" not found in categories mapping`);
    return null;
  }
  
  const platformMappings = categories[platformKey] || [];
  
  // ✅ STEP 1: Try exact URL match FIRST (most reliable)
  const exactMatch = platformMappings.find(m => {
    const dbUrl = (m.url || '').toLowerCase().trim();
    const inputUrl = (categoryUrl || '').toLowerCase().trim();
    return dbUrl === inputUrl;
  });
  
  if (exactMatch) {
    return {
      officialCategory: exactMatch.officialCategory || exactMatch.officalCategory,
      officialSubCategory: exactMatch.officialSubCategory || exactMatch.officalSubCategory,
      masterCategory: exactMatch.masterCategory
    };
  }
  
  // ✅ STEP 2: Try slug-based matching (platform-aware)
  const slug = extractSlugFromUrl(categoryUrl, platform);
  
  if (slug) {
    const slugMatches = platformMappings.filter(m => {
      const dbSlug = extractSlugFromUrl(m.url, platform);
      return dbSlug === slug;
    });
    
    if (slugMatches.length > 0) {
      // If multiple slug matches, prefer exact URL match again or return first
      const mapping = slugMatches[0];
      return {
        officialCategory: mapping.officialCategory || mapping.officalCategory,
        officialSubCategory: mapping.officialSubCategory || mapping.officalSubCategory,
        masterCategory: mapping.masterCategory
      };
    }
  }
  
  // No match found
  return null;
}

/**
 * Generate productId suffix from officialSubCategory
 * "Hot beverages" → "__hot-beverages"
 * "Fresh Vegetables" → "__fresh-vegetables"
 */
export function generateProductIdSuffix(officialSubCategory) {
  if (!officialSubCategory) return '';
  
  return '__' + officialSubCategory
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/&/g, 'and')
    .replace(/[^\w-]/g, '');
}

/**
 * Enhance product with correct category mappings for manual insertion
 * Updates: category, officialCategory, officialSubCategory, productId
 */
export function enhanceProductForManualInsertion(product, folderPath, platform = 'Instamart') {
  const enhanced = { ...product };
  
  // 1. Extract category from folder name (as fallback)
  const folderCategory = extractCategoryFromFolder(folderPath);
  enhanced.category = folderCategory;
  
  // 2. Map from categoryUrl if available
  if (product.categoryUrl) {
    const urlMapping = mapCategoryFromUrl(product.categoryUrl, platform);
    if (urlMapping) {
      // Map category from masterCategory (the broad grouping)
      if (urlMapping.masterCategory) {
        enhanced.category = urlMapping.masterCategory;
      }
      // Map official categories
      enhanced.officialCategory = urlMapping.officialCategory;
      enhanced.officialSubCategory = urlMapping.officialSubCategory;
    }
  }
  
  // 3. Fix productId with correct suffix from officialSubCategory
  if (enhanced.productId && enhanced.officialSubCategory) {
    const productBase = enhanced.productId.includes('__') 
      ? enhanced.productId.split('__')[0] 
      : enhanced.productId;
    const suffix = generateProductIdSuffix(enhanced.officialSubCategory);
    enhanced.productId = productBase + suffix;
  }
  
  return enhanced;
}

/**
 * Batch enhance products for manual insertion
 * Use alongside dataControllerOptimized
 */
export function enhanceProductsBatchForManualInsertion(products, folderPath, platform = 'Instamart') {
  return products.map(product => enhanceProductForManualInsertion(product, folderPath, platform));
}

export default {
  extractCategoryFromFolder,
  mapCategoryFromUrl,
  generateProductIdSuffix,
  enhanceProductForManualInsertion,
  enhanceProductsBatchForManualInsertion
};
