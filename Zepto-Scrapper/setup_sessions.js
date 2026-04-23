import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMacChromeContext } from './browserFingerprint.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PINCODES = {
    'Mumbai': ['400070', '400703', '401101', '401202'],
    'Delhi NCR': ['400706', '201303', '201014', '122008', '122010', '122016']
};

const STORAGE_MAP_FILE = path.join(__dirname, 'pincodes_storage_map.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SELECTORS = {
    locationButton: [
        '[data-testid="user-address"]',
        'button:has([data-testid="user-address"])',
        'button[aria-label="Select Location"]',
        'button.__4y7HY',
        'div.a0Ppr button'
    ],
    locationModal: 'div[data-testid="address-modal"]',
    searchInput: 'div[data-testid="address-search-input"] input[type="text"]',
    searchResultItem: 'div[data-testid="address-search-item"]'
};

async function setPincode(page, targetPincode) {
    try {
        console.log(`🎯 Setting location to pincode: ${targetPincode}`);

        await page.waitForLoadState('domcontentloaded');
        await delay(500);

        // Click location button
        let clicked = false;
        for (const selector of SELECTORS.locationButton) {
            try {
                const button = page.locator(selector).first();
                if (await button.count() > 0) {
                    await button.click({ timeout: 3000 });
                    console.log(`✓ Clicked location button: ${selector}`);
                    clicked = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!clicked) {
            console.error('❌ Could not find location button');
            return false;
        }
        await delay(1000);

        // Wait for modal
        try {
            await page.waitForSelector(SELECTORS.locationModal, { timeout: 10000 });
            console.log('✓ Location modal opened');
        } catch (e) {
            console.error('❌ Location modal did not appear');
            return false;
        }

        await delay(1500);

        // Type pincode
        const searchInput = page.locator(SELECTORS.searchInput).first();
        if (await searchInput.count() === 0) {
            console.error('❌ Search input not found');
            return false;
        }

        await searchInput.click();
        await delay(300);
        await searchInput.fill('');
        await delay(200);
        await searchInput.fill(targetPincode);
        console.log(`✓ Typed pincode: ${targetPincode}`);
        await delay(800);

        // Wait for suggestions
        try {
            await page.waitForSelector(SELECTORS.searchResultItem, { timeout: 8000 });
            console.log('✓ Address results appeared');
        } catch (e) {
            console.error('❌ No address results appeared');
            return false;
        }

        await delay(500);

        // Click address
        const addressResults = page.locator(SELECTORS.searchResultItem);
        const count = await addressResults.count();
        console.log(`✓ Found ${count} address results`);

        if (count > 0) {
            const targetIndex = 0;
            const targetAddress = addressResults.nth(targetIndex);
            const clickableDiv = targetAddress.locator('div.cgG1vl').first();

            console.log(`📍 Attempting to select address #${targetIndex + 1}`);

            // Try clicking
            try {
                await clickableDiv.click({ timeout: 3000 });
                console.log('✓ Clicked address (inner div)');
            } catch (e) {
                try {
                    await targetAddress.click({ force: true, timeout: 3000 });
                    console.log('✓ Clicked address (outer container)');
                } catch (e2) {
                    await page.evaluate((index) => {
                        const items = document.querySelectorAll('div[data-testid="address-search-item"]');
                        if (items[index]) {
                            const clickable = items[index].querySelector('div.cgG1vl');
                            if (clickable) {
                                clickable.click();
                            } else {
                                items[index].click();
                            }
                        }
                    }, targetIndex);
                    console.log('✓ Clicked address (JS)');
                }
            }

            await delay(1500);

            // Check for confirm button
            const confirmBtn = page.locator('button:has-text("Confirm Location"), button:has-text("Confirm & Proceed")').first();
            if (await confirmBtn.isVisible()) {
                console.log('ℹ️ Confirm Location button appeared, clicking it...');
                await confirmBtn.click();
                await delay(2000);
            }

            // Check if modal closed
            const modalStillOpen = await page.locator(SELECTORS.locationModal).count();
            if (modalStillOpen === 0) {
                console.log('✅ Location set successfully - modal closed');
                return true;
            } else {
                console.log('⚠️ Modal still open, pressing Escape...');
                await page.keyboard.press('Escape');
                await delay(1000);

                const addressEl = page.locator('[data-testid="user-address"]');
                const addressText = await addressEl.textContent().catch(() => '');

                if (addressText && addressText.length > 5 && !addressText.toLowerCase().includes('select')) {
                    console.log('✅ Address text appears valid');
                    return true;
                }

                if (await page.locator(SELECTORS.locationModal).count() === 0) {
                    console.log('✅ Modal closed after Escape');
                    return true;
                }

                return false;
            }
        } else {
            console.error('❌ No address results found');
            return false;
        }

    } catch (error) {
        console.error(`❌ Error setting pincode: ${error.message}`);
        return false;
    }
}

async function setupSession(pincode) {
    console.log(`\n🎯 Setting up session for pincode: ${pincode}`);

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu'
        ]
    });

    const { context } = await createMacChromeContext(browser);

    const page = await context.newPage();

    try {
        await page.goto('https://www.zepto.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        console.log('✓ Loaded Zepto homepage');

        const success = await setPincode(page, pincode);

        if (success) {
            // Save session
            const sessionData = await context.storageState();

            let storageMap = {};
            try {
                const data = fs.readFileSync(STORAGE_MAP_FILE, 'utf8');
                storageMap = JSON.parse(data);
            } catch (e) { }

            storageMap[pincode] = sessionData;
            fs.writeFileSync(STORAGE_MAP_FILE, JSON.stringify(storageMap, null, 2));

            console.log(`💾 Saved session for ${pincode}`);
            await browser.close();
            return true;
        } else {
            await browser.close();
            return false;
        }

    } catch (error) {
        console.error(`❌ Failed to process ${pincode}:`, error.message);
        await browser.close();
        return false;
    }
}

async function main() {
    console.log('🚀 Starting Zepto session setup\n');
    console.log('📍 Pincodes to process:');
    for (const [region, codes] of Object.entries(PINCODES)) {
        console.log(`   ${region}: ${codes.join(', ')}`);
    }
    console.log('');

    const results = {};
    const allPincodes = Object.values(PINCODES).flat();

    for (const pincode of allPincodes) {
        const region = Object.keys(PINCODES).find(r => PINCODES[r].includes(pincode));
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📍 Processing: ${pincode} (${region})`);
        console.log('='.repeat(50));

        const success = await setupSession(pincode);
        results[pincode] = success;

        // Wait between pincodes
        if (allPincodes.indexOf(pincode) < allPincodes.length - 1) {
            console.log('\n⏳ Waiting 3 seconds before next pincode...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

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
