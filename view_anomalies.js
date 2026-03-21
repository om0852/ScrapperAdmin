import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const anomaliesPath = path.join(__dirname, 'group_anomalies.json');
const anomalies = JSON.parse(fs.readFileSync(anomaliesPath, 'utf-8'));

console.log('📊 GROUP ANOMALIES SUMMARY\n');
console.log('=' .repeat(80));

anomalies.forEach((anomaly, idx) => {
  console.log(`\n${idx + 1}. Base ID: ${anomaly.baseId}`);
  console.log(`   Total Products: ${anomaly.totalProductsInGroup}`);
  
  for (const [platform, issue] of Object.entries(anomaly.issues)) {
    console.log(`\n   Platform: ${platform}`);
    console.log(`   Suffixes found: ${issue.suffixes.join(', ')}`);
    issue.products.forEach((prod, pidx) => {
      console.log(`     Product ${pidx + 1}:`);
      console.log(`       - Name: ${prod.productName}`);
      console.log(`       - Suffix: ${prod.suffix}`);
      console.log(`       - SubCategory: ${prod.officialSubCategory}`);
      console.log(`       - Price: ${prod.price || 'N/A'}`);
    });
  }
  
  if ((idx + 1) % 10 === 0) {
    console.log('\n' + '-'.repeat(80));
  }
});

console.log('\n' + '='.repeat(80));
console.log(`\nTotal anomalies: ${anomalies.length}`);
console.log('Recommendation: Keep products with suffix that best matches officialSubCategory');
