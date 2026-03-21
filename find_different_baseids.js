import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the Zepto JSON file
const filePath = path.join(__dirname, '12marchdata/10march/Fruits _ Vegetables/Zepto_201303_2026-03-10T12-50-09-575Z.json');
const fileContent = fs.readFileSync(filePath, 'utf-8');
const data = JSON.parse(fileContent);

const products = data.products || [];

console.log(`Total products: ${products.length}\n`);

// Helper function to extract base ID
function getBaseId(productId) {
  if (!productId) return '';
  return String(productId).replace(/__.*$/, '');
}

// Helper function to extract suffix
function getSuffix(productId) {
  if (!productId) return '';
  const match = String(productId).match(/__(.+)$/);
  return match ? match[1] : '';
}

// Group by product name (treating same name as same group)
const groupsByName = {};
for (const prod of products) {
  const name = prod.productName || 'Unknown';
  if (!groupsByName[name]) {
    groupsByName[name] = [];
  }
  groupsByName[name].push(prod);
}

console.log(`Total unique product names: ${Object.keys(groupsByName).length}\n`);

// Find groups where same platform has different base IDs
const problematicGroups = [];

for (const [productName, prods] of Object.entries(groupsByName)) {
  if (prods.length < 2) continue; // Skip single products

  // Group by platform
  const byPlatform = {};
  for (const prod of prods) {
    const platform = prod.platform || 'unknown';
    if (!byPlatform[platform]) {
      byPlatform[platform] = [];
    }
    byPlatform[platform].push(prod);
  }

  // Check each platform for different base IDs
  for (const [platform, platformProds] of Object.entries(byPlatform)) {
    const baseIds = new Set(platformProds.map(p => getBaseId(p.productId)));
    
    // If same platform has different base IDs = PROBLEM!
    if (baseIds.size > 1) {
      problematicGroups.push({
        groupName: productName,
        platform: platform,
        differentBaseIds: Array.from(baseIds),
        totalProductsInGroup: platformProds.length,
        products: platformProds.map(p => ({
          productId: p.productId,
          baseId: getBaseId(p.productId),
          suffix: getSuffix(p.productId),
          officialCategory: p.officialCategory,
          officialSubCategory: p.officialSubCategory,
          price: p.price || 'N/A'
        }))
      });
    }
  }
}

console.log(`⚠️  Found ${problematicGroups.length} problematic groups WITH DIFFERENT BASE IDs FOR SAME PLATFORM\n`);

// Write to JSON file
const outputPath = path.join(__dirname, 'groups_different_baseids.json');
fs.writeFileSync(outputPath, JSON.stringify(problematicGroups, null, 2));

console.log(`✅ Saved to: groups_different_baseids.json\n`);

// Display first 5
console.log('First 5 examples:\n');
problematicGroups.slice(0, 5).forEach((group, idx) => {
  console.log(`${idx + 1}. "${group.groupName}"`);
  console.log(`   Platform: ${group.platform}`);
  console.log(`   Different Base IDs: ${group.differentBaseIds.join(', ')}`);
  console.log(`   Total Products: ${group.totalProductsInGroup}`);
  group.products.forEach((prod, pidx) => {
    console.log(`     Product ${pidx + 1}: ID=${prod.productId}`);
    console.log(`                Base=${prod.baseId}, Suffix=${prod.suffix}`);
  });
  console.log();
});

console.log(`\nTotal problematic groups: ${problematicGroups.length}`);
