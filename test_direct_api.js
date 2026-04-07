/**
 * Test Script for Direct API Scraper
 * 
 * Demonstrates how to call the direct API scraper via HTTP requests
 * Tests both Jiomart and Flipkart Minutes platforms
 */

const fetch = require('node-fetch');

// Server configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';
const PINCODE = process.env.PINCODE || '110001';

/**
 * Test Jiomart direct API scraping
 */
async function testJiomartDirectAPI() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  Testing Jiomart Direct API Scraping   ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    try {
        // Example Jiomart URLs
        const jiomartUrls = [
            'https://www.jiomart.com/c/groceries/grains',
            'https://www.jiomart.com/c/groceries/vegetables'
        ];
        
        console.log(`📍 Pincode: ${PINCODE}`);
        console.log(`📄 URLs to scrape: ${jiomartUrls.length}`);
        
        // Make scraping request
        const response = await fetch(`${SERVER_URL}/api/jiomart/scrape?pincode=${PINCODE}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                urls: jiomartUrls
            })
        });
        
        const result = await response.json();
        console.log('\n✅ Scrape request initiated');
        console.log(`Session ID: ${result.sessionId}`);
        
        if (result.success) {
            // Poll for results
            let attempts = 0;
            const maxAttempts = 60; // 5 minutes with 5-second intervals
            
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds
                attempts++;
                
                // Check session status
                const statusResponse = await fetch(`${SERVER_URL}/api/session/${result.sessionId}/status`);
                const status = await statusResponse.json();
                
                console.log(`[${attempts * 5}s] Status: ${status.status}`);
                
                if (status.status === 'completed') {
                    console.log(`✅ Completed - Total products: ${status.totalProducts}`);
                    
                    // Get full results
                    const resultsResponse = await fetch(`${SERVER_URL}/api/session/${result.sessionId}`);
                    const results = await resultsResponse.json();
                    
                    console.log('\n📊 Results Summary:');
                    console.log(`Total Products: ${results.totalProducts}`);
                    console.log(`Completed at: ${results.completedAt}`);
                    
                    return results;
                } else if (status.status === 'error') {
                    console.error(`❌ Error: ${status.error}`);
                    return null;
                }
            }
            
            console.warn('⏱️  Timeout waiting for results');
        }
        
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
    }
}

/**
 * Test Flipkart Minutes direct API scraping
 */
async function testFlipkartDirectAPI() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║ Testing Flipkart Minutes Direct API    ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    try {
        // Example Flipkart Minutes URLs
        const flipkartUrls = [
            'https://www.flipkart.com/fm/api/4/page/fetch?pageUID=1640000000000',
            'https://www.flipkart.com/fm/api/4/page/fetch?pageUID=1640000001000'
        ];
        
        console.log(`📍 Pincode: ${PINCODE}`);
        console.log(`📄 URLs to scrape: ${flipkartUrls.length}`);
        
        // Make scraping request
        const response = await fetch(`${SERVER_URL}/api/flipkart/scrape?pincode=${PINCODE}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                urls: flipkartUrls
            })
        });
        
        const result = await response.json();
        console.log('\n✅ Scrape request initiated');
        console.log(`Session ID: ${result.sessionId}`);
        
        if (result.success) {
            // Poll for results
            let attempts = 0;
            const maxAttempts = 60;
            
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 5000));
                attempts++;
                
                const statusResponse = await fetch(`${SERVER_URL}/api/session/${result.sessionId}/status`);
                const status = await statusResponse.json();
                
                console.log(`[${attempts * 5}s] Status: ${status.status}`);
                
                if (status.status === 'completed') {
                    console.log(`✅ Completed - Total products: ${status.totalProducts}`);
                    
                    const resultsResponse = await fetch(`${SERVER_URL}/api/session/${result.sessionId}`);
                    const results = await resultsResponse.json();
                    
                    console.log('\n📊 Results Summary:');
                    console.log(`Total Products: ${results.totalProducts}`);
                    console.log(`Completed at: ${results.completedAt}`);
                    
                    return results;
                } else if (status.status === 'error') {
                    console.error(`❌ Error: ${status.error}`);
                    return null;
                }
            }
            
            console.warn('⏱️  Timeout waiting for results');
        }
        
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
    }
}

/**
 * Test multi-platform scraping
 */
async function testMultiPlatformDirectAPI() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  Testing Multi-Platform Direct API     ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    try {
        const mixedUrls = [
            'https://www.jiomart.com/c/groceries/grains',
            'https://www.flipkart.com/fm/api/4/page/fetch?pageUID=1640000000000'
        ];
        
        console.log(`📍 Pincode: ${PINCODE}`);
        console.log(`📄 URLs to scrape: ${mixedUrls.length}`);
        
        const response = await fetch(`${SERVER_URL}/api/scrape-all?pincode=${PINCODE}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                urls: mixedUrls
            })
        });
        
        const result = await response.json();
        console.log('\n✅ Scrape request initiated');
        console.log(`Session ID: ${result.sessionId}`);
        console.log(`Platforms: Jiomart (${result.platforms.jiomart}), Flipkart (${result.platforms.flipkart_minutes})`);
        
        if (result.success) {
            let attempts = 0;
            const maxAttempts = 60;
            
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 5000));
                attempts++;
                
                const statusResponse = await fetch(`${SERVER_URL}/api/session/${result.sessionId}/status`);
                const status = await statusResponse.json();
                
                console.log(`[${attempts * 5}s] Status: ${status.status}`);
                
                if (status.status === 'completed') {
                    console.log(`✅ Completed - Total products: ${status.totalProducts}`);
                    
                    const resultsResponse = await fetch(`${SERVER_URL}/api/session/${result.sessionId}`);
                    const results = await resultsResponse.json();
                    
                    console.log('\n📊 Results Summary:');
                    console.log(`Total Products: ${results.totalProducts}`);
                    console.log(`Platform Breakdown:`);
                    Object.entries(results.productCounts).forEach(([platform, count]) => {
                        console.log(`  ${platform}: ${count} products`);
                    });
                    
                    return results;
                } else if (status.status === 'error') {
                    console.error(`❌ Error: ${status.error}`);
                    return null;
                }
            }
            
            console.warn('⏱️  Timeout waiting for results');
        }
        
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
    }
}

/**
 * Test session listing
 */
async function testSessionListing() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  Testing Session Listing               ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    try {
        const response = await fetch(`${SERVER_URL}/api/sessions`);
        const data = await response.json();
        
        console.log(`📊 Sessions found: ${data.count}`);
        if (data.sessions.length > 0) {
            console.log('\nRecent sessions:');
            data.sessions.slice(0, 10).forEach((sessionId, index) => {
                console.log(`  ${index + 1}. ${sessionId}`);
            });
        }
        
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
    }
}

/**
 * Test server health
 */
async function testServerHealth() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  Testing Server Health                 ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    try {
        const response = await fetch(`${SERVER_URL}/health`);
        const data = await response.json();
        
        console.log(`✅ Server Status: ${data.status}`);
        console.log(`Version: ${data.version}`);
        console.log(`Mode: ${data.mode}`);
        console.log(`Default Pincode: ${data.pincode}`);
        
        return true;
        
    } catch (error) {
        console.error(`❌ Server unavailable: ${error.message}`);
        console.log(`Make sure the server is running at ${SERVER_URL}`);
        console.log(`Start it with: npm start`);
        return false;
    }
}

/**
 * Main test runner
 */
async function runTests() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  Direct API Scraper Test Suite         ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`\nServer URL: ${SERVER_URL}`);
    console.log(`Default Pincode: ${PINCODE}`);
    
    // Check server health first
    const isHealthy = await testServerHealth();
    if (!isHealthy) {
        process.exit(1);
    }
    
    // Run tests based on command line arguments
    const testArg = process.argv[2];
    
    if (!testArg || testArg === 'all') {
        console.log('\n⚡ Running all tests...\n');
        await testSessionListing();
        // Uncomment to run actual scraping tests:
        // await testJiomartDirectAPI();
        // await testFlipkartDirectAPI();
        // await testMultiPlatformDirectAPI();
    } else if (testArg === 'jiomart') {
        await testJiomartDirectAPI();
    } else if (testArg === 'flipkart') {
        await testFlipkartDirectAPI();
    } else if (testArg === 'multi') {
        await testMultiPlatformDirectAPI();
    } else if (testArg === 'sessions') {
        await testSessionListing();
    } else {
        console.log(`\nUsage: node test_direct_api.js [test]`);
        console.log(`\nAvailable tests:`);
        console.log(`  jiomart   - Test Jiomart direct API`);
        console.log(`  flipkart  - Test Flipkart direct API`);
        console.log(`  multi     - Test multi-platform scraping`);
        console.log(`  sessions  - List all sessions`);
        console.log(`  all       - Run all tests (default)`);
    }
    
    console.log('\n');
}

// Run tests
runTests().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
});
