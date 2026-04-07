# Flipkart Minutes Scraping - HTTP 403 Analysis & Solutions

## Problem Summary
- **Rome API Calls**: All returning HTTP 403 Forbidden
- **Headers**: Enhanced with all common bot-detection bypasses
- **Patterns**: 100% consistent failure across URLs, retries, and payloads
- **Root Cause**: Rome API likely requires JavaScript execution context

## Why Direct HTTPS Won't Work for Rome API

The Rome API (`https://1.rome.api.flipkart.com`) is designed as an **internal browser API**, not a public API. It expects:
1. **JavaScript initialization** - Certain values populated by browser code
2. **Specific cookies** - Auth tokens generated during page load
3. **Timing patterns** - Sequential requests matching browser behavior
4. **TLS fingerprinting** - Cipher suites matching real browsers

Flipkart's anti-bot system detects direct HTTPS requests as non-browser traffic and blocks them with 403.

## Recommended Solutions (in order of feasibility)

### Solution 1: Playwright with API Interception (RECOMMENDED)
**Approach**: Use Playwright to load page + intercept Rome API calls
**Pros**:
- Genuine browser execution context
- No API authentication issues
- Can capture all required auth tokens
- Reliable and proven
**Cons**:
- Slower than pure API approach
- Requires browser resources
**Implementation**: 
```javascript
// Load page to trigger JavaScript
await page.goto(categoryUrl);

// Intercept API calls
page.on('response', req => {
  if (req.url().includes('rome.api.flipkart.com')) {
    const data = await req.json();
    // Use this data directly, cache responses
  }
});
```

### Solution 2: HTML Parsing Fallback
**Approach**: Parse HTML directly from www.flipkart.com
**Pros**:
- No API authentication needed
- Can scrape without JavaScript
- Simpler implementation
**Cons**:
- Slower than API
- HTML structure changes require updates
- May require form submissions

### Solution 3: Alternative Flipkart APIs
**Research needed**: Check if Flipkart has other public/documented APIs
- GraphQL endpoints
- Search/category endpoints that don't require Rome
- Legacy API versions

## Status of Direct API Approach
- ❌ **HTTP 403 - Blocked**
- No viable workaround found without browser execution
- Flipkart's anti-bot system is too sophisticated

## Recommendation
**Implement Playwright with API Interception** (Solution 1):
- Achieves speed improvements (via API response caching)
- Maintains reliability (genuine browser context)
- Practical to implement
- Fallback to HTML parsing for reliability

Would you like me to:
1. Implement Playwright + API interception?
2. Create HTML parsing fallback?
3. Research alternative Flipkart APIs?
