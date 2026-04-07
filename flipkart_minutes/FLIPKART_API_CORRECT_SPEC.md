# Flipkart Minutes - Correct API Specification

## Critical Fix Applied

The previous implementation was **incorrectly constructing the API endpoint**. This document provides the **correct specification** based on actual network traffic inspection.

## Correct API Endpoint

### ❌ WRONG (Old Implementation)
```
https://www.flipkart.com/api/4/page/fetch?pageUID=1774714783000
```

### ✅ CORRECT (Fixed Implementation)
```
https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false
```

## Key Differences

| Aspect | Wrong | Correct |
|--------|-------|---------|
| Domain | `www.flipkart.com` | `1.rome.api.flipkart.com` |
| Path | `/api/4/page/fetch` | `/api/4/page/fetch` |
| Query Param | `pageUID=<timestamp>` | `cacheFirst=false` |
| Port | Implicit (443) | Explicit (443 via HTTPS) |
| IP Address | Dynamic | `103.243.33.5` (or other Rome servers) |

## Network Details

### Request

```
Method: POST
URL: https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false
Status: 200 OK
Remote Address: 103.243.33.5:443
```

### Headers (Confirmed)

```
Request Headers:
├─ Host: 1.rome.api.flipkart.com
├─ Origin: https://www.flipkart.com
├─ Referer: https://www.flipkart.com/
├─ Accept: */*
├─ Accept-Encoding: gzip, deflate, br, zstd
├─ Accept-Language: en-GB,en-US;q=0.9,en;q=0.8
├─ Content-Type: application/json
├─ Cache-Control: no-cache
├─ Pragma: no-cache
├─ Sec-Fetch-Dest: empty
├─ Sec-Fetch-Mode: cors
├─ Sec-Fetch-Site: same-site
├─ User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...
├─ X-User-Agent: Mozilla/5.0 ... FKUA/website/desktop/5.0.0/desktop
├─ Cookie: [Multiple authentication cookies]
└─ Connection: keep-alive

Response Headers:
├─ Status: 200 OK
├─ Content-Type: application/json;charset=utf-8
├─ Content-Encoding: gzip
├─ Access-Control-Allow-Origin: https://www.flipkart.com
├─ Access-Control-Allow-Credentials: true
├─ Server: nginx
├─ Set-Cookie: at=<JWT_TOKEN>; Domain=flipkart.com; Secure; HttpOnly
├─ Set-Cookie: vd=<encrypted>; Domain=flipkart.com; Secure; HttpOnly
├─ Set-Cookie: ud=<encrypted>; Domain=flipkart.com; Secure; HttpOnly
├─ Transfer-Encoding: chunked
├─ X-Request-ID: f2cfa6bb-41d7-43df-91c2-247cf7ed6a70
├─ X-Payload-Length: 292859
└─ Vary: Accept-Encoding, User-Agent
```

## Request Payload Structure

### Correct Payload Format

```json
{
  "pageContext": {
    "pageId": "PAGE_SEARCH",
    "catalogId": null,
    "pageNumber": 1,
    "pageSize": 40
  },
  "requestContext": {
    "marketPlace": "HYPERLOCAL",
    "clientContext": {
      "appVersion": "146.0.0.0",
      "entryPoint": "HYPERLOCAL_BROWSE"
    }
  }
}
```

### Key Notes

- **pageNumber**: Increment for pagination (1, 2, 3, ...)
- **pageSize**: 40 products per page (standard)
- **marketPlace**: Must be "HYPERLOCAL" (Flipkart Minutes)
- **appVersion**: Match Chrome version (146.0.0.0)
- **catalogId**: Can be null or specific category ID

## Response Structure

```json
{
  "RESPONSE": {
    "pageMeta": {
      "hasNextPage": true,
      "pageNumber": 1,
      "pageSize": 40
    },
    "slots": [...],
    "widgetContext": {...}
  }
}
```

## Session Management

### Authentication Cookies

Flipkart Rome API uses multiple authentication tokens:

1. **at** (Access Token)
   - JWT token with expiration
   - Contains user authentication
   - Secure, HttpOnly flag

2. **vd** (Visitor Data)
   - Encrypted device fingerprint
   - Tracks user device
   - Secure, HttpOnly flag

3. **ud** (User Data)
   - Encrypted user profile data
   - Tracks user behaviors
   - Secure, HttpOnly flag

4. **S** (Session)
   - HMAC signed session data
   - Secure, HttpOnly flag

5. **SN** (Session Number)
   - Sequential session identifier
   - Also secure

### Cookie Persistence

```javascript
// Cookies should be saved and reused per pincode
// Expiration: 15,552,000 seconds (~180 days)
// Domain: flipkart.com (works for all subdomains)
```

## CORS Details

```
Access-Control-Allow-Origin: https://www.flipkart.com
Access-Control-Allow-Methods: POST, GET, OPTIONS, DELETE, PUT
Access-Control-Allow-Headers: X-ACK-RESPONSE,X-PARTNER-CONTEXT
Access-Control-Allow-Credentials: true
```

The API explicitly allows cross-origin requests **only** from https://www.flipkart.com, which is why the Referer and Origin headers are critical.

## Rome API Info

### What is Rome?

Rome is Flipkart's **API gateway/server cluster** specifically for:
- **Hyperlocal delivery** (Flipkart Minutes)
- **Real-time inventory** queries
- **Quick search** operations
- **Fast pagination** through grocery products

### Rome Server Addresses

```
Primary: 1.rome.api.flipkart.com
IP: 103.243.33.5 (varies by location/load balancing)
```

The naming convention suggests:
- **1** = Instance/cluster ID
- **rome** = API service endpoint name
- **api.flipkart.com** = Flipkart's API domain

## Response Size

```
X-Payload-Length: 292859 bytes (~286 KB)
Content-Encoding: gzip (compressed)
```

Uncompressed response may be ~1-2MB depending on product catalog size.

## Implementation Changes

### Before (Wrong)

```javascript
// INCORRECT - builds endpoint from category URL
const apiUrl = new URL(categoryUrl);
const apiEndpoint = `${apiUrl.protocol}//${apiUrl.host}/api/4/page/fetch?pageUID=${Date.now()}`;
// Would result in: https://some-category-url/api/4/page/fetch?pageUID=...
```

### After (Correct)

```javascript
// CORRECT - uses hardcoded Rome API endpoint
const apiEndpoint = 'https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false';
// Results in: https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false
```

## HTTP/2 Considerations

Flipkart's Rome API servers use HTTP/2:
- Multiplexed streams
- Binary framing
- Server push capability
- Compression (HPACK)

Modern fetch/axios automatically handles this, but be aware for custom HTTP implementations.

## Rate Limiting

```
No explicit X-RateLimit headers visible
Recommended: 1-2 requests per second per session
Suggested delay between pages: 2000ms minimum
```

## Testing Verification

To verify the correct endpoint:

```bash
# Check saved API dumps
ls -la api_dumps/dump*response*.json

# Verify Rome API was called
grep -r "1.rome.api.flipkart.com" api_dumps/
```

## Troubleshooting

### Issue: 403 Forbidden

**Cause**: Missing or expired authentication cookies
**Fix**: Ensure cookies are properly loaded from session storage

### Issue: 429 Too Many Requests

**Cause**: Rate limiting triggered
**Fix**: Reduce concurrent_limit and increase delays between pages

### Issue: 200 OK but Empty Response

**Cause**: Wrong payload structure or pageNumber out of range
**Fix**: Verify pageContext and requestContext structure

### Issue: CORS Error in Browser

**Cause**: Request from wrong origin
**Fix**: Should not happen in direct API (server-to-server), check referrer header

## Best Practices

1. ✅ **Always use** `https://1.rome.api.flipkart.com`
2. ✅ **Always set** `cacheFirst=false` query parameter
3. ✅ **Always include** Referer and Origin headers
4. ✅ **Always preserve** authentication cookies
5. ✅ **Always use** POST method
6. ✅ **Always use** JSON request body
7. ❌ **Never** change the API domain
8. ❌ **Never** use pageUID query parameter
9. ❌ **Never** call www.flipkart.com/api/... directly

## Additional Resources

- **API Gateway**: Rome on 1.rome.api.flipkart.com
- **Caching**: Set `cacheFirst=false` to bypass server caches
- **Authentication**: Managed via JWT (at) token
- **Pagination**: Page numbers start at 1
- **Compression**: gzip/brotli encoding supported

---

**Status**: ✅ Fixed and Verified
**Date**: March 28, 2026
**API Version**: Flipkart v4
**Last Verified**: Real network inspection
