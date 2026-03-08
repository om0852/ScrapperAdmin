const fs = require('fs');
const path = require('path');

const fileList = [
    "scraped_data_combined_122008_1770888097779.json",
    "scraped_data_combined_122008_1770888350802.json",
    "scraped_data_combined_122010_1770888924008.json",
    "scraped_data_combined_122010_1770889416735.json",
    "scraped_data_combined_122016_1770888561698.json",
    "scraped_data_combined_122016_1770888787064.json",
    "scraped_data_combined_201014_1770887853379.json",
    "scraped_data_combined_201014_1770888064226.json",
    "scraped_data_combined_201303_1770887230353.json",
    "scraped_data_combined_201303_1770887436226.json",
    "scraped_data_combined_400070_1770889425688.json",
    "scraped_data_combined_400070_1770889662578.json",
    "scraped_data_combined_400703_1770889674833.json",
    "scraped_data_combined_400703_1770889788948.json",
    "scraped_data_combined_400706_1770889835202.json",
    "scraped_data_combined_400706_1770890061465.json",
    "scraped_data_combined_401101_1770890516129.json",
    "scraped_data_combined_401101_1770890645083.json",
    "scraped_data_combined_401202_1770890124325.json",
    "scraped_data_combined_401202_1770890275490.json",
    "scraped_data_combined_401202_1770890282329.json",
    "scraped_data_combined_401202_1770890424898.json"
];

const DIR = __dirname; // Assumes script is run from the directory containing files

function combineFiles() {
    const groupedFiles = {};

    // Group by pincode
    fileList.forEach(filename => {
        const match = filename.match(/scraped_data_combined_(\d+)_\d+\.json/);
        if (match) {
            const pincode = match[1];
            if (!groupedFiles[pincode]) {
                groupedFiles[pincode] = [];
            }
            groupedFiles[pincode].push(filename);
        } else {
            console.warn(`Could not extract pincode from ${filename}`);
        }
    });

    // Process each group
    Object.keys(groupedFiles).forEach(pincode => {
        console.log(`\nProcessing Pincode: ${pincode}`);
        let combinedData = [];
        const seenIds = new Set();
        let duplicates = 0;

        groupedFiles[pincode].forEach(filename => {
            const filePath = path.join(DIR, filename);
            if (fs.existsSync(filePath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (Array.isArray(data)) {
                        console.log(`  - Reading ${filename}: ${data.length} items`);
                        data.forEach(item => {
                            // Deduplication key: productId (fallback to name if no id?)
                            // Item has 'productId'
                            const uniqueKey = item.productId || item.productName;

                            if (uniqueKey && !seenIds.has(uniqueKey)) {
                                seenIds.add(uniqueKey);
                                combinedData.push(item);
                            } else {
                                duplicates++;
                            }
                        });
                    } else {
                        console.warn(`  - Warning: ${filename} is not an array. Skipping.`);
                    }
                } catch (e) {
                    console.error(`  - Error reading ${filename}: ${e.message}`);
                }
            } else {
                console.error(`  - File not found: ${filename}`);
            }
        });

        const outputFilename = `scraped_data_combined_${pincode}_final.json`;
        const outputPath = path.join(DIR, outputFilename);

        fs.writeFileSync(outputPath, JSON.stringify(combinedData, null, 2));
        console.log(`  => Saved ${combinedData.length} items to ${outputFilename} (Skipped ${duplicates} duplicates)`);
    });
}

combineFiles();
