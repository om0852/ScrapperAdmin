/**
 * Helper script to generate session files for specific pincodes
 * Run this locally BEFORE deploying to Render
 * 
 * Usage: node generate_session.js <pincode>
 * Example: node generate_session.js 122016
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR);
}

async function generateSession(pincode) {
    if (!pincode) {
        console.error('❌ Error: Pincode is required');
        console.log('Usage: node generate_session.js <pincode>');
        process.exit(1);
    }

    const sessionFile = path.join(SESSION_DIR, `flipkart_session_${pincode}.json`);

    if (fs.existsSync(sessionFile)) {
        console.log(`⚠️  Session already exists for pincode ${pincode}`);
        console.log(`   File: ${sessionFile}`);
        const answer = await askQuestion('Do you want to regenerate it? (y/n): ');
        if (answer.toLowerCase() !== 'y') {
            console.log('Cancelled.');
            process.exit(0);
        }
    }

    console.log(`🚀 Starting Session Setup for Pincode: ${pincode}`);
    console.log('   A browser window will open. Please wait...\n');

    const browser = await chromium.launch({
        headless: false,  // Must be false for session generation
        args: ['--start-maximized']
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    const TARGET_URL = 'https://www.flipkart.com/rv/checkout/changeShippingAddress/add?marketplace=HYPERLOCAL&source=entry&originalUrl=%2Fflipkart-minutes-store%3Fmarketplace%3DHYPERLOCAL&hideAddressForm=true&isMap=true&addressBSTouchpoint=ENTER_LOCATION_MANUALLY';

    try {
        console.log('📍 Navigating to Flipkart location setup...');
        await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        console.log(`⌨️  Entering pincode: ${pincode}`);
        const searchInput = page.locator('input#search');
        await searchInput.waitFor({ state: 'visible', timeout: 10000 });
        await searchInput.clear();
        await page.waitForTimeout(500);
        await searchInput.pressSequentially(pincode, { delay: 150 });
        await page.waitForTimeout(1000);

        console.log('🔍 Waiting for location suggestions...');
        const suggestionItem = page.locator('li._2APc3k');
        await suggestionItem.first().waitFor({ state: 'visible', timeout: 8000 });

        console.log('✅ Selecting location...');
        const correctSuggestion = suggestionItem.filter({ hasText: pincode }).first();
        if (await correctSuggestion.isVisible()) {
            await correctSuggestion.click();
        } else {
            if (await suggestionItem.count() > 1) await suggestionItem.nth(1).click();
            else await suggestionItem.first().click();
        }
        await page.waitForTimeout(1000);

        console.log('💾 Confirming location...');
        const confirmBtn = page.getByRole('button', { name: /Confirm|Save|Proceed/i }).first();
        if (await confirmBtn.isVisible({ timeout: 5000 })) {
            await confirmBtn.click();
        } else {
            const textBtn = page.getByText('Confirm', { exact: false });
            if (await textBtn.count() > 0) await textBtn.first().click();
        }

        await page.waitForTimeout(3000);

        console.log('💾 Saving session...');
        await context.storageState({ path: sessionFile });

        console.log(`\n✅ SUCCESS! Session saved to: ${sessionFile}`);
        console.log('\n📝 Next steps:');
        console.log('   1. Commit this session file to your repository');
        console.log('   2. Push to GitHub/GitLab');
        console.log('   3. Deploy to Render');

        await browser.close();

    } catch (error) {
        console.error('\n❌ Error during session setup:', error.message);
        await browser.close();
        process.exit(1);
    }
}

function askQuestion(query) {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => readline.question(query, ans => {
        readline.close();
        resolve(ans);
    }));
}

// Get pincode from command line argument
const pincode = process.argv[2];
generateSession(pincode);
