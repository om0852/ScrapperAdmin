import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const missingFile = path.join(__dirname, 'missing_products_at_dates.json');
const groupingsFile = path.join(__dirname, 'problematic_groupings_fruits_vegetables.json');

const missing = JSON.parse(fs.readFileSync(missingFile, 'utf-8'));
const groupings = JSON.parse(fs.readFileSync(groupingsFile, 'utf-8'));

// Create a set of productIds to remove (missing at both dates)
const productsToRemove = new Set(
  missing.missingAtBothDates.map(item => item.productId)
);

console.log(`🗑️ Removing ${productsToRemove.size} products missing at both dates...\n`);

let totalGroupsUpdated = 0;
let totalProductsRemoved = 0;
let groupsFullyEmptied = 0;

// Process each grouping
const updatedGroupings = groupings.map((grouping, idx) => {
  let productsRemoved = 0;
  let groupWasModified = false;

  // Update each platform's products
  for (const [platform, issue] of Object.entries(grouping.issues)) {
    const originalCount = issue.products.length;
    
    // Filter out products that are missing at both dates
    issue.products = issue.products.filter(product => {
      const shouldKeep = !productsToRemove.has(product.productId);
      if (!shouldKeep) {
        productsRemoved++;
        totalProductsRemoved++;
        groupWasModified = true;
      }
      return shouldKeep;
    });

    if (issue.products.length === 0) {
      // Remove this platform entry if no products left
      delete grouping.issues[platform];
    }
  }

  // If group was modified, update totalProducts count
  if (groupWasModified) {
    // Recalculate totalProducts
    let newTotalProducts = 0;
    for (const issue of Object.values(grouping.issues)) {
      newTotalProducts += issue.products.length;
    }
    
    const oldTotal = grouping.totalProducts;
    grouping.totalProducts = newTotalProducts;
    
    totalGroupsUpdated++;
    
    // If group has no products left, mark it
    if (newTotalProducts === 0) {
      groupsFullyEmptied++;
      console.log(`❌ Group "${grouping.primaryName}" - FULLY EMPTIED (had ${oldTotal} products)`);
    } else if (newTotalProducts < oldTotal) {
      console.log(`✏️ Group "${grouping.primaryName}" - ${oldTotal} → ${newTotalProducts} products (removed ${productsRemoved})`);
    }
  }

  return grouping;
});

// Filter out fully emptied groups
const finalGroupings = updatedGroupings.filter(g => g.totalProducts > 0);

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
console.log(`📊 CLEANING SUMMARY:\n`);
console.log(`   Groups modified: ${totalGroupsUpdated}`);
console.log(`   Groups fully emptied: ${groupsFullyEmptied}`);
console.log(`   Groups remaining: ${finalGroupings.length}`);
console.log(`   Total products removed: ${totalProductsRemoved}`);
console.log(`\n`);

// Save the updated groupings
const outputPath = path.join(__dirname, 'problematic_groupings_fruits_vegetables_cleaned.json');
fs.writeFileSync(outputPath, JSON.stringify(finalGroupings, null, 2));

console.log(`✅ Cleaned groupings saved to: problematic_groupings_fruits_vegetables_cleaned.json\n`);

// Calculate updated statistics
const stats = {
  originalCount: groupings.length,
  finalCount: finalGroupings.length,
  groupsRemoved: groupings.length - finalGroupings.length,
  productsRemoved: totalProductsRemoved,
  platformBreakdown: {}
};

// Platform breakdown
for (const grouping of finalGroupings) {
  for (const platform of Object.keys(grouping.issues)) {
    if (!stats.platformBreakdown[platform]) {
      stats.platformBreakdown[platform] = 0;
    }
    stats.platformBreakdown[platform] += grouping.issues[platform].products.length;
  }
}

console.log(`📈 UPDATED STATISTICS:\n`);
console.log(`   Original groupings: ${stats.originalCount}`);
console.log(`   After cleaning: ${stats.finalCount}`);
console.log(`   Groupings removed (fully emptied): ${stats.groupsRemoved}\n`);
console.log(`   Products by platform (after cleaning):`);
for (const [platform, count] of Object.entries(stats.platformBreakdown)) {
  console.log(`      ${platform}: ${count}`);
}

// Save stats
const statsPath = path.join(__dirname, 'cleaning_stats.json');
fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));

console.log(`\n✅ Statistics saved to: cleaning_stats.json\n`);
