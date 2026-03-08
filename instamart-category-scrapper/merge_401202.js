const fs = require('fs');
const path = require('path');

// Files to merge
const files = [
  'scraped_data_combined_401202_1769572468180.json',
  'scraped_data_combined_401202_1769572554871.json',
  'scraped_data_combined_401202_1769573666270.json',
  'scraped_data_combined_401202_1769573879380.json'
];

let mergedData = [];
const seenIds = new Set();

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`Processing ${file}...`);
    
    data.forEach(product => {
      // Avoid duplicate products
      if (!seenIds.has(product.productId)) {
        mergedData.push(product);
        seenIds.add(product.productId);
      }
    });
    
    console.log(`Added ${data.length} products from ${file}`);
  }
});

// Save merged data
const outputFile = path.join(__dirname, 'scraped_data_combined_401202_merged.json');
fs.writeFileSync(outputFile, JSON.stringify(mergedData, null, 2));

console.log(`\nMerge complete!`);
console.log(`Total unique products: ${mergedData.length}`);
console.log(`Saved to: ${outputFile}`);
