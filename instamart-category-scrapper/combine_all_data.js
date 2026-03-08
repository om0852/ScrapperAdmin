const fs = require('fs');
const path = require('path');

const dirPath = __dirname;
const files = fs.readdirSync(dirPath).filter(file => 
  file.startsWith('scraped_data_combined_') && file.endsWith('.json')
);

console.log(`Found ${files.length} files to combine`);

let combinedData = [];
let errors = [];

files.forEach((file, index) => {
  try {
    const filePath = path.join(dirPath, file);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(fileContent);
    
    if (Array.isArray(jsonData)) {
      combinedData = combinedData.concat(jsonData);
      console.log(`✓ ${file}: ${jsonData.length} items`);
    } else {
      console.log(`⚠ ${file}: Not an array, skipping`);
    }
  } catch (error) {
    console.error(`✗ Error processing ${file}:`, error.message);
    errors.push({ file, error: error.message });
  }
});

// Remove duplicates based on productUrl or categoryUrl
const uniqueData = [];
const seenUrls = new Set();

combinedData.forEach(item => {
  const url = item.productUrl || item.categoryUrl;
  if (url && !seenUrls.has(url)) {
    seenUrls.add(url);
    uniqueData.push(item);
  }
});

console.log(`\nCombined ${combinedData.length} total items`);
console.log(`After removing duplicates: ${uniqueData.length} unique items`);

// Write combined file
const outputFile = path.join(dirPath, 'all_instamart_data_combined.json');
fs.writeFileSync(outputFile, JSON.stringify(uniqueData, null, 2));

console.log(`\n✓ Combined data saved to: ${outputFile}`);
console.log(`File size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);

if (errors.length > 0) {
  console.log(`\nErrors encountered: ${errors.length}`);
  errors.forEach(err => console.log(`  - ${err.file}: ${err.error}`));
}
