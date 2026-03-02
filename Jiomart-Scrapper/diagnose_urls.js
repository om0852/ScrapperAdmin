const fs = require('fs');
const path = require('path');

const PINCODE = '201014';
const OUTPUT_FILE = path.join(__dirname, `jiomart_bulk_results_${PINCODE}.json`);

const testUrls = [
  "https://www.jiomart.com/c/groceries/fruits-vegetables/fresh-fruits/220",
  "https://www.jiomart.com/c/groceries/fruits-vegetables/basic-vegetables/28981",
  "https://www.jiomart.com/c/groceries/fruits-vegetables/roots-herbs-others/28982",
  "https://www.jiomart.com/c/groceries/fruits-vegetables/premium-fruits-vegetables/28983",
  "https://www.jiomart.com/c/groceries/dairy-bakery/milk-milk-products/29011",
];

console.log('📊 DIAGNOSTIC: URL Matching Test\n');

try {
  const data = fs.readFileSync(OUTPUT_FILE, 'utf8');
  const allResults = JSON.parse(data);
  
  // Extract all unique categoryUrls from results
  const categoryUrlsInResults = new Set();
  allResults.forEach(p => {
    if (p.categoryUrl) {
      categoryUrlsInResults.add(p.categoryUrl);
    }
  });
  
  console.log(`✅ Loaded ${allResults.length} products from results file`);
  console.log(`✅ Found ${categoryUrlsInResults.size} unique URLs in results\n`);
  
  // Test each URL
  console.log('🔍 Testing URLs:\n');
  testUrls.forEach((url, index) => {
    const found = categoryUrlsInResults.has(url);
    const status = found ? '✓ FOUND' : '✗ NOT FOUND';
    console.log(`${index + 1}. ${status}`);
    console.log(`   URL: ${url}\n`);
  });
  
  // Show first 10 actual URLs in the file
  console.log('\n📋 Sample of URLs actually in results file:');
  const urlArray = Array.from(categoryUrlsInResults).slice(0, 10);
  urlArray.forEach((url, i) => {
    console.log(`${i + 1}. ${url}`);
  });
  
  console.log(`\n... and ${Math.max(0, categoryUrlsInResults.size - 10)} more URLs`);
  
} catch (error) {
  console.error('Error:', error.message);
}
