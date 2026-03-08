# Blinkit Scraper - Render Deployment Guide

## 🚀 Quick Deploy to Render

Your Blinkit scraper is being prepared for Render deployment with API interception!

### What's New

✅ **API Interception** - Captures `/v1/layout/listing_widgets` endpoint  
✅ **Click-First-Product** - Triggers initial API calls  
✅ **Hybrid Data** - Merges DOM + API for complete results  
✅ **Headless Mode** - Ready for containerized deployment  
✅ **Render Configuration** - `render.yaml` + deployment files created  

---

## Implementation Status

### ✅ Completed
- [x] Backed up original `server.js` to `server.backup.js`
- [x] Created `CHANGES_NEEDED.md` with detailed patch guide
- [x] Added `postinstall` script to `package.json`
- [x] Created `render.yaml` configuration
- [x] Created `.dockerignore` and `.gitignore`

### 🔄 Manual Steps Required

You need to apply the changes from `CHANGES_NEEDED.md` to `server.js`:

1. **Add API Processing Functions** (after line 67)
2. **Modify scrapeCategory Function** (lines 224-274)
3. **Update Browser Launch Options** (lines 512-515)

See [`CHANGES_NEEDED.md`](file:///d:/creatosaurus-intership/quick-commerce-scrappers/Blinkit-Scrapper/CHANGES_NEEDED.md) for exact code.

---

## Deployment Steps

### Step 1: Apply Code Changes

Open `CHANGES_NEEDED.md` and apply the 3 changes to `server.js`:
- Change 1: Add API processing functions
- Change 2: Modify scrapeCategory with API interception
- Change 3: Enable headless mode

### Step 2: Test Locally

```bash
npm install
npm start
```

Make a test request to verify API interception works.

### Step 3: Commit and Push

```bash
git add package.json render.yaml .dockerignore .gitignore server.js
git commit -m "Add API interception and Render deployment for Blinkit"
git push origin main
```

### Step 4: Deploy to Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. **Settings**:
   - **Name**: `blinkit-scraper`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or paid)
5. Click **"Create Web Service"**

---

## API Endpoint

**POST** `/blinkitcategoryscrapper`

**Request Body**:
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

**Response**:
```json
{
  "status": "success",
  "pincode": "122016",
  "totalProducts": 150,
  "products": [
    {
      "rank": 1,
      "id": "...",
      "name": "...",
      "url": "https://blinkit.com/prn/.../prid/...",
      "image": "...",
      "price": "99",
      "originalPrice": "120",
      "discount": "17%",
      "quantity": "1 unit",
      "deliveryTime": "10 mins",
      "combo": "1",
      "isOutOfStock": false,
      "isAd": false,
      "category": "Sexual Wellness"
    }
  ]
}
```

---

## How API Interception Works

### 1. Response Listener
```javascript
page.on('response', async (response) => {
    if (url.includes('/v1/layout/listing_widgets')) {
        const json = await response.json();
        capturedApiData.push(json);
    }
});
```

### 2. Click First Product
Triggers initial API calls that may not fire on page load:
```javascript
const firstProduct = page.locator('div[role="button"][id]').first();
await firstProduct.click();
await page.waitForTimeout(2000);
await page.keyboard.press('Escape');
```

### 3. Data Merge
Combines DOM (for ranking) + API (for complete data):
- DOM products get enriched with API data
- API-only products appended at end
- Duplicates removed by product ID

---

## Benefits of API Interception

1. **More Complete Data**: API provides all product details
2. **Better Images**: Full-resolution URLs from API
3. **Accurate Pricing**: Exact prices from API
4. **Pagination Info**: Know total available products
5. **Less DOM Parsing**: Faster and more reliable

---

## Session Management

Sessions are already implemented! The scraper:
- Checks for existing session file: `sessions/{pincode}.json`
- Loads session if exists
- Sets up location if needed
- Saves session for future use

---

## Troubleshooting

**Issue**: API data not captured
- **Solution**: Check that `/v1/layout/listing_widgets` endpoint is being called. Enable debug logging.

**Issue**: Products missing
- **Solution**: API interception + DOM scraping should cover all products. Check merge logic.

**Issue**: "Executable doesn't exist" on Render
- **Solution**: Ensure `postinstall` script ran successfully in build logs.

**Issue**: Headless mode issues locally
- **Solution**: Temporarily set `headless: false` for local testing, but remember to set back to `true` before deploying.

---

## Performance Notes

- **First Request**: 30-60 seconds (cold start on free tier)
- **Concurrent Tabs**: Default 8, adjustable via `maxConcurrentTabs`
- **Scroll Logic**: Optimized with 8 no-change threshold
- **Memory**: Playwright requires significant memory

---

## Next Steps

1. ✅ Apply changes from `CHANGES_NEEDED.md`
2. ✅ Test locally
3. ✅ Commit and push
4. ✅ Deploy to Render
5. 🔄 Monitor logs
6. 🔄 Test API interception

---

## Files Modified/Created

- ✅ [`package.json`](file:///d:/creatosaurus-intership/quick-commerce-scrappers/Blinkit-Scrapper/package.json) - Added postinstall
- 🔄 [`server.js`](file:///d:/creatosaurus-intership/quick-commerce-scrappers/Blinkit-Scrapper/server.js) - Needs manual changes
- ✅ [`render.yaml`](file:///d:/creatosaurus-intership/quick-commerce-scrappers/Blinkit-Scrapper/render.yaml) - Deployment config
- ✅ [`.dockerignore`](file:///d:/creatosaurus-intership/quick-commerce-scrappers/Blinkit-Scrapper/.dockerignore) - Optimization
- ✅ [`.gitignore`](file:///d:/creatosaurus-intership/quick-commerce-scrappers/Blinkit-Scrapper/.gitignore) - Git exclusions
- ✅ [`CHANGES_NEEDED.md`](file:///d:/creatosaurus-intership/quick-commerce-scrappers/Blinkit-Scrapper/CHANGES_NEEDED.md) - Patch guide
- ✅ `server.backup.js` - Original backup
