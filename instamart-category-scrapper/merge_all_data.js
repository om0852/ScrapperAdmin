const fs = require('fs');
const path = require('path');

// Get all scraped_data_combined_*.json files
const dir = __dirname;
const files = fs.readdirSync(dir)
    .filter(file => file.startsWith('scraped_data_combined_') && file.endsWith('.json'))
    .sort();

console.log(`Found ${files.length} files to merge`);

let allData = [];
let mergeStats = {
    totalFiles: files.length,
    totalRecords: 0,
    filesProcessed: 0,
    errors: []
};

files.forEach(file => {
    try {
        const filePath = path.join(dir, file);
        const fileSize = fs.statSync(filePath).size;
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        
        // Handle both array and single object
        const records = Array.isArray(data) ? data : [data];
        
        allData = allData.concat(records);
        mergeStats.filesProcessed++;
        mergeStats.totalRecords += records.length;
        
        console.log(`✓ ${file} - ${records.length} records (${(fileSize / 1024).toFixed(2)} KB)`);
    } catch (error) {
        mergeStats.errors.push({
            file: file,
            error: error.message
        });
        console.error(`✗ Error reading ${file}:`, error.message);
    }
});

// Write merged data to new file
const outputFile = path.join(dir, 'merged_all_instamart_data.json');
fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2), 'utf8');

console.log('\n=== Merge Summary ===');
console.log(`Total records merged: ${mergeStats.totalRecords}`);
console.log(`Files processed: ${mergeStats.filesProcessed}/${mergeStats.totalFiles}`);
console.log(`Output file: ${outputFile}`);
console.log(`Output size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);

if (mergeStats.errors.length > 0) {
    console.log(`\nErrors encountered: ${mergeStats.errors.length}`);
    mergeStats.errors.forEach(err => {
        console.log(`  - ${err.file}: ${err.error}`);
    });
}
