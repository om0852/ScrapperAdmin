import fs from 'fs';

const dumpFile = './api_dumps/jiomart_api_dump_unknown_category_2026-04-16T15-51-48-540Z_4or2sl.json';
const dumpData = JSON.parse(fs.readFileSync(dumpFile, 'utf8'));

console.log('\n=== SEARCHING FOR BADGE/BADGE INFORMATION IN API RESPONSE ===\n');

// Check entire structure for all keys
const allKeys = new Set();
const badgeData = [];

dumpData.responses.forEach((response) => {
  const results = response.response?.results || [];
  
  results.forEach((item, itemIdx) => {
    // Check all keys at product level
    if (item.product) {
      Object.keys(item.product).forEach(k => allKeys.add(`product.${k}`));
    }
    
    // Check variants
    if (item.product?.variants) {
      item.product.variants.forEach((variant, varIdx) => {
        Object.keys(variant).forEach(k => allKeys.add(`variant.${k}`));
        
        // Look for publishingData which might have badges
        if (variant.publishingData) {
          Object.keys(variant.publishingData).forEach(k => allKeys.add(`publishingData.${k}`));
          
          // Print publishingData structure for first variant
          if (itemIdx === 0 && varIdx === 0) {
            console.log('=== FIRST VARIANT PUBLISHINGDATA STRUCTURE ===\n');
            const pd = variant.publishingData;
            Object.entries(pd).forEach(([key, value]) => {
              console.log(`${key}:`);
              if (typeof value === 'object') {
                if (Array.isArray(value)) {
                  console.log(`  [Array with ${value.length} items]`);
                  if (value.length > 0) {
                    console.log(`  First item: ${JSON.stringify(value[0]).slice(0, 200)}`);
                  }
                } else {
                  console.log(`  ${JSON.stringify(value).slice(0, 300)}`);
                }
              } else {
                console.log(`  ${value}`);
              }
            });
          }
        }
      });
    }
  });
});

console.log('\n\n=== ALL UNIQUE KEYS FOUND IN RESPONSE ===\n');
Array.from(allKeys).sort().forEach(k => console.log(k));

// Now specifically look for products with "Quick" badge/tag visible on cards
console.log('\n\n=== SEARCHING FOR BADGE/QUICK TAG DATA ===\n');

let productsWithBadges = 0;
dumpData.responses.forEach((response) => {
  const results = response.response?.results || [];
  
  results.forEach((item) => {
    const newKeys = new Set();
    
    if (item.product?.variants?.[0]) {
      const variant = item.product.variants[0];
      const variantStr = JSON.stringify(variant).toLowerCase();
      
      // Look for any badge-related data
      if (variantStr.includes('badge') || 
          variantStr.includes('quick') ||
          variantStr.includes('label') ||
          variantStr.includes('tag')) {
        
        if (productsWithBadges < 5) {
          console.log(`\n✓ Product: ${item.product.title}`);
          console.log(`  Variant keys: ${Object.keys(variant).join(', ')}`);
          
          // Look in publishingData
          if (variant.publishingData) {
            const str = JSON.stringify(variant.publishingData);
            if (str.includes('badge') || str.includes('quick') || str.includes('label')) {
              console.log(`  Found in publishingData:`);
              console.log(`  ${str.slice(0, 500)}`);
            }
          }
        }
        
        productsWithBadges++;
      }
    }
  });
});

console.log(`\n\nFound ${productsWithBadges} products with potential badge data`);

// Look for productContent which might have badge info
console.log('\n\n=== CHECKING PRODUCTCONTENT FOR BADGES ===\n');

dumpData.responses.forEach((response) => {
  const results = response.response?.results || [];
  
  results.forEach((item) => {
    if (item.product?.variants?.[0]?.productContent) {
      console.log(`\n✓ Product has productContent: ${item.product.title}`);
      const pc = item.product.variants[0].productContent;
      console.log(`  ProductContent structure: ${JSON.stringify(pc).slice(0, 500)}`);
    }
  });
});
