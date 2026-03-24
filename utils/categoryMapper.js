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
  const platformMappings = mappings[platform] || [];

  // Normalize URL for comparison (remove query params variations)
  const normalizedUrl = categoryUrl.split('?')[0];

  // Try exact match first
  let match = platformMappings.find(m => {
    if (!m.url) return false;
    const mappingUrlBase = m.url.split('?')[0];
    return mappingUrlBase === normalizedUrl;
  });

  // Try matching base URL + query params intelligently
  if (!match) {
    match = platformMappings.find(m => {
      if (!m.url) return false;
      
      // Extract key parts from both URLs
      const urlParams = new URLSearchParams(categoryUrl.split('?')[1] || '');
      const mappingParams = new URLSearchParams(m.url.split('?')[1] || '');
      
      // Match on categoryName at minimum
      const urlCategoryName = urlParams.get('categoryName');
      const mappingCategoryName = mappingParams.get('categoryName');
      
      if (urlCategoryName && mappingCategoryName && urlCategoryName === mappingCategoryName) {
        // Additional check: if there's a filterName, try to match it
        const urlFilterName = urlParams.get('filterName');
        const mappingFilterName = mappingParams.get('filterName');
        
        if (urlFilterName && mappingFilterName) {
          return urlFilterName === mappingFilterName;
        }
        
        // If no filterName in URL, any entry with same categoryName works
        return !mappingFilterName;
      }
      
      return false;
    });
  }

  if (match) {
    return {
      category: match.masterCategory || 'Unknown',
      officialCategory: match.officalCategory || match.officialCategory || 'Unknown',
      officialSubCategory: match.officalSubCategory || match.officialSubCategory || 'Unknown',
      masterCategory: match.masterCategory || 'Unknown'
    };
  }

  // Fallback: try to extract from categoryName parameter
  try {
    const urlParams = new URLSearchParams(categoryUrl.split('?')[1] || '');
    const categoryName = urlParams.get('categoryName');
    
    if (categoryName) {
      return {
        category: decodeURIComponent(categoryName),
        officialCategory: decodeURIComponent(categoryName),
        officialSubCategory: 'Unknown',
        masterCategory: decodeURIComponent(categoryName)
      };
    }
  } catch (e) {
    console.warn('⚠️ Failed to extract category from URL params:', categoryUrl);
  }

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
