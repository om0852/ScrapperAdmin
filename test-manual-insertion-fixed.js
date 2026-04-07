import { 
  extractCategoryFromFolder,
  mapCategoryFromUrl,
  generateProductIdSuffix,
  enhanceProductForManualInsertion,
  enhanceProductsBatchForManualInsertion
} from './utils/manualInsertionHelper.js';

console.log(`\n${'='.repeat(70)}`);
console.log('MANUAL INSERTION HELPER - FIXED TEST SUITE');
console.log(`${'='.repeat(70)}\n`);

// ═══════════════════════════════════════════════════════════════════
// TEST 1: Extract Category from Folder
// ═══════════════════════════════════════════════════════════════════
console.log('TEST 1: Extract Category from Folder Name');
console.log('-'.repeat(70));

const testFolders = [
  'scraped_data/Tea_ Coffee _ More',
  'scraped_data/Fruits_Vegetables',
  'scraped_data/Packaged_Foods',
  'scraped_data/Biscuits_Cakes',
];

testFolders.forEach(folder => {
  const category = extractCategoryFromFolder(folder);
  console.log(`  📂 ${folder.split('/')[1]}`);
  console.log(`     → Category: "${category}"`);
});

// ═══════════════════════════════════════════════════════════════════
// TEST 2: Map Category from URL - INSTAMART
// ═══════════════════════════════════════════════════════════════════
console.log(`\nTEST 2A: Map Category from URL (INSTAMART)`);
console.log('-'.repeat(70));

const testUrlInstamart = "https://www.swiggy.com/instamart/category-listing?categoryName=Cereals+and+Breakfast&filterId=681f386909ab2e00019aa59b&filterName=Hot+Beverages&taxonomyType=All+Listing";

const mappingInstamart = mapCategoryFromUrl(testUrlInstamart, 'Instamart');
console.log(`  URL: ${testUrlInstamart.substring(0, 80)}...`);
console.log(`  📊 Extracted Mapping:`);
if (mappingInstamart) {
  console.log(`     ✅ officialCategory: "${mappingInstamart.officialCategory}"`);
  console.log(`     ✅ officialSubCategory: "${mappingInstamart.officialSubCategory}"`);
  console.log(`     ✅ masterCategory: "${mappingInstamart.masterCategory}"`);
} else {
  console.log(`     ❌ No matching mapping found`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 2B: Map Category from URL - JIOMART (CRITICAL FIX)
// ═══════════════════════════════════════════════════════════════════
console.log(`\nTEST 2B: Map Category from URL (JIOMART) - CRITICAL`);
console.log('-'.repeat(70));

const testUrlJioMart = "https://www.jiomart.com/c/groceries/biscuits-drinks-packaged-foods/tea-coffee/29009";

// Test with exact platform name from file (lowercase)
const mappingJioMart = mapCategoryFromUrl(testUrlJioMart, 'Jiomart');
console.log(`  URL: ${testUrlJioMart}`);
console.log(`  Platform: "Jiomart" (lowercase - as in product file)`);
console.log(`  📊 Extracted Mapping:`);
if (mappingJioMart) {
  console.log(`     ✅ officialCategory: "${mappingJioMart.officialCategory}"`);
  console.log(`     ✅ officialSubCategory: "${mappingJioMart.officialSubCategory}"`);
  console.log(`     ✅ masterCategory: "${mappingJioMart.masterCategory}"`);
} else {
  console.log(`     ❌ No matching mapping found (THIS WAS THE BUG!)`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 3: Generate ProductId Suffix
// ═══════════════════════════════════════════════════════════════════
console.log(`\nTEST 3: Generate ProductId Suffix from officialSubCategory`);
console.log('-'.repeat(70));

const testSubCategories = [
  'Hot beverages',
  'Fresh Vegetables',
  'Green and Herbal Tea',
  'Filter & Ground Coffee',
  'Tea & Coffee',
];

testSubCategories.forEach(subCat => {
  const suffix = generateProductIdSuffix(subCat);
  console.log(`  "${subCat}"`);
  console.log(`     → Suffix: "${suffix}"`);
});

// ═══════════════════════════════════════════════════════════════════
// TEST 4: Enhance Single Product (JIOMART REAL SCENARIO)
// ═══════════════════════════════════════════════════════════════════
console.log(`\nTEST 4: Enhance Single Product for Manual Insertion (JIOMART)`);
console.log('-'.repeat(70));

const sampleProductJioMart = {
  platform: "Jiomart",
  productId: "601862757_P__tea-coffee",
  productName: "Nikunj Real Elaichi Tea, 1kg",
  category: "Tea, Coffee & More",  // May be wrong
  officialCategory: "Biscuits, Drinks & Packaged Foods",  // Already correct
  officialSubCategory: "Tea & Coffee",  // May need update
  categoryUrl: "https://www.jiomart.com/c/groceries/biscuits-drinks-packaged-foods/tea-coffee/29009",  // Real URL from product
  pincode: "400070",
  scrapedAt: "2026-03-22T17:51:38.111Z",
  ranking: 1  // Will be reassigned
};

console.log(`BEFORE Enhancement:`);
console.log(`  productId: "${sampleProductJioMart.productId}"`);
console.log(`  category: "${sampleProductJioMart.category}"`);
console.log(`  officialCategory: "${sampleProductJioMart.officialCategory}"`);
console.log(`  officialSubCategory: "${sampleProductJioMart.officialSubCategory}"`);
console.log(`  ranking: ${sampleProductJioMart.ranking}`);

const enhancedProductJioMart = enhanceProductForManualInsertion(
  sampleProductJioMart, 
  './scraped_data/Tea_ Coffee _ More', 
  'Jiomart'
);

console.log(`\nAFTER Enhancement:`);
console.log(`  productId: "${enhancedProductJioMart.productId}"`);
console.log(`  category: "${enhancedProductJioMart.category}"`);
console.log(`  officialCategory: "${enhancedProductJioMart.officialCategory}"`);
console.log(`  officialSubCategory: "${enhancedProductJioMart.officialSubCategory}"`);

// Validate the enhancement
const changes = [];
if (enhancedProductJioMart.productId !== sampleProductJioMart.productId) {
  changes.push(`productId: "${sampleProductJioMart.productId}" → "${enhancedProductJioMart.productId}"`);
}
if (enhancedProductJioMart.category !== sampleProductJioMart.category) {
  changes.push(`category: "${sampleProductJioMart.category}" → "${enhancedProductJioMart.category}"`);
}
if (enhancedProductJioMart.officialSubCategory !== sampleProductJioMart.officialSubCategory) {
  changes.push(`officialSubCategory: "${sampleProductJioMart.officialSubCategory}" → "${enhancedProductJioMart.officialSubCategory}"`);
}

if (changes.length > 0) {
  console.log(`\n ✅ Changes Applied:`);
  changes.forEach(c => console.log(`    • ${c}`));
} else {
  console.log(`\n ⚠️  No changes (product already had correct mapping)`);
}

// ═══════════════════════════════════════════════════════════════════
// TEST 5: Batch Enhancement with Ranking
// ═══════════════════════════════════════════════════════════════════
console.log(`\nTEST 5: Batch Enhancement with Ranking Assignment`);
console.log('-'.repeat(70));

const sampleProductsBatch = [
  {
    ...sampleProductJioMart,
    productId: "PRODUCT_1__tea-coffee",
    productName: "Product 1 Tea",
    officialSubCategory: "Tea & Coffee"
  },
  {
    ...sampleProductJioMart,
    productId: "PRODUCT_2__instant-coffee",
    productName: "Product 2 Coffee",
    officialSubCategory: "Instant Coffee"
  },
  {
    ...sampleProductJioMart,
    productId: "PRODUCT_3__tea-coffee",
    productName: "Product 3 Tea",
    officialSubCategory: "Tea & Coffee"
  },
  {
    ...sampleProductJioMart,
    productId: "PRODUCT_4__instant-coffee",
    productName: "Product 4 Coffee",
    officialSubCategory: "Instant Coffee"
  },
];

const enhancedBatch = enhanceProductsBatchForManualInsertion(
  sampleProductsBatch,
  './scraped_data/Tea_ Coffee _ More',
  'Jiomart'
);

console.log(`  📦 ${sampleProductsBatch.length} products enhanced`);
console.log(`\n  Products by SubCategory:`);

// Group by subcategory to show ranking
const grouped = {};
enhancedBatch.forEach(p => {
  const key = p.officialSubCategory;
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(p);
});

Object.entries(grouped).forEach(([subCat, products]) => {
  console.log(`\n  ${subCat}:`);
  products.forEach(p => {
    console.log(`    [Rank ${p.ranking}] ${p.productName}`);
    console.log(`           ID: ${p.productId}`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TEST 6: Case-Insensitive Platform Lookup
// ═══════════════════════════════════════════════════════════════════
console.log(`\nTEST 6: Case-Insensitive Platform Lookup`);
console.log('-'.repeat(70));

const platformVariants = [
  { platform: 'Jiomart', url: "https://www.jiomart.com/c/groceries/biscuits-drinks-packaged-foods/tea-coffee/29009" },
  { platform: 'jiomart', url: "https://www.jiomart.com/c/groceries/biscuits-drinks-packaged-foods/tea-coffee/29009" },
  { platform: 'JIOMART', url: "https://www.jiomart.com/c/groceries/biscuits-drinks-packaged-foods/tea-coffee/29009" },
  { platform: 'JioMart', url: "https://www.jiomart.com/c/groceries/biscuits-drinks-packaged-foods/tea-coffee/29009" },
];

let successCount = 0;
platformVariants.forEach(({ platform, url }) => {
  const mapping = mapCategoryFromUrl(url, platform);
  const status = mapping ? '✅' : '❌';
  console.log(`  ${status} Platform: "${platform}" → ${mapping ? 'MATCHED' : 'NO MATCH'}`);
  if (mapping) successCount++;
});

console.log(`\n  Result: ${successCount}/${platformVariants.length} platform variants matched correctly`);

console.log(`\n${'='.repeat(70)}`);
console.log('✅ ALL TESTS COMPLETED');
console.log(`${'='.repeat(70)}\n`);
