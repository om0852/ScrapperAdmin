/**
 * Diagnostic: Check categories_with_urls.json for missing mappings
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mappingFile = path.join(__dirname, 'categories_with_urls.json');
const data = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));

const instamartMappings = data.Instamart || [];

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  🔍 DIAGNOSTIC: Categories in categories_with_urls.json   ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// Extract all unique categoryNames
const categoryNames = new Set();

instamartMappings.forEach(entry => {
  if (entry.url) {
    try {
      const urlParams = new URLSearchParams(entry.url.split('?')[1] || '');
      const categoryName = urlParams.get('categoryName');
      if (categoryName) {
        categoryNames.add(decodeURIComponent(categoryName));
      }
    } catch (e) {
      // skip
    }
  }
});

console.log(`📊 Total entries in Instamart: ${instamartMappings.length}`);
console.log(`📚 Unique categoryNames found: ${categoryNames.size}\n`);

console.log('All categoryNames in JSON:\n');
const sorted = Array.from(categoryNames).sort();
sorted.forEach((name, i) => {
  console.log(`   ${i + 1}. ${name}`);
});

console.log('\n\n🔎 Searching for specific categories:\n');

const searchFor = ['Cereals and Breakfast', 'Coffee', 'Tea', 'Chocolates', 'Biscuits'];

searchFor.forEach(search => {
  const found = sorted.filter(name => name.toLowerCase().includes(search.toLowerCase()));
  if (found.length > 0) {
    console.log(`✅ "${search}" found:\n   ${found.join('\n   ')}\n`);
  } else {
    console.log(`❌ "${search}" NOT found in JSON\n`);
  }
});

console.log('\n📝 If categories not found, add them to categories_with_urls.json');
console.log('with proper masterCategory mappings.\n');
