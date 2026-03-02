import { chromium } from 'playwright';
import fs from 'fs/promises';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // Jiomart URL to test
    const url = 'https://www.jiomart.com/c/groceries/biscuits-drinks-packaged-foods/chocolates-candies/29001';

    console.log(`Navigating to ${url}...`);

    let apiResponseCaptured = false;

    page.on('response', async (response) => {
        const reqUrl = response.url();
        if (reqUrl.includes('trex/search') && response.status() === 200 && !apiResponseCaptured) {
            console.log('Intercepted API call:', reqUrl);
            apiResponseCaptured = true;

            try {
                const json = await response.json();
                await fs.writeFile('jiomart_api_dump.json', JSON.stringify(json, null, 2));
                console.log('Saved response to jiomart_api_dump.json');

                const request = response.request();
                const headers = request.headers();
                const postData = request.postDataJSON();

                await fs.writeFile('jiomart_api_payload.json', JSON.stringify({
                    url: reqUrl,
                    headers,
                    postData
                }, null, 2));
                console.log('Saved payload to jiomart_api_payload.json');
            } catch (e) {
                console.error('Failed to parse API response:', e);
            }
        }
    });

    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        console.log('Page loaded.');
    } catch (e) {
        console.error('Navigation failed:', e);
    }

    // Wait a bit to ensure capture
    await page.waitForTimeout(5000);

    await browser.close();
})();
