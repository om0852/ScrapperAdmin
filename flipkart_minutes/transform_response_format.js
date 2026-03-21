/**
 * Flipkart Minutes Response Format Transformer
 * Standardizes all Flipkart scraper responses to a consistent format
 * Handles deduplication, field mapping, N/A values, and category enrichment
 */

import fs from 'fs';
import path from 'path';

// === CONSTANTS ===
const PLATFORM_NAME = 'FlipkartMinutes';

/**
 * Standardize a single Flipkart product
 * @param {Object} product - Raw product object from scraper
 * @param {string} categoryUrl - URL of the category being scraped
 * @param {string} categoryName - Name of the category (backup for officialCategory)
 * @param {string} subCategoryName - Name of subcategory (optional)
 * @param {string} pincode - Pincode
 * @param {number} rank - Rank in the list
 * @param {Object} categoryMapping - Enriched category mapping object (optional)
 */
export function transformFlipkartProduct(product, categoryUrl, categoryName, subCategoryName, pincode, rank, categoryMapping = null) {
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

    // Reject products with a numeric-only name — these are data quality issues where
    // a discount % or price was mistakenly scraped as the product title.
    const rawName = String(product.productName || '').trim();
    if (!rawName || /^\d+$/.test(rawName)) {
        return null;
    }

    const subCatSuffix = (officialSubCategory && officialSubCategory !== 'N/A')
        ? '__' + officialSubCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        : '';

    return {
        category: masterCategory,
        categoryUrl: safeString(categoryUrl),
        officialCategory: officialCategory,
        officialSubCategory: officialSubCategory,
        pincode: safeString(pincode),
        platform: PLATFORM_NAME,
        scrapedAt: product.scrapedAt || scrapedAt,
        productId: safeString(product.productId) + subCatSuffix,
        skuId: safeString(product.skuId || 'N/A'),
        brand: safeString(product.brand || 'N/A'),
        productName: safeString(product.productName),
        productImage: safeString(product.productImage ? product.productImage.replace(/{@width}/g, '400').replace(/{@height}/g, '400') : ''),
        productWeight: safeString(product.productWeight || product.quantity || 'N/A'),
        quantity: safeString(product.quantity || 'N/A'),
        combo: safeString(product.combo || 'N/A'),
        deliveryTime: safeString(product.deliveryTime),
        isAd: !!product.isAd,
        rating: safeString(product.rating),
        currentPrice: safeString(product.currentPrice),
        originalPrice: safeString(product.originalPrice),
        discountPercentage: safeString(product.discountPercentage),
        ranking: rank,
        inStock: product.inStock !== undefined ? !!product.inStock : true,
        productUrl: safeString(product.productUrl)
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
        const id = p.productId || p.productName;
        const categoryUrl = p.categoryUrl || 'unknown_category';

        // Create composite key to allow same product in different categories/URLs
        const uniqueKey = `${id}|${categoryUrl}`;

        if (id && !seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            unique.push(p);
        }
    });

    return unique;
}
