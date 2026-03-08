const { scrape } = require('./scraper_service');
const fs = require('fs');
const path = require('path');

const PINCODE = '400070';
const URL = 'https://www.flipkart.com/hyperlocal/hloc/2001/pr?sid=hloc%2F0020%2F2001&marketplace=HYPERLOCAL';

async function run() {
    try {
        console.log(`Testing scrape for ${PINCODE}...`);

        // Force delete session to verify new setup logic
        const sessionPath = path.join(__dirname, 'sessions', `flipkart_session_${PINCODE}.json`);
        if (fs.existsSync(sessionPath)) {
            console.log('Deleting existing session file to force fresh setup...');
            try {
                fs.unlinkSync(sessionPath);
            } catch (e) { console.error('Failed to delet session:', e); }
        }

        const data = await scrape(URL, PINCODE);
        console.log(`Scrape success! Found ${data.length} items.`);
        if (data.length > 0) {
            console.log('Sample item:', data[0]);
        } else {
            console.log('Result: 0 items (as expected for unserviceable).');
        }
    } catch (error) {
        console.error('Scrape failed:', error);
    }
}

run();
