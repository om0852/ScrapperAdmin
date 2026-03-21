import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const anomaliesPath = path.join(__dirname, 'group_anomalies.json');
const zeotoFilePath = path.join(__dirname, '12marchdata/10march/Fruits _ Vegetables/Zepto_201303_2026-03-10T12-50-09-575Z.json');

const anomalies = JSON.parse(fs.readFileSync(anomaliesPath, 'utf-8'));
const zeptoData = JSON.parse(fs.readFileSync(zeotoFilePath, 'utf-8'));

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function fixAnomalies() {
  console.log(`\n🔧 Group Anomalies Fixer`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total anomalies to review: ${anomalies.length}\n`);

  let fixed = 0;
  let skipped = 0;

  for (let i = 0; i < anomalies.length; i++) {
    const anomaly = anomalies[i];
    const { baseId, issues } = anomaly;

    console.log(`\n[${i + 1}/${anomalies.length}] Base ID: ${baseId}`);
    console.log(`Total Products in Group: ${anomaly.totalProductsInGroup}`);
    console.log(`Platform(s): ${anomaly.platformsWithDuplicates.join(', ')}`);

    for (const [platform, issue] of Object.entries(issues)) {
      console.log(`\n  📦 ${platform} (${issue.count} products):`);
      issue.products.forEach((prod, idx) => {
        console.log(`    ${idx + 1}. ${prod.productName}`);
        console.log(`       ID: ${prod.productId}`);
        console.log(`       Suffix: ${prod.suffix}`);
        console.log(`       SubCat: ${prod.officialSubCategory}`);
        console.log(`       Price: ${prod.price}`);
      });
    }

    console.log(`\n  Choose action:`);
    console.log(`  [1] Keep product with suffix '__all'`);
    console.log(`  [2] Keep product with specific suffix (enter suffix number)`);
    console.log(`  [3] View full details`);
    console.log(`  [Q] Skip this group\n`);

    let choice = '';
    while (!choice || (choice !== '1' && choice !== '2' && choice !== '3' && choice.toLowerCase() !== 'q')) {
      choice = await question('  Enter choice: ');
    }

    if (choice.toLowerCase() === 'q') {
      console.log('  ⏭️  Skipped');
      skipped++;
      continue;
    }

    if (choice === '3') {
      console.log('\n' + JSON.stringify(anomaly, null, 2));
      continue; // Repeat this anomaly
    }

    // Apply fix
    let suffixToKeep = null;
    if (choice === '1') {
      suffixToKeep = 'all';
    } else if (choice === '2') {
      // Get available suffixes
      const suffixes = [];
      for (const [platform, issue] of Object.entries(issues)) {
        suffixes.push(...issue.suffixes);
      }
      const uniqueSuffixes = [...new Set(suffixes)];
      console.log(`\n  Available suffixes: ${uniqueSuffixes.join(', ')}`);
      const suffixChoice = await question('  Enter suffix to keep: ');
      suffixToKeep = suffixChoice;
    }

    if (suffixToKeep) {
      // Find products to remove
      const productsToRemove = [];
      for (const [platform, issue] of Object.entries(issues)) {
        for (const prod of issue.products) {
          if (prod.suffix !== suffixToKeep) {
            productsToRemove.push(prod.productId);
          }
        }
      }

      // Remove from zeptoData.products
      const originalCount = zeptoData.products.length;
      zeptoData.products = zeptoData.products.filter(p => !productsToRemove.includes(p.productId));
      const removedCount = originalCount - zeptoData.products.length;

      console.log(`  ✅ Fixed! Removed ${removedCount} product(s), kept ${suffixToKeep}`);
      fixed++;
    }
  }

  // Save updated data
  if (fixed > 0) {
    fs.writeFileSync(zeotoFilePath, JSON.stringify(zeptoData, null, 2));
    console.log(`\n\n✅ Changes saved to Zepto file!`);
    console.log(`   Fixed: ${fixed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total products now: ${zeptoData.products.length}`);
  } else {
    console.log(`\n\n⏭️ No changes made.`);
  }

  rl.close();
}

fixAnomalies().catch(console.error);
