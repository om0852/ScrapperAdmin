# Testing Blinkit Scraper with Postman

## Prerequisites

1. **Server Running**: Make sure your Blinkit scraper is running
   ```bash
   npm start
   ```
   You should see: `Blinkit Scraper API running on port 3088`

2. **Postman Installed**: Download from [postman.com](https://www.postman.com/downloads/)

---

## Quick Test - Health Check

### Step 1: Test Health Endpoint

**Method**: `GET`  
**URL**: `http://localhost:3088/health`

**Expected Response**:
```json
{
  "status": "ok",
  "services": {
    "scraper": "up"
  }
}
```

This confirms your server is running correctly.

---

## Main Test - Scrape Category

### Step 2: Create POST Request

1. **Open Postman**
2. Click **"New"** → **"HTTP Request"**
3. Set method to **POST**
4. Enter URL: `http://localhost:3088/blinkitcategoryscrapper`

### Step 3: Set Headers

Click on **"Headers"** tab and add:

| Key | Value |
|-----|-------|
| Content-Type | application/json |

### Step 4: Set Request Body

Click on **"Body"** tab:
1. Select **"raw"**
2. Select **"JSON"** from dropdown
3. Paste this JSON:

```json
{
  "pincode": "122016",
  "categories": [
    {
      "name": "Sexual Wellness",
      "url": "https://blinkit.com/cn/sexual-wellness/cid/287/741"
    }
  ],
  "maxConcurrentTabs": 8
}
```

### Step 5: Send Request

Click **"Send"** button

**Expected Response** (this may take 30-60 seconds):
```json
{
  "status": "success",
  "pincode": "122016",
  "totalProducts": 150,
  "products": [
    {
      "rank": 1,
      "id": "123456",
      "name": "Product Name",
      "url": "https://blinkit.com/prn/product-name/prid/123456",
      "image": "https://cdn.grofers.com/...",
      "price": "99",
      "discount": "17%",
      "originalPrice": "120",
      "quantity": "1 unit",
      "deliveryTime": "10 mins",
      "combo": "1",
      "isOutOfStock": false,
      "isAd": false,
      "category": "Sexual Wellness"
    }
    // ... more products
  ]
}
```

---

## Test Variations

### Test 1: Multiple Categories

```json
{
  "pincode": "122016",
  "categories": [
    {
      "name": "Fruits & Vegetables",
      "url": "https://blinkit.com/cn/fruits-vegetables/cid/1487/1489"
    },
    {
      "name": "Dairy & Breakfast",
      "url": "https://blinkit.com/cn/dairy-breakfast/cid/1487/1490"
    }
  ],
  "maxConcurrentTabs": 4
}
```

### Test 2: Different Pincode

```json
{
  "pincode": "110001",
  "categories": [
    {
      "name": "Snacks & Munchies",
      "url": "https://blinkit.com/cn/snacks-munchies/cid/1487/1491"
    }
  ]
}
```

### Test 3: With Proxy (Optional)

```json
{
  "pincode": "122016",
  "categories": [
    {
      "name": "Test Category",
      "url": "https://blinkit.com/cn/..."
    }
  ],
  "proxyUrl": "http://username:password@proxy-server:port"
}
```

---

## Understanding the Response

### Success Response Structure

```json
{
  "status": "success",           // Request succeeded
  "pincode": "122016",            // Pincode used
  "totalProducts": 150,           // Total products scraped
  "products": [...]               // Array of product objects
}
```

### Product Object Structure

```json
{
  "rank": 1,                      // Position in listing
  "id": "123456",                 // Blinkit product ID
  "name": "Product Name",         // Product name
  "url": "https://...",           // Product page URL
  "image": "https://...",         // Product image URL
  "price": "99",                  // Current price
  "originalPrice": "120",         // MRP/Original price
  "discount": "17%",              // Discount percentage
  "quantity": "1 unit",           // Weight/quantity
  "deliveryTime": "10 mins",      // Delivery time
  "combo": "1",                   // Number of variants
  "isOutOfStock": false,          // Stock status
  "isAd": false,                  // Sponsored product
  "category": "Category Name"     // Category name
}
```

### Error Response

```json
{
  "status": "error",
  "message": "Error description",
  "partialData": []
}
```

---

## Common Issues & Solutions

### Issue 1: Connection Refused

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:3088`

**Solution**: 
- Make sure server is running: `npm start`
- Check the port in terminal output
- Verify URL is `http://localhost:3088`

### Issue 2: Invalid Input

**Error**: 
```json
{
  "error": "Invalid input. Pincode and categories array are required."
}
```

**Solution**: 
- Ensure `pincode` is provided
- Ensure `categories` is an array
- Each category must have `name` and `url`

### Issue 3: Timeout

**Error**: Request times out after 2 minutes

**Solution**:
- This is normal for large categories
- Increase Postman timeout: Settings → General → Request timeout
- Or reduce categories in request

### Issue 4: Empty Products Array

**Response**: `totalProducts: 0`

**Possible Causes**:
- Invalid category URL
- Pincode not serviceable
- Page structure changed
- Session expired

**Solution**:
- Verify URL in browser first
- Check if pincode is valid for Blinkit
- Delete session file and retry

---

## Monitoring Progress

### Check Terminal Logs

While request is running, watch terminal for:

```
[12:00:00] [API] ℹ️ Received request: Pincode 122016, 1 categories.
[12:00:01] [Setup] ℹ️ Checking location configuration...
[12:00:02] [Setup] ✅ Location already matches pincode 122016. Skipping setup.
[12:00:03] [Sexual Wellness] 🚀 Starting scrape... (Attempt 1/3)
[12:00:05] [Sexual Wellness] ℹ️ Auto-scrolling...
[12:00:20] [Sexual Wellness] ℹ️ Scroll finished. Found 150 items.
[12:00:22] [Sexual Wellness] ✅ Extracted 150 products. (Missing imgs: 0)
[12:00:22] [Summary] ✅ Total products extracted: 150
```

---

## Postman Collection (Import This)

Save this as `Blinkit-Scraper.postman_collection.json`:

```json
{
  "info": {
    "name": "Blinkit Scraper API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:3088/health",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3088",
          "path": ["health"]
        }
      }
    },
    {
      "name": "Scrape Single Category",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"pincode\": \"122016\",\n  \"categories\": [\n    {\n      \"name\": \"Sexual Wellness\",\n      \"url\": \"https://blinkit.com/cn/sexual-wellness/cid/287/741\"\n    }\n  ],\n  \"maxConcurrentTabs\": 8\n}"
        },
        "url": {
          "raw": "http://localhost:3088/blinkitcategoryscrapper",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3088",
          "path": ["blinkitcategoryscrapper"]
        }
      }
    },
    {
      "name": "Scrape Multiple Categories",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"pincode\": \"122016\",\n  \"categories\": [\n    {\n      \"name\": \"Fruits & Vegetables\",\n      \"url\": \"https://blinkit.com/cn/fruits-vegetables/cid/1487/1489\"\n    },\n    {\n      \"name\": \"Dairy & Breakfast\",\n      \"url\": \"https://blinkit.com/cn/dairy-breakfast/cid/1487/1490\"\n    }\n  ],\n  \"maxConcurrentTabs\": 4\n}"
        },
        "url": {
          "raw": "http://localhost:3088/blinkitcategoryscrapper",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3088",
          "path": ["blinkitcategoryscrapper"]
        }
      }
    }
  ]
}
```

**To Import**:
1. Open Postman
2. Click **"Import"**
3. Drag and drop this JSON file
4. Collection will appear in left sidebar

---

## Testing After API Interception Changes

Once you apply the changes from `CHANGES_NEEDED.md`, you'll see additional logs:

```
[Sexual Wellness] ℹ️ 📡 Captured API response #1
[Sexual Wellness] ℹ️ 📡 Captured API response #2
[Sexual Wellness] ℹ️ 📡 Captured API response #3
[Sexual Wellness] ℹ️ Processed 3 API responses, extracted 45 unique products
[Sexual Wellness] ✅ Merged: 150 DOM + 45 API = 150 total products
```

This confirms API interception is working!

---

## Performance Benchmarks

| Metric | Expected Value |
|--------|---------------|
| Health Check | < 100ms |
| Single Category (50 products) | 20-40 seconds |
| Single Category (150 products) | 40-80 seconds |
| Multiple Categories (3 x 50) | 60-120 seconds |
| Session Setup (first time) | +10-15 seconds |

---

## Tips for Faster Testing

1. **Use Existing Sessions**: Sessions are cached in `sessions/` folder
2. **Reduce maxConcurrentTabs**: Lower = slower but more stable
3. **Test Small Categories First**: Verify setup before large scrapes
4. **Save Requests**: Use Postman collections to save test cases
5. **Use Environment Variables**: Set `{{baseUrl}}` = `http://localhost:3088`

---

## Next Steps

1. ✅ Test health endpoint
2. ✅ Test single category scrape
3. ✅ Verify products in response
4. ✅ Test with different pincodes
5. ✅ Test multiple categories
6. 🔄 Apply API interception changes
7. 🔄 Test API data capture
8. 🔄 Deploy to Render
