import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ═══════════════════════════════════════════════════════════════
 * CATEGORY MAPPING UTILITY
 * Extracts and maps categories from URLs and product metadata
 * ═══════════════════════════════════════════════════════════════
 */

let CATEGORY_CACHE = null;

/**
 * Master category mapping for categoryName → masterCategory
 * Used when URL matching is not available
 */
const CATEGORY_NAME_MAPPING = {
  'Chocolates': 'Sweet Cravings',
  'Dark Chocolates': 'Sweet Cravings',
  'Biscuits': 'Bakery & Biscuits',
  'Cookies': 'Bakery & Biscuits',
  'Cakes': 'Bakery & Biscuits',
  'Wafers': 'Bakery & Biscuits',
  'Snacks': 'Breakfast & Sauces',
  'Cereal': 'Breakfast & Sauces',
  'Muesli': 'Breakfast & Sauces',
  'Pasta': 'Packaged Food',
  'Noodles': 'Packaged Food',
  'Instant Food': 'Packaged Food',
  'Soups': 'Packaged Food',
  'Sauces': 'Packaged Food',
  'Condiments': 'Packaged Food',
  'Tea': 'Tea, Coffee & More',
  'Coffee': 'Tea, Coffee & More',
  'Beverages': 'Cold Drinks & Juices',
  'Energy Drinks': 'Cold Drinks & Juices',
  'Juice': 'Cold Drinks & Juices',
  'Water': 'Cold Drinks & Juices',
  'Ice Cream': 'Ice Creams & More',
  'Frozen Desserts': 'Ice Creams & More',
  'Honey': 'Health & Wellness',
  'Protein': 'Health & Wellness',
  'Vitamins': 'Health & Wellness',
  'Supplements': 'Health & Wellness',
  'Fresh Vegetables': 'Fruits & Vegetables',
  'Fresh Fruits': 'Fruits & Vegetables',
  'Dairy': 'Dairy, Bread & Eggs',
  'Milk': 'Dairy, Bread & Eggs',
  'Bread': 'Dairy, Bread & Eggs',
  'Eggs': 'Dairy, Bread & Eggs',
  'Rice': 'Atta, Rice, Oil & Dals',
  'Atta': 'Atta, Rice, Oil & Dals',
  'Dal': 'Atta, Rice, Oil & Dals',
  'Oil': 'Atta, Rice, Oil & Dals',
  'Dals': 'Atta, Rice, Oil & Dals'
};

/**
 * Load category mappings from JSON file
 */
function loadCategoryMappings() {
  if (CATEGORY_CACHE) return CATEGORY_CACHE;

  const mappingFile = path.join(__dirname, '..', 'categories_with_urls.json');
  
  try {
    const data = fs.readFileSync(mappingFile, 'utf8');
    const mappings = JSON.parse(data);
    CATEGORY_CACHE = mappings;
    return mappings;
  } catch (err) {
    console.error('❌ Failed to load category mappings:', err.message);
    return {};
  }
}

/**
 * Extract category from URL by comparing with mappings
 */
/**
 * Normalize URL for comparison (handles encoding differences)
 * Preserves domain and path but handles space/special char encoding variations
 */
function normalizeUrlForComparison(url) {
  if (!url) return '';
  // Decode then re-encode consistently to handle %20 vs + vs space differences
  try {
    // Decode any existing encoding
    let decoded = decodeURIComponent(url);
    // Re-encode to standard format (space as %20)
    return encodeURI(decoded).toLowerCase().trim();
  } catch {
    // If decoding fails, just use as-is
    return url.toLowerCase().trim();
  }
}

function extractCategoryFromUrl(categoryUrl, platform = 'Instamart') {
  if (!categoryUrl || categoryUrl === 'N/A') {
    return {
      category: 'Unknown',
      officialCategory: 'Unknown',
      officialSubCategory: 'Unknown',
      masterCategory: 'Unknown'
    };
  }

  const mappings = loadCategoryMappings();
  
  // 🔧 FIX: Case-insensitive platform lookup
  const platformKey = Object.keys(mappings).find(
    key => key.toLowerCase() === (platform || '').toLowerCase()
  );
  
  if (!platformKey) {
    console.warn(`⚠️  Platform "${platform}" not found in category mappings`);
    return {
      category: 'Unknown',
      officialCategory: 'Unknown',
      officialSubCategory: 'Unknown',
      masterCategory: 'Unknown'
    };
  }
  
  const platformMappings = mappings[platformKey] || [];
  const normalizedInput = normalizeUrlForComparison(categoryUrl);

  // ✅ STEP 1: TRY EXACT URL MATCH FIRST (with normalization for encoding)
  const exactMatch = platformMappings.find(m => {
    const dbUrl = (m.url || '').toLowerCase().trim();
    // Try both normalized and direct comparison
    const directMatch = dbUrl === categoryUrl.toLowerCase().trim();
    const normalizedMatch = normalizeUrlForComparison(m.url) === normalizedInput;
    return directMatch || normalizedMatch;
  });

  if (exactMatch) {
    return {
      category: exactMatch.masterCategory || 'Unknown',
      officialCategory: exactMatch.officalCategory || exactMatch.officialCategory || 'Unknown',
      officialSubCategory: exactMatch.officalSubCategory || exactMatch.officialSubCategory || 'Unknown',
      masterCategory: exactMatch.masterCategory || 'Unknown'
    };
  }

  console.warn(`⚠️  No URL match found for: ${categoryUrl.substring(0, 80)}...`);
  
  // No match: return Unknowns
  return {
    category: 'Unknown',
    officialCategory: 'Unknown',
    officialSubCategory: 'Unknown',
    masterCategory: 'Unknown'
  };
}

/**
 * Map product category based on URL and fallback logic
 */
function mapProductCategory(product, platform = 'Instamart') {
  const categoryUrl = product.categoryUrl || product.category_url || 'N/A';
  const currentCategory = product.category || 'Unknown';
  const currentOfficialCategory = product.officialCategory || product.officalCategory || 'Unknown';
  const currentOfficialSubCategory = product.officialSubCategory || product.officalSubCategory || 'Unknown';

  // If categoryUrl is available, use it to extract proper mappings
  if (categoryUrl && categoryUrl !== 'N/A') {
    const extracted = extractCategoryFromUrl(categoryUrl, platform);
    
    // Only override if we have valid extracted data
    if (extracted.category !== 'Unknown') {
      return {
        category: extracted.category,
        officialCategory: extracted.officialCategory,
        officialSubCategory: extracted.officialSubCategory,
        masterCategory: extracted.masterCategory
      };
    }
  }

  // Fall back to product's existing categories if extraction failed
  return {
    category: currentCategory,
    officialCategory: currentOfficialCategory,
    officialSubCategory: currentOfficialSubCategory,
    masterCategory: currentCategory
  };
}

/**
 * Batch map products - useful during manual insertion
 */
function batchMapProductCategories(products, platform = 'Instamart') {
  return products.map(product => {
    const mapping = mapProductCategory(product, platform);
    return {
      ...product,
      category: mapping.category,
      officialCategory: mapping.officialCategory,
      officialSubCategory: mapping.officialSubCategory
    };
  });
}

/**
 * Get all available categories for a platform
 */
function getAvailableCategoriesForPlatform(platform = 'Instamart') {
  const mappings = loadCategoryMappings();
  const platformMappings = mappings[platform] || [];
  
  const categories = new Set();
  platformMappings.forEach(m => {
    if (m.masterCategory) categories.add(m.masterCategory);
  });
  
  return Array.from(categories);
}

/**
 * Validate category data for a product
 */
function validateProductCategories(product) {
  const issues = [];
  
  if (!product.category || product.category === 'Unknown' || product.category === 'N/A') {
    issues.push('Missing category');
  }
  
  if (!product.officialCategory || product.officialCategory === 'N/A') {
    issues.push('Missing officialCategory');
  }
  
  if (!product.officialSubCategory || product.officialSubCategory === 'N/A') {
    issues.push('Missing officialSubCategory');
  }
  
  return {
    isValid: issues.length === 0,
    issues: issues
  };
}

export const categoryMapper = {
  loadCategoryMappings,
  extractCategoryFromUrl,
  mapProductCategory,
  batchMapProductCategories,
  getAvailableCategoriesForPlatform,
  validateProductCategories,
  clearCache: () => { CATEGORY_CACHE = null; }
};

export default categoryMapper;
