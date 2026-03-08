const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PINCODES = {
    'Mumbai': ['400070', '400703', '401101', '401202'],
    'Delhi NCR': ['400706', '201303', '201014', '122008', '122010', '122016']
};

const SESSION_DIR = path.join(__dirname, 'sessions');

if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

async function setupSession(pincode) {
    console.log(`\n🎯 Setting up session for pincode: ${pincode}`);

    const sessionFile = path.join(SESSION_DIR, `flipkart_session_${pincode}.json`);

    const browser = await chromium.launch({
        headless: false,
        executablePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    const TARGET_URL = 'https://www.flipkart.com/rv/checkout/changeShippingAddress/add?marketplace=HYPERLOCAL&source=entry&originalUrl=%2Fflipkart-minutes-store%3Fmarketplace%3DHYPERLOCAL&hideAddressForm=true&isMap=true&addressBSTouchpoint=ENTER_LOCATION_MANUALLY';

    try {
        await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
        console.log('✓ Loaded Flipkart Minutes location page');
        await page.waitForTimeout(2000);

        const searchInput = page.locator('input#search');
        await searchInput.waitFor({ state: 'visible', timeout: 10000 });
        await searchInput.clear();
        console.log('✓ Found search input');

        await page.waitForTimeout(500);
        await searchInput.pressSequentially(pincode, { delay: 150 });
        console.log(`✓ Entered pincode: ${pincode}`);

        await page.waitForTimeout(1000);

        const suggestionItem = page.locator('li._2APc3k');
        await suggestionItem.first().waitFor({ state: 'visible', timeout: 8000 });
        console.log('✓ Suggestions appeared');

        // Select logic
        const correctSuggestion = suggestionItem.filter({ hasText: pincode }).first();
        if (await correctSuggestion.isVisible()) {
            await correctSuggestion.click();
            console.log('✓ Clicked matching suggestion');
        } else {
            if (await suggestionItem.count() > 1) {
                await suggestionItem.nth(1).click();
            } else {
                await suggestionItem.first().click();
            }
            console.log('✓ Clicked first suggestion');
        }

        await page.waitForTimeout(1000);

        // Confirm
        const confirmBtn = page.getByRole('button', { name: /Confirm|Save|Proceed/i }).first();
        if (await confirmBtn.isVisible({ timeout: 5000 })) {
            await confirmBtn.click();
            console.log('✓ Clicked confirm button');
        } else {
            const textBtn = page.getByText('Confirm', { exact: false });
            if (await textBtn.count() > 0) {
                await textBtn.first().click();
                console.log('✓ Clicked confirm text');
            }
        }

        await page.waitForTimeout(3000);

        await context.storageState({ path: sessionFile });
        console.log(`💾 Saved session to: ${sessionFile}`);

        await browser.close();
        return true;

    } catch (e) {
        console.error(`❌ Error setting up session for ${pincode}:`, e.message);
        await browser.close();
        return false;
    }
}

async function main() {
    console.log('🚀 Starting Flipkart Minutes session setup\n');
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
