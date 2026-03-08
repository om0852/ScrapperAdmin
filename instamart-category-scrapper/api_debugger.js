const axios = require('axios');
const fs = require('fs');

/**
 * Swiggy API Debugger - Debug 202 Empty Response Issue
 * 
 * This script helps identify why you're getting 202 with empty response
 */

class SwigyDebugger {
  constructor() {
    this.baseURL = 'https://www.swiggy.com';
  }

  log(label, value, emoji = '→') {
    console.log(`${emoji} ${label}: ${JSON.stringify(value)}`);
  }

  async testBasicConnectivity() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TEST 1: Basic Connectivity');
    console.log('='.repeat(60));

    try {
      const response = await axios.get('https://www.swiggy.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0'
        }
      });
      
      this.log('Response Status', response.status, '✓');
      this.log('Can Access Swiggy', 'Yes', '✓');
      return true;
    } catch (error) {
      this.log('Error', error.message, '✗');
      return false;
    }
  }

  async testAPIEndpoint(payload) {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TEST 2: API Endpoint with Minimal Headers');
    console.log('='.repeat(60));

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'https://www.swiggy.com',
      'Referer': 'https://www.swiggy.com/instamart/'
    };

    try {
      console.log('📤 Sending payload...');
      console.log(JSON.stringify(payload, null, 2));

      const response = await axios.post(
        'https://www.swiggy.com/api/instamart/category-listing/filter/v2',
        payload,
        { headers, timeout: 30000, validateStatus: () => true }
      );

      this.log('Status Code', response.status, '→');
      this.log('Status Text', response.statusText, '→');
      this.log('Content-Type', response.headers['content-type'], '→');
      this.log('Content-Length', response.headers['content-length'], '→');
      this.log('Response Size (bytes)', JSON.stringify(response.data).length, '→');
      this.log('Response is Empty?', Object.keys(response.data).length === 0, '→');
      
      console.log('\n📋 Full Response:');
      if (typeof response.data === 'string') {
        console.log(response.data.substring(0, 500));
      } else {
        console.log(JSON.stringify(response.data, null, 2).substring(0, 500));
      }

      return response;
    } catch (error) {
      this.log('Error', error.message, '✗');
      return null;
    }
  }

  async testWithCookies(cookies, payload) {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TEST 3: API with Cookies');
    console.log('='.repeat(60));

    const cookieString = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'https://www.swiggy.com',
      'Referer': 'https://www.swiggy.com/instamart/',
      'Cookie': cookieString
    };

    try {
      console.log('🍪 Cookies being sent:');
      Object.keys(cookies).forEach(key => {
        console.log(`   • ${key}: ${cookies[key].substring(0, 30)}...`);
      });

      const response = await axios.post(
        'https://www.swiggy.com/api/instamart/category-listing/filter/v2',
        payload,
        { headers, timeout: 30000, validateStatus: () => true }
      );

      this.log('Status Code', response.status, '→');
      this.log('Response is Empty?', Object.keys(response.data).length === 0, '→');
      
      if (response.status === 202) {
        console.log('\n⚠️  202 ACCEPTED');
        console.log('   This means the request is still processing');
        console.log('   The API might use polling or WebSocket');
      }

      if (response.status === 403) {
        console.log('\n❌ 403 FORBIDDEN');
        console.log('   Your cookies are invalid or expired');
        console.log('   Refresh cookies from your browser!');
      }

      return response;
    } catch (error) {
      this.log('Error', error.message, '✗');
      return null;
    }
  }

  async testDifferentPayloads() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TEST 4: Try Different Payload Structures');
    console.log('='.repeat(60));

    const payloads = [
      {
        name: 'Minimal',
        data: { storeId: '1314371' }
      },
      {
        name: 'With pageNo',
        data: { storeId: '1314371', pageNo: 1 }
      },
      {
        name: 'Original',
        data: {
          storeId: '1314371',
          primaryStoreId: '1314371',
          pageNo: 1,
          offset: 0,
          page_name: 'category_listing_filter',
          filters: []
        }
      },
      {
        name: 'With empty body',
        data: {}
      }
    ];

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
      'Content-Type': 'application/json'
    };

    for (const { name, data } of payloads) {
      try {
        console.log(`\n  Testing "${name}" payload...`);
        const response = await axios.post(
          'https://www.swiggy.com/api/instamart/category-listing/filter/v2',
          data,
          { headers, timeout: 15000, validateStatus: () => true }
        );

        console.log(`    Status: ${response.status} | Response keys: ${Object.keys(response.data).length}`);
        
        if (Object.keys(response.data).length > 0) {
          console.log(`    ✓ Got data with "${name}" payload!`);
          return response.data;
        }
      } catch (error) {
        console.log(`    Error: ${error.message}`);
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async runFullDiagnostics(cookies = {}) {
    console.log('\n');
    console.log('╔' + '='.repeat(58) + '╗');
    console.log('║' + ' '.repeat(12) + '🔍 SWIGGY API DIAGNOSTICS' + ' '.repeat(21) + '║');
    console.log('╚' + '='.repeat(58) + '╝');

    // Test 1: Basic connectivity
    const canConnect = await this.testBasicConnectivity();
    if (!canConnect) {
      console.log('\n❌ Cannot connect to Swiggy at all. Check your internet!');
      return;
    }

    // Test 2: Basic API
    const payload = {
      storeId: '1314371',
      primaryStoreId: '1314371',
      pageNo: 1,
      offset: 0,
      page_name: 'category_listing_filter',
      filters: []
    };

    await this.testAPIEndpoint(payload);

    // Test 3: With cookies if provided
    if (Object.keys(cookies).length > 0) {
      await this.testWithCookies(cookies, payload);
    } else {
      console.log('\n⚠️ No cookies provided. Skipping cookie test.');
      console.log('   Run with cookies to test authenticated requests!');
    }

    // Test 4: Different payloads
    await this.testDifferentPayloads();

    console.log('\n' + '='.repeat(60));
    console.log('📌 RECOMMENDATIONS:');
    console.log('='.repeat(60));
    console.log('1. If all tests show 202 + empty response:');
    console.log('   → API is designed differently');
    console.log('   → Check browser DevTools Network tab in real request');
    console.log('   → Look for actual response data structure');
    console.log('');
    console.log('2. If 403 appears:');
    console.log('   → Refresh cookies immediately');
    console.log('   → Make sure sid is not expired');
    console.log('');
    console.log('3. If you get data in some payloads:');
    console.log('   → Use that payload structure in your scraper');
    console.log('   → Adjust filters as needed');
  }
}

// Run diagnostics
const debugger = new SwigyDebugger();

// Try with empty cookies first
debugger.runFullDiagnostics({}).catch(console.error);

// Optionally, uncomment and add your cookies
/*
const myCookies = {
  deviceId: 'your-device-id',
  sid: 'your-session-id',
  tid: 'your-tid',
  // ... add your cookies here
};

debugger.runFullDiagnostics(myCookies).catch(console.error);
*/
