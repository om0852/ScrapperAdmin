# DMart Clustering Guide

## Overview

The clustered version of the DMart scraper uses Node.js's `cluster` module to distribute scraping jobs across multiple worker processes. This enables **3-4x performance improvement** on multi-core CPUs.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Master Process (PID: xxx)                               │
│ ├─ Express HTTP Server (Port: 4199)                    │
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

# Port (default: 4199)
export PORT=4199
```

### Running

**Development Mode:**
```bash
node server-clustered.js
```

**Production with multiple workers (8-core CPU):**
```bash
WORKERS=8 PORT=4199 node server-clustered.js
```

**Custom worker count:**
```bash
WORKERS=6 node server-clustered.js
```

## API Endpoints

### 1. Start Scraping Job (POST)

**Endpoint:** `POST /dmartcategoryscrapper`

**Request Format (Single URL):**
```json
{
  "url": "https://www.dmart.in/category/groceries",
  "pincode": "400703",
  "maxConcurrentTabs": 1,
  "store": "dmart"
}
```

**Request Format (Multiple URLs - Recommended for Clustering):**
```json
{
  "urls": [
    "https://www.dmart.in/category/groceries",
    "https://www.dmart.in/category/personal-care",
    "https://www.dmart.in/category/home-care"
  ],
  "pincode": "400703",
  "maxConcurrentTabs": 1,
  "store": "dmart"
}
```

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "productId": "xxx",
      "productName": "Product Name",
      "price": 100,
      "discountedPrice": 85,
      "discount": 15,
      "availability": "in_stock",
      "weight": "500g",
      "ranking": 1,
      "officialCategory": "Groceries",
      "officialSubCategory": "Staples",
      "pincode": "400703"
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
- Concurrency: Up to 1 tab per request
- Processing: Sequential for multiple requests
- CPU Utilization: ~25% on 4-core CPU

### Clustered (4 Workers)
- Concurrency: 1 tab/worker × 4 workers = 4 concurrent page loads
- Processing: Request-level parallelization
- CPU Utilization: ~90% on 4-core CPU
- Expected Speedup: **3-4x**

### Job Distribution Example

**Request 1** (3 URLs, Pincode: 400703) → Worker 1  
**Request 2** (4 URLs, Pincode: 400706) → Worker 2  
**Request 3** (2 URLs, Pincode: 401101) → Worker 3  
**Request 4** (queued) → Next available worker

## Key Features

### 1. Round-Robin Load Balancing
Jobs are assigned to workers in round-robin fashion to distribute load evenly.

### 2. Automatic Worker Restart
If a worker crashes or disconnects, the master process automatically spawns a replacement.

### 3. Pincode-to-Store ID Mapping
DMart URLs require a Store ID cookie/parameter. The clustering version maintains:
- Built-in PINCODE_STORE_MAP for common pincodes
- Automatic fallback to DMart's cookie values
- Per-worker session isolation

**Known Pincode Mappings:**
```javascript
"400706" → Store ID 10718
"400703" → Store ID 10718
"401101" → Store ID 10706
"401202" → Store ID 10706
"400070" → Store ID 10734
```

### 4. Job Queue Management
- Jobs wait in queue if all workers busy
- Master processes queue as workers become available
- No job loss during worker restart

### 5. Backward Compatibility
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
- Store pincode not in PINCODE_STORE_MAP
- DMart pincode dialog not resolving correctly
- Network slowness

**Fixes:**
- Increase workers: `WORKERS=8 node server-clustered.js`
- Add missing pincode to PINCODE_STORE_MAP (edit server-clustered.js)
- Check DMart website availability

### 3. Memory Usage High

**Issue:** Master process using excessive memory

**Check:**
- Browser instances not closing properly
```bash
ps aux | grep chromium  # Count browser processes
```

**Fix:**
- Reduce `WORKERS` count: `WORKERS=2 node server-clustered.js`
- Increase garbage collection intervals
- Monitor with `top` or `htop`

### 4. Port Already in Use

**Error:** `EADDRINUSE: address already in use :::4199`

**Fix:**
```bash
# Kill existing process
lsof -i :4199 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Or use different port
PORT=4200 node server-clustered.js
```

### 5. DMart Pincode Dialog Issues

**Issue:** Worker can't set pincode, falls back to store ID 10706

**Solution:**
- Add pincode to PINCODE_STORE_MAP in server-clustered.js
- Format: `"pincode": "storeId"`

```javascript
// Edit this section in server-clustered.js
const PINCODE_STORE_MAP = {
    "400706": "10718",
    "400703": "10718",
    // ADD YOUR PINCODE HERE:
    "110010": "10500",  // Example for Delhi
};
```

## Comparison with Other Scrapers

| Feature | Jiomart | Blinkit | Flipkart | Instamart | DMart |
|---------|---------|---------|----------|-----------|-------|
| Port | 4099 | 3088 | 5500 | 4400 | 4199 |
| Module Type | ESM | ESM | CommonJS | ESM | ESM |
| Job Pattern | Batch multi-URL | Single/batch | URL array | Multi-URL | Batch URL |
| Workers | N | N | N | N | N |
| Concurrency | 3 categories | 2 categories | 3 URLs | 3 URLs | 1 URL |
| Session Type | Per-pincode | Per-pincode | N/A | Per-pincode | Via cookie |
| Timeout | 5min | 8min | 10min | 12min | 15min |

## Migration from Single-Process

### Step 1: Backup Original
```bash
cp server.js server-single.js
```

### Step 2: Test Clustered Version
```bash
WORKERS=2 PORT=4199 node server-clustered.js
```

### Step 3: Run Health Check
```bash
curl http://localhost:4199/health
```

### Step 4: Submit Test Job
```bash
curl -X POST http://localhost:4199/dmartcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://www.dmart.in/category/groceries"],
    "pincode": "400703"
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
      name: 'dmart-clustered',
      script: './server-clustered.js',
      instances: 4,
      exec_mode: 'cluster',
      env: {
        PORT: 4199,
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
pm2 logs dmart-clustered
```

## Output Files

The clustered version generates the same output as single process:

1. **Scraped Data:**
   - Auto-saved to configured storage
   - Format: JSON with transformed products

2. **Browser State:**
   - Per-worker independent
   - No shared session conflicts

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
curl -X POST http://localhost:4199/dmartcategoryscrapper -d '{"url": "...", "pincode": "400703"}'
curl -X POST http://localhost:4199/dmartcategoryscrapper -d '{"url": "...", "pincode": "400703"}'

# Better: 1 request with multiple URLs
curl -X POST http://localhost:4199/dmartcategoryscrapper \
  -d '{
    "urls": ["...", "...", "..."],
    "pincode": "400703"
  }'
```

### 3. Monitor Worker Health
```bash
# Check health status
curl http://localhost:4199/health | jq '.workers'

# Output shows worker busy/idle status
```

## Notes

- DMart uses real browser automation (Chromium)
- Clustering is most effective when handling multiple concurrent requests
- Each worker maintains independent browser state
- Session persistence via cookies per request
- Timeout: 15 minutes (DMart can be slow during peak hours)

## Support & Questions

For issues specific to this implementation, check:
1. Worker logs in console output
2. Health endpoint for worker status
3. Pincode-to-Store mapping for DMart-specific issues

**Common Debugging:**
```bash
# View all workers
curl http://localhost:4199/status | jq '.'

# Monitor real-time
watch 'curl http://localhost:4199/health 2>/dev/null | jq ".workers"'

# Kill entire server
lsof -i :4199 | awk 'NR != 1 {print $2}' | xargs kill -9
```
