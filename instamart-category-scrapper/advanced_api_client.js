const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Advanced Swiggy Instamart API Client with Cookie Management
 * 
 * HOW TO GET COOKIES FROM YOUR BROWSER:
 * 1. Open Firefox/Chrome DevTools (F12)
 * 2. Go to Storage/Application tab
 * 3. Find Cookies for www.swiggy.com
 * 4. Copy these key cookies:
 *    - deviceId
 *    - tid
 *    - sid (changes frequently)
 *    - aws-waf-token
 * 5. Update them in this script or save to cookies.json
 */

class AdvancedSwigyAPI {
  constructor(cookiesFilePath = null) {
    this.baseURL = 'https://www.swiggy.com';
    this.cookies = {};
    this.lastRequestTime = 0;
    this.minRequestInterval = 2000; // 2 seconds between requests

    if (cookiesFilePath && fs.existsSync(cookiesFilePath)) {
      this.loadCookiesFromFile(cookiesFilePath);
    }

    this.setupClient();
  }

  setupClient() {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      validateStatus: () => true // Don't throw on any status
    });

    // Request interceptor to add headers and cookies
    this.client.interceptors.request.use(async (config) => {
      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.minRequestInterval) {
        await new Promise(resolve => 
          setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
        );
      }
      this.lastRequestTime = Date.now();

      // Add headers
      config.headers = {
        ...config.headers,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/json',
        'Origin': 'https://www.swiggy.com',
        'Referer': 'https://www.swiggy.com/instamart/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'x-build-version': '2.316.0',
        'Cookie': this.getCookieString()
      };

      return config;
    });

    // Response interceptor to update cookies
    this.client.interceptors.response.use((response) => {
      if (response.headers['set-cookie']) {
        this.updateCookiesFromResponse(response.headers['set-cookie']);
      }
      return response;
    });
  }

  getCookieString() {
    return Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('; ');
  }

  updateCookiesFromResponse(setCookieHeaders) {
    setCookieHeaders.forEach(cookieHeader => {
      const [cookiePart] = cookieHeader.split(';');
      const [key, ...valueParts] = cookiePart.split('=');
      this.cookies[key.trim()] = valueParts.join('=').trim();
    });
    console.log('✓ Cookies updated from response');
  }

  loadCookiesFromFile(filepath) {
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      this.cookies = data;
      console.log('✓ Cookies loaded from file');
    } catch (error) {
      console.warn('⚠ Could not load cookies from file:', error.message);
    }
  }

  saveCookiesToFile(filepath) {
    fs.writeFileSync(filepath, JSON.stringify(this.cookies, null, 2));
    console.log(`✓ Cookies saved to ${filepath}`);
  }

  setCookie(key, value) {
    this.cookies[key] = value;
  }

  setCookies(cookieObject) {
    this.cookies = { ...this.cookies, ...cookieObject };
  }

  async makeRequest(endpoint, method = 'POST', data = null, debugMode = false) {
    try {
      const config = {
        method,
        url: endpoint,
        data
      };

      console.log(`\n→ ${method} ${endpoint}`);
      if (data) console.log('  Payload:', JSON.stringify(data, null, 2).substring(0, 200) + '...');

      const response = await this.client(config);

      console.log(`✓ Status: ${response.status} (${this.getStatusMessage(response.status)})`);
      
      if (debugMode) {
        console.log('\n📋 DEBUG INFO:');
        console.log('  Response Status:', response.status);
        console.log('  Response Headers:', response.headers);
        console.log('  Response Data Type:', typeof response.data);
        console.log('  Response Data:', response.data);
        console.log('  Content-Length:', response.headers['content-length']);
      }

      // Handle different status codes
      if (response.status === 200 || response.status === 201) {
        return response.data;
      } else if (response.status === 202) {
        // 202 Accepted - Request accepted but still processing
        console.warn('⚠️ Request accepted but still processing (202)');
        console.warn('  Tip: Response may come asynchronously. Data might be empty.');
        return response.data;
      } else if (response.status === 204) {
        // 204 No Content - Success but no data
        console.warn('⚠️ Request successful but no content returned (204)');
        return null;
      } else if (response.status === 403 || response.status === 429) {
        console.error(`✗ Blocked! Status: ${response.status}`);
        console.error('  Response:', response.data?.message || response.statusText);
        console.error('\n🔧 Troubleshooting:');
        console.error('  • If 403: Your cookies are expired. Refresh from browser!');
        console.error('  • If 429: You\'re being rate-limited. Increase request delays.');
        throw new Error(`Request blocked: ${response.status}`);
      } else if (response.status >= 400) {
        console.warn(`⚠️ Error Status: ${response.status}`);
        console.log('  Response:', response.data);
        return response.data;
      } else {
        console.warn(`⚠️ Unexpected Status: ${response.status}`);
        return response.data;
      }
    } catch (error) {
      console.error('✗ Request failed:', error.message);
      throw error;
    }
  }

  getStatusMessage(status) {
    const messages = {
      200: 'OK',
      201: 'Created',
      202: 'Accepted (Processing)',
      204: 'No Content',
      301: 'Moved Permanently',
      302: 'Found',
      304: 'Not Modified',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden (Blocked)',
      404: 'Not Found',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable'
    };
    return messages[status] || 'Unknown';
  }

  async fetchCategoryListing(storeId, pageNo = 1, filters = []) {
    const payload = {
      storeId,
      primaryStoreId: storeId,
      secondaryStoreId: '',
      pageNo,
      offset: (pageNo - 1) * 20,
      page_name: 'category_listing_filter',
      filters
    };

    return this.makeRequest('/api/instamart/category-listing/filter/v2', 'POST', payload);
  }

  async fetchWithRetry(endpoint, method, data, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.makeRequest(endpoint, method, data);
      } catch (error) {
        if (attempt === maxRetries) throw error;
        
        const backoffTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`⏳ Retrying in ${backoffTime / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }

  async scrapeCategoryPages(storeId, pageCount = 5, filters = []) {
    const results = [];

    for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
      try {
        console.log(`\n========== Page ${pageNo}/${pageCount} ==========`);
        
        const data = await this.fetchWithRetry(
          '/api/instamart/category-listing/filter/v2',
          'POST',
          {
            storeId,
            primaryStoreId: storeId,
            secondaryStoreId: '',
            pageNo,
            offset: (pageNo - 1) * 20,
            page_name: 'category_listing_filter',
            filters
          }
        );

        if (data?.data?.gridWidgets) {
          results.push({
            pageNo,
            timestamp: new Date().toISOString(),
            itemCount: data.data.gridWidgets.length,
            data
          });
          console.log(`✓ Scraped ${data.data.gridWidgets.length} items`);
        } else {
          console.warn('⚠ No data in response');
        }
      } catch (error) {
        console.error(`✗ Failed to scrape page ${pageNo}`);
        // Continue to next page instead of stopping
      }
    }

    return results;
  }
}

// Example usage and testing
async function main() {
  // Initialize API client
  const api = new AdvancedSwigyAPI();

  // IMPORTANT: Add your actual cookies from browser here
  // Get these from: DevTools → Storage → Cookies → www.swiggy.com
  api.setCookies({
    // deviceId: 'your-device-id-here',
    // tid: 'your-tid-here',
    // sid: 'your-sid-here',
    // aws-waf-token: 'your-waf-token-here',
    // ... add other cookies as needed
  });

  // Save cookies for future use
  // api.saveCookiesToFile(path.join(__dirname, 'swiggy_cookies.json'));

  try {
    // Test single API call
    console.log('🔍 Testing API connection with DEBUG MODE...\n');
    console.log('📌 Payload Details:');
    console.log('   - storeId: 1314371');
    console.log('   - pageNo: 1');
    console.log('   - filters: [] (empty)');
    console.log('   - Current cookies set:', Object.keys(api.cookies).length > 0 ? Object.keys(api.cookies) : 'None (⚠️ Add cookies!)');
    
    const result = await api.makeRequest(
      '/api/instamart/category-listing/filter/v2',
      'POST',
      {
        storeId: '1314371',
        primaryStoreId: '1314371',
        secondaryStoreId: '',
        pageNo: 1,
        offset: 0,
        page_name: 'category_listing_filter',
        filters: []
      },
      true // Enable debug mode
    );

    console.log('\n✅ API test complete!');
    console.log('\n📊 Response Analysis:');
    console.log('   - Response type:', typeof result);
    console.log('   - Is object:', typeof result === 'object');
    console.log('   - Is empty:', Object.keys(result).length === 0);
    console.log('   - Response keys:', Object.keys(result));
    console.log('   - Full response:', JSON.stringify(result, null, 2).substring(0, 500));

    if (Object.keys(result).length === 0) {
      console.log('\n⚠️ Empty Response Detected!');
      console.log('\n🔧 Possible Causes & Solutions:');
      console.log('   1. ❌ Cookies are invalid/expired');
      console.log('      → Solution: Refresh cookies from browser (DevTools → Storage → Cookies)');
      console.log('   2. ❌ API requires specific filters');
      console.log('      → Solution: Try with specific category/filter IDs');
      console.log('   3. ❌ 202 Status = Request still processing');
      console.log('      → Solution: API may need polling or websocket connection');
      console.log('   4. ❌ Wrong storeId');
      console.log('      → Solution: Verify storeId matches your Instamart location');
      console.log('   5. ❌ Swiggy changed API format');
      console.log('      → Solution: Check network tab in DevTools for actual response structure');
    } else {
      console.log('\n✓ Response has data!');
      // Save sample response
      fs.writeFileSync(
        path.join(__dirname, `api_response_${Date.now()}.json`),
        JSON.stringify(result, null, 2)
      );
      console.log('   Saved to: api_response_*.json');
    }

  } catch (error) {
    console.error('\n✗ API test failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check if cookies are expired/invalid');
    console.error('2. Verify storeId is correct');
    console.error('3. Check if Swiggy has anti-scraping measures');
    console.error('4. Try using a fresh browser session to get new cookies');
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = AdvancedSwigyAPI;
