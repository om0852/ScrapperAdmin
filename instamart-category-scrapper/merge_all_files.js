const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.startsWith('scraped_data_combined_') && f.endsWith('.json'));

console.log(`Found ${files.length} files to combine`);

let combinedData = [];

files.forEach((file, index) => {
  try {
    const filePath = path.join(dir, file);
    const fileSize = fs.statSync(filePath).size / 1024 / 1024; // Size in MB
    console.log(`[${index + 1}/${files.length}] Processing: ${file} (${fileSize.toFixed(2)} MB)`);
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (Array.isArray(data)) {
      combinedData = combinedData.concat(data);
      console.log(`  Added ${data.length} items`);
    } else {
      console.log(`  File is not an array, skipping`);
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
  }
});

const outputFile = path.join(dir, `instamart_all_combined_${Date.now()}.json`);
fs.writeFileSync(outputFile, JSON.stringify(combinedData, null, 2));

console.log(`\nSuccess! Combined ${combinedData.length} items into: ${path.basename(outputFile)}`);
console.log(`File size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);
