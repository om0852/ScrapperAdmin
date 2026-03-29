/**
 * Jiomart Response Format Transformer
 * Standardizes all Jiomart scraper responses to a consistent format
 * Handles deduplication, field mapping, N/A values, and category enrichment
 */

import fs from 'fs';
import path from 'path';
import { enrichProductWithCategoryMapping, loadCategoryMappings } from '../enrich_categories.js';

// === CONSTANTS ===
const PLATFORM_NAME = 'Jiomart';

/**
 * Standardize a single Jiomart product
 * @param {Object} product - Raw product object from scraper
 * @param {string} categoryUrl - URL of the category being scraped
 * @param {string} categoryName - Name of the category (backup for officialCategory)
 * @param {string} subCategoryName - Name of subcategory (optional)
 * @param {string} pincode - Pincode
 * @param {number} rank - Rank in the list
 * @param {Object} categoryMapping - Enriched category mapping object (optional)
 */
export function transformJiomartProduct(product, categoryUrl, categoryName, subCategoryName, pincode, rank, categoryMapping = null) {
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
    } else {
        // Fallback
        officialCategory = categoryName || 'N/A';
        officialSubCategory = subCategoryName || 'N/A';
    }

    // Safely handle values
    const safeString = (val) => (val !== null && val !== undefined && val !== '') ? String(val) : 'N/A';

    const subCatSuffix = (officialSubCategory && officialSubCategory !== 'N/A')
        ? '__' + officialSubCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        : '';

    // Jiomart prices often have ₹ symbol or commas
    const cleanPrice = (val) => {
        if (!val) return 'N/A';
        return String(val).replace(/[^\d.]/g, '');
    }

    // --- API JSON HANDLING ---
    if (product.product && product.product.title) {
        const p = product.product;
        // ID
        const productId = safeString(product.id);

        // Name
        const productName = safeString(p.title);

        // Image
        let productImage = 'N/A';
        // Try top-level images first (some APIs)
        if (p.images && p.images.length > 0) {
            productImage = p.images[0].uri || 'N/A';
        }
        // Fallback to variant images (most common structure now)
        else if (p.variants && p.variants.length > 0 && p.variants[0].images && p.variants[0].images.length > 0) {
            productImage = p.variants[0].images[0].uri || 'N/A';
        }

        // Price & Stock
        let currentPrice = 'N/A';
        let originalPrice = 'N/A';
        let discount = 'N/A';
        let isOutOfStock = false; // Default to in-stock if data not available

        // Try direct avg fields first
        if (p.variants && p.variants.length > 0) {
            const vAttr = p.variants[0].attributes;
            if (vAttr.avg_selling_price && vAttr.avg_selling_price.numbers) {
                currentPrice = safeString(vAttr.avg_selling_price.numbers[0]);
            }
            if (vAttr.avg_discount_pct && vAttr.avg_discount_pct.numbers) {
                discount = safeString(vAttr.avg_discount_pct.numbers[0]) + '%';
            }

            // Check inventory arrays for out-of-stock status
            // OUT OF STOCK if: no 1P stores AND (no 3P stores OR only "NA")
            const stores1p = vAttr.inv_stores_1p?.text || [];
            const stores3p = vAttr.inv_stores_3p?.text || [];
            if (stores1p.length === 0 && (stores3p.length === 0 || stores3p[0] === 'NA')) {
                isOutOfStock = true;
            }

            // Parse buybox_mrp for more accurate store-level price/MRP
            // Format: "StoreCode|SellerId|SellerName||MRP|SellingPrice||Discount|Pct||?|"
            // e.g. "3201|1|Reliance Retail||125.0|106.0||19.0|15.0||2|"
            if (vAttr.buybox_mrp && vAttr.buybox_mrp.text && vAttr.buybox_mrp.text.length > 0) {
                // Pick the first one or logic to match store could go here
                const boxString = vAttr.buybox_mrp.text[0];
                const parts = boxString.split('|');
                if (parts.length >= 6) {
                    const rawMrp = parts[4];
                    const rawSp = parts[5];
                    if (rawMrp) originalPrice = rawMrp;
                    if (rawSp) currentPrice = rawSp; // Prefer this over avg
                }
            }
        }

        // Weight/pack size often in title (supports decimals like 3.5 kg)
        let packSize = 'N/A';
        const sizeMatch = productName.match(/(\d+\.?\d*\s*(?:g|kg|ml|l|pc|pcs|pack))/i);
        if (sizeMatch) {
            packSize = sizeMatch[0];
        }

        // Product URL - extract from variant
        let productUrl = helperUrl(productId);
        if (p.variants && p.variants.length > 0 && p.variants[0].uri) {
            productUrl = p.variants[0].uri;
        }

        // Brand - Extract from variants first (most reliable in new API)
        let brandName = 'N/A';
        if (p.variants && p.variants.length > 0 && Array.isArray(p.variants[0].brands) && p.variants[0].brands.length > 0) {
            brandName = safeString(p.variants[0].brands[0]);
        } else if (p.brand) {
            brandName = safeString(p.brand);
        }

        const adTagRaw = product.__adTag || product.adTag || 'N/A';
        const adTag = safeString(adTagRaw);
        const isSponsoredTag = typeof adTagRaw === 'string' && /(sponsor|ad)/i.test(adTagRaw);
        const isAd = product.__isAd === true || product.isAd === true || isSponsoredTag;
        const websitePosition = Number(product.__websitePosition || product.websitePosition || rank);
        const resolvedRank = Number.isFinite(websitePosition) && websitePosition > 0 ? websitePosition : rank;

        return {
            category: masterCategory,
            categoryUrl: safeString(categoryUrl),
            officialCategory: officialCategory,
            officialSubCategory: officialSubCategory,
            pincode: safeString(pincode),
            platform: PLATFORM_NAME,
            scrapedAt: scrapedAt,
            productId: productId + subCatSuffix,
            skuId: 'N/A',
            brand: brandName,
            productName: productName,
            productImage: productImage,
            productWeight: packSize,
            quantity: packSize,
            combo: safeString(product.combo || p.combo || 'N/A'),
            deliveryTime: '20 to 30 minutes', // Hardcoded as per user request
            isAd,
            rating: 'N/A', // vAttr.popularity is number, not rating
            currentPrice: cleanPrice(currentPrice),
            originalPrice: cleanPrice(originalPrice),
            discountPercentage: discount,
            ranking: resolvedRank,
            websitePosition: resolvedRank,
            isOutOfStock: isOutOfStock,
            productUrl: productUrl
        };
    }

    // --- DOM SCRAPED HANDLING (FALLBACK) ---
    const fallbackPosition = Number(product.websitePosition || product.__websitePosition || rank);
    const fallbackRank = Number.isFinite(fallbackPosition) && fallbackPosition > 0 ? fallbackPosition : rank;

    return {
        category: masterCategory,
        categoryUrl: safeString(categoryUrl),
        officialCategory: officialCategory,
        officialSubCategory: officialSubCategory,
        pincode: safeString(pincode),
        platform: PLATFORM_NAME,
        scrapedAt: product.scrapedAt || scrapedAt,
        productId: safeString(product.id || product.productId) + subCatSuffix,
        skuId: safeString(product.skuId || 'N/A'),
        brand: safeString(product.brand || 'N/A'),
        productName: safeString(product.name || product.productName),
        productImage: safeString(product.image || product.productImage),
        productWeight: safeString(product.weight || product.packSize || product.quantity || 'N/A'),
        quantity: safeString(product.quantity || product.packSize || 'N/A'),
        combo: safeString(product.combo || 'N/A'),
        deliveryTime: safeString(product.deliveryTime),
        isAd: !!product.isAd,
        rating: safeString(product.rating),
        currentPrice: cleanPrice(product.price || product.sellingPrice),
        originalPrice: cleanPrice(product.originalPrice || product.mrp),
        discountPercentage: safeString(product.discount || product.discountPercentage),
        ranking: fallbackRank,
        websitePosition: fallbackRank,
        isOutOfStock: !!product.isOutOfStock,
        productUrl: safeString(product.url || product.productUrl)
    };
}

function helperUrl(id) {
    return `https://www.jiomart.com/p/${id}`;
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
        // Jiomart IDs are usually stable
        const id = p.id || p.productId || p.productName; // Fallback
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
