# Instamart Clustering Guide

## Overview

The clustered version of the Instamart scraper uses Node.js's `cluster` module to distribute scraping jobs across multiple worker processes. This enables **3-4x performance improvement** on multi-core CPUs.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Master Process (PID: xxx)                               │
│ ├─ Express HTTP Server (Port: 4400)                    │
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

# Port (default: 4400)
export PORT=4400
```

### Running

**Development Mode:**
```bash
node server-clustered.js
```

**Production with multiple workers (8-core CPU):**
```bash
WORKERS=8 PORT=4400 node server-clustered.js
```

**Custom worker count:**
```bash
WORKERS=6 node server-clustered.js
```

## API Endpoints

### 1. Start Scraping Job (POST)

**Endpoint:** `POST /instamartcategorywrapper`

**Request Format (Single URL):**
```json
{
  "url": "https://www.swiggy.com/instamart/...",
  "pincode": "110001",
  "maxConcurrentTabs": 3,
  "store": "instamart"
}
```

**Request Format (Multiple URLs - Recommended for Clustering):**
```json
{
  "urls": [
    "https://www.swiggy.com/instamart/category1",
    "https://www.swiggy.com/instamart/category2",
    "https://www.swiggy.com/instamart/category3"
  ],
  "pincode": "110001",
  "maxConcurrentTabs": 3,
  "store": "instamart"
}
```

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "productId": "xxx",
      "name": "Product Name",
      "price": 100,
      "originalPrice": 150,
      "weight": "500g",
      "ranking": 1,
      "officialCategory": "Groceries",
      "officialSubCategory": "Fruits & Vegetables",
      "categoryUrl": "https://...",
      "pincode": "110001"
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
- Concurrency: 3 tabs/worker × 4 workers = 12 concurrent tabs
- Processing: Request-level parallelization
- CPU Utilization: ~90% on 4-core CPU
- Expected Speedup: **3-4x**

### Job Distribution Example

**Request 1** (3 URLs, Pincode: 110001) → Worker 1  
**Request 2** (4 URLs, Pincode: 110002) → Worker 2  
**Request 3** (2 URLs, Pincode: 110003) → Worker 3 (while 1 & 2 busy)  
**Request 4** (queued) → Next available worker

## Key Features

### 1. Round-Robin Load Balancing
Jobs are assigned to workers in round-robin fashion to distribute load evenly.

### 2. Automatic Worker Restart
If a worker crashes or disconnects, the master process automatically spawns a replacement.

### 3. Per-Pincode Sessions
Each worker maintains independent session storage:
- Location: `sessions/session_{pincode}.json`
- Prevents cross-pincode session contamination

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
npx playwright install
```

### 2. Queue Piling Up

**Issue:** Jobs accumulating in queue, slow processing

**Fix:**
- Increase workers: `WORKERS=8 node server-clustered.js`
- Check individual worker logs for errors
- Reduce `maxConcurrentTabs` if workers are crashing

### 3. Memory Usage High

**Issue:** Master process using excessive memory

**Check:**
- Browser instances not closing properly
```bash
ps aux | grep chromium  # Count browser processes
```

**Fix:**
- Reduce `WORKERS` count
- Check for memory leaks in transform modules

### 4. Port Already in Use

**Error:** `EADDRINUSE: address already in use :::4400`

**Fix:**
```bash
# Kill existing process
lsof -i :4400 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Or use different port
PORT=4401 node server-clustered.js
```

## Comparison with Other Scrapers

| Feature | Jiomart | Blinkit | Flipkart | DMart | Instamart |
|---------|---------|---------|----------|-------|-----------|
| Port | 4099 | 3088 | 5500 | 4199 | 4400 |
| Module Type | ESM | ESM | CommonJS | ESM | ESM |
| Job Pattern | Batch multi-URL | Single/batch | URL array | Batch | Multi-URL |
| Workers | N | N | N | N | N |
| Session Type | Per-pincode | Per-pincode | N/A | Per-pincode | Per-pincode |
| Timeout | 10min | 8min | 10min | 15min | 12min |

## Migration from Single-Process

### Step 1: Backup Original
```bash
cp server.js server-single.js
```

### Step 2: Test Clustered Version
```bash
WORKERS=2 PORT=4400 node server-clustered.js
```

### Step 3: Run Health Check
```bash
curl http://localhost:4400/health
```

### Step 4: Submit Test Job
```bash
curl -X POST http://localhost:4400/instamartcategorywrapper \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://www.swiggy.com/instamart/..."],
    "pincode": "110001"
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
      name: 'instamart-clustered',
      script: './server-clustered.js',
      instances: 4,
      exec_mode: 'cluster',
      env: {
        PORT: 4400,
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
pm2 logs instamart-clustered
```

## Output Files

Both single and clustered versions generate:

1. **Scraped Data:**
   - `scraped_data_combined_{pincode}_{timestamp}.json` - Combined results

2. **Sessions:**
   - `sessions/session_{pincode}.json` - Location/auth state

3. **API Dumps:**
   - `api_dumps/dump_{pincode}_{type}_{hash}_{timestamp}.json` - Raw API responses

## Notes

- Instamart can be slow due to real browser rendering
- Clustering is most effective when handling multiple concurrent requests
- Keep `maxConcurrentTabs` ≤ 3 to avoid browser crashes
- Session persistence helps subsequent requests for same pincode
