/**
 * Instamart Response Format Transformer
 * Standardizes all Instamart scraper responses to a consistent format
 * Handles deduplication, field mapping, N/A values, and category enrichment
 */

import fs from 'fs';
import path from 'path';

// === CONSTANTS ===
const PLATFORM_NAME = 'Instamart';

/**
 * Standardize a single Instamart product
 * @param {Object} product - Raw product object from scraper
 * @param {string} categoryUrl - URL of the category being scraped
 * @param {string} categoryName - Name of the category (backup for officialCategory)
 * @param {string} subCategoryName - Name of subcategory (optional)
 * @param {string} pincode - Pincode
 * @param {number} rank - Rank in the list
 * @param {Object} categoryMapping - Enriched category mapping object (optional)
 */
export function transformInstamartProduct(product, categoryUrl, categoryName, subCategoryName, pincode, rank, categoryMapping = null) {
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
    const slugSuffix = (value) => safeString(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const parseDiscountPercentage = (value) => {
        if (value === null || value === undefined || value === '') {
            return 'N/A';
        }
        if (typeof value === 'number') {
            return String(value);
        }

        const raw = String(value).trim();
        const match = raw.match(/(\d+(?:\.\d+)?)\s*%/);
        if (match) {
            return match[1];
        }
        if (/^\d+(?:\.\d+)?$/.test(raw)) {
            return raw;
        }
        return raw || 'N/A';
    };
    const toOutOfStock = (value) => {
        if (typeof value === 'boolean') {
            return value;
        }

        const normalized = safeString(value).toLowerCase();
        if (normalized === 'unavailable' || normalized === 'out_of_stock' || normalized === 'sold_out') {
            return true;
        }
        if (normalized === 'available' || normalized === 'in_stock' || normalized === 'instock') {
            return false;
        }
        return false;
    };

    const variantValue = safeString(
        product.variant ||
        product.weight ||
        product.productWeight ||
        product.quantity ||
        'N/A'
    );
    const subCategorySlug = slugSuffix(officialSubCategory);
    const variantSlug = variantValue !== 'N/A' ? slugSuffix(variantValue) : '';

    const subCatSuffix = (officialSubCategory && officialSubCategory !== 'N/A' && subCategorySlug)
        ? '__' + subCategorySlug
        : '';
    const variantSuffix = variantSlug ? `__${variantSlug}` : '';

    const currentPrice = safeString(product.currentPrice ?? product.price ?? 'N/A');
    const originalPrice = safeString(product.originalPrice ?? product.mrp ?? 'N/A');
    const productUrl = safeString(product.productUrl || 'N/A');
    const rating = safeString(product.rating ?? 'N/A');
    const isAd = Boolean(product.isAd || product.isSponsored || product.adTrackingContext);
    const discountPercentage = parseDiscountPercentage(product.discountPercentage ?? product.discount ?? 'N/A');

    return {
        category: masterCategory,
        categoryUrl: safeString(categoryUrl),
        officialCategory: officialCategory,
        officialSubCategory: officialSubCategory,
        pincode: safeString(pincode),
        platform: PLATFORM_NAME,
        scrapedAt: product.scrapedAt || scrapedAt,
        productId: safeString(product.productId) + subCatSuffix + variantSuffix,
        skuId: safeString(product.skuId || 'N/A'),
        brand: safeString(product.brand || product.brandName || 'N/A'),
        productName: safeString(product.productName),
        productImage: safeString(product.productImage),
        variant: variantValue,
        productWeight: variantValue,
        quantity: variantValue,
        combo: safeString(product.combo || 'N/A'),
        deliveryTime: safeString(product.deliveryTime),
        isAd: isAd,
        server: safeString(product.server || 'N/A'),
        rating: rating,
        currentPrice: currentPrice,
        originalPrice: originalPrice,
        discountPercentage: discountPercentage,
        ranking: rank,
        isOutOfStock: toOutOfStock(product.isOutOfStock ?? product.availability),
        productUrl: productUrl
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
