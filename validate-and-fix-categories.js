/**
 * Validate & Fix Categories Before Manual Insertion
 * 
 * PROBLEM: When scraping new "tea-coffee-and-more" URLs, products get assigned wrong categories
 * SOLUTION: Re-map categories using categoryUrl before insertion
 * 
 * Usage: node validate-and-fix-categories.js <path/to/json> <platform>
 * Example: node validate-and-fix-categories.js scraped_data/Tea_Coffee_More/Instamart_401202_2026-03-26T09-44-13-433Z.json instamart
 */

import fs from 'fs';
import path from 'path';

// Load categories_with_urls.json
function loadCategoryMappings(mappingFilePath = './categories_with_urls.json') {
    try {
        const data = JSON.parse(fs.readFileSync(mappingFilePath, 'utf8'));
        const urlToCategoryMap = new Map();

        Object.entries(data).forEach(([platform, categories]) => {
            if (Array.isArray(categories)) {
                categories.forEach(cat => {
                    if (cat.url) {
                        urlToCategoryMap.set(cat.url, {
                            platform,
                            masterCategory: cat.masterCategory || 'N/A',
                            officialCategory: cat.officialCategory || cat.officalCategory || 'N/A',
                            officialSubCategory: cat.officialSubCategory || cat.officalSubCategory || 'N/A',
                            fullUrl: cat.url
                        });
                    }
                });
            }
        });

        console.log(`✅ Loaded ${urlToCategoryMap.size} category mappings`);
        return urlToCategoryMap;
    } catch (error) {
        console.error(`❌ Error loading category mappings: ${error.message}`);
        return new Map();
    }
}

// Find category by URL
function findCategoryByUrl(categoryUrl, urlMap) {
    if (!categoryUrl || categoryUrl === 'N/A') {
        return null;
    }

    // Strategy 1: Exact match
    if (urlMap.has(categoryUrl)) {
        return urlMap.get(categoryUrl);
    }

    // Strategy 2: Match query parameters (for Instamart/Zepto)
    try {
        const inputUrlObj = new URL(categoryUrl);
        const inputPathname = inputUrlObj.pathname;
        const inputFilterId = inputUrlObj.searchParams.get('filterId');
        const inputCategoryName = inputUrlObj.searchParams.get('categoryName');

        let bestMatch = null;

        for (const [key, value] of urlMap.entries()) {
            try {
                const mapUrlObj = new URL(key);

                if (mapUrlObj.pathname === inputPathname) {
                    const mapFilterId = mapUrlObj.searchParams.get('filterId');
                    const mapCategoryName = mapUrlObj.searchParams.get('categoryName');

                    // If both use filterId, they must match exactly
                    if (inputFilterId && mapFilterId && inputFilterId === mapFilterId) {
                        return value;
                    }

                    // Fallback to categoryName match
                    if (!bestMatch && inputCategoryName && mapCategoryName && inputCategoryName === mapCategoryName) {
                        bestMatch = value;
                    }
                }
            } catch (e) {
                // Skip invalid URLs
            }
        }

        if (bestMatch) return bestMatch;

    } catch (e) {
        // Invalid URL format
    }

    return null;
}

// Generate productId suffix from officialSubCategory
function generateProductIdSuffix(officialSubCategory) {
    if (!officialSubCategory || officialSubCategory === 'N/A') {
        return '';
    }
    return '__' + officialSubCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Validate and fix a single product
function validateAndFixProduct(product, categoryUrlMap) {
    const originalCategory = product.category;
    const originalOfficialCategory = product.officialCategory;
    const originalOfficialSubCategory = product.officialSubCategory;
    const categoryUrl = product.categoryUrl || 'N/A';

    // Try to find correct category from URL
    const mapping = findCategoryByUrl(categoryUrl, categoryUrlMap);

    let fixed = false;
    let details = {};

    if (mapping && mapping.masterCategory !== 'N/A') {
        // Update with correct mapping
        if (product.category !== mapping.masterCategory) {
            details.category = { old: originalCategory, new: mapping.masterCategory };
            product.category = mapping.masterCategory;
            fixed = true;
        }

        if (product.officialCategory !== mapping.officialCategory) {
            details.officialCategory = { old: originalOfficialCategory, new: mapping.officialCategory };
            product.officialCategory = mapping.officialCategory;
            fixed = true;
        }

        if (product.officialSubCategory !== mapping.officialSubCategory) {
            details.officialSubCategory = { old: originalOfficialSubCategory, new: mapping.officialSubCategory };
            product.officialSubCategory = mapping.officialSubCategory;
            fixed = true;
        }

        // Update productId suffix if needed
        const newSuffix = generateProductIdSuffix(mapping.officialSubCategory);
        if (newSuffix && !product.productId.includes(newSuffix)) {
            // Remove old suffix and add new one
            const baseId = product.productId.split('__')[0];
            const newProductId = baseId + newSuffix;
            details.productId = { old: product.productId, new: newProductId };
            product.productId = newProductId;
            fixed = true;
        }
    } else {
        // Could not find mapping for this URL
        details.mapping = 'NOT FOUND - Manual review recommended';
    }

    return { fixed, details, product };
}

// Main function
async function validateAndFixCategories() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Usage: node validate-and-fix-categories.js <path/to/json> [--dry-run]

Examples:
  node validate-and-fix-categories.js scraped_data/Tea_Coffee_More/Instamart_401202.json
  node validate-and-fix-categories.js scraped_data/Tea_Coffee_More/Instamart_401202.json --dry-run

Options:
  --dry-run    Show changes without saving file
        `);
        process.exit(1);
    }

    const jsonFile = args[0];
    const dryRun = args.includes('--dry-run');

    if (!fs.existsSync(jsonFile)) {
        console.error(`❌ File not found: ${jsonFile}`);
        process.exit(1);
    }

    try {
        // Load JSON
        const fileContent = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        const products = fileContent.products || [];

        console.log(`📂 Loading file: ${jsonFile}`);
        console.log(`📊 Total products: ${products.length}`);

        // Load mappings
        const categoryUrlMap = loadCategoryMappings();

        // Statistics
        let totalFixed = 0;
        let totalNotFound = 0;
        const fixedProducts = [];
        const notFoundProducts = [];

        console.log(`\n🔍 Validating categories...`);

        // Validate and fix each product
        products.forEach((product, index) => {
            const result = validateAndFixProduct(product, categoryUrlMap);

            if (result.fixed) {
                totalFixed++;
                fixedProducts.push({
                    productId: product.productId,
                    productName: product.productName || 'N/A',
                    details: result.details
                });
            }

            if (result.details.mapping === 'NOT FOUND - Manual review recommended') {
                totalNotFound++;
                notFoundProducts.push({
                    productId: product.productId,
                    productName: product.productName || 'N/A',
                    categoryUrl: product.categoryUrl || 'N/A'
                });
            }
        });

        // Print summary
        console.log(`\n${'='.repeat(80)}`);
        console.log(`✅ VALIDATION SUMMARY`);
        console.log(`${'='.repeat(80)}`);
        console.log(`Total products:        ${products.length}`);
        console.log(`Fixed categories:      ${totalFixed}`);
        console.log(`Mapping not found:     ${totalNotFound}`);
        console.log(`No changes needed:     ${products.length - totalFixed - totalNotFound}`);

        // Show fixed products
        if (fixedProducts.length > 0) {
            console.log(`\n📋 FIXED PRODUCTS (${fixedProducts.length}):`);
            fixedProducts.slice(0, 10).forEach(p => {
                console.log(`\n  Product: ${p.productId}`);
                console.log(`  Name: ${p.productName}`);
                Object.entries(p.details).forEach(([key, value]) => {
                    if (typeof value === 'object' && value.old && value.new) {
                        console.log(`    ${key}: "${value.old}" → "${value.new}"`);
                    }
                });
            });
            if (fixedProducts.length > 10) {
                console.log(`\n  ... and ${fixedProducts.length - 10} more`);
            }
        }

        // Show not found products
        if (notFoundProducts.length > 0) {
            console.log(`\n⚠️  MAPPING NOT FOUND (${notFoundProducts.length}) - Review manually:`);
            notFoundProducts.slice(0, 5).forEach(p => {
                console.log(`\n  ID: ${p.productId}`);
                console.log(`  Name: ${p.productName}`);
                console.log(`  URL: ${p.categoryUrl.substring(0, 80)}...`);
            });
            if (notFoundProducts.length > 5) {
                console.log(`\n  ... and ${notFoundProducts.length - 5} more`);
            }
        }

        // Save if not dry-run
        if (!dryRun && totalFixed > 0) {
            fileContent.products = products;
            fs.writeFileSync(jsonFile, JSON.stringify(fileContent, null, 2));
            console.log(`\n✅ File updated and saved: ${jsonFile}`);
        } else if (dryRun) {
            console.log(`\n⏭️  DRY RUN MODE - No changes saved`);
        } else if (totalFixed === 0) {
            console.log(`\n✔️  No changes needed - file is already valid`);
        }

        console.log(`\n${'='.repeat(80)}`);

    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

validateAndFixCategories();
