# Zepto Clustering Guide

## Overview

The clustered version of the Zepto scraper uses Node.js's `cluster` module to distribute scraping jobs across multiple worker processes. This enables **3-4x performance improvement** on multi-core CPUs.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Master Process (PID: xxx)                               │
│ ├─ Express HTTP Server (Port: 4089)                    │
│ ├─ Job Queue (FIFO)                                    │
│ └─ Round-Robin Load Balancer                           │
└──────────┬──────────────────────────────────────────────┘
           │
           ├─ IPC Message Channel
           │
    ┌──────┴──────────┬──────────────┬──────────────┐
    ▼                 ▼              ▼              ▼
┌─────────┐      ┌─────────┐   ┌─────────┐   ┌─────────┐
│ Worker 1│      │ Worker 2│   │ Worker 3│   │ Worker 4│
│(PID:xxx)│      │(PID:xxx)│   │(PID:xxx)│   │(PID:xxx)│
│ Browser │      │ Browser │   │ Browser │   │ Browser │
│Instance │      │Instance │   │Instance │   │Instance │
└─────────┘      └─────────┘   └─────────┘   └─────────┘
```

## Configuration

### Environment Variables

```bash
# Number of worker processes (default: CPU core count)
export WORKERS=4

# Port (default: 4089)
export PORT=4089
```

### Running

**Development Mode:**
```bash
node server-clustered.js
```

**Production with multiple workers (8-core CPU):**
```bash
WORKERS=8 PORT=4089 node server-clustered.js
```

**Custom worker count:**
```bash
WORKERS=6 node server-clustered.js
```

## API Endpoints

### 1. Start Scraping Job (POST)

**Endpoint:** `POST /zeptocategoryscrapper`

**Request Format (Categories with URLs):**
```json
{
  "pincode": "411001",
  "categories": [
    {
      "name": "Fresh Vegetables",
      "url": "https://www.zepto.com/search?collection_id=..."
    },
    {
      "name": "Dairy",
      "url": "https://www.zepto.com/search?collection_id=..."
    }
  ],
  "maxConcurrentTabs": 3,
  "headless": true,
  "navigationTimeout": 60000
}
```

**Request Format (Simple URLs Array - Recommended for Clustering):**
```json
{
  "urls": [
    "https://www.zepto.com/search?collection_id=...",
    "https://www.zepto.com/search?collection_id=...",
    "https://www.zepto.com/search?collection_id=..."
  ],
  "pincode": "411001",
  "maxConcurrentTabs": 3,
  "headless": true
}
```

**Optional Parameters:**
```json
{
  "urls": ["..."],
  "pincode": "411001",
  "scrollCount": 3,
  "maxProductsPerSearch": 100,
  "maxConcurrentTabs": 3,
  "headless": true,
  "navigationTimeout": 60000,
  "proxyUrl": "http://user:pass@proxy.com:8080",
  "store": false
}
```

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "productId": "xxx",
      "productName": "Fresh Tomatoes",
      "price": 35,
      "originalPrice": 50,
      "discount": 30,
      "weight": "500g",
      "availability": "in_stock",
      "rating": 4.5,
      "eta": "10 mins",
      "ranking": 1,
      "officialCategory": "Groceries",
      "officialSubCategory": "Vegetables",
      "pincode": "411001"
    }
  ],
  "totalProducts": 150,
  "duplicatesRemoved": 5
}
```

### 2. Health Check (GET)

**Endpoint:** `GET /health`

**Response (Clustered):**
```json
{
  "status": "healthy",
  "master_pid": 12345,
  "workers": {
    "total": 4,
    "busy": 2,
    "idle": 2
  },
  "queue_length": 3,
  "workers_stats": [
    {
      "pid": 12346,
      "busy": true,
      "jobs_processed": 5
    },
    {
      "pid": 12347,
      "busy": false,
      "jobs_processed": 4
    }
  ]
}
```

### 3. Status Check (GET)

**Endpoint:** `GET /status`

**Response (Clustered):**
```json
{
  "mode": "clustered",
  "master_pid": 12345,
  "num_workers": 4,
  "queue_length": 2,
  "active_workers": 2,
  "total_jobs_queued": 15
}
```

## Performance Characteristics

### Baseline (Single Process)
- Concurrency: Up to 3 tabs per request
- Processing: Sequential for multiple requests
- CPU Utilization: ~25% on 4-core CPU

### Clustered (4 Workers)
- Concurrency: 3 tabs/worker × 4 workers = 12 concurrent page loads
- Processing: Request-level parallelization
- CPU Utilization: ~90% on 4-core CPU
- Expected Speedup: **3-4x**

### Job Distribution Example

**Request 1** (4 URLs, Pincode: 411001) → Worker 1  
**Request 2** (3 URLs, Pincode: 411002) → Worker 2  
**Request 3** (5 URLs, Pincode: 411003) → Worker 3  
**Request 4** (queued) → Next available worker

## Key Features

### 1. Round-Robin Load Balancing
Jobs are assigned to workers in round-robin fashion to distribute load evenly.

### 2. Automatic Worker Restart
If a worker crashes or disconnects, the master process automatically spawns a replacement.

### 3. Pincode Location Detection
Zepto requires location setup via browser interaction:
- Auto-detects location button selectors
- Handles location modal
- Automatically fills pincode
- Supports location search from dropdown

### 4. Proxy Support
- Optional proxy URL support (Apify compatible)
- Per-request proxy configuration
- Useful for scaling with geo-restrictions

### 5. Job Queue Management
- Jobs wait in queue if all workers busy
- Master processes queue as workers become available
- No job loss during worker restart

### 6. Backward Compatibility
- 100% API compatible with single-process version
- Same endpoint paths and request/response formats
- Works with existing client code

## Troubleshooting

### 1. Workers Not Starting

**Check Log Output:**
```bash
node server-clustered.js 2>&1 | grep -i "worker\|error"
```

**Verify Playwright Installation:**
```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

### 2. Queue Piling Up

**Issue:** Jobs accumulating in queue, slow processing

**Causes:**
- Zepto location detection failing
- Network slowness
- Browser crashed silently

**Fixes:**
- Increase workers: `WORKERS=8 node server-clustered.js`
- Check Zepto website availability
- Enable verbose logging by checking worker output
- Use headless=false and manually verify: `node server-clustered.js 2>&1 | head -50`

### 3. Location Detection Failing

**Issue:** Worker can't find location button or modal

**Selectors Used:**
```javascript
// Location button selectors (in order of priority)
'[data-testid="user-address"]'
'button:has([data-testid="user-address"])'
'button[aria-label="Select Location"]'
'button.__4y7HY'
'div.a0Ppr button'

// Location modal
'div[data-testid="address-modal"]'

// Search input
'div[data-testid="address-search-input"] input[type="text"]'
```

**Solution:** Zepto's UI changes frequently. If location detection fails:
- Consider adding pincode storage states (`pincodes_storage_map.json`)
- Update selectors in code if Zepto changes UI
- Report to dev team for updates

### 4. Memory Usage High

**Issue:** Master process using excessive memory

**Check:**
```bash
ps aux | grep chromium  # Count browser processes
ps aux | grep node      # Count node processes (should be N workers + 1 master)
```

**Fix:**
- Reduce workers: `WORKERS=2 node server-clustered.js`
- Reduce maxConcurrentTabs in requests
- Monitor with `top` or `htop`

### 5. Port Already in Use

**Error:** `EADDRINUSE: address already in use :::4089`

**Fix:**
```bash
# Kill existing process
lsof -i :4089 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Or use different port
PORT=4090 node server-clustered.js
```

## Comparison with Other Scrapers

| Feature | Jiomart | Blinkit | Flipkart | Instamart | DMart | Zepto |
|---------|---------|---------|----------|-----------|-------|-------|
| Port | 4099 | 3088 | 5500 | 4400 | 4199 | 4089 |
| Module Type | ESM | ESM | CommonJS | ESM | ESM | ESM |
| Job Pattern | Batch multi-URL | Single/batch | URL array | Multi-URL | Batch URL | Multi-URL |
| Workers | N | N | N | N | N | N |
| Concurrency | 3 categories | 2 categories | 3 URLs | 3 URLs | 1 URL | 3 URLs |
| Session Type | Per-pincode | Per-pincode | N/A | Per-pincode | Via cookie | Via storage |
| Proxy Support | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Timeout | 5min | 8min | 10min | 12min | 15min | 10min |

## Migration from Single-Process

### Step 1: Backup Original
```bash
cp server.js server-single.js
```

### Step 2: Test Clustered Version
```bash
WORKERS=2 PORT=4089 node server-clustered.js
```

### Step 3: Run Health Check
```bash
curl http://localhost:4089/health
```

### Step 4: Submit Test Job
```bash
curl -X POST http://localhost:4089/zeptocategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://www.zepto.com/search?collection_id=..."],
    "pincode": "411001"
  }'
```

### Step 5: Deploy
- Replace `server.js` with `server-clustered.js`, or
- Run both versions on different ports, or
- Use process manager (PM2) to manage clustering

## Advanced Configuration

### Using PM2 for Process Management

**Install PM2:**
```bash
npm install -g pm2
```

**Create Ecosystem Config:**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'zepto-clustered',
      script: './server-clustered.js',
      instances: 4,
      exec_mode: 'cluster',
      env: {
        PORT: 4089,
        WORKERS: 4
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
```

**Start with PM2:**
```bash
pm2 start ecosystem.config.js
pm2 logs zepto-clustered
```

## Using Proxy URLs

### Apify Proxy Format
```json
{
  "urls": ["https://www.zepto.com/search?collection_id=..."],
  "pincode": "411001",
  "proxyUrl": "http://username:password@proxy.apify.com:8000"
}
```

### Proxy Rotation
For better scaling, use Apify's proxy manager to rotate IPs across multiple requests.

## Output Files

The clustered version generates outputs similar to single process:

1. **Scraped Data:**
   - Returned in JSON response
   - Format: JSON with transformed products

2. **Storage State:**
   - `pincodes_storage_map.json` - Cached browser states (optional)
   - Speeds up subsequent requests for same pincode

3. **API Dumps:**
   - Optional debugging output
   - Can be enabled in worker code

## Performance Tips

### 1. Optimize Worker Count
- Minimum: 2 workers
- Recommended: CPU cores
- Maximum: CPU cores × 1.5 (for I/O bound tasks)

```bash
# Check CPU cores
sysctl -n hw.logicalcpu  # macOS
nproc                    # Linux
```

### 2. Batch URL Requests
Instead of multiple single-URL requests:
```bash
# Poor: 5 separate requests
curl -X POST http://localhost:4089/zeptocategoryscrapper -d '{"urls": ["..."], "pincode": "411001"}'
curl -X POST http://localhost:4089/zeptocategoryscrapper -d '{"urls": ["..."], "pincode": "411001"}'

# Better: 1 request with multiple URLs
curl -X POST http://localhost:4089/zeptocategoryscrapper \
  -d '{
    "urls": ["...", "...", "..."],
    "pincode": "411001"
  }'
```

### 3. Monitor Worker Health
```bash
# Check health status
curl http://localhost:4089/health | jq '.workers'

# Output shows worker busy/idle status
```

### 4. Use Storage States
If you scrape the same pincode repeatedly:
```bash
# Pre-populate pincodes_storage_map.json
# This caches browser state and speeds up location detection
```

## Notes

- Zepto uses dynamic location selection (browser interaction required)
- Clustering is most effective when handling multiple concurrent requests
- Each worker maintains independent browser state
- Zepto can rate-limit or block aggressive scraping
- Proxy URLs are optional but recommended for scale
- Timeout: 10 minutes (Zepto network requests can be slow)

## Support & Questions

For issues specific to this implementation, check:
1. Worker logs in console output
2. Health endpoint for worker status
3. Zepto website availability for location/modal issues

**Common Debugging:**
```bash
# View all workers
curl http://localhost:4089/status | jq '.'

# Monitor real-time
watch 'curl http://localhost:4089/health 2>/dev/null | jq ".workers"'

# Kill entire server
lsof -i :4089 | awk 'NR != 1 {print $2}' | xargs kill -9

# Check browser processes
ps aux | grep chromium | wc -l
```
