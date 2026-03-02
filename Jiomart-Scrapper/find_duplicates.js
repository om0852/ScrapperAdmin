const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'run_bulk_scrape.js');

// Read the file and extract the allUrls array
const fileContent = fs.readFileSync(OUTPUT_FILE, 'utf8');

// Find the allUrls array
const arrayStart = fileContent.indexOf('const allUrls = [');
const arrayEnd = fileContent.indexOf('];', arrayStart) + 2;
const arrayContent = fileContent.substring(arrayStart, arrayEnd);

// Parse URLs from the array
const urlPattern = /"(https:\/\/[^"]+)"/g;
const allUrls = [];
let match;

while ((match = urlPattern.exec(arrayContent)) !== null) {
    allUrls.push(match[1]);
}

console.log(`📊 Total URLs in array: ${allUrls.length}`);
console.log(`\n🔍 Finding duplicates...\n`);

// Find duplicates
const urlCounts = {};
const duplicates = new Set();

allUrls.forEach(url => {
    urlCounts[url] = (urlCounts[url] || 0) + 1;
    if (urlCounts[url] > 1) {
        duplicates.add(url);
    }
});

console.log(`🎯 Duplicate URLs found: ${duplicates.size}\n`);

duplicates.forEach(url => {
    console.log(`❌ DUPLICATE (${urlCounts[url]} times):`);
    console.log(`   ${url}\n`);
});

if (duplicates.size === 0) {
    console.log('✓ No duplicates found');
}

// Summary
const uniqueUrls = new Set(allUrls);
console.log(`\n📈 SUMMARY:`);
console.log(`  Total URLs: ${allUrls.length}`);
console.log(`  Unique URLs: ${uniqueUrls.size}`);
console.log(`  Duplicates: ${allUrls.length - uniqueUrls.size}`);
