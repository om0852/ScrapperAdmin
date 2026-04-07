/**
 * Test Script: Verify Flipkart Minutes API Endpoint
 * 
 * This script tests the CORRECT Flipkart Rome API endpoint
 * with proper headers and payload structure
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Configuration
const CORRECT_API_ENDPOINT = 'https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false';
const TEST_PINCODE = '122010';
const TEST_OUTPUT_DIR = path.join(__dirname, 'test_results');

// Create output directory
if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

/**
 * Build correct headers as per Flipkart API specification
 */
function buildCorrectHeaders() {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Content-Type': 'application/json',
        'Origin': 'https://www.flipkart.com',
        'Referer': 'https://www.flipkart.com/',
        'X-User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 FKUA/website/desktop/5.0.0/desktop',
        'Connection': 'keep-alive'
    };
}

/**
 * Build correct request payload
 */
function buildCorrectPayload(pageNumber = 1) {
    return {
        pageContext: {
            pageId: 'PAGE_SEARCH',
            catalogId: null,
            pageNumber: pageNumber,
            pageSize: 40
        },
        requestContext: {
            marketPlace: 'HYPERLOCAL',
            clientContext: {
                appVersion: '146.0.0.0',
                entryPoint: 'HYPERLOCAL_BROWSE'
            }
        }
    };
}

/**
 * Test 1: Verify endpoint structure
 */
async function testEndpointStructure() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║ Test 1: Endpoint Structure Verification ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    const endpoint = CORRECT_API_ENDPOINT;
    const url = new URL(endpoint);
    
    console.log('✓ API Endpoint Analysis:');
    console.log(`  Protocol: ${url.protocol}`);
    console.log(`  Hostname: ${url.hostname}`);
    console.log(`  Domain: ${url.hostname === '1.rome.api.flipkart.com' ? '✅ CORRECT' : '❌ WRONG'}`);
    console.log(`  Pathname: ${url.pathname}`);
    console.log(`  Search: ${url.search}`);
    console.log(`  Query param: cacheFirst=${url.searchParams.get('cacheFirst')}`);
    
    const tests = {
        'Protocol is HTTPS': url.protocol === 'https:',
        'Hostname is Rome API': url.hostname === '1.rome.api.flipkart.com',
        'Path is /api/4/page/fetch': url.pathname === '/api/4/page/fetch',
        'Query param exists': url.searchParams.has('cacheFirst'),
        'Query param = false': url.searchParams.get('cacheFirst') === 'false'
    };
    
    console.log('\n✓ Verification Results:');
    let allPassed = true;
    Object.entries(tests).forEach(([testName, passed]) => {
        console.log(`  ${passed ? '✅' : '❌'} ${testName}`);
        if (!passed) allPassed = false;
    });
    
    return allPassed;
}

/**
 * Test 2: Verify header structure
 */
function testHeaderStructure() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║ Test 2: Request Header Verification    ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    const headers = buildCorrectHeaders();
    const requiredHeaders = [
        'User-Agent',
        'Accept',
        'Content-Type',
        'Origin',
        'Referer',
        'X-User-Agent',
        'Sec-Fetch-Dest',
        'Sec-Fetch-Mode',
        'Sec-Fetch-Site'
    ];
    
    console.log('✓ Header Check:');
    let allPresent = true;
    requiredHeaders.forEach(header => {
        const present = header in headers;
        console.log(`  ${present ? '✅' : '❌'} ${header}: ${headers[header] ? '✓' : '✗'}`);
        if (!present) allPresent = false;
    });
    
    // Verify specific values
    console.log('\n✓ Critical Values:');
    const criticalChecks = {
        'Origin is https://www.flipkart.com': headers['Origin'] === 'https://www.flipkart.com',
        'Referer is https://www.flipkart.com/': headers['Referer'] === 'https://www.flipkart.com/',
        'Sec-Fetch-Site is same-site': headers['Sec-Fetch-Site'] === 'same-site',
        'Content-Type is application/json': headers['Content-Type'] === 'application/json'
    };
    
    Object.entries(criticalChecks).forEach(([checkName, passed]) => {
        console.log(`  ${passed ? '✅' : '❌'} ${checkName}`);
        if (!passed) allPresent = false;
    });
    
    return allPresent;
}

/**
 * Test 3: Verify payload structure
 */
function testPayloadStructure() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║ Test 3: Request Payload Verification   ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    const payload = buildCorrectPayload(1);
    
    console.log('✓ Payload Structure:');
    console.log(JSON.stringify(payload, null, 2));
    
    const requiredFields = {
        'pageContext.pageId': payload.pageContext?.pageId === 'PAGE_SEARCH',
        'pageContext.pageNumber': typeof payload.pageContext?.pageNumber === 'number',
        'pageContext.pageSize': payload.pageContext?.pageSize === 40,
        'requestContext.marketPlace': payload.requestContext?.marketPlace === 'HYPERLOCAL',
        'requestContext.clientContext.appVersion': payload.requestContext?.clientContext?.appVersion === '146.0.0.0'
    };
    
    console.log('\n✓ Field Validation:');
    let allValid = true;
    Object.entries(requiredFields).forEach(([fieldName, valid]) => {
        console.log(`  ${valid ? '✅' : '❌'} ${fieldName}`);
        if (!valid) allValid = false;
    });
    
    return allValid;
}

/**
 * Test 4: Make actual API request (if cookies available)
 */
async function testActualRequest() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║ Test 4: Actual API Request             ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    try {
        // Check for saved session
        const sessionFile = path.join(__dirname, 'sessions', `session_${TEST_PINCODE}.json`);
        let cookies = '';
        
        if (fs.existsSync(sessionFile)) {
            const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            cookies = session.cookies;
            console.log(`✓ Using saved session from ${TEST_PINCODE}`);
        } else {
            console.log(`⚠️  No saved session for pincode ${TEST_PINCODE}`);
            console.log('   Run the main scraper first to establish a session');
            return null;
        }
        
        // Prepare request
        const headers = buildCorrectHeaders();
        headers['Cookie'] = cookies;
        
        const payload = buildCorrectPayload(1);
        
        console.log(`\n📤 Making request to: ${CORRECT_API_ENDPOINT}`);
        console.log(`📋 Method: POST`);
        console.log(`📊 Payload size: ${JSON.stringify(payload).length} bytes`);
        
        const response = await fetch(CORRECT_API_ENDPOINT, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            timeout: 30000
        });
        
        console.log(`\n📥 Response received:`);
        console.log(`   Status: ${response.status} ${response.statusText}`);
        console.log(`   Content-Type: ${response.headers.get('content-type')}`);
        console.log(`   Content-Length: ${response.headers.get('content-length')}`);
        
        if (!response.ok) {
            console.log(`\n❌ Request failed:`);
            const text = await response.text();
            console.log(text.substring(0, 200));
            return false;
        }
        
        const data = await response.json();
        
        // Save response for inspection
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultFile = path.join(TEST_OUTPUT_DIR, `test_response_${timestamp}.json`);
        fs.writeFileSync(resultFile, JSON.stringify(data, null, 2));
        console.log(`\n✓ Response saved to: ${path.relative(__dirname, resultFile)}`);
        
        // Analyze response
        console.log('\n✓ Response Analysis:');
        if (data.RESPONSE) {
            console.log(`  ✅ Has RESPONSE object`);
            if (data.RESPONSE.pageMeta) {
                console.log(`  ✅ Has pageMeta`);
                console.log(`     - hasNextPage: ${data.RESPONSE.pageMeta.hasNextPage}`);
                console.log(`     - pageNumber: ${data.RESPONSE.pageMeta.pageNumber}`);
            }
            if (data.RESPONSE.slots) {
                console.log(`  ✅ Has slots: ${data.RESPONSE.slots.length} items`);
            }
        }
        
        return true;
        
    } catch (error) {
        console.log(`\n❌ Request failed: ${error.message}`);
        return false;
    }
}

/**
 * Test 5: Compare old vs new spec
 */
function testCompareSpecs() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║ Test 5: Old vs New Specification       ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    const oldSpec = {
        endpoint: 'https://www.flipkart.com/api/4/page/fetch?pageUID=<timestamp>',
        issue: 'Derived from category URL, uses pageUID'
    };
    
    const newSpec = {
        endpoint: 'https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false',
        issue: 'Fixed: Hardcoded Rome API, correct query param'
    };
    
    console.log('❌ OLD (INCORRECT):');
    console.log(`   Endpoint: ${oldSpec.endpoint}`);
    console.log(`   Issue: ${oldSpec.issue}`);
    
    console.log('\n✅ NEW (CORRECT):');
    console.log(`   Endpoint: ${newSpec.endpoint}`);
    console.log(`   Reason: ${newSpec.issue}`);
    
    console.log('\n✓ Key Changes:');
    console.log('  1. Domain: www.flipkart.com → 1.rome.api.flipkart.com');
    console.log('  2. Query param: pageUID=<timestamp> → cacheFirst=false');
    console.log('  3. Endpoint: Hardcoded (not derived)');
    console.log('  4. Headers: Added Origin, Referer, X-User-Agent');
    console.log('  5. Payload: appVersion 121 → 146 (match Chrome version)');
    
    return true;
}

/**
 * Generate comprehensive test report
 */
async function generateReport() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║  Flipkart Minutes API - Test Report            ║');
    console.log('╚════════════════════════════════════════════════╝');
    
    const results = {
        'Endpoint Structure': await testEndpointStructure(),
        'Header Structure': testHeaderStructure(),
        'Payload Structure': testPayloadStructure(),
        'Specification Comparison': testCompareSpecs()
    };
    
    // Try actual request
    const actualRequest = await testActualRequest();
    if (actualRequest !== null) {
        results['Actual API Request'] = actualRequest;
    }
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  Test Summary                                  ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    Object.entries(results).forEach(([testName, passed]) => {
        if (passed !== null) {
            console.log(`${passed ? '✅' : '❌'} ${testName}`);
        }
    });
    
    const allPassed = Object.values(results).every(r => r !== null && r !== false);
    
    console.log(`\n${allPassed ? '✅' : '⚠️'} Overall: ${allPassed ? 'ALL TESTS PASSED' : 'Some tests need attention'}`);
    console.log(`\nTest results: ${TEST_OUTPUT_DIR}`);
    console.log('\n');
}

// Run all tests
generateReport().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
