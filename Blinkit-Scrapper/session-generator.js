import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PINCODES = [
    { label: 'Gurgaon — 122018', value: '122018' },
    { label: 'Gurgaon — 122017', value: '122017' },
    { label: 'Gurgaon — 122016', value: '122016' },
    { label: 'Gurgaon — 122015', value: '122015' },
    { label: 'Gurgaon — 122011', value: '122011' },
    { label: 'Delhi NCR — 201303', value: '201303' },
    { label: 'Delhi NCR — 201014', value: '201014' },
    { label: 'Delhi NCR — 122008', value: '122008' },
    { label: 'Delhi NCR — 122010', value: '122010' },
    { label: 'Pune', value: '411001' }
];

const SESSION_DIR = 'sessions';

if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR);
}

// Reusing robust setupLocation logic
async function setupLocation(context, pincode, logPrefix = '') {
    const page = await context.newPage();
    try {
        await page.goto('https://blinkit.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Retry loop for setting location
        for (let attempt = 1; attempt <= 3; attempt++) {
            console.log(`${logPrefix} Location setup attempt ${attempt}/3`);
            try {
                // 1. Check if input is already visible (modal open by default)
                const inputSelectors = [
                    'input[name="select-locality"]',
                    'input.LocationSearchBox__InputSelect-sc-1k8u6a6-0',
                    'input[placeholder*="search delivery location"]'
                ];

                let input = null;
                let modalOpen = false;

                // Check visibility of input first
                for (const sel of inputSelectors) {
                    if (await page.locator(sel).first().isVisible({ timeout: 2000 })) {
                        input = page.locator(sel).first();
                        modalOpen = true;
                        console.log(`${logPrefix} Location modal detected open.`);
                        break;
                    }
                }

                // 2. If not open, click the Location Bar
                if (!modalOpen) {
                    const locationBarSelectors = [
                        'div[class*="LocationBar__Container"]',
                        'div[class*="LocationBar"]',
                        'div.LocationBar__Subtitle-sc-x8ezho-10'
                    ];

                    for (const sel of locationBarSelectors) {
                        if (await page.locator(sel).first().isVisible()) {
                            console.log(`${logPrefix} Clicking location bar: ${sel}`);
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
                    console.log(`${logPrefix} Input not found, page might need reload.`);
                    throw new Error("Location input not found");
                }

                // 3. Fill Pincode
                await input.click();
                await page.waitForTimeout(300);
                await input.fill(pincode);
                console.log(`${logPrefix} Entered pincode: ${pincode}`);

                // Wait specifically for suggestions to appear
                const suggestionSelector = 'div[class*="LocationSearchList__LocationListContainer"]';
                try {
                    await page.waitForSelector(suggestionSelector, { timeout: 5000 });
                } catch (e) {
                    console.warn(`${logPrefix} Suggestions did not appear for ${pincode}`);
                }

                // 4. Select Suggestion
                const firstSuggestion = page.locator(suggestionSelector).first();
                if (await firstSuggestion.isVisible()) {
                    console.log(`${logPrefix} Found suggestion, clicking...`);
                    await firstSuggestion.click();
                } else {
                    console.warn(`${logPrefix} No suggestions found, pressing Enter...`);
                    await page.keyboard.press('Enter');
                }

                // 5. Verification with explicit wait
                console.log(`${logPrefix} Waiting for location update...`);

                // Wait until the location text is valid (length > 5 and not "select location")
                try {
                    await page.waitForFunction(() => {
                        const el = document.querySelector('div[class*="LocationBar__Subtitle"]');
                        const text = el ? el.textContent.trim().toLowerCase() : '';
                        return text.length > 5 && text !== 'select location' && !text.includes('detect');
                    }, null, { timeout: 10000 });
                } catch (e) {
                    console.warn(`${logPrefix} Timed out waiting for location text update.`);
                }

                // Final check
                const locationTextEl = page.locator('div[class*="LocationBar__Subtitle"]').first();
                const locationText = await locationTextEl.textContent().catch(() => '');
                console.log(`${logPrefix} Final location text: "${locationText}"`);

                if (locationText && locationText.toLowerCase() !== 'select location' && locationText.length > 5) {
                    console.log(`${logPrefix} ✅ Location verified successfully: ${locationText}`);
                    // KEEP PAGE OPEN TO SAVE STATE
                    return true;
                } else {
                    if (await page.locator('input[name="select-locality"]').isVisible()) {
                        console.log(`${logPrefix} Modal still visible, trying Escape key...`);
                        await page.keyboard.press('Escape');
                    }
                    throw new Error(`Location not updated. Text: ${locationText}`);
                }

            } catch (e) {
                console.warn(`${logPrefix} Location setup failed (Attempt ${attempt}): ${e.message}`);
                if (attempt === 3) throw e;
                await page.reload();
                await page.waitForTimeout(3000);
            }
        }
    } catch (e) {
        console.error(`${logPrefix} Critical: Failed to set location. ${e.message}`);
        return false;
    }
    return false;
}

(async () => {
    const browser = await chromium.launch({ headless: false }); // Headful for debugging/visibility

    for (const pin of PINCODES) {
        console.log(`\nProcessing ${pin.label} (${pin.value})...`);
        const sessionPath = path.join(SESSION_DIR, `${pin.value}.json`);

        if (fs.existsSync(sessionPath)) {
            console.log(`Session already exists for ${pin.value}, skipping...`);
            continue;
        }

        const context = await browser.newContext();

        const success = await setupLocation(context, pin.value, `[${pin.value}]`);

        if (success) {
            await context.storageState({ path: sessionPath });
            console.log(`💾 Saved session to ${sessionPath}`);
        } else {
            console.error(`❌ Failed to create session for ${pin.value}`);
        }

        await context.close();
        await new Promise(r => setTimeout(r, 1000));
    }

    await browser.close();
    console.log('\nAll done.');
})();
