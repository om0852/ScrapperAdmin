import fs from 'fs';

const dumpFile = './api_dumps/jiomart_api_dump_unknown_category_2026-04-16T15-51-48-540Z_4or2sl.json';
const dumpData = JSON.parse(fs.readFileSync(dumpFile, 'utf8'));

console.log('\n=== EXTRACTING RAW PRODUCT JSON FOR QUICKWORK NOTEBOOK ===\n');

dumpData.responses.forEach((response) => {
  const results = response.response?.results || [];
  
  results.forEach((item) => {
    const productTitle = item.product?.title || '';
    
    if (productTitle.includes('Quickwork A4 Binded Single Line Notebook')) {
      console.log('FOUND PRODUCT!\n');
      
      // List all keys at top level of variant
      const variant = item.product?.variants?.[0];
      console.log('Variant top-level keys:', Object.keys(variant));
      
      // Print attributes without the large inv_stores_1p
      const attrs = variant.attributes;
      console.log('\n=== ATTRIBUTES (excluding inv_stores_1p) ===');
      
      Object.entries(attrs).forEach(([key, value]) => {
        if (key !== 'inv_stores_1p') {
          console.log(`\n${key}:`);
          if (value.text && Array.isArray(value.text)) {
            console.log(`  Text values: ${JSON.stringify(value.text.slice(0, 5))}`);
            if (value.text.length > 5) console.log(`  ... and ${value.text.length - 5} more`);
          } else {
            console.log(`  Value: ${JSON.stringify(value)}`);
          }
        }
      });
      
      // Check for tags in any other location
      console.log('\n\n=== CHECKING FOR TAGS IN OTHER VARIANT FIELDS ===\n');
      
      if (variant.tags) {
        console.log('✓ Found variant.tags:', JSON.stringify(variant.tags, null, 2));
      }
      
      if (variant.badges) {
        console.log('✓ Found variant.badges:', JSON.stringify(variant.badges, null, 2));
      }
      
      if (variant.promotionBadges) {
        console.log('✓ Found variant.promotionBadges:', JSON.stringify(variant.promotionBadges, null, 2));
      }
      
      if (variant.quickTag) {
        console.log('✓ Found variant.quickTag:', JSON.stringify(variant.quickTag, null, 2));
      }
      
      if (variant.customAttributes) {
        console.log('✓ Found variant.customAttributes:', JSON.stringify(variant.customAttributes, null, 2));
      }
      
      // Print the whole top-level variant and top-level fields (limited)
      console.log('\n\n=== FULL VARIANT STRUCTURE ===\n');
      const variantKeys = Object.keys(variant);
      console.log('Keys present in variant:', variantKeys);
      
      variantKeys.forEach(key => {
        if (!['attributes', 'publishingData'].includes(key)) {
          const val = variant[key];
          if (typeof val === 'string') {
            console.log(`${key}: "${val}"`);
          } else if (Array.isArray(val)) {
            console.log(`${key}: [${val.length} items] ${JSON.stringify(val.slice(0, 3))}`);
          } else if (typeof val === 'object') {
            console.log(`${key}:`, JSON.stringify(val).slice(0, 100));
          } else {
            console.log(`${key}:`, val);
          }
        }
      });
    }
  });
});
