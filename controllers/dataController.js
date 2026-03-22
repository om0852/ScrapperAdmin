import mongoose from 'mongoose';
import Brand from '../models/Brand.js';
import ProductSnapshot from '../models/ProductSnapshot.js';
import ProductGrouping from '../models/ProductGrouping.js';

/**
 * Validates productName to ensure it's not a price or invalid value.
 * Skips products where productName is empty, "N/A", or looks like a price (₹XX, $XX, etc.)
 */
const isValidProductName = (productName) => {
    if (!productName || productName === 'N/A' || productName.trim() === '') {
        return false;
    }
    
    const trimmed = String(productName).trim();
    
    // Check if it looks like a price (currency symbol + numbers)
    const pricePattern = /^[₹$£€¥₺₽₩₪₫₦]\d+(\.\d{1,2})?$/;
    if (pricePattern.test(trimmed)) {
        return false;
    }
    
    // Check if it's purely numeric (like just "62")
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return false;
    }
    
    return true;
};

export const processScrapedData = async ({ pincode, platform, category, products }) => {
    // Decode folder-name sanitization: Windows replaces & with _ in directory names.
    // " _ " surrounded by spaces is the tell-tale sign (e.g. "Fruits _ Vegetables").
    const decodedCategory = category.replace(/ _ /g, ' & ');

    // NO MONGODB OPERATIONS DURING SCRAPING
    // Just validate and deduplicate data locally
    let processedCount = 0;

    // Deduplicate within this batch: a true duplicate is the same productId AND same
    // officialSubCategory (same final suffixed ID) with the same scrapedAt.
    // Products with the same base ID but DIFFERENT officialSubCategory are distinct products
    // (they'll get different suffixes like __fresh-vegetables vs __fresh-fruits) — keep both.
    const seenInBatch = new Set();
    const uniqueProducts = products.filter(prod => {
        const subCat = prod.officialSubCategory || prod.officalSubCategory || '';
        const key = `${prod.productId || prod.id}|${subCat}|${prod.scrapedAt || prod.time || ''}`;
        if (seenInBatch.has(key)) return false;
        seenInBatch.add(key);
        return true;
    });

    // ── Calculate Rankings ─────────────────────────────────────────────
    // Calculate rankings dynamically per subcategory based on order of appearance.
    // This ensures accurate 1-N ranking even on manual insertion or messy scrape data.
    const rankCounters = {};
    for (const prod of uniqueProducts) {
        const subCat = (prod.officialSubCategory || prod.officalSubCategory || 'Unknown').trim();
        if (!rankCounters[subCat]) {
            rankCounters[subCat] = 1;
        }
        prod.ranking = rankCounters[subCat];
        rankCounters[subCat]++;
    }
    // ───────────────────────────────────────────────────────────────────

    for (const prod of uniqueProducts) {
        // ── Skip products with invalid productName ─────────────────────
        if (!isValidProductName(prod.productName || prod.name)) {
            console.warn(`[DataController] Skipping product with invalid productName: "${prod.productName || prod.name}"`);
            continue;
        }
        // ─────────────────────────────────────────────────────────────────

        // ── Suffix Safety Net ──────────────────────────────────────────────
        // Ensure productId always carries the __<officialSubCategory> suffix.
        // This runs for every product regardless of where it came from, so
        // scraper bugs or missing orchestrator fixes can't pollute the DB.
        const officialSubCat = prod.officialSubCategory || prod.officalSubCategory || '';
        if (officialSubCat && officialSubCat !== 'N/A') {
            // Keep hyphens to differentiate multi-word categories (e.g., fresh-vegetables, not freshvegetables)
            const expectedSuffix = '__' + officialSubCat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const rawId = String(prod.productId || prod.id || '');
            if (!rawId.endsWith(expectedSuffix)) {
                // Strip any existing __suffix then re-apply the correct one
                const baseId = rawId.replace(/__.*$/, '');
                prod.productId = baseId + expectedSuffix;
            }
        }
        // ───────────────────────────────────────────────────────────────────

        // Just validate and count — NO DB operations during scraping
        processedCount++;
    }

    return {
        success: true,
        message: `Processed ${processedCount} valid products. Data is ready for manual insertion.`,
        stats: {
            new: 0,                    // Will be set during manual insertion
            updated: 0,                // Will be set during manual insertion
            newGroups: 0,              // Will be set during manual insertion
            scraped: processedCount     // Track scraped count
        }
    };
};
