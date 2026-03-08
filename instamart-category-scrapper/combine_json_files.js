const fs = require('fs');
const path = require('path');

const filePaths = [
    'scraped_data_combined_122008_1770492664306.json',
    'scraped_data_combined_122008_1770492819455.json',
    'scraped_data_combined_122010_1770493286415.json',
    'scraped_data_combined_122010_1770493406031.json',
    'scraped_data_combined_122016_1770492997914.json',
    'scraped_data_combined_122016_1770493104793.json',
    'scraped_data_combined_201014_1770492198232.json',
    'scraped_data_combined_201014_1770492294722.json',
    'scraped_data_combined_201303_1770492059163.json',
    'scraped_data_combined_201303_1770492145313.json',
    'scraped_data_combined_400070_1770493592270.json',
    'scraped_data_combined_400070_1770493703038.json',
    'scraped_data_combined_400703_1770519500830.json',
    'scraped_data_combined_400703_1770519620998.json',
    'scraped_data_combined_400706_1770519913471.json',
    'scraped_data_combined_400706_1770519997944.json',
    'scraped_data_combined_401202_1770520341930.json',
    'scraped_data_combined_401202_1770520413156.json'
];

const outputFile = 'combined_data_all.json';
let combinedData = [];

filePaths.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(data);
            if (Array.isArray(jsonData)) {
                combinedData = combinedData.concat(jsonData);
                console.log(`Successfully added data from ${file}. Current count: ${combinedData.length}`);
            } else {
                console.warn(`Skipping ${file}: Content is not an array.`);
            }
        } catch (err) {
            console.error(`Error reading ${file}: ${err.message}`);
        }
    } else {
        console.warn(`File not found: ${file}`);
    }
});

fs.writeFileSync(path.join(__dirname, outputFile), JSON.stringify(combinedData, null, 2));
console.log(`\nCombined data written to ${outputFile}`);
console.log(`Total records: ${combinedData.length}`);
