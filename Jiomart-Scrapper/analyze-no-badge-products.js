import fs from 'fs';

const dumpFile = './api_dumps/jiomart_api_dump_unknown_category_2026-04-16T15-51-48-540Z_4or2sl.json';
const dumpData = JSON.parse(fs.readFileSync(dumpFile, 'utf8'));

console.log('\n=== ANALYZING PRODUCTS WITHOUT QUICK BADGE ===\n');

const targetProducts = [
  'PUVI Recycled Notebook',
  'DOODLEDASH Glitter Cards',
  'StealQDeal Black Beige Leather Zipper Headphone Case'
];

const foundProducts = [];

dumpData.responses.forEach((response) => {
  const results = response.response?.results || [];
  
  results.forEach((item) => {
    const title = item.product?.title || '';
    
    targetProducts.forEach(target => {
      if (title.includes(target)) {
        foundProducts.push({
          title,
          productId: item.id,
          variant: item.product?.variants?.[0],
          category: item.product?.categories?.[0]
        });
      }
    });
  });
});

console.log(`Found ${foundProducts.length} products\n`);

foundProducts.forEach((p, idx) => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${idx + 1}. ${p.title}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Product ID: ${p.productId}`);
  console.log(`Category: ${p.category}`);
  
  const v = p.variant;
  const attrs = v?.attributes || {};
  
  const sellers = attrs.seller_ids?.text || [];
  const inv1p = attrs.inv_stores_1p?.text || [];
  const available3p = attrs.available_at_3p_seller?.text?.[0];
  const tag = attrs.tag?.text || [];
  const verticaCode = attrs.vertical_code?.text?.[0];
  
  console.log(`\nCore Attributes:`);
  console.log(`  Sellers: ${sellers.join(', ')}`);
  console.log(`  1P Stores: ${inv1p.length}`);
  console.log(`  Available at 3P: ${available3p}`);
  console.log(`  Tags: ${tag.length > 0 ? tag.join(', ') : 'NONE'}`);
  console.log(`  Vertical Code: ${verticaCode}`);
  
  // Check pattern
  const is1p = sellers.includes('1');
  const hasHighAvailability = inv1p.length > 100;
  const notAt3p = available3p === 'false';
  
  console.log(`\nQuick Badge Pattern Check:`);
  console.log(`  ✓ Is 1P (Seller 1): ${is1p ? '✅ YES' : '❌ NO'}`);
  console.log(`  ✓ High 1P Availability (>100): ${hasHighAvailability ? `✅ YES (${inv1p.length})` : '❌ NO'}`);
  console.log(`  ✓ Not Available at 3P: ${notAt3p ? '✅ YES' : '❌ NO'}`);
  
  const meetsQuickCriteria = is1p && hasHighAvailability && notAt3p;
  if (meetsQuickCriteria) {
    console.log(`\n  🟢 SHOULD HAVE QUICK BADGE`);
  } else {
    console.log(`\n  🔴 DOES NOT HAVE QUICK BADGE`);
    if (!is1p) console.log(`     ⚠️ Reason: Not sold by Seller 1`);
    if (!hasHighAvailability) console.log(`     ⚠️ Reason: Low 1P availability (${inv1p.length} stores)`);
    if (!notAt3p) console.log(`     ⚠️ Reason: Available from 3P sellers`);
  }
  
  // Show seller info
  const sellerNames = attrs.seller_names?.text || [];
  console.log(`\nSeller Information:`);
  console.log(`  Seller IDs: ${sellers.join(', ')}`);
  console.log(`  Seller Names: ${sellerNames.join(', ') || 'N/A'}`);
});

// Summary comparison
console.log(`\n\n${'='.repeat(70)}`);
console.log('SUMMARY COMPARISON');
console.log(`${'='.repeat(70)}\n`);

const quickProducts = foundProducts.filter(p => {
  const attrs = p.variant?.attributes || {};
  const sellers = attrs.seller_ids?.text || [];
  const inv1p = attrs.inv_stores_1p?.text || [];
  const available3p = attrs.available_at_3p_seller?.text?.[0];
  
  return sellers.includes('1') && inv1p.length > 100 && available3p === 'false';
});

const nonQuickProducts = foundProducts.filter(p => {
  const attrs = p.variant?.attributes || {};
  const sellers = attrs.seller_ids?.text || [];
  const inv1p = attrs.inv_stores_1p?.text || [];
  const available3p = attrs.available_at_3p_seller?.text?.[0];
  
  return !(sellers.includes('1') && inv1p.length > 100 && available3p === 'false');
});

console.log(`Products with Quick Badge Potential: ${quickProducts.length}`);
quickProducts.forEach(p => console.log(`  ✅ ${p.title.substring(0, 60)}`));

console.log(`\nProducts WITHOUT Quick Badge: ${nonQuickProducts.length}`);
nonQuickProducts.forEach(p => {
  const attrs = p.variant?.attributes || {};
  const sellers = attrs.seller_ids?.text || [];
  const inv1p = attrs.inv_stores_1p?.text || [];
  const available3p = attrs.available_at_3p_seller?.text?.[0];
  
  console.log(`  ❌ ${p.title.substring(0, 50)}`);
  if (!sellers.includes('1')) console.log(`     └─ Seller: ${sellers.join(',') || 'Other'}`);
  if (inv1p.length <= 100) console.log(`     └─ 1P Stores: ${inv1p.length}`);
  if (available3p !== 'false') console.log(`     └─ Available at 3P: Yes`);
});
