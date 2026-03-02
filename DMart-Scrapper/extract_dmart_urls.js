const fs = require('fs');
const path = require('path');

const CATEGORY_FILE = path.join(__dirname, '..', 'categoryurls.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'dmart_urls_array.json');

try {
    const rawData = fs.readFileSync(CATEGORY_FILE, 'utf8');
    const categories = JSON.parse(rawData);

    let dmartUrls = [];

    // Traverse master categories
    for (const masterCategory in categories) {
        const platformData = categories[masterCategory];

        // Check if dmart entries exist
        if (platformData.dmart && Array.isArray(platformData.dmart)) {
            platformData.dmart.forEach(item => {
                if (item.url) {
                    dmartUrls.push({
                        url: item.url,
                        officialCategory: item.officialCategory || ''
                    });
                }
            });
        }
    }

    // Write to output file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dmartUrls, null, 2));
    console.log(`Successfully extracted ${dmartUrls.length} DMart URLs to ${OUTPUT_FILE}`);

} catch (error) {
    console.error('Error extracting DMart URLs:', error);
}
