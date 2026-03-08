# Swiggy Instamart API - POST Request Guide with Cookies

## Overview
Yes, you can call the Swiggy Instamart POST API using browser cookies and headers. This prevents getting blocked by mimicking a legitimate browser request.

## Key API Endpoint
```
POST https://www.swiggy.com/api/instamart/category-listing/filter/v2
```

## Step 1: Extract Cookies from Your Browser

### Firefox/Chrome Instructions:
1. Open **DevTools** (Press `F12`)
2. Go to **Storage** (Firefox) or **Application** (Chrome) tab
3. Click **Cookies** → **www.swiggy.com**
4. You'll see all cookies. The important ones are:

| Cookie Name | Purpose | Expiry |
|---|---|---|
| `deviceId` | Device fingerprinting | 30 days |
| `tid` | Tracking ID | 30 days |
| `sid` | Session ID | 1 hour |
| `aws-waf-token` | Anti-bot token | Session |
| `versionCode` | App version | 30 days |
| `platform` | Device type (web/mobile) | 30 days |

### Save Cookies to File:
```json
{
  "deviceId": "be92b16d-cbb8-34a2-bdf1-9c65afd15c53",
  "tid": "c5761176-2255-4112-8f28-8ca8ad2948a8",
  "sid": "pdlcb9b6-a171-498f-acf1-cc72a0b3d794",
  "versionCode": "1200",
  "platform": "web",
  "subplatform": "dweb",
  "aws-waf-token": "1209ae5a-a7b2-47ab-90d1-88b2b3830020:..."
}
```

Save this as `swiggy_cookies.json` in your project.

## Step 2: Required Headers

All POST requests need these headers to avoid being blocked:

```javascript
headers: {
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
  'Cookie': '[all cookies joined with ;]'
}
```

## Step 3: API Request Payload

```javascript
{
  "storeId": "1314371",           // Your Instamart store ID
  "primaryStoreId": "1314371",
  "secondaryStoreId": "",
  "pageNo": 1,                     // Page number for pagination
  "offset": 1,                     // Offset for results
  "page_name": "category_listing_filter",
  "filters": [
    {
      "filterType": "category",
      "filterId": "6822eeeded32000001e25ac5",
      "filterName": "Dairy, Bread and Eggs"
    }
    // Add more filters as needed
  ]
}
```

## Step 4: Use the Provided Scripts

### Option A: Simple API Client
```bash
node api_with_cookies.js
```

### Option B: Advanced API Client (Recommended)
```bash
node advanced_api_client.js
```

## Important Notes

### Rate Limiting
- **Always add 2-5 second delays between requests**
- Use exponential backoff on retries (2s, 4s, 8s, 16s)
- Don't exceed 60 requests per minute

### Cookie Expiration
- `sid` (Session ID) expires in **1 hour**
- `aws-waf-token` expires after **session**
- `deviceId` and `tid` last **30 days**

**Solution:** Rotate cookies regularly or implement automatic session refresh

### Anti-Bot Detection
Swiggy uses CloudFlare WAF. To avoid blocking:

1. ✓ Use realistic User-Agent
2. ✓ Include all required headers
3. ✓ Set proper Referer header
4. ✓ Use valid, fresh cookies
5. ✓ Respect rate limits (2-5s delays)
6. ✓ Don't use VPN/Proxy if possible
7. ✓ Rotate cookies periodically

### Handling 403/429 Errors

If you get blocked:

```
403 Forbidden → Invalid/Expired cookies
429 Too Many Requests → Rate limit exceeded
```

**Solutions:**
1. Refresh cookies from browser
2. Increase delay between requests
3. Use residential IP (not datacenter)
4. Implement retry logic with exponential backoff

## Python Alternative (if needed)

```python
import requests

cookies = {
    'deviceId': 'your-device-id',
    'sid': 'your-session-id',
    # ... other cookies
}

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0)...',
    'Content-Type': 'application/json',
    # ... other headers
}

payload = {
    'storeId': '1314371',
    'pageNo': 1,
    'filters': []
}

response = requests.post(
    'https://www.swiggy.com/api/instamart/category-listing/filter/v2',
    json=payload,
    headers=headers,
    cookies=cookies,
    timeout=30
)

print(response.json())
```

## Debugging Tips

### Check Headers:
```javascript
api.client.interceptors.request.use(config => {
  console.log('Request Headers:', config.headers);
  console.log('Request Cookies:', config.headers.Cookie);
  return config;
});
```

### Check Response:
```javascript
console.log('Status:', response.status);
console.log('Headers:', response.headers);
console.log('Body Length:', JSON.stringify(response.data).length);
```

### Log Network Activity:
Use Firefox DevTools → Network tab to monitor requests and see:
- Response status codes
- Set-Cookie headers
- Response body for errors

## Next Steps

1. **Extract cookies** from your browser
2. **Update** `advanced_api_client.js` with your cookies
3. **Test** with: `node advanced_api_client.js`
4. **Monitor** rate limits and adjust delays
5. **Implement session rotation** for long-running scrapes

## References

- Browser DevTools: F12
- Cookie Security: https://owasp.org/www-community/attacks/xss/
- HTTP Headers: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers
- Axios Interceptors: https://axios-http.com/docs/interceptors
