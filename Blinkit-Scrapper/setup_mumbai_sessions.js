import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PINCODES = ['400070', '400703', '401101', '401202'];

async function setupLocationForPincode(browser, pincode) {
    console.log(`\n🎯 Setting up session for pincode: ${pincode}`);

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
        await page.goto('https://blinkit.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('✓ Loaded Blinkit homepage');

        // Check if location is already set
        try {
            const el = await page.waitForSelector('div[class*="LocationBar__Subtitle"]', { timeout: 5000 });
            const text = await el.textContent();

            if (text && text.includes(pincode)) {
                console.log(`✅ Location already matches pincode ${pincode}`);
                const sessionPath = path.join(__dirname, 'sessions', `blinkit_${pincode}.json`);
                await context.storageState({ path: sessionPath });
                console.log(`💾 Saved session to: ${sessionPath}`);
                await context.close();
                return true;
            }
        } catch (e) {
            console.log('ℹ️ No existing location, proceeding to set...');
        }

        // Retry loop for setting location
        for (let attempt = 1; attempt <= 3; attempt++) {
            console.log(`🔄 Attempt ${attempt}/3 to set location`);
            try {
                const inputSelectors = [
                    'input[name="select-locality"]',
                    'input.LocationSearchBox__InputSelect-sc-1k8u6a6-0',
                    'input[placeholder*="search delivery location"]'
                ];

                let input = null;
                let modalOpen = false;

                // Check if input is already visible
                for (const sel of inputSelectors) {
                    if (await page.locator(sel).first().isVisible({ timeout: 2000 })) {
                        input = page.locator(sel).first();
                        modalOpen = true;
                        break;
                    }
                }

                // If not open, click the Location Bar
                if (!modalOpen) {
                    const locationBarSelectors = [
                        'div[class*="LocationBar__Container"]',
                        'div[class*="LocationBar"]',
                        'div.LocationBar__Subtitle-sc-x8ezho-10'
                    ];

                    for (const sel of locationBarSelectors) {
                        if (await page.locator(sel).first().isVisible()) {
                            await page.locator(sel).first().click();
                            await page.waitForTimeout(1000);
                            break;
                        }
                    }

                    // Re-check input
                    for (const sel of inputSelectors) {
                        if (await page.locator(sel).first().isVisible()) {
                            input = page.locator(sel).first();
                            break;
                        }
                    }
                }

                if (!input) {
                    throw new Error("Location input not found");
                }

                // Fill Pincode
                await input.click();
                await page.waitForTimeout(300);
                await input.fill(pincode);
                console.log(`✓ Entered pincode: ${pincode}`);

                // Wait for suggestions
                const suggestionSelector = 'div[class*="LocationSearchList__LocationListContainer"]';
                try {
                    await page.waitForSelector(suggestionSelector, { timeout: 5000 });
                    console.log('✓ Suggestions appeared');
                } catch (e) {
                    console.log('⚠️ Suggestions did not appear');
                }

                // Select first suggestion
                const firstSuggestion = page.locator(suggestionSelector).first();
                if (await firstSuggestion.isVisible()) {
                    await firstSuggestion.click();
                    console.log('✓ Clicked first suggestion');
                } else {
                    console.log('⚠️ No suggestions found, pressing Enter');
                    await page.keyboard.press('Enter');
                }

                // Wait for location to update
                await page.waitForTimeout(3000);

                // Verify location was set
                const locationTextEl = page.locator('div[class*="LocationBar__Subtitle"]').first();
                const locationText = await locationTextEl.textContent().catch(() => '');

                if (locationText && locationText.toLowerCase() !== 'select location' && locationText.length > 5) {
                    console.log(`✅ Location verified: ${locationText}`);

                    // Save session
                    const sessionPath = path.join(__dirname, 'sessions', `blinkit_${pincode}.json`);
                    await context.storageState({ path: sessionPath });
                    console.log(`💾 Saved session to: ${sessionPath}`);

                    await context.close();
                    return true;
                } else {
                    throw new Error(`Location not updated. Text: ${locationText}`);
                }

            } catch (e) {
                console.log(`❌ Attempt ${attempt} failed: ${e.message}`);
                if (attempt === 3) throw e;
                await page.reload();
                await page.waitForTimeout(3000);
            }
        }

    } catch (error) {
        console.error(`❌ Failed to set pincode ${pincode}:`, error.message);
        await context.close();
        return false;
    }
}

async function main() {
    console.log('🚀 Starting Blinkit session setup for Mumbai pincodes\n');

    // Create sessions directory
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
        console.log('📁 Created sessions directory\n');
    }

    const browser = await chromium.launch({
        headless: false, // Set to true for production
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    const results = {};

    for (const pincode of PINCODES) {
        const success = await setupLocationForPincode(browser, pincode);
        results[pincode] = success;

        // Wait between pincodes
        if (PINCODES.indexOf(pincode) < PINCODES.length - 1) {
            console.log('\n⏳ Waiting 2 seconds before next pincode...\n');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    await browser.close();

    console.log('\n\n📊 Summary:');
    console.log('═══════════════════════════════════════');
    for (const [pincode, success] of Object.entries(results)) {
        const status = success ? '✅ Success' : '❌ Failed';
        console.log(`${pincode}: ${status}`);
    }
    console.log('═══════════════════════════════════════\n');

    const successCount = Object.values(results).filter(Boolean).length;
    console.log(`✅ Successfully created ${successCount}/${PINCODES.length} sessions`);
}

main().catch(console.error);
