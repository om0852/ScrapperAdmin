
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_FILE = path.join(__dirname, 'test_output.json');
let allResults = [];

// Clean up previous run
if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
}

// Simulate batches
async function run() {
    for (let i = 0; i < 3; i++) {
        console.log(`\nBatch ${i}`);

        // Reload existing (simulating script restart or just ensuring persistence)
        if (fs.existsSync(OUTPUT_FILE)) {
            try {
                const data = fs.readFileSync(OUTPUT_FILE, 'utf8');
                const loaded = JSON.parse(data);
                console.log(`Loaded from disk: ${loaded.length} items`);
                // In the original script, allResults is maintained in memory, but let's see if we can break it
                // Logic: allResults.push(...new); save();
            } catch (e) {
                console.log('Error reading file');
            }
        }

        const newProducts = [{ id: i, name: `Product ${i}` }];
        allResults.push(...newProducts);

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
        console.log(`Saved. In-memory count: ${allResults.length}`);

        await new Promise(r => setTimeout(r, 100));
    }
}

run();
