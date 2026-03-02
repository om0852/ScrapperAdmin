import axios from 'axios';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:4199/dmartcategoryscrapper';
const PINCODE = '401202';

async function testStorage() {
    console.log('🧪 Testing DMart Storage Functionality...');

    try {
        const payload = {
            pincode: PINCODE,
            url: 'https://www.dmart.in/category/dals-pulses-aesc-dals-pulses',
            store: true, // <--- Key parameter
            maxConcurrentTabs: 1
        };

        console.log('📡 Sending request with store: true');
        const res = await axios.post(API_URL, payload, { timeout: 0 });

        if (res.data.status === 'success') {
            console.log('✅ API returned success');

            // Check if file info is in response metadata (optional, but good practice if I implemented it)
            if (res.data.meta.storedFile) {
                console.log(`ℹ️ Server reported file: ${res.data.meta.storedFile}`);
            }

            // Verify file actually exists
            const storageDir = path.join(process.cwd(), 'scraped_data'); // Assumes running from DMart-Scrapper dir
            // If running from root, might need adjustment, but user likely runs from root or folder.
            // Let's assume we run this script FROM the dmart folder.

            // Actually, let's list the directory content to be sure
            if (fs.existsSync(storageDir)) {
                const files = fs.readdirSync(storageDir);
                console.log('📂 Files in scraped_data:', files);
                const hasMatch = files.some(f => f.includes(PINCODE) && f.endsWith('.json'));
                if (hasMatch) {
                    console.log('✅ Found matching stored file!');
                } else {
                    console.error('❌ No matching file found in scraped_data.');
                }
            } else {
                console.error('❌ scraped_data directory not found.');
            }

        } else {
            console.error('❌ API failed:', res.data);
        }

    } catch (e) {
        console.error('❌ Request failed. Is server running?', e.message);
    }
}

testStorage();
