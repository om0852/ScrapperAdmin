import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the report
const reportPath = path.join(__dirname, 'DUPLICATE_URLS_REPORT.json');
const duplicates = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

console.log('\n' + '═'.repeat(140));
console.log('📋 DUPLICATE URLS SUMMARY - Zepto-Scrapper/categories_with_urls.json');
console.log('═'.repeat(140));

console.log(`\n📊 Total Duplicate URLs: ${duplicates.length}\n`);

// Group by category
const groupByCategory = {};
duplicates.forEach(dup => {
  const cat1 = dup.occurrences[0].category;
  const cat2 = dup.occurrences[1].category;
  const key = [cat1, cat2].sort().join(' <-> ');
  if (!groupByCategory[key]) {
    groupByCategory[key] = [];
  }
  groupByCategory[key].push(dup);
});

console.log(`📂 Grouped by Category Combination: ${Object.keys(groupByCategory).length} unique combinations\n`);

Object.entries(groupByCategory).forEach(([combo, dups], idx) => {
  console.log(`\n${idx + 1}. Categories: ${combo}`);
  console.log(`   Duplicate URLs: ${dups.length}`);
});

// Create a CSV for easy analysis
let csvContent = 'Duplicate #,Category 1,Category 2,URL\n';
duplicates.forEach((dup, idx) => {
  const cat1 = dup.occurrences[0].category;
  const cat2 = dup.occurrences[1].category;
  const url = dup.url;
  csvContent += `${idx + 1},"${cat1}","${cat2}","${url}"\n`;
});

const csvPath = path.join(__dirname, 'DUPLICATE_URLS_LIST.csv');
fs.writeFileSync(csvPath, csvContent);

console.log(`\n\n✅ Files Generated:`);
console.log(`   1. DUPLICATE_URLS_REPORT.json (Full detailed report)`);
console.log(`   2. DUPLICATE_URLS_LIST.csv (Easy-to-review CSV format)`);
console.log(`\n` + '═'.repeat(140) + '\n');
