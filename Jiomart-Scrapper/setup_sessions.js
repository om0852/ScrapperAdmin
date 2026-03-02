import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PINCODES = {
    'Mumbai': ['400070', '400703', '401101', '401202'],
    'Delhi NCR': ['400706', '201303', '201014', '122008', '122010', '122016']
};

const SESSIONS_DIR = path.join(__dirname, 'sessions');
const STORAGE_MAP_FILE = path.join(__dirname, 'jiomart_storage_map.json');

// Ensure sessions directory exists
try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
} catch (e) { }

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

const delay = (min = 1000, max = 3000) => {
    const time = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, time));
};

async function setupSession(browser, pincode) {
    console.log(`\n🎯 Setting up session for pincode: ${pincode}`);

    const context = await browser.newContext({
        userAgent: USER_AGENTS[0],
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();
    const stateFileName = `jiomart_${pincode}_${Date.now()}.json`;
    const statePath = path.join(SESSIONS_DIR, stateFileName);

    try {
        await page.goto('https://www.jiomart.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('✓ Loaded Jiomart homepage');
        await delay(2000, 4000);

        // Close popup if exists
        try {
            const closeBtn = page.locator('#btn_location_close_icon, button.close-privacy').first();
            if (await closeBtn.isVisible({ timeout: 5000 })) {
                console.log('✓ Closing popup');
                await closeBtn.click();
                await closeBtn.waitFor({ state: 'hidden', timeout: 3000 });
                await delay(500);
            }
        } catch (e) { }

        // Click location button
        const locationBtn = page.locator('#btn_delivery_location, .delivery-location, .pin-code-text, img[src*="pin"], button[class*="delivery"]').first();
        if (await locationBtn.isVisible()) {
            await locationBtn.click();
            console.log('✓ Clicked location button');
            await delay(1000, 2000);
        } else {
            const headerLoc = page.getByText(/Deliver to/i).first();
            if (await headerLoc.isVisible()) {
                await headerLoc.click();
                console.log('✓ Clicked header location');
                await delay(1000, 2000);
            }
        }

        // Fill pincode
        const input = page.locator('input[id="rel_pincode"], input[placeholder*="pincode"], input[type="tel"]').first();
        await input.waitFor({ state: 'visible', timeout: 10000 });
        await input.fill(pincode);
        console.log(`✓ Entered pincode: ${pincode}`);
        await delay(500, 1000);

        // Click Apply
        const applyBtn = page.getByText('Apply').first();
        await applyBtn.click();
        console.log('✓ Clicked Apply');

        await delay(3000, 5000);

        // Save session
        await context.storageState({ path: statePath });
        console.log(`💾 Saved session to: ${statePath}`);

        // Update map
        let map = {};
        try {
            const data = await fs.readFile(STORAGE_MAP_FILE, 'utf8');
            map = JSON.parse(data);
        } catch (e) { }

        map[pincode] = stateFileName;
        await fs.writeFile(STORAGE_MAP_FILE, JSON.stringify(map, null, 2));

        await context.close();
        return true;

    } catch (error) {
        console.error(`❌ Failed to set pincode ${pincode}:`, error.message);
        await context.close();
        return false;
    }
}

async function main() {
    console.log('🚀 Starting Jiomart session setup\n');
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

        const success = await setupSession(browser, pincode);
        results[pincode] = success;

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
