const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const apiUrl = 'https://digital.dmart.in/api/v3/plp/dairy-aesc-dairy?page=2&size=40&channel=web&=&storeId=10718';

(async () => {
    let browser;
    try {
        console.log('Launching browser...');
        browser = await chromium.launch({
            headless: false, // User requested opening browser
            args: ['--start-maximized']
        });

        const context = await browser.newContext({
            viewport: null
        });
        const page = await context.newPage();

        console.log('Navigating to DMart home to initialize session...');
        await page.goto('https://www.dmart.in/', { waitUntil: 'domcontentloaded' });

        console.log('Fetching data from API within page context...');

        // Execute fetch inside the browser context
        const data = await page.evaluate(async (url) => {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'storeid': '10718', // Crucial header for DMart
                    // Browser automatically adds User-Agent, Referer, Cookies, etc.
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        }, apiUrl);

        console.log('Data fetched successfully.');

        // Extract products list
        const productsList = data.products || (data.data && data.data.products) || [];

        console.log(`Found ${productsList.length} raw products. Formatting...`);

        let formattedProducts = [];
        if (productsList.length > 0) {
            formattedProducts = productsList.map(item => {
                const sku = item.sKUs && item.sKUs.length > 0 ? item.sKUs[0] : {};

                // Construct Image URL
                let imageUrl = '';
                if (sku.imageKey) {
                    imageUrl = `https://cdn.dmart.in/images/products/${sku.imageKey}_5_P.jpg`;
                }

                return {
                    productId: item.productId,
                    productName: item.name,
                    productImage: imageUrl,
                    brand: item.manufacturer || '',
                    productWeight: sku.variantTextValue || '',
                    currentPrice: sku.priceSALE ? parseFloat(sku.priceSALE) : 0,
                    originalPrice: sku.priceMRP ? parseFloat(sku.priceMRP) : 0,
                    discountPercentage: sku.savingPercentage || 0,
                    isOutOfStock: sku.invType !== 'A'
                };
            });
            console.log(`Successfully formatted ${formattedProducts.length} products.`);

            // Save formatted data
            const outputPath = path.join(__dirname, 'dmart_output.json');
            fs.writeFileSync(outputPath, JSON.stringify(formattedProducts, null, 2));
            console.log(`Formatted data saved to: ${outputPath}`);

            // Save raw data for debugging
            const debugPath = path.join(__dirname, 'dmart_raw_debug.json');
            fs.writeFileSync(debugPath, JSON.stringify(data, null, 2));
            console.log(`Raw data saved to: ${debugPath}`);
        } else {
            console.log('No products found in the response.');
        }

    } catch (error) {
        console.error('Error during browser scraping:', error);
    } finally {
        if (browser) {
            console.log('Closing browser...');
            await browser.close();
        }
    }
})();
