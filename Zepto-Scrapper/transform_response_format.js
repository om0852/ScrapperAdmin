/**
 * Zepto Response Format Transformer
 * Standardizes all Zepto scraper responses to a consistent format
 * Handles deduplication, field mapping, N/A values, and category enrichment
 */
import fs from 'fs';
import path from 'path';
import { enrichProductWithCategoryMapping, loadCategoryMappings } from '../enrich_categories.js';

// === CONSTANTS ===
const PLATFORM_NAME = 'Zepto';

/**
 * Standardize a single Zepto product
 * @param {Object} product - Raw product object from scraper
 * @param {string} categoryUrl - URL of the category being scraped
 * @param {string} categoryName - Name of the category (backup for officialCategory)
 * @param {string} subCategoryName - Name of subcategory (optional)
 * @param {string} pincode - Pincode
 * @param {number} rank - Rank in the list
 * @param {Object} categoryMapping - Enriched category mapping object (optional)
 */
export function transformZeptoProduct(product, categoryUrl, categoryName, subCategoryName, pincode, rank, categoryMapping = null) {
    const scrapedAt = new Date().toISOString();

    // Determine Categories
    // If enriched mapping is provided, use it. Otherwise fallback to arguments.
    let masterCategory = 'N/A';
    let officialCategory = 'N/A';
    let officialSubCategory = 'N/A';

    if (categoryMapping && categoryMapping.categoryMappingFound) {
        masterCategory = categoryMapping.masterCategory || 'N/A';
        officialCategory = categoryMapping.officialCategory || 'N/A';
        officialSubCategory = categoryMapping.officialSubCategory || 'N/A';
        // If the mapping has a specific URL, usually we keep the input categoryUrl or use mapping.fullUrl
        // We will keep the input categoryUrl as it's what was scraped.
    } else {
        // Fallback or legacy behavior
        officialCategory = categoryName || 'N/A';
        officialSubCategory = subCategoryName || 'N/A';
    }

    // Ensure numeric values are properly formatted strings or numbers as per requirement
    // Requirement says: "currentPrice", "originalPrice" etc.
    // Based on previous Blinkit example, typically strings or numbers.
    // The user's list just has names. I will follow the Blinkit `transform_response_format.js` output which produced strings for prices/rankings or preserved types.
    // Checking Blinkit output: ranking is number, prices are strings.

    const safeString = (val) => (val !== null && val !== undefined && val !== '') ? String(val) : 'N/A';
    const normalizeCount = (val, fallback = 1) => {
        const parsed = Number.parseInt(String(val ?? '').trim(), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    const slugifySuffixPart = (val) => String(val || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const subCatSuffix = (officialSubCategory && officialSubCategory !== 'N/A')
        ? '__' + officialSubCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        : '';
    const quantitySuffix = slugifySuffixPart(product.quantity || '');
    const baseIdentity = safeString(product.baseProductId || product.productId || product.skuId || product.productSlug);
    const variantIdentity = safeString(product.skuId || product.productId || product.productSlug);
    const transformedProductId = product.isVariant === true
        ? `${variantIdentity}${subCatSuffix}${quantitySuffix ? `__${quantitySuffix}` : ''}`
        : `${baseIdentity}${subCatSuffix}`;

    const comboOf = Array.isArray(product.comboOf)
        ? product.comboOf
            .map((entry) => {
                const rawId = safeString(entry?.productId || entry);
                if (rawId === 'N/A') {
                    return 'N/A';
                }
                const entryQuantitySuffix = slugifySuffixPart(entry?.quantity || '');
                return `${rawId}${subCatSuffix}${entryQuantitySuffix ? `__${entryQuantitySuffix}` : ''}`;
            })
            .filter((entry) => entry !== 'N/A')
        : [];

    const transformed = {
        category: masterCategory,
        categoryUrl: safeString(categoryUrl),
        officialCategory: officialCategory,
        officialSubCategory: officialSubCategory,
        pincode: safeString(pincode),
        platform: PLATFORM_NAME,
        scrapedAt: product.scrapedAt || scrapedAt,
        comboGroupId: safeString(product.baseProductId || product.productId || product.skuId || product.productSlug),
        productId: transformedProductId,
        skuId: safeString(product.skuId || product.productSlug || 'N/A'),
        brand: safeString(product.brand || 'N/A'),
        productName: safeString(product.productName),
        productImage: safeString(product.productImage),
        productWeight: safeString(product.quantity || 'N/A'),
        quantity: safeString(product.quantity || 'N/A'),
        combo: normalizeCount(product.combo, comboOf.length + 1),
        deliveryTime: safeString(product.deliveryTime),
        isAd: !!product.isAd,
        isVariant: product.isVariant === true,
        rating: safeString(product.rating),
        currentPrice: safeString(product.currentPrice),
        originalPrice: safeString(product.originalPrice),
        discountPercentage: safeString(product.discountPercentage),
        ranking: rank,
        isOutOfStock: !!product.isOutOfStock,
        productUrl: safeString(product.productUrl)
    };

    if (!transformed.isVariant) {
        transformed.comboOf = comboOf;
    }

    return transformed;
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
        // Use productId if available, else fallback to name or skip
        const id = p.productId || p.productName;
        if (id && !seen.has(id)) {
            seen.add(id);
            unique.push(p);
        }
    });

    return unique;
}
