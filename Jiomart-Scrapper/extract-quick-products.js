import fs from 'fs';

/**
 * EXTRACT PRODUCTS WITH "QUICK" BADGE
 * Based on discovered pattern:
 * - Seller ID = "1" (JioMart 1P)
 * - High 1P store availability
 * - Not available from 3P
 */

export const extractQuickProducts = (dumpFilePath) => {
  const dumpData = JSON.parse(fs.readFileSync(dumpFilePath, 'utf8'));
  const quickProducts = [];
  
  dumpData.responses.forEach((response) => {
    const results = response.response?.results || [];
    
    results.forEach((item) => {
      const variant = item.product?.variants?.[0];
      if (!variant) return;
      
      const attrs = variant.attributes;
      const sellers = attrs.seller_ids?.text || [];
      const inv1p = attrs.inv_stores_1p?.text || [];
      const available3p = attrs.available_at_3p_seller?.text?.[0];
      
      // Check if product meets "Quick" criteria
      const is1p = sellers.includes('1');
      const has1pAvailability = inv1p.length > 100; // High availability threshold
      const notAvailableAt3p = available3p === 'false';
      
      if (is1p && has1pAvailability && notAvailableAt3p) {
        quickProducts.push({
          productId: item.id,
          title: item.product?.title,
          sellers: sellers,
          inv1pStores: inv1p.length,
          available3p: available3p,
          brand: variant.brands?.[0],
          category: item.product?.categories?.[0],
          url: variant.uri,
          hasQuickBadge: true,
          badgeType: 'Quick'
        });
      }
    });
  });
  
  return quickProducts;
};

/**
 * BATCH PROCESS ALL DUMPS
 */
export const processAllDumpsForQuickProducts = (dumpDir) => {
  const files = fs.readdirSync(dumpDir).filter(f => f.endsWith('.json'));
  
  let totalQuickProducts = 0;
  const allQuickProducts = [];
  
  files.forEach((file) => {
    const filePath = `${dumpDir}/${file}`;
    const quickInThisFile = extractQuickProducts(filePath);
    totalQuickProducts += quickInThisFile.length;
    allQuickProducts.push(...quickInThisFile);
  });
  
  return {
    summary: {
      totalFiles: files.length,
      totalQuickProducts: totalQuickProducts,
      averagePerFile: (totalQuickProducts / files.length).toFixed(0)
    },
    products: allQuickProducts
  };
};

/**
 * USAGE EXAMPLE
 */
const results = processAllDumpsForQuickProducts('./api_dumps');

console.log('\n=== QUICK PRODUCTS EXTRACTION RESULTS ===\n');
console.log(`Total Quick Products: ${results.summary.totalQuickProducts}`);
console.log(`Average per dump: ${results.summary.averagePerFile}`);

console.log('\n=== SAMPLE QUICK PRODUCTS ===\n');
results.products.slice(0, 10).forEach((p, idx) => {
  console.log(`${idx + 1}. ${p.title}`);
  console.log(`   ID: ${p.productId}`);
  console.log(`   1P Stores: ${p.inv1pStores}`);
  console.log(`   Badge: ${p.badgeType}`);
  console.log();
});

console.log(`... and ${results.products.length - 10} more products\n`);

// Save complete results
fs.writeFileSync(
  'quick-products-extracted.json',
  JSON.stringify(results, null, 2)
);

console.log('✓ Saved to: quick-products-extracted.json');

export default {
  extractQuickProducts,
  processAllDumpsForQuickProducts
};
