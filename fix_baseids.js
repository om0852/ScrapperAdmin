import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const anomaliesFile = path.join(__dirname, 'groups_different_baseids.json');
const zeptoFile = path.join(__dirname, '12marchdata/10march/Fruits _ Vegetables/Zepto_201303_2026-03-10T12-50-09-575Z.json');

const anomalies = JSON.parse(fs.readFileSync(anomaliesFile, 'utf-8'));
let zeptoData = JSON.parse(fs.readFileSync(zeptoFile, 'utf-8'));

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function fixGroups() {
  console.log(`\n🔧 FIX GROUPS WITH DIFFERENT BASE IDs`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total groups to fix: ${anomalies.length}\n`);

  let fixed = 0;
  let skipped = 0;

  for (let i = 0; i < anomalies.length; i++) {
    const anomaly = anomalies[i];
    const { groupName, platform, differentBaseIds, products } = anomaly;

    console.log(`\n[${i + 1}/${anomalies.length}] Group: "${groupName}"`);
    console.log(`Platform: ${platform}`);
    console.log(`Different Base IDs: ${differentBaseIds.join(', ')}`);
    console.log(`Total Products: ${products.length}\n`);

    // Display products by base ID
    const byBaseId = {};
    products.forEach(prod => {
      const bid = prod.baseId;
      if (!byBaseId[bid]) {
        byBaseId[bid] = [];
      }
      byBaseId[bid].push(prod);
    });

    let prodIdx = 1;
    const baseIdMap = {};
    for (const [baseId, prods] of Object.entries(byBaseId)) {
      baseIdMap[prodIdx] = baseId;
      console.log(`[${prodIdx}] Base ID: ${baseId}`);
      prods.forEach((prod, idx) => {
        console.log(`    ${idx + 1}. ${prod.productId}`);
        console.log(`       Suffix: ${prod.suffix}`);
        console.log(`       SubCategory: ${prod.officialSubCategory}`);
      });
      prodIdx++;
    }

    console.log(`\nChoose which Base ID group to KEEP (others will be DELETED):`);
    console.log(`[1-${Object.keys(byBaseId).length}] Keep Base ID number`);
    console.log(`[S] Skip this group\n`);

    let choice = '';
    while (!choice || (isNaN(choice) && choice.toLowerCase() !== 's')) {
      choice = await question('Enter choice: ');
    }

    if (choice.toLowerCase() === 's') {
      console.log('⏭️  Skipped');
      skipped++;
      continue;
    }

    const baseIdChoice = baseIdMap[parseInt(choice)];
    if (!baseIdChoice) {
      console.log('❌ Invalid choice');
      continue;
    }

    // Find products to remove
    const productsToRemove = products
      .filter(p => p.baseId !== baseIdChoice)
      .map(p => p.productId);

    // Remove from zeptoData
    const originalCount = zeptoData.products.length;
    zeptoData.products = zeptoData.products.filter(
      p => !productsToRemove.includes(p.productId)
    );
    const removedCount = originalCount - zeptoData.products.length;

    console.log(`✅ FIXED! Removed ${removedCount} product(s)`);
    console.log(`   Kept Base ID: ${baseIdChoice}`);
    fixed++;
  }

  // Save if changes made
  if (fixed > 0) {
    fs.writeFileSync(zeptoFile, JSON.stringify(zeptoData, null, 2));
    console.log(`\n\n✅ CHANGES SAVED!`);
    console.log(`   Fixed: ${fixed} groups`);
    console.log(`   Skipped: ${skipped} groups`);
    console.log(`   Total products now: ${zeptoData.products.length}`);
  } else {
    console.log(`\n\n⏭️ No groups fixed.`);
  }

  rl.close();
}

fixGroups().catch(console.error);
