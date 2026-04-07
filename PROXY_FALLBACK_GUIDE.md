# Proxy Fallback Setup Guide for Instamart Scraper

## Overview
The Instamart scraper now includes **automatic proxy fallback** functionality. When requests fail or encounter glitch payloads, the scraper will automatically restart the browser with an Apify residential proxy to bypass rate limiting and IP blocking.

## Configuration

### Default Proxy
By default, the scraper uses the Apify residential proxy:
```
http://groups-RESIDENTIAL:apify_proxy_qSfOtbOtJniV67rnynnJYcP2BBL7G520BFKa@proxy.apify.com:8000
```

### Options

#### 1. **Via Constructor Options**
```javascript
const scraper = new InstamartScraper(
    'sessions/session_122010.json',
    requestConfigs,
    {
        proxyUrl: 'http://groups-RESIDENTIAL:apify_proxy_qSfOtbOtJniV67rnynnJYcP2BBL7G520BFKa@proxy.apify.com:8000',
        enableProxyFallback: true,  // Enable/disable proxy fallback
        maxProxyRestartsPerRequest: 2  // Max times to restart per request (default: 2)
    }
);
```

#### 2. **Via Environment Variables**
```bash
# Set custom proxy URL
set PROXY_URL=http://your-proxy:port

# Or use the default Apify proxy
npm run dev
```

#### 3. **Using CLI Script**
The scraper can be invoked with proxy settings via environment variables:
```bash
PROXY_URL=http://groups-RESIDENTIAL:... \
HEADLESS=true \
npm run dev
```

## How It Works

### Failure Scenarios Triggering Proxy Fallback
1. **Glitch Payload on First Page**: If the API returns an `ERR_NON_2XX_3XX_RESPONSE` glitch payload before any successful pages are captured
2. **Request Failure on First Page**: If the initial request fails (timeout, network error, etc.) before any pages are captured

### Proxy Activation Flow
```
Request Fails
    ↓
Check: enableProxyFallback === true?
    ↓ YES
Check: proxyRestartsUsed < maxProxyRestartsPerRequest?
    ↓ YES
Check: proxyEnabled === false?
    ↓ YES
Call: restartBrowserWithProxy()
    ↓
Browser closed
    ↓
Sleep for restartDelayMs
    ↓
Browser restarted with proxy
    ↓
Retry request with new context
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `proxyUrl` | string | Apify residential proxy | The proxy URL to use for fallback |
| `enableProxyFallback` | boolean | `true` | Enable/disable automatic proxy fallback |
| `maxProxyRestartsPerRequest` | number | `2` | Maximum proxy restarts per request |
| `restartDelayMs` | number | `1500` | Delay before restarting browser with proxy |

## Example Usage

```javascript
import { InstamartScraper } from './server.js';

const requestConfigs = [
    {
        name: 'fresh-fruits',
        sourceUrl: 'https://www.swiggy.com/instamart/category-listing?...',
        query: { storeId: '1404592', ... },
        body: { categoryName: 'Fresh Fruits', ... }
    }
];

const scraper = new InstamartScraper(
    'sessions/session_122010.json',
    requestConfigs,
    {
        headless: true,
        enableProxyFallback: true,
        maxProxyRestartsPerRequest: 2,
        retryCount: 20,
        proxyUrl: 'http://groups-RESIDENTIAL:apify_proxy_qSfOtbOtJniV67rnynnJYcP2BBL7G520BFKa@proxy.apify.com:8000'
    }
);

await scraper.run();
```

## Logging Output

When proxy fallback is triggered, you'll see console messages like:

```
[fresh-fruits] Glitch payload on page 0. No usable page captured.
[fresh-fruits] Attempting proxy fallback...

[PROXY FALLBACK] Closing current browser and restarting with proxy...
✓ Proxy enabled: groups-RESIDENTIAL:***@proxy.apify.com:8000
[PROXY FALLBACK] Browser restarted with proxy (attempt 1)

[fresh-fruits] Retrying after proxy restart...
[fresh-fruits] Page 1: 25 product-like node(s)
```

## Statistics

Proxy restart statistics are included in the request stats:
```json
{
    "name": "fresh-fruits",
    "pagesCaptured": 5,
    "proxyRestartsUsed": 1,
    "proxyEnabled": true,
    "success": true
}
```

## Best Practices

1. **Use with Rate Limiting**: Proxy fallback is most effective when combined with appropriate delays:
   ```javascript
   {
       interPageDelayMs: 700,      // Delay between pages
       interRequestDelayMs: 1200,  // Delay between requests
       retryBaseDelayMs: 500,      // Base retry delay
       retryMaxDelayMs: 3000       // Max retry delay
   }
   ```

2. **Monitor Proxy Usage**: Keep the `maxProxyRestartsPerRequest` reasonable to avoid excessive restarts
   - Default of `2` means max 2 proxy restarts per request
   - This covers most failure scenarios

3. **Session Management**: Use persistent session files to maintain authentication:
   ```javascript
   const scraper = new InstamartScraper(
       'sessions/session_122010.json',  // Saved session with cookies
       requestConfigs
   );
   ```

4. **Error Handling**: Check the returned stats to monitor proxy usage:
   ```javascript
   const stats = result.stats;
   if (stats.proxyRestartsUsed > 0) {
       console.log(`Request succeeded with proxy after ${stats.proxyRestartsUsed} restart(s)`);
   }
   ```

## Troubleshooting

### Proxy Not Working
- Verify the proxy URL is correct
- Check network connectivity to proxy.apify.com
- Ensure the proxy credentials are valid
- Check firewall/VPN settings

### Still Getting Rate Limited
- Increase `retryCount` for more retry attempts
- Increase delays between requests and pages
- Consider using multiple store IDs or rotating sessions

### Browser Not Restarting
- Check logs for "Failed to restart browser with proxy" message
- Verify `enableProxyFallback: true` in options
- Ensure `maxProxyRestartsPerRequest > 0`

## Environment Variables

```bash
# Custom proxy URL
PROXY_URL=http://username:password@proxy:port

# Control proxy fallback
ENABLE_PROXY_FALLBACK=true
MAX_PROXY_RESTARTS_PER_REQUEST=2

# Browser restart delay (milliseconds)
RESTART_DELAY_MS=1500
```

## Notes
- Proxy is only enabled on explicit failures, not on normal page collection
- Each proxy restart closes and reopens the browser context
- Session cookies are preserved across proxy restarts
- Maximum of 2 proxy restarts per request by default (configurable)
