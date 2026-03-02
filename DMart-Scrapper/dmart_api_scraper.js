const fs = require('fs');
const path = require('path');

// URL provided by the user
const apiUrl = 'https://digital.dmart.in/api/v3/plp/dairy-aesc-dairy?page=2&size=40&channel=web&=&storeId=10718';

// Headers provided by the user and standard browser headers
const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json;charset=UTF-8',
    'd_info': 'w-20260120_151536',
    'origin': 'https://www.dmart.in',
    'referer': 'https://www.dmart.in/',
    'storeid': '10718',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
    'x-request-id': 'NTA2ZTMyNjItNmViYi00Zjc5LWE1Y2YtNjFiYjJmNjhjN2Q0fHxTLTIwMjYwMTIwXzE1MTUzNnx8LTEwMDI='
};

async function fetchDMartData() {
    try {
        console.log('Fetching data from DMart API...');
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();

        // Extract products list
        const productsList = data.products || (data.data && data.data.products) || [];

        if (productsList.length > 0) {
            const formattedProducts = productsList.map(item => {
                const sku = item.sKUs && item.sKUs.length > 0 ? item.sKUs[0] : {};

                // Construct Image URL
                // Pattern: https://cdn.dmart.in/images/products/<imageKey>_5_P.jpg
                // imageKey e.g. "J/U/N/JUN130001470xx8JUN22"
                let imageUrl = '';
                if (sku.imageKey) {
                    imageUrl = `https://cdn.dmart.in/images/products/${sku.imageKey}_5_P.jpg`;
                }

                return {
                    productId: item.productId,
                    productName: item.name,
                    productImage: imageUrl,
                    productWeight: sku.variantTextValue || '',
                    currentPrice: sku.priceSALE ? parseFloat(sku.priceSALE) : 0,
                    originalPrice: sku.priceMRP ? parseFloat(sku.priceMRP) : 0,
                    discountPercentage: sku.savingPercentage || 0,
                    isOutOfStock: sku.invType !== 'A' // Assuming 'A' is Available
                };
            });
            console.log(`Successfully extracted ${formattedProducts.length} products.`);

            // Save formatted data
            const outputPath = path.join(__dirname, 'dmart_output.json');
            fs.writeFileSync(outputPath, JSON.stringify(formattedProducts, null, 2));
            console.log(`Formatted data saved to: ${outputPath}`);

            // Save raw data for debugging if needed
            const debugPath = path.join(__dirname, 'dmart_raw_debug.json');
            fs.writeFileSync(debugPath, JSON.stringify(data, null, 2));
            console.log(`Raw data saved to: ${debugPath}`);

        } else {
            console.log('No products found in the response or unexpected structure.');
            const debugPath = path.join(__dirname, 'dmart_raw_debug.json');
            fs.writeFileSync(debugPath, JSON.stringify(data, null, 2));
            console.log(`Saved raw response to ${debugPath} for inspection.`);
        }

    } catch (error) {
        console.error('Error fetching DMart data:', error);
    }
}

fetchDMartData();
