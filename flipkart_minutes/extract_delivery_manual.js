const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    console.log('🚀 Launching Browser for Manual Inspection...');
    const browser = await chromium.launch({
        headless: false,
        executablePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
    });

    // Create context with stealth
    const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    });
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();
    const TARGET_URL = 'https://www.flipkart.com/flipkart-minutes-store?marketplace=HYPERLOCAL';

    try {
        console.log(`🌐 Navigating to: ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('⏳ Waiting 60 seconds for YOU to manage location/login popup if needed...');
        console.log('👉 Please manually enter pincode 400703 or login if prompted.');
        await page.waitForTimeout(60000);

        console.log('🔍 Attempting to extract delivery time from body text...');
        const bodyText = await page.innerText('body');

        // Regex
        const timeRegex = /(\d+(?:-\d+)?)\s*(?:mins?|minutes?)/i;
        const match = bodyText.match(timeRegex);

        let deliveryTime = "N/A";
        if (match) {
            deliveryTime = `${match[1]} min`;
            console.log(`✅ Extracted: ${deliveryTime}`);
        } else {
            console.log('⚠️ Strict capture failed. Checking for "Tomorrow"/"Today"...');
            if (/tomorrow/i.test(bodyText)) deliveryTime = "Tomorrow";
            else if (/today/i.test(bodyText)) deliveryTime = "Today";
            console.log(`ℹ️ Result: ${deliveryTime}`);
        }

        // Also dump for review
        fs.writeFileSync('manual_debug.txt', bodyText);
        console.log('📝 Page text saved to manual_debug.txt');

    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        console.log('🔒 Closing browser...');
        await browser.close();
    }
})();
