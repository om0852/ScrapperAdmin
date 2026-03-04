import fetch from 'node-fetch';

const DMART_SERVER_URL = 'http://localhost:4199/dmartcategoryscrapper';

// Change this pincode if you want to test another area
const PINCODE = '400706';

// Category URL to test (provided by you)
const CATEGORY_URL = 'https://www.dmart.in/category/fresh-fruits-aesc-freshfruits';

async function runTest() {
  try {
    console.log('Sending test request to DMart scraper server...');

    const response = await fetch(DMART_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pincode: PINCODE,
        url: CATEGORY_URL,
        store: true, // also trigger saving of transformed output to file if enabled in server
        maxConcurrentTabs: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Server responded with error status:', response.status);
      console.error('Response body:', errorText);
      process.exit(1);
    }

    const data = await response.json();

    console.log('=== DMart Scrape Test Result ===');
    console.log('Status:', data.status);
    console.log('Pincode:', data.pincode);
    console.log('Total Products:', data.totalProducts);
    if (data.meta && data.meta.storedFile) {
      console.log('Stored File:', data.meta.storedFile);
    }
    console.log('First product sample:');
    console.log(JSON.stringify(data.products && data.products[0], null, 2));
  } catch (err) {
    console.error('Error while calling DMart scraper server:', err);
    process.exit(1);
  }
}

runTest();

