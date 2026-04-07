# Proxy Fallback Quick Start

## What Was Added?
Your Instamart scraper now has **automatic proxy fallback**. When requests fail (glitch payloads, timeouts, rate limiting), the scraper will automatically restart the browser with an Apify residential proxy and retry.

## Is It Enabled by Default?
**YES!** Proxy fallback is enabled by default and uses this Apify residential proxy:
```
http://groups-RESIDENTIAL:apify_proxy_qSfOtbOtJniV67rnynnJYcP2BBL7G520BFKa@proxy.apify.com:8000
```

## How to Use It

### Option 1: Just Run It (Default Proxy)
```bash
cd instamart-category-scrapper
npm run dev
```
The scraper will automatically use proxy fallback when needed - no additional configuration required!

### Option 2: Custom Proxy URL
Set environment variable and run:
```bash
# Windows
set PROXY_URL=http://username:password@proxy.example.com:8000
node server.js

# Linux/Mac
export PROXY_URL=http://username:password@proxy.example.com:8000
node server.js
```

### Option 3: With Docker
```bash
docker run \
  -e PROXY_URL="http://groups-RESIDENTIAL:apify_proxy_...@proxy.apify.com:8000" \
  -e HEADLESS=true \
  your-image-name
```

## When Does Proxy Activate?

Proxy automatically kicks in when:
1. **First page returns glitch payload** (ERR_NON_2XX_3XX_RESPONSE)
2. **First request fails** (timeout, network error, etc.)
3. **Only if no pages captured yet** (no interference with successful scraping)

## Configuration in Code

```javascript
const scraper = new InstamartScraper(
    'sessions/session_122010.json',
    requestConfigs,
    {
        // Proxy settings (all optional)
        proxyUrl: 'http://your-proxy...',        // Default: Apify
        enableProxyFallback: true,                // Default: true
        maxProxyRestartsPerRequest: 2             // Default: 2
    }
);

await scraper.run();
```

## Key Options

| Option | Default | What It Does |
|--------|---------|-------------|
| `proxyUrl` | Apify residential | Proxy URL to use on fallback |
| `enableProxyFallback` | `true` | Enable/disable automatic proxy restart |
| `maxProxyRestartsPerRequest` | `2` | Max times to restart per request |

## Console Output Example

When proxy activates, you'll see:
```
[fresh-fruits] Glitch payload on page 0. No usable page captured.
[fresh-fruits] Attempting proxy fallback...

[PROXY FALLBACK] Closing current browser and restarting with proxy...
✓ Proxy enabled: groups-RESIDENTIAL:***@proxy.apify.com:8000
[PROXY FALLBACK] Browser restarted with proxy (attempt 1)

[fresh-fruits] Retrying after proxy restart...
[fresh-fruits] Page 1: 45 product-like node(s)
```

## Check If Proxy Was Used

After running, check the statistics:
```javascript
// In scraper instance after run():
scraper.requestStats.forEach(stat => {
    if (stat.proxyRestartsUsed > 0) {
        console.log(`${stat.name}: Used proxy ${stat.proxyRestartsUsed} time(s)`);
    }
});
```

## Disable Proxy Fallback (If Needed)

```javascript
const scraper = new InstamartScraper(
    sessionFile,
    requestConfigs,
    {
        enableProxyFallback: false  // Disable proxy fallback
    }
);
```

## Environment Variables

```bash
# Proxy URL (optional - default included)
PROXY_URL=http://...@proxy:8000

# Enable/disable proxy (optional - default true)
PROXY_ENABLED=true

# Max restarts per request (optional - default 2)
MAX_PROXY_RESTARTS_PER_REQUEST=2

# Browser restart delay in ms (optional - default 1500)
RESTART_DELAY_MS=1500
```

## Implementation Details

**File Modified:** `instamart-category-scrapper/server.js`

**Changes Made:**
1. Added 3 new options to constructor
2. Modified `initBrowser()` to accept proxy parameter
3. Added `restartBrowserWithProxy()` method
4. Modified `executeRequest()` to trigger proxy on first-page failures
5. Added proxy statistics to output

**Backward Compatible:** ✅ YES - No breaking changes, proxy is automatic

## Troubleshooting

### Proxy Not Activating?
- Check if `enableProxyFallback: true`
- Verify first request actually failed
- Check console for `[PROXY FALLBACK]` messages

### Still Failing After Proxy?
- Proxy might be blocked/rate-limited too
- Try increasing `maxProxyRestartsPerRequest`
- Increase delays: `interPageDelayMs`, `retryCount`

### Browser Won't Restart?
- Check system resources (enough RAM/CPU)
- Look for error messages in console
- Try reducing `maxConcurrentRequests`

## Examples

See [PROXY_FALLBACK_GUIDE.md](../PROXY_FALLBACK_GUIDE.md) for detailed examples and [proxy-fallback-examples.js](./proxy-fallback-examples.js) for code samples.

## Ready to Use?
Just run it! The feature is completely automatic.
```bash
npm run dev
```
