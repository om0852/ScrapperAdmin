/**
 * DMart Response Format Transformer
 * Standardizes all DMart scraper responses to a consistent format
 * Handles deduplication, field mapping, N/A values, and category enrichment
 */

import fs from 'fs';
import path from 'path';

// === CONSTANTS ===
const PLATFORM_NAME = 'DMart';

/**
 * Standardize a single DMart product
 * @param {Object} product - Raw product object from scraper
 * @param {string} categoryUrl - URL of the category being scraped
 * @param {string} categoryName - Name of the category (backup for officialCategory)
 * @param {string} subCategoryName - Name of subcategory (optional)
 * @param {string} pincode - Pincode
 * @param {number} rank - Rank in the list
 * @param {Object} categoryMapping - Enriched category mapping object (optional)
 */
export function transformDMartProduct(product, categoryUrl, categoryName, subCategoryName, pincode, rank, categoryMapping = null) {
    const scrapedAt = new Date().toISOString();

    // Determine Categories
    let masterCategory = 'N/A';
    let officialCategory = 'N/A';
    let officialSubCategory = 'N/A';

    if (categoryMapping && categoryMapping.categoryMappingFound) {
        masterCategory = categoryMapping.masterCategory || 'N/A';
        officialCategory = categoryMapping.officialCategory || 'N/A';
        officialSubCategory = categoryMapping.officialSubCategory || 'N/A';
    } else {
        // Fallback
        officialCategory = categoryName || 'N/A';
        officialSubCategory = subCategoryName || 'N/A';
    }

    // Safely handle values
    const safeString = (val) => (val !== null && val !== undefined && val !== '') ? String(val) : 'N/A';
    const cleanPrice = (val) => {
        if (!val) return 'N/A';
        return String(val).replace(/[^\d.]/g, ''); // aggressive cleanup
    }

    return {
        category: masterCategory,
        categoryUrl: safeString(categoryUrl),
        officialCategory: officialCategory,
        officialSubCategory: officialSubCategory,
        pincode: safeString(pincode),
        platform: PLATFORM_NAME,
        scrapedAt: product.scrapedAt || scrapedAt,
        productId: safeString(product.id || product.productId), // DMart raw has 'id'
        skuId: safeString(product.sku || product.skuId || 'N/A'),
        brand: safeString(product.brand || 'N/A'),
        productName: safeString(product.name || product.productName),
        productImage: safeString(product.image || product.productImage),
        productWeight: safeString(product.weight || product.packSize || product.quantity || 'N/A'),
        quantity: safeString(product.quantity || product.packSize || 'N/A'),
        combo: safeString(product.combo || 'N/A'),
        deliveryTime: safeString(product.deliveryTime || 'N/A'),
        isAd: !!product.isAd,
        rating: safeString(product.rating || 'N/A'),
        currentPrice: cleanPrice(product.price || product.sellingPrice),
        originalPrice: cleanPrice(product.originalPrice || product.mrp),
        discountPercentage: safeString(product.discount || product.discountPercentage),
        ranking: rank,
        isOutOfStock: !!product.isOutOfStock,
        productUrl: safeString(product.url || product.productUrl)
    };
}

/**
 * Deduplicate raw products based on productId
 * PRIOR to ranking assignment
 */
export function deduplicateRawProducts(products) {
    if (!Array.isArray(products)) return [];

    const seen = new Set();
    const unique = [];

    products.forEach(p => {
        if (!p) return;
        const id = p.id || p.productId || p.productName; // Use id if available
        if (id && !seen.has(id)) {
            seen.add(id);
            unique.push(p);
        }
    });

    return unique;
}
