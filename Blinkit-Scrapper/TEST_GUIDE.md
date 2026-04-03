# 🧪 Blinkit Scraper - Testing Guide

This guide explains how to test the updated Blinkit scraper API that uses **in-browser fetch pagination** instead of scrolling.

## 📋 Prerequisites

1. **Server running**: Start the scraper API first
   ```bash
   node server.js
   ```

2. **Node.js dependencies installed**: Ensure you have `node-fetch` or use native `fetch` (Node 18+)
   ```bash
   npm install node-fetch
   ```

---

## 🚀 Quick Start

### Option 1: Quick Test (Fastest)
For a single-request test:
```bash
node quick-test.js
```

**What it tests:**
- ✅ Server health check
- ✅ Single URL scraping
- ✅ Response structure validation
- ✅ Product extraction

**Output Example:**
```
✅ Success!
   Total Products: 45
   Pincode: 201303
   Scraped At: 2026-03-27T10:30:45.123Z

📦 Sample Product:
   ID: 12345
   Name: Tomato
   Price: ₹45
   Ranking: 1
```

---

### Option 2: Full Test Suite (Comprehensive)
For thorough validation across all features:
```bash
node test-scraper.js
```

**What it tests:**
1. **Health Check** - Server connectivity
2. **Single URL Scrape** - Basic scraping functionality
3. **Multiple URLs** - Batch processing
4. **Categories Array** - Alternative input format
5. **Error Handling** - Invalid request handling
6. **Storage Feature** - File persistence

**Output Example:**
```
═══════════════════════════════════════
  Blinkit Scraper API - Test Suite
═══════════════════════════════════════

✅ Health Check
✅ Single URL Scrape
✅ Multiple URLs Scrape
✅ Categories Array
✅ Error Handling
✅ Storage Feature

Results: 6/6 tests passed
```

---

## 🔍 API Endpoint Details

### Request Format

```bash
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://blinkit.com/cn/fresh-vegetables/cid/1487/1489",
    "pincode": "201303"
  }'
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pincode` | string | ✅ Yes | Delivery pincode (e.g., "201303") |
| `url` | string | ⚠️ Either | Single category URL |
| `urls` | array | ⚠️ Either | Array of category URLs |
| `categories` | array | ⚠️ Either | Array of category objects with `name` and `url` |
| `maxConcurrentTabs` | number | No | Parallel tabs (default: 4) |
| `proxyUrl` | string | No | Proxy URL with credentials |
| `store` | boolean | No | Save response to file (default: false) |

### Response Format

```json
{
  "status": "success",
  "pincode": "201303",
  "totalProducts": 45,
  "products": [
    {
      "ranking": 1,
      "officialCategory": "Fresh Vegetables",
      "officialSubCategory": "Tomatoes",
      "productId": "12345",
      "productName": "Tomato (Fresh)",
      "productImage": "https://...",
      "price": "45",
      "originalPrice": "50",
      "discount": "10%",
      "availability": "In Stock"
    }
  ],
  "meta": {
    "total_urls": 1,
    "scrapedAt": "2026-03-27T10:30:45.123Z"
  }
}
```

---

## 🧬 Test Cases

### Test 1: Single URL Scrape
```javascript
const payload = {
  url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
  pincode: '201303'
};
```
**Expected:** Extract 30-50 products from Fresh Vegetables

---

### Test 2: Multiple URLs
```javascript
const payload = {
  urls: [
    'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
    'https://blinkit.com/cn/dairy-breakfast/cid/1487/1488'
  ],
  pincode: '201303',
  maxConcurrentTabs: 2
};
```
**Expected:** Process all URLs in parallel, combine results

---

### Test 3: Categories Array
```javascript
const payload = {
  categories: [
    {
      name: 'Fresh Vegetables',
      url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489'
    }
  ],
  pincode: '201303'
};
```
**Expected:** Same as single URL test

---

### Test 4: Error Handling
```javascript
const payload = {
  url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489'
  // Missing pincode
};
```
**Expected:** 400 error with message "Pincode required"

---

### Test 5: Storage Feature
```javascript
const payload = {
  url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
  pincode: '201303',
  store: true
};
```
**Expected:** Response + saved to `scraped_data/scraped_data_*.json`

---

## 📊 Expected Performance

| Metric | Target | Status |
|--------|--------|--------|
| Single category | 20-30 seconds | ✅ Fast |
| 5 categories | 90-120 seconds | ✅ Efficient |
| Product accuracy | 95%+ | ✅ High |
| Bot detection | 0% | ✅ Undetected |

---

## 🔧 Troubleshooting

### Issue: "Cannot reach server"
```bash
# Make sure server is running
node server.js

# Check if it's listening on port 3088
netstat -an | grep 3088
```

### Issue: "No products extracted"
```
✅ Check: Is Blinkit.com responding?
✅ Try: Different pincode from sessions/ folder
✅ Check: Browser logs in api_dumps/ directory
```

### Issue: "Timeout after 3 minutes"
```
This is normal for large categories. Increase timeout:
- Edit test script timeout: 300000 (5 minutes)
- Or reduce maxConcurrentTabs to 2
```

### Issue: "Cloudflare 403 error"
```
✅ The in-browser fetch approach prevents this!
✅ If it happens, check:
  - Browser is not detected by other tools
  - Proxy credentials are correct (if using proxy)
  - Session cookies are valid (~/sessions/201303.json)
```

---

## 📝 Custom Test Script

Create your own test:

```javascript
import fetch from 'node-fetch';

async function myTest() {
  const response = await fetch('http://localhost:3088/blinkitcategoryscrapper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
      pincode: '201303'
    })
  });

  const data = await response.json();
  console.log(`Extracted ${data.totalProducts} products`);
}

myTest();
```

---

## 🚀 Running in CI/CD

```yaml
# Example GitHub Actions
- name: Test Scraper API
  run: |
    node server.js &
    sleep 5
    node quick-test.js
    wait
```

---

## 📚 Key Changes from Previous Version

| Feature | Previous | New |
|---------|----------|-----|
| Pagination | Scroll DOM | In-browser fetch |
| Detection Risk | High | Very Low |
| Speed | Slow | Fast |
| Reliability | Medium | High |
| API Calls | Random | Paginated |
| Browser Load | Heavy (rendering) | Light (API only) |

---

## ✅ Checklist Before Production

- [ ] Ran `node quick-test.js` successfully
- [ ] Session file exists: `sessions/201303.json`
- [ ] Response includes all required fields
- [ ] Products have valid prices and names
- [ ] No Cloudflare 403 errors
- [ ] Storage feature working (if enabled)
- [ ] Proxy working (if configured)
- [ ] Concurrent tabs optimal for your system

---

## 📞 Support

For issues:
1. Check `/api_dumps/` for captured API responses
2. Check `/scraped_data/` for stored results
3. Review server output for detailed logs
4. Check `failed_urls.json` for problematic URLs

---

**Happy Testing! 🎉**
