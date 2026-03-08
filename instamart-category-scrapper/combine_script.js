const fs = require('fs');
const path = require('path');

const fileNames = [
    "scraped_data_combined_400706_1769151484975.json",
    "scraped_data_combined_400706_1769151516849.json"
];

const outputFileName = 'final_combined_400706.json';
const outputFilePath = path.join(__dirname, outputFileName);
let combinedData = [];

fileNames.forEach(fileName => {
    const filePath = path.join(__dirname, fileName);
    if (fs.existsSync(filePath)) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            if (data.trim()) {
                const parsedData = JSON.parse(data);
                if (Array.isArray(parsedData)) {
                    combinedData = combinedData.concat(parsedData);
                    console.log(`Loaded ${parsedData.length} items from ${fileName}`);
                } else {
                    console.error(`File content is not an array: ${fileName}`);
                }
            } else {
                console.log(`File is empty: ${fileName}`);
            }
        } catch (error) {
            console.error(`Error reading/parsing file ${fileName}:`, error.message);
        }
    } else {
        console.error(`File not found: ${fileName}`);
    }
});

fs.writeFileSync(outputFilePath, JSON.stringify(combinedData, null, 2));
console.log(`Successfully combined ${combinedData.length} items into ${outputFilePath}`);
