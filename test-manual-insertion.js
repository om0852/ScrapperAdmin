import { 
  extractCategoryFromFolder,
  mapCategoryFromUrl,
  generateProductIdSuffix,
  enhanceProductForManualInsertion,
  enhanceProductsBatchForManualInsertion
} from './utils/manualInsertionHelper.js';

console.log(`\n${'='.repeat(70)}`);
console.log('MANUAL INSERTION HELPER - TEST SUITE');
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
// TEST 2: Map Category from URL
// ═══════════════════════════════════════════════════════════════════
console.log(`\nTEST 2: Map Category from categoryUrl`);
console.log('-'.repeat(70));

const testUrl = "https://www.swiggy.com/instamart/category-listing?categoryName=Cereals+and+Breakfast&filterId=681f386909ab2e00019aa59b&filterName=Hot+Beverages&taxonomyType=All+Listing";

const mapping = mapCategoryFromUrl(testUrl, 'Instamart');
console.log(`  URL: ${testUrl.substring(0, 80)}...`);
console.log(`  📊 Extracted Mapping:`);
if (mapping) {
  console.log(`     ✅ officialCategory: "${mapping.officialCategory}"`);
  console.log(`     ✅ officialSubCategory: "${mapping.officialSubCategory}"`);
  console.log(`     ✅ masterCategory: "${mapping.masterCategory}"`);
} else {
  console.log(`     ❌ No matching mapping found`);
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
];

testSubCategories.forEach(subCat => {
  const suffix = generateProductIdSuffix(subCat);
  console.log(`  "${subCat}"`);
  console.log(`     → Suffix: "${suffix}"`);
});

// ═══════════════════════════════════════════════════════════════════
// TEST 4: Enhance Single Product
// ═══════════════════════════════════════════════════════════════════
console.log(`\nTEST 4: Enhance Single Product for Manual Insertion`);
console.log('-'.repeat(70));

const sampleProduct = {
  platform: "Instamart",
  productId: "G7126YK69Y__fresh-vegetables",
  productName: "Taj Mahal Rich and Flavourful Tea",
  category: "Fruits & Vegetables",  // ❌ Wrong
  officialCategory: "Fruits & Vegetables",  // ❌ Wrong
  officialSubCategory: "Fresh Vegetables",  // ❌ Wrong
  categoryUrl: "https://www.swiggy.com/instamart/category-listing?categoryName=Cereals+and+Breakfast&filterId=681f386909ab2e00019aa59b&filterName=Hot+Beverages&taxonomyType=All+Listing",
  pincode: "400706",
  scrapedAt: "2026-03-22T08:00:00.000Z"
};

console.log(`BEFORE Enhancement:`);
console.log(`  ❌ productId: "${sampleProduct.productId}"`);
console.log(`  ❌ category: "${sampleProduct.category}"`);
console.log(`  ❌ officialCategory: "${sampleProduct.officialCategory}"`);
console.log(`  ❌ officialSubCategory: "${sampleProduct.officialSubCategory}"`);

const enhancedProduct = enhanceProductForManualInsertion(sampleProduct, './scraped_data/Tea_ Coffee _ More', 'Instamart');

console.log(`\nAFTER Enhancement:`);
console.log(`  ✅ productId: "${enhancedProduct.productId}"`);
console.log(`  ✅ category: "${enhancedProduct.category}"`);
console.log(`  ✅ officialCategory: "${enhancedProduct.officialCategory}"`);
console.log(`  ✅ officialSubCategory: "${enhancedProduct.officialSubCategory}"`);

// ═══════════════════════════════════════════════════════════════════
// TEST 5: Batch Enhancement
// ═══════════════════════════════════════════════════════════════════
console.log(`\nTEST 5: Batch Enhancement (Multiple Products)`);
console.log('-'.repeat(70));

const sampleProducts = Array(3).fill(null).map((_, i) => ({
  ...sampleProduct,
  productId: `PRODUCT_${i}__fresh-vegetables`,
  productName: `Product ${i} Tea`
}));

const enhancedProducts = enhanceProductsBatchForManualInsertion(
  sampleProducts,
  './scraped_data/Tea_ Coffee _ More',
  'Instamart'
);

console.log(`  📦 ${sampleProducts.length} products enhanced`);
enhancedProducts.slice(0, 2).forEach((prod, i) => {
  console.log(`\n  Product ${i + 1}:`);
  console.log(`    productId: ${prod.productId}`);
  console.log(`    category: ${prod.category}`);
  console.log(`    subCategory: ${prod.officialSubCategory}`);
});
if (enhancedProducts.length > 2) {
  console.log(`  ... and ${enhancedProducts.length - 2} more products`);
}

console.log(`\n${'='.repeat(70)}`);
console.log('✅ ALL TESTS COMPLETED');
console.log(`${'='.repeat(70)}\n`);
