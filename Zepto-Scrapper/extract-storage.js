import { chromium } from 'playwright';
import fs from 'fs/promises';

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
    searchResultItem: 'div[data-testid="address-search-item"]',
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function setPincode(page, targetPincode) {
    try {
        console.log(`🎯 Setting location to pincode: ${targetPincode}`);

        await page.waitForLoadState('domcontentloaded');
        await delay(1500);

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
        await delay(2000);

        // Wait for modal detection
        try {
            await page.waitForSelector(SELECTORS.locationModal, { timeout: 10000 });
            console.log('✓ Location modal opened');
        } catch (e) {
            console.error('❌ Location modal did not appear (timeout)');
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
        await delay(2500);

        // Wait for search results
        try {
            await page.waitForSelector(SELECTORS.searchResultItem, { timeout: 8000 });
            console.log('✓ Address results appeared');
        } catch (e) {
            console.error('❌ No address results appeared');
            return false;
        }

        await delay(500);

        const addressResults = page.locator(SELECTORS.searchResultItem);
        const count = await addressResults.count();
        console.log(`✓ Found ${count} address results`);

        if (count > 0) {
            const targetIndex = 0;
            const targetAddress = addressResults.nth(targetIndex);
            const clickableDiv = targetAddress.locator('div.cgG1vl').first();

            console.log(`📍 Attempting to select address #${targetIndex + 1}`);

            let clicked = false;
            try {
                await clickableDiv.click({ timeout: 3000 });
                console.log('✓ Clicked address (inner div)');
                clicked = true;
            } catch (e) {
                console.log('⚠️ Inner div click failed, trying outer container');
                try {
                    await targetAddress.click({ force: true, timeout: 3000 });
                    console.log('✓ Clicked address (outer container)');
                    clicked = true;
                } catch (e2) {
                    // Method 3: JavaScript click
                    await page.evaluate((index) => {
                        const items = document.querySelectorAll('div[data-testid="address-search-item"]');
                        if (items[index]) {
                            const clickable = items[index].querySelector('div.cgG1vl');
                            if (clickable) clickable.click();
                            else items[index].click();
                        }
                    }, targetIndex);
                    console.log('✓ Clicked address (JS)');
                    clicked = true;
                }
            }

            if (!clicked) {
                console.error('❌ All click methods failed');
                return false;
            }

            await delay(3000);

            // Check if "Confirm Location" button appeared
            const confirmBtn = page.locator('button:has-text("Confirm Location"), button:has-text("Confirm & Proceed")').first();
            if (await confirmBtn.isVisible()) {
                console.log('ℹ️ Confirm Location button appeared, clicking it...');
                await confirmBtn.click();
                await delay(2000);
            }

            const modalStillOpen = await page.locator(SELECTORS.locationModal).count();
            if (modalStillOpen === 0) {
                console.log('✅ Location set successfully - modal closed');
                return true;
            } else {
                console.error('❌ Modal still open after clicking address');
                // Try to close modal with Escape key
                console.log('⚠️ Attempting to close modal with Escape...');
                await page.keyboard.press('Escape');
                await delay(1000);
                if (await page.locator(SELECTORS.locationModal).count() === 0) {
                    console.log('✅ Modal closed after Escape, assuming success');
                    return true;
                }
                return false;
            }
        } else {
            console.error('❌ No address results found to click');
            return false;
        }

    } catch (error) {
        console.error(`❌ Error setting pincode: ${error.message}`);
        return false;
    }
}

(async () => {
    const args = process.argv.slice(2);
    const pincode = args[0] || '411001'; // Default pincode
    const outputFile = 'zepto_storage_state.json';

    console.log(`🚀 Starting Storage Extraction for Pincode: ${pincode}`);

    const browser = await chromium.launch({
        headless: false, // Use headed mode to see what's happening
        args: [
            '--disable-blink-features=AutomationControlled',
            '--start-maximized'
        ]
    });

    const context = await browser.newContext({
        viewport: null, // Let browser set viewport
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    try {
        await page.goto('https://www.zepto.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        const success = await setPincode(page, pincode);

        if (success) {
            console.log('💾 Saving storage state...');
            await context.storageState({ path: outputFile });

            // Also explicitly get localStorage for verifying
            const localStorageData = await page.evaluate(() => {
                return JSON.stringify(window.localStorage);
            });
            console.log(`📦 LocalStorage data size: ${localStorageData.length} bytes`);

            console.log(`✅ Storage state saved to ${outputFile}`);
        } else {
            console.error('❌ Failed to set pincode, storage state NOT saved.');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ detailed error:', error);
    } finally {
        await browser.close();
    }
})();
