const fs = require('fs');
const path = require('path');

// Get all scraped_data_combined_*.json files from current directory
const dirPath = __dirname;
const files = fs.readdirSync(dirPath)
  .filter(file => file.match(/^scraped_data_combined_\d+_\d+\.json$/))
  .sort();

console.log(`Found ${files.length} files to merge...\n`);

let mergedData = [];
const seenIds = new Set();
let successCount = 0;
let errorCount = 0;

files.forEach(file => {
  const filePath = path.join(dirPath, file);
  try {
    const fileSize = fs.statSync(filePath).size / 1024; // KB
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (Array.isArray(data)) {
      const beforeCount = mergedData.length;
      
      data.forEach(item => {
        // Use productId for deduplication if available, otherwise use productUrl
        const uniqueKey = item.productId || item.productUrl;
        if (uniqueKey && !seenIds.has(uniqueKey)) {
          mergedData.push(item);
          seenIds.add(uniqueKey);
        }
      });
      
      const addedCount = mergedData.length - beforeCount;
      console.log(`✓ ${file} (${fileSize.toFixed(2)} KB) - Added ${addedCount} items`);
      successCount++;
    } else {
      console.log(`⚠ ${file} - Invalid format (not an array)`);
      errorCount++;
    }
  } catch (error) {
    console.error(`✗ ${file} - ${error.message}`);
    errorCount++;
  }
});

// Save merged data
const outputFile = path.join(dirPath, `instamart_all_pincodes_merged_${Date.now()}.json`);
fs.writeFileSync(outputFile, JSON.stringify(mergedData, null, 2));

console.log(`\n========== MERGE SUMMARY ==========`);
console.log(`Files processed: ${successCount}`);
console.log(`Files with errors: ${errorCount}`);
console.log(`Total unique items: ${mergedData.length}`);
console.log(`Output file: ${path.basename(outputFile)}`);
console.log(`File size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);
