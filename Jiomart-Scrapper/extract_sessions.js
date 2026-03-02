
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, 'jiomart_sessions.json');

const PINCODES = [
    { label: 'Mumbai — 400706	', value: '400706	' },
    { label: 'Gurgaon — 122017', value: '122017' },
    { label: 'Gurgaon — 122016', value: '122016' },
    { label: 'Gurgaon — 122015', value: '122015' },
    { label: 'Gurgaon — 122011', value: '122011' },
    { label: 'Delhi NCR — 201303', value: '201303' },
    { label: 'Delhi NCR — 201014', value: '201014' },
    { label: 'Delhi NCR — 122008', value: '122008' },
    { label: 'Delhi NCR — 122010', value: '122010' }
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function setPincodeAndGetState(browser, pincode) {
    console.log(`Processing ${pincode}...`);
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto('https://www.jiomart.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(2000);

        // 1. Aggressively handle "location_popup" or "alcohol-popup"
        // The user provided structure shows class "alcohol-popup" inside id "location_popup" or similar outer divs.
        // We target the close button directly.
        try {
            const closeBtn = page.locator('#btn_location_close_icon, button.close-privacy').first();
            // Short wait to see if it pops up
            if (await closeBtn.isVisible({ timeout: 5000 })) {
                console.log('Detected Location Popup, closing it...');
                await closeBtn.click();
                // Wait for it to be gone
                await closeBtn.waitFor({ state: 'hidden', timeout: 3000 });
                await delay(500);
            }
        } catch (e) {
            // Ignore timeout if it doesn't appear
        }

        // 2. Click Delivery/Pin button in Navbar
        // Common selectors for the header location pin
        const locationBtn = page.locator('#btn_delivery_location, a.delivery-location, .pin-code-text, img[src*="pin"], button[class*="delivery"]').first();

        // Ensure we scroll to top just in case
        await page.evaluate(() => window.scrollTo(0, 0));

        if (await locationBtn.isVisible({ timeout: 5000 })) {
            console.log('Clicking location button...');
            await locationBtn.click();
        } else {
            const headerLoc = page.getByText(/Deliver to/i).first();
            if (await headerLoc.isVisible()) {
                console.log('Clicking "Deliver to" text...');
                await headerLoc.click();
            } else {
                console.log('⚠️ Location button not found in navbar. Checking if modal is already open...');
            }
        }
        await delay(1500);

        const input = page.locator('input[id="rel_pincode"], input[placeholder*="pincode"], input[type="tel"]').first();
        await input.waitFor({ state: 'visible', timeout: 5000 });

        // Clear and type
        await input.clear();
        await input.fill(pincode);
        await delay(500);

        const applyBtn = page.getByText('Apply').first();
        await applyBtn.click();

        await delay(3000);

        const state = await context.storageState();
        return state;

    } catch (e) {
        console.error(`Failed to set pincode ${pincode}: ${e.message}`);
        return null;
    } finally {
        await context.close();
    }
}

async function main() {
    const allSessions = {};
    const browser = await chromium.launch({ headless: false });

    try {
        for (const pin of PINCODES) {
            console.log(`Starting extraction for ${pin.label}`);
            const state = await setPincodeAndGetState(browser, pin.value);
            if (state) {
                allSessions[pin.value] = state;
                console.log(`✅ Captured session for ${pin.value}`);
            } else {
                console.log(`❌ Failed to capture session for ${pin.value}`);
            }
            await delay(1000);
        }

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(allSessions, null, 2));
        console.log(`\n🎉 All sessions saved to ${OUTPUT_FILE}`);

    } catch (error) {
        console.error('Extraction failed:', error);
    } finally {
        await browser.close();
    }
}

main();
