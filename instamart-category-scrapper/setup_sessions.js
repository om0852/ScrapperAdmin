const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PINCODES = {
    'Mumbai': ['400070', '400703', '401101', '401202'],
    'Delhi NCR': ['400706', '201303', '201014', '122008', '122010', '122016']
};

const SESSION_DIR = path.join(__dirname, 'sessions');

// Ensure sessions directory exists
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

const getSessionPath = (pincode) => path.join(SESSION_DIR, `session_${pincode}.json`);

async function setupLocation(page, context, pincode) {
    console.log(`\n🎯 Setting up location for pincode: ${pincode}`);

    try {
        // Click address bar
        try {
            await page.waitForSelector('div[data-testid="address-bar"]', { timeout: 5000 });
            await page.click('div[data-testid="address-bar"]');
            console.log('✓ Clicked address bar');
        } catch (e) {
            console.log('⚠️ Address bar not found');
        }

        // Click search location
        try {
            await page.waitForSelector('div[data-testid="search-location"]', { timeout: 5000 });
            await page.click('div[data-testid="search-location"]');
            console.log('✓ Clicked search location');
        } catch (e) {
            console.log('⚠️ Search location button not found');
        }

        // Fill pincode
        const inputSelector = 'input[placeholder="Search for area, street name…"]';
        try {
            await page.waitForSelector(inputSelector, { timeout: 5000 });
            await page.fill(inputSelector, pincode);
            console.log(`✓ Entered pincode: ${pincode}`);
        } catch (e) {
            console.log('⚠️ Input field not found');
            throw e;
        }

        // Wait for and click first result
        try {
            await page.waitForSelector('div._11n32', { timeout: 5000 });
            const results = await page.$$('div._11n32');
            if (results.length > 0) {
                await results[0].click();
                console.log('✓ Clicked first address result');
            }
        } catch (e) {
            console.log('⚠️ No address results found');
            throw e;
        }

        // Click confirm button if visible
        try {
            await page.waitForTimeout(2000);
            const confirmBtn = page.getByRole('button', { name: /confirm/i });
            if (await confirmBtn.isVisible()) {
                await confirmBtn.click();
                console.log('✓ Clicked confirm button');
            }
        } catch (e) {
            console.log('ℹ️ No confirm button needed');
        }

        // Wait for location to be set
        await page.waitForTimeout(3000);

        // Save session
        const sessionPath = getSessionPath(pincode);
        await context.storageState({ path: sessionPath });
        console.log(`💾 Saved session to: ${sessionPath}`);

        return true;

    } catch (error) {
        console.error(`❌ Error setting up location for ${pincode}:`, error.message);
        return false;
    }
}

async function main() {
    console.log('🚀 Starting Instamart session setup\n');
    console.log('📍 Pincodes to process:');
    for (const [region, codes] of Object.entries(PINCODES)) {
        console.log(`   ${region}: ${codes.join(', ')}`);
    }
    console.log('');

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    const results = {};
    const allPincodes = Object.values(PINCODES).flat();

    for (const pincode of allPincodes) {
        const region = Object.keys(PINCODES).find(r => PINCODES[r].includes(pincode));
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📍 Processing: ${pincode} (${region})`);
        console.log('='.repeat(50));

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });

        const page = await context.newPage();

        try {
            await page.goto('https://www.swiggy.com/instamart', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });
            console.log('✓ Loaded Instamart homepage');

            await page.waitForTimeout(2000);

            const success = await setupLocation(page, context, pincode);
            results[pincode] = success;

        } catch (error) {
            console.error(`❌ Failed to process ${pincode}:`, error.message);
            results[pincode] = false;
        } finally {
            await context.close();
        }

        // Wait between pincodes
        if (allPincodes.indexOf(pincode) < allPincodes.length - 1) {
            console.log('\n⏳ Waiting 3 seconds before next pincode...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    await browser.close();

    // Print summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));

    for (const [region, codes] of Object.entries(PINCODES)) {
        console.log(`\n${region}:`);
        for (const pincode of codes) {
            const status = results[pincode] ? '✅ Success' : '❌ Failed';
            console.log(`  ${pincode}: ${status}`);
        }
    }

    const successCount = Object.values(results).filter(Boolean).length;
    const totalCount = allPincodes.length;

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Successfully created ${successCount}/${totalCount} sessions`);
    console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
