import fs from 'fs';

// Read the JSON file
const data = JSON.parse(fs.readFileSync('categories_with_urls.json', 'utf-8'));

const urlMap = {};
const allItems = [];

// Collect all URLs and their locations
for (const platform in data) {
  if (Array.isArray(data[platform])) {
    data[platform].forEach((item, index) => {
      allItems.push({
        platform,
        index,
        category: item.officalCategory,
        subcategory: item.officalSubCategory,
        url: item.url
      });
      
      if (!urlMap[item.url]) {
        urlMap[item.url] = [];
      }
      urlMap[item.url].push(allItems.length - 1);
    });
  }
}

// Find duplicates
const duplicates = Object.entries(urlMap).filter(([url, indices]) => indices.length > 1);

if (duplicates.length === 0) {
  console.log('\n✓ No duplicate URLs found!\n');
} else {
  console.log(`\n⚠ Found ${duplicates.length} duplicate URL(s):\n`);
  
  duplicates.forEach(([url, indices]) => {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Appears ${indices.length} times:\n`);
    
    indices.forEach((idx) => {
      const item = allItems[idx];
      console.log(`  Platform: ${item.platform}`);
      console.log(`  Category: ${item.category}`);
      console.log(`  SubCategory: ${item.subcategory}`);
      console.log(`  Index: ${item.index}`);
      console.log('');
    });
    
    console.log(`URL: ${url}\n`);
  });
}
