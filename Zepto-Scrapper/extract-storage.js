import { firefox } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';

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

    // Get user's actual Firefox profile directory
    const username = os.userInfo().username;
    const firefoxProfilesPath = path.join(
        `C:\\Users\\${username}\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles`
    );

    console.log(`📁 Looking for Firefox profiles in: ${firefoxProfilesPath}`);

    // Find the default Firefox profile
    let profileDir = null;
    try {
        const profiles = fs.readdirSync(firefoxProfilesPath);
        const defaultProfile = profiles.find(p => p.includes('default'));
        if (defaultProfile) {
            profileDir = path.join(firefoxProfilesPath, defaultProfile);
            console.log(`✓ Found Firefox profile: ${defaultProfile}`);
            console.log(`✓ Full path: ${profileDir}`);
        }
    } catch (e) {
        console.error(`❌ Could not read Firefox profiles: ${e.message}`);
        process.exit(1);
    }

    if (!profileDir) {
        console.error('❌ Could not find Firefox default profile');
        process.exit(1);
    }

    const browser = await firefox.launchPersistentContext(profileDir, {
        headless: false,
        executablePath: "C:\\Program Files\\Mozilla Firefox\\firefox.exe"
    }).catch(async (err) => {
        // If Firefox is already running with this profile, that's OK
        // Just return a dummy context that will let us proceed
        if (err.message.includes('closed')) {
            console.log('ℹ️ Firefox opened in existing instance (this is expected)');
            return null;
        }
        throw err;
    });

    if (!browser) {
        // Firefox was already running, just wait for user
        console.log('\n✓ Firefox has opened with your existing profile in a new tab');
        console.log('📍 IMPORTANT:');
        console.log('1. Check your Firefox browser');
        console.log('2. Navigate to Zepto.com tab if not already there');
        console.log('3. Click on the location/pincode at the top');
        console.log('4. Change the pincode to your desired location');
        console.log('5. Confirm the new location');
        console.log('6. Return here and press Enter...\n');

        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });

        console.log('✓ You can now manually copy the session cookies.');
        console.log('⚠️ For now, we\'ll create a placeholder storage state.');
        console.log('💾 Saving storage state...');
        
        const storageState = {
            cookies: [],
            origins: [{
                origin: 'https://www.zepto.com',
                localStorage: []
            }]
        };

        fs.writeFileSync(outputFile, JSON.stringify(storageState, null, 2));
        console.log(`✅ Storage state placeholder saved to ${outputFile}`);
        console.log('📝 Please manually export your cookies from Firefox Developer Tools (F12 -> Storage -> Cookies -> zepto.com)');
        console.log('   and paste them into the zepto_storage_state.json file.');
        return;
    }

    const context = browser;
    
    const pages = context.pages();
    let page = pages.length > 0 ? pages[0] : await context.newPage();

    try {
        await page.goto('https://www.zepto.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('\n📍 IMPORTANT INSTRUCTIONS:');
        console.log('1. The Firefox browser window has opened');
        console.log('2. You should see your Zepto login already active');
        console.log('3. Click on the location/pincode at the top');
        console.log('4. Change the pincode to your desired location');
        console.log('5. Confirm the new location');
        console.log('6. After you finish, press Enter in this terminal to continue...\n');

        // Wait for user to manually change pincode
        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });

        console.log('✓ Proceeding to extract session data...');
        await delay(2000);

        console.log('💾 Saving storage state...');
        await context.storageState({ path: outputFile });

        // Also explicitly get localStorage for verifying
        const localStorageData = await page.evaluate(() => {
            return JSON.stringify(window.localStorage);
        });
        console.log(`📦 LocalStorage data size: ${localStorageData.length} bytes`);

        console.log(`✅ Storage state saved to ${outputFile}`);
        console.log('🎉 You can now close the Firefox browser window');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await context.close();
    }
})();
