/**
 * Diagnostic test for Rome API 403 issue
 * Tests different payloads and headers to identify the problem
 */

const https = require('https');
const zlib = require('zlib');

// Test configurations
const tests = [
    {
        name: 'Standard Payload (Current)',
        payload: {
            pageContext: {
                pageId: 'PAGE_SEARCH',
                catalogId: null,
                pageNumber: 1,
                pageSize: 40
            },
            requestContext: {
                marketPlace: 'HYPERLOCAL',
                clientContext: {
                    appVersion: '146.0.0.0',
                    entryPoint: 'HYPERLOCAL_BROWSE'
                }
            }
        }
    },
    {
        name: 'Minimal Payload',
        payload: {
            pageContext: {
                pageId: 'PAGE_SEARCH',
                pageNumber: 1,
                pageSize: 40
            },
            requestContext: {
                marketPlace: 'HYPERLOCAL'
            }
        }
    },
    {
        name: 'Empty Context Payload',
        payload: {
            pageContext: {},
            requestContext: { marketPlace: 'HYPERLOCAL' }
        }
    }
];

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'Origin': 'https://www.flipkart.com',
    'Referer': 'https://www.flipkart.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'Sec-Ch-Ua': '"Google Chrome";v="146", "Chromium";v="146", ";Not A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"'
};

function makeRequest(payload, testName) {
    return new Promise((resolve, reject) => {
        const bodyString = JSON.stringify(payload);
        const reqHeaders = {
            ...headers,
            'Host': '1.rome.api.flipkart.com',
            'Content-Length': Buffer.byteLength(bodyString)
        };

        const options = {
            hostname: '1.rome.api.flipkart.com',
            path: '/api/4/page/fetch?cacheFirst=false',
            method: 'POST',
            headers: reqHeaders,
            timeout: 15000
        };

        console.log(`\n[${testName}] Testing...`);
        console.log(`  Payload keys: ${Object.keys(payload).join(', ')}`);

        const req = https.request(options, (res) => {
            let data = '';
            let decompressed = res;

            if (res.headers['content-encoding'] === 'gzip') {
                decompressed = res.pipe(zlib.createGunzip());
            } else if (res.headers['content-encoding'] === 'deflate') {
                decompressed = res.pipe(zlib.createInflate());
            }

            decompressed.on('data', (chunk) => {
                data += chunk;
            });

            decompressed.on('end', () => {
                console.log(`  Status: ${res.statusCode} ${res.statusMessage}`);
                console.log(`  Content-Type: ${res.headers['content-type']}`);
                
                if (res.statusCode !== 200) {
                    try {
                        const parsed = JSON.parse(data);
                        console.log(`  Error Response:`, JSON.stringify(parsed, null, 2).substring(0, 200));
                    } catch (e) {
                        console.log(`  Response Body:`, data.substring(0, 200));
                    }
                } else {
                    console.log(`  ✅ SUCCESS - Response length: ${data.length} bytes`);
                }

                resolve(`Test completed`);
            });
        });

        req.on('error', (err) => {
            console.log(`  ❌ Error: ${err.message}`);
            resolve(`Error: ${err.message}`);
        });

        req.on('timeout', () => {
            req.destroy();
            console.log(`  ❌ Timeout`);
            resolve('Timeout');
        });

        req.write(bodyString);
        req.end();
    });
}

// Run tests sequentially with delays
async function runTests() {
    console.log(`\n========================================`);
    console.log(`Rome API 403 Diagnostic Tests`);
    console.log(`========================================`);
    console.log(`Endpoint: https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false`);
    console.log(`Common headers: ${Object.keys(headers).join(', ')}`);

    for (const test of tests) {
        await makeRequest(test.payload, test.name);
        // Wait between requests
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n========================================`);
    console.log(`Tests Complete`);
    console.log(`========================================\n`);
}

runTests().catch(console.error);
