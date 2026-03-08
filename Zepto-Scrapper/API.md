# Zepto Scraper HTTP API

REST API server for scraping Zepto categories via HTTP requests.

## Installation

```bash
npm install
```

## Running the Server

```bash
npm run server
```

Server will start at: `http://localhost:4000`

## API Endpoints

### 1. Scrape Categories
**Endpoint:** `POST /zeptocategoryscrapper`

**Request Body:**
```json
{
  "pincode": "411001",
  "categories": [
    {
      "name": "Fruit & Vegetables - All",
      "url": "https://www.zepto.com/cn/fruits-vegetables/all/cid/..."
    }
  ],
  "scrollCount": null,
  "maxProductsPerSearch": 100,
  "maxConcurrentTabs": 8,
  "headless": true,
  "navigationTimeout": 60000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [...],
    "totalProducts": 150,
    "totalCategories": 3,
    "pincode": "411001",
    "scrapedAt": "2026-01-02T08:30:00.000Z",
    "durationSeconds": 45.23
  }
}
```

### 2. Health Check
**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "message": "Zepto scraper API is running"
}
```

## Usage Examples

### Using cURL

```bash
curl -X POST http://localhost:4000/zeptocategoryscrapper \
  -H "Content-Type: application/json" \
  -d @api-request-example.json
```

### Using JavaScript (fetch)

```javascript
const response = await fetch('http://localhost:4000/zeptocategoryscrapper', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    pincode: '411001',
    categories: [
      {
        name: 'Fruit & Vegetables - All',
        url: 'https://www.zepto.com/cn/fruits-vegetables/all/cid/...'
      }
    ],
    scrollCount: null,
    maxConcurrentTabs: 8,
    headless: true
  })
});

const result = await response.json();
console.log(result.data.products);
```

### Using Axios

```javascript
const axios = require('axios');

const response = await axios.post('http://localhost:4000/zeptocategoryscrapper', {
  pincode: '411001',
  categories: [
    {
      name: 'Fruit & Vegetables - All',
      url: 'https://www.zepto.com/cn/fruits-vegetables/all/cid/...'
    }
  ],
  scrollCount: null,
  maxConcurrentTabs: 8,
  headless: true
});

console.log(response.data.data.products);
```

### Using Python (requests)

```python
import requests

response = requests.post('http://localhost:4000/zeptocategoryscrapper', json={
    'pincode': '411001',
    'categories': [
        {
            'name': 'Fruit & Vegetables - All',
            'url': 'https://www.zepto.com/cn/fruits-vegetables/all/cid/...'
        }
    ],
    'scrollCount': None,
    'maxConcurrentTabs': 8,
    'headless': True
})

data = response.json()
print(data['data']['products'])
```

## Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pincode` | string | No | `"411001"` | Delivery pincode |
| `categories` | array | **Yes** | - | Array of `{name, url}` objects |
| `scrollCount` | number/null | No | `null` | Scrolls (null = infinite) |
| `maxProductsPerSearch` | number | No | `100` | Max products per category |
| `maxConcurrentTabs` | number | No | `8` | Batch size |
| `headless` | boolean | No | `true` | Run browser headless |
| `navigationTimeout` | number | No | `60000` | Timeout in ms |

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "No categories provided",
  "message": "Please provide an array of categories with {name, url} objects"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Failed to set pincode",
  "message": "Could not set delivery location"
}
```

## Product Schema

Each product in the response includes:

```javascript
{
  productId: "string",
  productSlug: "string",
  productName: "string",
  productImage: "string",
  currentPrice: number,
  originalPrice: number,
  discountPercentage: number,
  quantity: "string",
  rating: number,
  isAd: boolean,
  deliveryTime: "string",
  isOutOfStock: boolean,
  productUrl: "string",
  categoryName: "string",
  categoryUrl: "string",
  platform: "Zepto",
  pincode: "string",
  scrapedAt: "ISO date string"
}
```

## Development

### Start with Auto-Reload (using nodemon)

```bash
npx nodemon server.js
```

### Environment Variables

Set `NODE_ENV=development` to see error stack traces in responses:

```bash
NODE_ENV=development npm run server
```

## Notes

- The server runs on port **4000** by default
- Browser instances are created and destroyed per request
- Scraping is done in batches based on `maxConcurrentTabs`
- All times are returned in seconds
- Products are returned immediately after scraping (no database storage)

## Troubleshooting

**Port already in use:**
```bash
# Kill process on port 4000 (Windows)
netstat -ano | findstr :4000
taskkill /PID <PID> /F
```

**Browser not launching:**
- Ensure Playwright browsers are installed: `npx playwright install chromium`
- Try with `headless: false` to debug visually
