/**
 * Flipkart Minutes Response Format Transformer
 * Standardizes all Flipkart scraper responses to a consistent format
 * Handles deduplication, field mapping, N/A values, and category enrichment
 */

import fs from 'fs';
import path from 'path';

// === CONSTANTS ===
const PLATFORM_NAME = 'FlipkartMinutes';

function isUsefulValue(value) {
    return value !== null && value !== undefined && value !== '' && value !== 'N/A';
}

function slugifySuffixPart(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function buildSubCategorySuffix(officialSubCategory) {
    const slug = slugifySuffixPart(officialSubCategory);
    return slug ? `__${slug}` : '';
}

function buildWeightSuffix(productWeight) {
    const slug = slugifySuffixPart(productWeight);
    return slug ? `__${slug}` : '';
}

function normalizeComboCount(value, fallback = 0) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function extractCanonicalProductId(product) {
    const productUrl = String(product?.productUrl || '').trim();
    if (productUrl) {
        try {
            const parsed = new URL(productUrl);
            const pid = parsed.searchParams.get('pid');
            if (pid) {
                return pid.trim().toUpperCase();
            }
        } catch (_) {
            const match = productUrl.match(/[?&]pid=([A-Z0-9]+)/i);
            if (match?.[1]) {
                return match[1].trim().toUpperCase();
            }
        }
    }

    const rawProductId = String(product?.productId || '').trim();
    if (rawProductId) {
        return rawProductId.toUpperCase();
    }

    const skuId = String(product?.skuId || '').trim();
    if (skuId.startsWith('LST') && skuId.length > 3) {
        return skuId.slice(3).toUpperCase();
    }

    return '';
}

function buildDeduplicationKey(product) {
    const canonicalId = extractCanonicalProductId(product);
    const categoryUrl = String(product?.categoryUrl || 'unknown_category').trim();
    const productName = String(product?.productName || '').trim().toLowerCase();
    const productUrl = String(product?.productUrl || '').trim().toLowerCase();
    const variantWeightKey = product?.isVariant
        ? slugifySuffixPart(product?.productWeight || product?.quantity || '')
        : '';

    if (canonicalId) {
        return variantWeightKey ? `${canonicalId}|${variantWeightKey}` : canonicalId;
    }

    return productUrl || `${productName}|${categoryUrl}`;
}

function scoreProductQuality(product) {
    let score = 0;

    if (isUsefulValue(product?.skuId)) score += 4;
    if (isUsefulValue(product?.productImage)) score += 3;
    if (isUsefulValue(product?.productUrl)) score += 3;
    if (isUsefulValue(product?.brand)) score += 2;
    if (isUsefulValue(product?.currentPrice)) score += 2;
    if (isUsefulValue(product?.originalPrice)) score += 1;
    if (isUsefulValue(product?.discountPercentage) && String(product.discountPercentage) !== '0') score += 1;
    if (product?.isAd === true) score += 1;
    if (product?.inStock === true) score += 1;

    return score;
}

function mergeDuplicateProducts(existing, incoming) {
    const merged = scoreProductQuality(incoming) > scoreProductQuality(existing)
        ? { ...incoming, ranking: existing.ranking }
        : { ...existing };

    const fallback = merged === existing ? incoming : existing;
    const fieldsToMerge = [
        'productId',
        'skuId',
        'brand',
        'productName',
        'productImage',
        'productWeight',
        'quantity',
        'combo',
        'comboOf',
        'comboOfRefs',
        'deliveryTime',
        'rating',
        'currentPrice',
        'originalPrice',
        'discountPercentage',
        'productUrl',
        'parentProductId',
        'isVariant',
        'officialCategory',
        'officialSubCategory',
        'category',
        'categoryUrl'
    ];

    fieldsToMerge.forEach((field) => {
        if (!isUsefulValue(merged[field]) && isUsefulValue(fallback[field])) {
            merged[field] = fallback[field];
        }
    });

    merged.isAd = Boolean(existing?.isAd || incoming?.isAd);
    merged.inStock = Boolean(existing?.inStock || incoming?.inStock);
    merged.isVariant = existing?.isVariant === false || incoming?.isVariant === false
        ? false
        : Boolean(existing?.isVariant || incoming?.isVariant);
    merged.combo = Math.max(normalizeComboCount(existing?.combo), normalizeComboCount(incoming?.combo), 1);

    const mergeUniqueEntries = (left, right, keyBuilder) => {
        const combined = [];
        const seen = new Set();

        for (const source of [left, right]) {
            if (!Array.isArray(source)) continue;
            source.forEach((entry) => {
                if (!entry) return;
                const key = keyBuilder(entry);
                if (!key || seen.has(key)) return;
                seen.add(key);
                combined.push(entry);
            });
        }

        return combined;
    };

    merged.comboOf = mergeUniqueEntries(existing?.comboOf, incoming?.comboOf, (entry) => String(entry));
    merged.comboOfRefs = mergeUniqueEntries(
        existing?.comboOfRefs,
        incoming?.comboOfRefs,
        (entry) => `${entry?.productId || ''}|${entry?.productWeight || ''}`
    );

    return merged;
}

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

    const canonicalProductId = extractCanonicalProductId(product) || safeString(product.productId);
    const subCatSuffix = buildSubCategorySuffix(officialSubCategory);
    const variantWeight = safeString(product.productWeight || product.quantity || 'N/A');
    const isVariant = !!product.isVariant;
    const variantWeightSuffix = isVariant ? buildWeightSuffix(variantWeight) : '';
    const transformedProductId = safeString(canonicalProductId) + subCatSuffix + variantWeightSuffix;
    const comboOfRefs = Array.isArray(product.comboOfRefs) ? product.comboOfRefs : [];
    const comboOf = comboOfRefs
        .map((entry) => {
            const rawVariantId = extractCanonicalProductId(entry) || safeString(entry?.productId || '');
            if (!rawVariantId || rawVariantId === 'N/A') {
                return '';
            }

            return safeString(rawVariantId) + subCatSuffix + buildWeightSuffix(entry?.productWeight || entry?.quantity || '');
        })
        .filter(Boolean);
    const comboCount = normalizeComboCount(product.combo, comboOf.length + 1 || 1);

    const transformedProduct = {
        category: masterCategory,
        categoryUrl: safeString(categoryUrl),
        officialCategory: officialCategory,
        officialSubCategory: officialSubCategory,
        pincode: safeString(pincode),
        platform: PLATFORM_NAME,
        scrapedAt: product.scrapedAt || scrapedAt,
        productId: transformedProductId,
        skuId: safeString(product.skuId || 'N/A'),
        brand: safeString(product.brand || 'N/A'),
        productName: safeString(product.productName),
        productImage: safeString(product.productImage ? product.productImage.replace(/{@width}/g, '400').replace(/{@height}/g, '400') : ''),
        productWeight: variantWeight,
        quantity: safeString(product.quantity || 'N/A'),
        combo: comboCount,
        deliveryTime: safeString(product.deliveryTime),
        isAd: !!product.isAd,
        isVariant: isVariant,
        rating: safeString(product.rating),
        currentPrice: safeString(product.currentPrice),
        originalPrice: safeString(product.originalPrice),
        discountPercentage: safeString(product.discountPercentage),
        ranking: rank,
        inStock: product.inStock !== undefined ? !!product.inStock : true,
        productUrl: safeString(product.productUrl)
    };

    if (!isVariant) {
        transformedProduct.comboOf = comboOf;
    }

    return transformedProduct;
}

/**
 * Deduplicate raw products based on productId
 * PRIOR to ranking assignment
 */
export function deduplicateRawProducts(products) {
    if (!Array.isArray(products)) return [];

    const mergedByKey = new Map();

    products.forEach(p => {
        if (!p) return;
        const categoryUrl = p.categoryUrl || 'unknown_category';
        const uniqueKey = `${buildDeduplicationKey(p)}|${categoryUrl}`;

        if (!mergedByKey.has(uniqueKey)) {
            mergedByKey.set(uniqueKey, p);
            return;
        }

        const existing = mergedByKey.get(uniqueKey);
        mergedByKey.set(uniqueKey, mergeDuplicateProducts(existing, p));
    });

    return Array.from(mergedByKey.values());
}
