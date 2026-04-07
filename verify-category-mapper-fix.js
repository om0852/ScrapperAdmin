import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load functions
function loadCategoryMappings() {
  const mappingFile = path.join(__dirname, 'categories_with_urls.json');
  const data = fs.readFileSync(mappingFile, 'utf8');
  return JSON.parse(data);
}

function normalizeUrlForComparison(url) {
  if (!url) return '';
  try {
    let decoded = decodeURIComponent(url);
    return encodeURI(decoded).toLowerCase().trim();
  } catch {
    return url.toLowerCase().trim();
  }
}

function extractCategoryFromUrl(categoryUrl, platform = 'Instamart') {
  if (!categoryUrl || categoryUrl === 'N/A') {
    return {
      category: 'Unknown',
      officialCategory: 'Unknown',
      officialSubCategory: 'Unknown',
      masterCategory: 'Unknown'
    };
  }

  const mappings = loadCategoryMappings();
  const platformKey = Object.keys(mappings).find(
    key => key.toLowerCase() === (platform || '').toLowerCase()
  );
  
  if (!platformKey) {
    console.warn(`⚠️  Platform "${platform}" not found`);
    return {
      category: 'Unknown',
      officialCategory: 'Unknown',
      officialSubCategory: 'Unknown',
      masterCategory: 'Unknown'
    };
  }
  
  const platformMappings = mappings[platformKey] || [];
  const normalizedInput = normalizeUrlForComparison(categoryUrl);

  const exactMatch = platformMappings.find(m => {
    const dbUrl = (m.url || '').toLowerCase().trim();
    const directMatch = dbUrl === categoryUrl.toLowerCase().trim();
    const normalizedMatch = normalizeUrlForComparison(m.url) === normalizedInput;
    return directMatch || normalizedMatch;
  });

  if (exactMatch) {
    return {
      category: exactMatch.masterCategory || 'Unknown',
      officialCategory: exactMatch.officalCategory || exactMatch.officialCategory || 'Unknown',
      officialSubCategory: exactMatch.officalSubCategory || exactMatch.officialSubCategory || 'Unknown',
      masterCategory: exactMatch.masterCategory || 'Unknown'
    };
  }

  return {
    category: 'Unknown',
    officialCategory: 'Unknown',
    officialSubCategory: 'Unknown',
    masterCategory: 'Unknown'
  };
}

console.log(`\n${'='.repeat(80)}`);
console.log('CATEGORY MAPPER FIX VERIFICATION');
console.log(`${'='.repeat(80)}\n`);

// Test case 1: The actual product URL that was inserted wrong
const testProductUrl = "https://www.swiggy.com/instamart/category-listing?categoryName=tea-coffee-and-more&filterId=682498a41f249300018d7753&filterName=Green+and+Herbal+Tea&taxonomyType=All+Listing";

console.log('TEST 1: Actual Product URL from DB');
console.log('-'.repeat(80));
console.log(`URL: ${testProductUrl}`);
console.log(`Platform: "instamart" (lowercase - as in product file)`);

const mapping = extractCategoryFromUrl(testProductUrl, 'instamart');

console.log(`\nResult:`);
console.log(`  category: "${mapping.category}"`);
console.log(`  officialCategory: "${mapping.officialCategory}"`);
console.log(`  officialSubCategory: "${mapping.officialSubCategory}"`);
console.log(`  masterCategory: "${mapping.masterCategory}"`);

if (mapping.officialSubCategory === 'Green and Herbal Tea') {
  console.log(`\n✅ CORRECT! Mapped to Green and Herbal Tea`);
} else if (mapping.officialSubCategory === 'Unknown') {
  console.log(`\n❌ FAILED! Could not find matching URL`);
  // Debug: let's search for similar URLs
  console.log(`\n  Debugging: Searching for matching entries...`);
  const mappings = loadCategoryMappings();
  const platformMappings = mappings['Instamart'] || [];
  const matches = platformMappings.filter(m => 
    (m.url || '').includes('tea-coffee-and-more') && 
    (m.url || '').includes('Green')
  );
  console.log(`  Found ${matches.length} entries with 'tea-coffee-and-more' and 'Green'`);
  if (matches.length > 0) {
    console.log(`  First match: ${matches[0].url.substring(0, 100)}...`);
    console.log(`  Expected: ${testProductUrl.substring(0, 100)}...`);
  }
} else {
  console.log(`\n⚠️  Mapped to: ${mapping.officialSubCategory} (not Green and Herbal Tea)`);
}

// Test case 2: Case-insensitive platform lookup
console.log(`\n\nTEST 2: Case-Insensitive Platform Lookup`);
console.log('-'.repeat(80));

const platformVariants = ['instamart', 'Instamart', 'INSTAMART', 'InstaMart'];
let passCount = 0;

platformVariants.forEach(platform => {
  const result = extractCategoryFromUrl(testProductUrl, platform);
  const isCorrect = result.officialSubCategory === 'Green and Herbal Tea';
  const status = isCorrect ? '✅' : '❌';
  console.log(`  ${status} Platform: "${platform}" → ${result.officialSubCategory}`);
  if (isCorrect) passCount++;
});

console.log(`\nResult: ${passCount}/${platformVariants.length} variants correct`);

console.log(`\n${'='.repeat(80)}`);
console.log(`VERIFICATION COMPLETE`);
console.log(`${'='.repeat(80)}\n`);
