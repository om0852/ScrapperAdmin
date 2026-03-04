/**
 * Category Mapper for Blinkit Products
 * Maps categoryUrl to masterCategory using categories_with_urls.json
 */

import fs from 'fs';
import path from 'path';

/**
 * Load category mappings from JSON file
 */
function loadCategoryMappings(mappingFilePath = 'd:\\creatosaurus-intership\\quick-commerce-scrappers\\mainserver\\categories_with_urls.json') {
    try {
        const absolutePath = 'd:\\creatosaurus-intership\\quick-commerce-scrappers\\mainserver\\categories_with_urls.json';
        const data = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));

        // Build a mapping from URL to category info
        const urlToCategoryMap = new Map();

        // Process each platform's categories
        Object.entries(data).forEach(([platform, categories]) => {
            if (Array.isArray(categories)) {
                categories.forEach(cat => {
                    if (cat.url) {
                        // Store full URL to prevent Instamart query parameter overlaps
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

/**
 * Find matching category info by URL
 * Supports various URL matching strategies
 */
function findCategoryByUrl(categoryUrl, urlMap) {
    if (!categoryUrl || categoryUrl === 'N/A') {
        return null;
    }

    // Strategy 1: Exact string match
    if (urlMap.has(categoryUrl)) {
        return urlMap.get(categoryUrl);
    }

    // Advanced Strategy: Match query parameters (required for Instamart/Zepto)
    try {
        const inputUrlObj = new URL(categoryUrl);
        const inputPathname = inputUrlObj.pathname;
        const inputFilterId = inputUrlObj.searchParams.get('filterId');
        const inputCategoryName = inputUrlObj.searchParams.get('categoryName');

        let bestMatch = null;

        for (const [key, value] of urlMap.entries()) {
            try {
                const mapUrlObj = new URL(key);

                // Must share the same base path
                if (mapUrlObj.pathname === inputPathname) {
                    const mapFilterId = mapUrlObj.searchParams.get('filterId');
                    const mapCategoryName = mapUrlObj.searchParams.get('categoryName');

                    // If both use filterId, they must match exactly
                    if (inputFilterId && mapFilterId && inputFilterId === mapFilterId) {
                        return value;
                    }

                    // If neither uses filterId, or one is missing, fallback to categoryName
                    if (!bestMatch && inputCategoryName && mapCategoryName && inputCategoryName === mapCategoryName) {
                        // We store it as best match, but keep looking just in case a filterId match comes up
                        bestMatch = value;
                    }
                }
            } catch (e) {
                // Skip invalid mapped URLs
            }
        }

        if (bestMatch) return bestMatch;

    } catch (e) {
        // Fallback for invalid URLs that can't be parsed
    }

    // Strategy 3: Substring match for fallback
    for (const [key, value] of urlMap.entries()) {
        if (categoryUrl.includes(key) || key.includes(categoryUrl)) {
            return value;
        }
    }

    return null;
}

/**
 * Enrich a product with category mapping data
 */
function enrichProductWithCategoryMapping(product, urlMap) {
    const categoryMatch = findCategoryByUrl(product.categoryUrl, urlMap);

    if (categoryMatch) {
        return {
            ...product,
            masterCategory: categoryMatch.masterCategory,
            officialCategory: categoryMatch.officialCategory,
            officialSubCategory: categoryMatch.officialSubCategory,
            platform: product.platform || categoryMatch.platform,
            categoryMappingFound: true,
            categoryMappingUrl: categoryMatch.fullUrl
        };
    }

    // No mapping found, add N/A values
    return {
        ...product,
        masterCategory: 'N/A',
        categoryMappingFound: false
    };
}

/**
 * Enrich entire product array with category mappings
 */
function enrichProductsWithCategoryMapping(products, urlMap) {
    let matchedCount = 0;

    const enriched = products.map(product => {
        const enrichedProduct = enrichProductWithCategoryMapping(product, urlMap);
        if (enrichedProduct.categoryMappingFound) {
            matchedCount++;
        }
        return enrichedProduct;
    });

    return {
        products: enriched,
        matchedCount,
        totalCount: products.length,
        matchPercentage: ((matchedCount / products.length) * 100).toFixed(2)
    };
}

/**
 * Enrich result file with category mappings
 */
function enrichResultFile(inputFile, outputFile = null, mappingFilePath = './categories_with_urls.json') {
    try {
        console.log(`\n📂 Reading products file: ${inputFile}`);
        const rawData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

        console.log(`📂 Loading category mappings: ${mappingFilePath}`);
        const urlMap = loadCategoryMappings(mappingFilePath);

        // Extract products
        let products = [];
        if (Array.isArray(rawData)) {
            products = rawData;
        } else if (rawData.products && Array.isArray(rawData.products)) {
            products = rawData.products;
        } else {
            console.error('❌ Cannot extract products from file');
            return null;
        }

        console.log(`📦 Processing ${products.length} products...`);

        // Enrich products
        const result = enrichProductsWithCategoryMapping(products, urlMap);

        // Determine output filename
        if (!outputFile) {
            const basename = path.basename(inputFile, '.json');
            const dirname = path.dirname(inputFile);
            outputFile = path.join(dirname, `${basename}_with_categories.json`);
        }

        // Save enriched data
        fs.writeFileSync(outputFile, JSON.stringify(result.products, null, 2));

        // Display summary
        console.log(`\n✅ Category Mapping Summary`);
        console.log(`   Total Products: ${result.totalCount}`);
        console.log(`   Matched: ${result.matchedCount}`);
        console.log(`   Unmatched: ${result.totalCount - result.matchedCount}`);
        console.log(`   Match Rate: ${result.matchPercentage}%`);
        console.log(`\n💾 Saved to: ${outputFile}`);

        return result;

    } catch (error) {
        console.error(`❌ Error enriching file: ${error.message}`);
        throw error;
    }
}

/**
 * Batch enrich all result files
 */
function batchEnrichFiles(directory = '.', mappingFilePath = './categories_with_urls.json') {
    try {
        console.log(`\n🔍 Scanning directory: ${directory}`);

        // Find all result files (but not ones already enriched)
        const files = fs.readdirSync(directory)
            .filter(f => f.match(/(_transformed\.json|bulk_results.*\.json)$/) &&
                !f.includes('with_categories'));

        console.log(`📋 Found ${files.length} files to enrich`);

        const results = [];
        files.forEach((file, index) => {
            console.log(`\n[${index + 1}/${files.length}] Processing: ${file}`);
            try {
                const filepath = path.join(directory, file);
                const result = enrichResultFile(filepath, null, mappingFilePath);
                if (result) {
                    results.push({
                        file,
                        status: 'success',
                        matched: result.matchedCount,
                        total: result.totalCount,
                        percentage: result.matchPercentage
                    });
                }
            } catch (error) {
                results.push({
                    file,
                    status: 'error',
                    error: error.message
                });
            }
        });

        // Summary
        console.log('\n\n========== BATCH ENRICHMENT SUMMARY ==========');
        results.forEach(r => {
            if (r.status === 'success') {
                console.log(`✅ ${r.file}`);
                console.log(`   Matched: ${r.matched}/${r.total} (${r.percentage}%)`);
            } else {
                console.log(`❌ ${r.file}: ${r.error}`);
            }
        });

        const successCount = results.filter(r => r.status === 'success').length;
        console.log(`\nTotal: ${successCount}/${results.length} files processed successfully`);

        return results;

    } catch (error) {
        console.error(`❌ Batch enrichment error: ${error.message}`);
        throw error;
    }
}

// === EXPORTS ===
export {
    loadCategoryMappings,
    findCategoryByUrl,
    enrichProductWithCategoryMapping,
    enrichProductsWithCategoryMapping,
    enrichResultFile,
    batchEnrichFiles
};

// === CLI USAGE ===
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
📝 Category Enrichment Tool

Maps products to masterCategory, officialCategory, and officialSubCategory
using the categories_with_urls.json mapping file.

Usage:
  node enrich_categories.js [file] [mapping_file]
  node enrich_categories.js --batch [dir] [mapping_file]

Examples:
  node enrich_categories.js blinkit_bulk_results_401202_transformed.json
  node enrich_categories.js result.json ./categories_with_urls.json
  node enrich_categories.js --batch ./Blinkit-Scrapper ./categories_with_urls.json
  node enrich_categories.js --batch . ./categories_with_urls.json
        `);
        process.exit(0);
    }

    if (args[0] === '--batch') {
        const dir = args[1] || '.';
        const mapping = args[2] || './categories_with_urls.json';
        batchEnrichFiles(dir, mapping);
    } else {
        const file = args[0];
        const mapping = args[1] || './categories_with_urls.json';
        enrichResultFile(file, null, mapping);
    }
}
