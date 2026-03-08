const http = require('http');

const data = JSON.stringify({
    url: "https://www.flipkart.com/hyperlocal/Oil-Ghee-Masala/pr?sid=hloc%2F0009&marketplace=HYPERLOCAL&param=193737489&BU=Minutes&pageUID=1768361581052",
    pincode: "122016"
});

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/scrape-flipkart-minutes',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let responseBody = '';

    res.on('data', (chunk) => {
        responseBody += chunk;
    });

    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log('Body length:', responseBody.length);
        const fs = require('fs');
        const path = require('path');
        const outFile = path.join(__dirname, 'scraped_data', 'api_response.json');
        fs.writeFileSync(outFile, responseBody);
        console.log(`Saved response to ${outFile}`);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(data);
req.end();
