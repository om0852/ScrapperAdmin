import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the JSON file
const filePath = path.join(__dirname, 'Zepto-Scrapper', 'categories_with_urls.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Find duplicates
const urlMap = new Map();
const duplicates = [];

// Iterate through all platforms
for (const [platform, categories] of Object.entries(data)) {
  if (Array.isArray(categories)) {
    categories.forEach((item, index) => {
      const url = item.url;
      if (urlMap.has(url)) {
        // This is a duplicate
        const existing = urlMap.get(url);
        duplicates.push({
          url: url,
          occurrences: [
            { platform: existing.platform, index: existing.index, category: existing.category },
            { platform: platform, index: index, category: item.officalCategory + ' > ' + item.officalSubCategory }
          ]
        });
        // Mark as duplicate to avoid re-adding same pair
        existing.isDuplicate = true;
      } else {
        urlMap.set(url, { platform, index, category: item.officalCategory + ' > ' + item.officalSubCategory, isDuplicate: false });
      }
    });
  }
}

console.log(`\n📊 DUPLICATE URLs FOUND: ${duplicates.length}\n`);
console.log('═'.repeat(120));

duplicates.forEach((dup, idx) => {
  console.log(`\n❌ DUPLICATE #${idx + 1}:`);
  console.log(`\nURL: ${dup.url}\n`);
  dup.occurrences.forEach((p, pIdx) => {
    console.log(`  Occurrence #${pIdx + 1}:`);
    console.log(`    Platform: ${p.platform} (Index: ${p.index})`);
    console.log(`    Category: ${p.category}`);
  });
  console.log('-'.repeat(120));
});

// Save detailed report
const reportPath = path.join(__dirname, 'DUPLICATE_URLS_REPORT.json');
fs.writeFileSync(reportPath, JSON.stringify(duplicates, null, 2));

// Create a summary
const summary = {};
for (const [platform, categories] of Object.entries(data)) {
  if (Array.isArray(categories)) {
    const platformDups = duplicates.filter(d => 
      d.occurrences.some(o => o.platform === platform)
    ).length;
    if (platformDups > 0) {
      summary[platform] = platformDups;
    }
  }
}

console.log(`\n\n📋 SUMMARY BY PLATFORM:`);
console.log('═'.repeat(120));
Object.entries(summary).forEach(([platform, count]) => {
  console.log(`${platform}: ${count} duplicate URL(s)`);
});

console.log(`\n✅ Detailed report saved to: DUPLICATE_URLS_REPORT.json`);
console.log(`\nTotal Duplicates: ${duplicates.length}`);
