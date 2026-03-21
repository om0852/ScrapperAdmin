import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const anomaliesFile = path.join(__dirname, 'groups_different_baseids.json');
const anomalies = JSON.parse(fs.readFileSync(anomaliesFile, 'utf-8'));

console.log(`\n📊 SUMMARY: Groups with Different Base IDs for Same Platform\n`);
console.log(`${'='.repeat(100)}\n`);

anomalies.forEach((group, idx) => {
  console.log(`${idx + 1}. GROUP: "${group.groupName.toUpperCase()}"`);
  console.log(`   Platform: ${group.platform}`);
  console.log(`   Problem: Multiple Base IDs [${group.differentBaseIds.join(', ')}]\n`);

  // Group by base ID
  const byBaseId = {};
  group.products.forEach(prod => {
    const bid = prod.baseId;
    if (!byBaseId[bid]) {
      byBaseId[bid] = [];
    }
    byBaseId[bid].push(prod);
  });

  let bidIdx = 1;
  for (const [baseId, prods] of Object.entries(byBaseId)) {
    console.log(`   OPTION ${bidIdx}: Keep Base ID ${baseId}`);
    prods.forEach((prod, pidx) => {
      console.log(`      ${pidx + 1}. ${prod.productId}`);
      console.log(`         └─ Suffix: ${prod.suffix} | SubCat: ${prod.officialSubCategory}`);
    });
    console.log();
    bidIdx++;
  }

  console.log(`${'─'.repeat(100)}\n`);
});

console.log(`\n💡 RECOMMENDATION:`);
console.log(`   - Remove products with suffix "__all" (generic catch-all)`);
console.log(`   - Keep products with specific suffixes (more accurate categorization)\n`);
