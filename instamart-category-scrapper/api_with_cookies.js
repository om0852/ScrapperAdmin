const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Browser-like headers and cookies for Swiggy API
class SwigyInstamartAPI {
  constructor() {
    this.baseURL = 'https://www.swiggy.com';
    this.cookies = {
      // Session cookies from your browser
      deviceId: 'be92b16d-cbb8-34a2-bdf1-9c65afd15c53',
      tid: 'c5761176-2255-4112-8f28-8ca8ad2948a8',
      sid: 'pdlcb9b6-a171-498f-acf1-cc72a0b3d794',
      versionCode: '1200',
      platform: 'web',
      subplatform: 'dweb',
      statusBarHeight: '0',
      bottomOffset: '0',
      genieTrackOn: 'false',
      'ally-on': 'false',
      isNative: 'false',
      openIMHP: 'false',
      LocSrc: 'swgyUL.Dzm1rLPIhJmB3Tl2Xs6141hVZS0ofGP7LGmLXgQOA7Y'
    };

    // Create axios instance with proper headers
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Content-Type': 'application/json',
        'Origin': 'https://www.swiggy.com',
        'Referer': 'https://www.swiggy.com/instamart/category-listing',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'TE': 'trailers',
        'x-build-version': '2.316.0'
      },
      timeout: 30000
    });

    // Add interceptor to include cookies
    this.client.interceptors.request.use(config => {
      config.headers['Cookie'] = this.generateCookieString();
      return config;
    });
  }

  generateCookieString() {
    return Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  setCookie(key, value) {
    this.cookies[key] = value;
  }

  async fetchCategoryListingFilter(payload) {
    try {
      console.log('Making POST request to category-listing filter API...');
      console.log('Payload:', JSON.stringify(payload, null, 2));

      const response = await this.client.post(
        '/api/instamart/category-listing/filter/v2',
        payload
      );

      console.log('✓ Request successful');
      console.log(`Status: ${response.status}`);
      
      // Update cookies from response if any
      if (response.headers['set-cookie']) {
        console.log('Updating cookies from response...');
        response.headers['set-cookie'].forEach(cookie => {
          const [key] = cookie.split('=');
          const value = cookie.split('=')[1].split(';')[0];
          this.setCookie(key, value);
        });
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        console.error('✗ API Error:');
        console.error(`Status: ${error.response.status}`);
        console.error('Response:', error.response.data);
      } else {
        console.error('✗ Request Error:', error.message);
      }
      throw error;
    }
  }

  async fetchMultiplePages(basePayload, pageCount = 5) {
    const results = [];
    
    for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
      try {
        console.log(`\n--- Fetching Page ${pageNo} ---`);
        
        const payload = {
          ...basePayload,
          pageNo: pageNo,
          offset: (pageNo - 1) * 10 + 1
        };

        const data = await this.fetchCategoryListingFilter(payload);
        results.push({
          pageNo,
          timestamp: new Date().toISOString(),
          data
        });

        // Add delay between requests to avoid blocking
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Failed to fetch page ${pageNo}`);
      }
    }

    return results;
  }

  async saveResults(results, filename) {
    const filepath = path.join(__dirname, filename);
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    console.log(`\n✓ Results saved to ${filename}`);
  }
}

// Example usage
async function main() {
  const api = new SwigyInstamartAPI();

  // Set your actual cookies here (get from browser DevTools -> Application -> Cookies)
  api.setCookie('deviceId', 'be92b16d-cbb8-34a2-bdf1-9c65afd15c53');
  api.setCookie('tid', 'c5761176-2255-4112-8f28-8ca8ad2948a8');
  api.setCookie('sid', 'pdlcb9b6-a171-498f-acf1-cc72a0b3d794');

  // Prepare the API payload
  const payload = {
    storeId: '1314371',
    primaryStoreId: '1314371',
    secondaryStoreId: '',
    pageNo: 1,
    offset: 1,
    page_name: 'category_listing_filter',
    filters: [
      // Add your filter parameters here
      // This depends on what you're trying to fetch
    ]
  };

  try {
    // Fetch single page
    // const result = await api.fetchCategoryListingFilter(payload);
    // console.log(JSON.stringify(result, null, 2));

    // Fetch multiple pages
    const results = await api.fetchMultiplePages(payload, 5);
    await api.saveResults(results, `instamart_api_results_${Date.now()}.json`);
  } catch (error) {
    console.error('Fatal error:', error.message);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = SwigyInstamartAPI;
