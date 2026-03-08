
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'test_output.json');
let allResults = [];

// Simulate initial load
if (fs.existsSync(OUTPUT_FILE)) {
    try {
        allResults = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        console.log('Loaded:', allResults.length);
    } catch (e) {
        allResults = [];
    }
}

// Simulate batches
async function run() {
    for (let i = 0; i < 3; i++) {
        console.log(`Batch ${i}`);
        const newProducts = [{ id: i, name: `Product ${i}` }];

        allResults.push(...newProducts);

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
        console.log(`Saved. Total: ${allResults.length}`);

        await new Promise(r => setTimeout(r, 100));
    }
}

run();
