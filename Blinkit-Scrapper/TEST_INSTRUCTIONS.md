# Blinkit Scraper Test Guide

## Test Script: `test_pasta.js`

This script tests the Blinkit scraper against the Pasta category page.

### Prerequisites

1. **Server Running**: The scraper server must be running on `http://localhost:3088`
2. **Dependencies**: axios must be installed
3. **Node.js**: v16+ with ES modules support

### Setup

```bash
# Install dependencies (if not already installed)
npm install

# Make sure server is running in another terminal
npm start
# OR
node server.js
```

### Running the Test

```bash
# From the Blinkit-Scrapper directory
node test_pasta.js
```

### What the Test Does

1. **Sends a scraping request** for the Pasta category URL
2. **Uses pincode 110001** (Delhi - change if needed)
3. **Captures the response** and displays:
   - Total products found
   - Sample of first 3 products with details
   - Statistics (average price, discounts, stock status, etc.)
4. **Saves results** to `test_results/` directory:
   - `response_[timestamp].json` - Full API response
   - `products_[timestamp].csv` - CSV export of all products
   - `stats_[timestamp].json` - Statistics summary

### Example Output

```
[12:34:56] 🚀 Starting Blinkit Scraper Test
[12:34:56] ℹ️ Target URL: https://blinkit.com/cn/pasta/cid/15/968
[12:34:56] ℹ️ Pincode: 110001
[12:35:45] ✅ Request completed in 49.23s
[12:35:45] ✅ Status: success
[12:35:45] ✅ Total Products: 247

Sample Products (First 3):

Product 1:
  ID: 12345
  Name: Banzai Noodles Pasta
  Price: ₹45
  Original Price: ₹60
  Discount: 25%
  Category: Pasta
  Stock: ✅ In Stock
  Delivery: 10 mins

Statistics:
  Total Products: 247
  Out of Stock: 12
  With Discount: 198
  With Images: 245
  Average Price: ₹87.50
  Categories: Pasta
```

### Customization

Edit the configuration at the top of `test_pasta.js`:

```javascript
const SERVER_URL = 'http://localhost:3088';        // Server address
const TEST_URL = 'https://blinkit.com/cn/pasta/cid/15/968'; // Target URL
const PINCODE = '110001';                         // Delivery pincode
const OUTPUT_DIR = path.join(__dirname, 'test_results'); // Output directory
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED` | Server not running. Start it with `npm start` |
| `ENOTFOUND` | Check `SERVER_URL` configuration |
| `ETIMEDOUT` | Scraping took too long (>5 min). Increase timeout or check network |
| `No products found` | Check URL validity and network connection |

### Output Files

All test results are saved in `test_results/` directory:

- **response_*.json** - Complete raw response from server
- **products_*.csv** - Tabular format for spreadsheets
- **stats_*.json** - Aggregated statistics

### Test Multiple URLs

To test multiple URLs, modify the script:

```javascript
const urls = [
    'https://blinkit.com/cn/pasta/cid/15/968',
    'https://blinkit.com/cn/cookies/cid/888/28',
    'https://blinkit.com/cn/tea/cid/12/957'
];

for (const url of urls) {
    TEST_URL = url;
    await testScraper();
}
```

### Performance Notes

- Average scraping time: 30-60 seconds per category
- Most time spent waiting for API responses and page loads
- Check `test_results/` files for detailed performance metrics

---

**Last Updated**: Jan 25, 2026
