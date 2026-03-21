import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const problematicFile = path.join(__dirname, 'problematic_groupings_db.json');
const problematic = JSON.parse(fs.readFileSync(problematicFile, 'utf-8'));

// Filter only Fruits & Vegetables category
const fruitsVeggies = problematic.filter(g => 
  g.category && g.category.toLowerCase() === 'fruits & vegetables'
);

console.log(`\n📊 PROBLEMATIC GROUPINGS - FRUITS & VEGETABLES CATEGORY ONLY\n`);
console.log(`${'='.repeat(120)}\n`);

console.log(`✅ Found ${fruitsVeggies.length} problematic groupings in "Fruits & Vegetables" category\n`);

if (fruitsVeggies.length === 0) {
  console.log('No problematic groupings found in this category.');
  process.exit(0);
}

// Analyze by platform
const byPlatform = {};
fruitsVeggies.forEach(group => {
  for (const [platform, issue] of Object.entries(group.issues)) {
    if (!byPlatform[platform]) {
      byPlatform[platform] = 0;
    }
    byPlatform[platform]++;
  }
});

console.log(`📈 BREAKDOWN BY PLATFORM:\n`);
for (const [platform, count] of Object.entries(byPlatform)) {
  console.log(`  ${platform.toUpperCase()}: ${count} groupings`);
}

// Analyze by number of different base IDs
const byBaseIdCount = {};
fruitsVeggies.forEach(group => {
  for (const [platform, issue] of Object.entries(group.issues)) {
    const count = issue.differentBaseIds.length;
    if (!byBaseIdCount[count]) {
      byBaseIdCount[count] = 0;
    }
    byBaseIdCount[count]++;
  }
});

console.log(`\n💔 DISTRIBUTION BY NUMBER OF DIFFERENT BASE IDs:\n`);
for (let i = 2; i <= 10; i++) {
  if (byBaseIdCount[i]) {
    console.log(`  ${i} different base IDs: ${byBaseIdCount[i]} groupings`);
  }
}

// Show all groupings in detail
console.log(`\n\n📝 ALL PROBLEMATIC GROUPINGS IN "FRUITS & VEGETABLES":\n`);
console.log(`${'='.repeat(120)}\n`);

fruitsVeggies.forEach((group, idx) => {
  console.log(`${idx + 1}. "${group.primaryName}"`);
  console.log(`   Grouping ID: ${group.groupingId}`);
  console.log(`   Total Products: ${group.totalProducts}`);
  
  for (const [platform, issue] of Object.entries(group.issues)) {
    console.log(`   Platform: ${platform.toUpperCase()}`);
    console.log(`     Different Base IDs: ${issue.differentBaseIds.join(', ')}`);
    console.log(`     Products in group: ${issue.productCount}`);
    issue.products.forEach((prod, pidx) => {
      console.log(`       ${pidx + 1}. ${prod.productId}`);
      console.log(`          Base ID: ${prod.baseId}`);
    });
  }
  console.log();
});

// Save to separate JSON file
const outputPath = path.join(__dirname, 'problematic_groupings_fruits_vegetables.json');
fs.writeFileSync(outputPath, JSON.stringify(fruitsVeggies, null, 2));

console.log(`${'='.repeat(120)}\n`);
console.log(`✅ Saved to: problematic_groupings_fruits_vegetables.json\n`);
