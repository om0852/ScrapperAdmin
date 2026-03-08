const fs = require('fs');
const path = require('path');

const baseDir = __dirname;
const outputFileName = 'combined_results_all.json';
const outputFile = path.join(baseDir, outputFileName);

const filesToCombine = [
    'scraped_data_combined_122008_1770097312494.json',
    'scraped_data_combined_122008_1770097512019.json',
    'scraped_data_combined_122010_1770110609902.json',
    'scraped_data_combined_122010_1770110775055.json',
    'scraped_data_combined_122016_1770111551934.json',
    'scraped_data_combined_122016_1770111758331.json',
    'scraped_data_combined_201014_1770096338265.json',
    'scraped_data_combined_201014_1770096565340.json',
    'scraped_data_combined_201014_1770096636222.json',
    'scraped_data_combined_201014_1770096769489.json',
    'scraped_data_combined_201303_1770098834457.json',
    'scraped_data_combined_201303_1770099035037.json',
    'scraped_data_combined_400070_1770099197618.json',
    'scraped_data_combined_400070_1770099434499.json',
    'scraped_data_combined_400703_1770104413407.json',
    'scraped_data_combined_400703_1770104583819.json',
    'scraped_data_combined_400703_1770110394385.json',
    'scraped_data_combined_400703_1770110556753.json',
    'scraped_data_combined_400706_1770104091189.json',
    'scraped_data_combined_400706_1770104325795.json',
    'scraped_data_combined_401202_1770095262170.json',
    'scraped_data_combined_401202_1770095314056.json',
    'scraped_data_combined_401202_1770095546760.json',
    'scraped_data_combined_401202_1770095776869.json',
    'scraped_data_combined_401202_1770096030040.json'
];

let allData = [];

console.log('Starting file combination...');

filesToCombine.forEach(fileName => {
    const filePath = path.join(baseDir, fileName);
    if (fs.existsSync(filePath)) {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(fileContent);
            if (Array.isArray(jsonData)) {
                allData = allData.concat(jsonData);
                console.log(`Processed ${fileName}: ${jsonData.length} records`);
            } else {
                console.warn(`Skipping ${fileName}: Content is not an array`);
            }
        } catch (error) {
            console.error(`Error reading ${fileName}:`, error.message);
        }
    } else {
        console.error(`File not found: ${fileName}`);
    }
});

fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2), 'utf8');

console.log(`Successfully combined ${allData.length} records into ${outputFileName}`);
