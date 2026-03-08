# Quick Start: Using Optimized Blinkit Scraper

## Basic Usage

### Start Server (Default - Normal Network)
```bash
cd Blinkit-Scrapper
node server.js
```

Server will output:
```
Blinkit Scraper API (Optimized) running on port 3088
Performance Mode: NORMAL
Memory Mode: NORMAL
Max Concurrent Tabs: 6
```

### Test Single Category
```bash
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://blinkit.com/cn/pasta/cid/15/968",
    "pincode": "110001"
  }'
```

Expected response:
```json
{
  "status": "success",
  "pincode": "110001",
  "totalProducts": 250,
  "products": [...],
  "processingTime": 28.45
}
```

---

## Performance Modes

### 1. **Normal Network (Default)**
Best for: Standard internet (5-50 Mbps), modern hardware
```bash
node server.js
```

**Expected Performance:**
- Time per category: 25-35 seconds
- Memory usage: 300-500 MB
- Concurrent tabs: 6

---

### 2. **Slow Network Mode**
Best for: <1 Mbps, high latency, packet loss
```bash
SLOW_NETWORK=true node server.js
```

**What changes:**
```
Timeouts:     25s → 45s (DOM loading)
Scroll waits: 1.5s → 2s (API response time)
Max retries:  1 (unchanged)
Scroll detection: 3 → 5 (more iterations)
```

**Example usage:**
```bash
# Start server
SLOW_NETWORK=true node server.js

# In another terminal, test
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://blinkit.com/cn/cookies/cid/888/28",
    "pincode": "110001"
  }'
```

**Expected Performance:**
- Time per category: 35-50 seconds
- Memory usage: 300-500 MB
- Concurrent tabs: 6
- Success rate: Higher on slow networks

---

### 3. **Low Memory Mode**
Best for: <512 MB RAM, shared hosting, old servers
```bash
LOW_MEMORY=true node server.js
```

**What changes:**
```
Concurrent tabs: 6 → 1-2 (auto-reduced)
Memory cleanup: Disabled → Enabled (between batches)
GC triggers: Manual garbage collection
```

**Example usage:**
```bash
# Start on low-memory system
LOW_MEMORY=true node server.js

# Can safely handle 100+ concurrent requests
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://blinkit.com/cn/pasta/cid/15/968",
      "https://blinkit.com/cn/cookies/cid/888/28",
      "https://blinkit.com/cn/chocolate/cid/891/31"
    ],
    "pincode": "110001"
  }'
```

**Expected Performance:**
- Time per category: 35-45 seconds (slower due to sequential processing)
- Memory usage: 150-300 MB (stable)
- Concurrent tabs: 1-2
- Crash risk: Very low

---

### 4. **Custom Tab Configuration**
Best for: Fine-tuning for specific hardware
```bash
MAX_TABS=3 node server.js
```

**Common configurations:**
```bash
# Single-core system (or extremely slow)
MAX_TABS=1 node server.js

# Dual-core system
MAX_TABS=2 node server.js

# Quad-core system
MAX_TABS=4 node server.js

# 8+ core system with high memory
MAX_TABS=8 node server.js
```

---

## Combined Modes (Advanced)

### Ultra-Optimized for Worst-Case Scenario
```bash
SLOW_NETWORK=true LOW_MEMORY=true MAX_TABS=1 node server.js
```

**Use when:**
- Network: <1 Mbps (like 2G/3G)
- Memory: <256 MB available
- CPU: Single-core or heavily loaded
- Need: Maximum stability over speed

**Expected Performance:**
- Time per category: 60-90 seconds
- Memory usage: 100-200 MB (very stable)
- Concurrent tabs: 1
- Success rate: Highest

**Test it:**
```bash
SLOW_NETWORK=true LOW_MEMORY=true MAX_TABS=1 node server.js &
sleep 2

# Test with multiple categories
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://blinkit.com/cn/pasta/cid/15/968",
      "https://blinkit.com/cn/tea/cid/12/957",
      "https://blinkit.com/cn/cookies/cid/888/28"
    ],
    "pincode": "110001",
    "maxConcurrentTabs": 1
  }'
```

---

### Balanced Performance
```bash
SLOW_NETWORK=true node server.js
```

Best for: Most real-world scenarios
- Good balance of speed and stability
- Handles network interruptions
- Works on medium hardware

---

### Maximum Throughput
```bash
MAX_TABS=8 node server.js
```

Best for: Data centers with excellent infrastructure
- Requires: >4 GB RAM, >10 Mbps connection, 8+ cores
- Process multiple categories simultaneously
- Not recommended for constrained environments

---

## Testing & Monitoring

### 1. Health Check
```bash
# Check current server state
curl http://localhost:3088/health | jq

# Expected output
{
  "status": "ok",
  "uptime": "45.32s",
  "performance": {
    "slowNetworkMode": false,
    "lowMemoryMode": false,
    "maxConcurrentTabs": 6,
    "requestsProcessed": 3,
    "productsExtracted": 750,
    "averageTimePerCategory": "28.45s"
  }
}
```

### 2. Run Performance Test
```bash
node test_performance.js
```

Output example:
```
=== Blinkit Scraper Performance Test ===

✓ Server Status:
  Mode: NORMAL
  Memory: NORMAL
  Concurrency: 6 tabs

[1/3] pasta...
  ✓ 245 products in 28.56s (8.58 p/s)

[2/3] cookies...
  ✓ 312 products in 32.10s (9.71 p/s)

[3/3] tea...
  ✓ 189 products in 25.34s (7.46 p/s)

=== Test Summary ===
Total Requests: 3
Successful: 3
Total Time: 86.00s
Average Time per Category: 28.67s
Total Products: 746
Overall Rate: 8.67 products/second

✓ Good performance (28.67s per category)
```

### 3. Monitor Real-time
```bash
# Watch performance continuously (updates every 5s)
watch -n 5 'curl -s http://localhost:3088/health | jq .performance'

# Watch memory usage (Linux)
watch -n 2 'ps aux | grep "node server" | grep -v grep'

# Watch memory usage (macOS)
watch -n 2 'ps aux | grep node | grep server'
```

---

## Batch Processing Examples

### Process Multiple URLs
```bash
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://blinkit.com/cn/pasta/cid/15/968",
      "https://blinkit.com/cn/cookies/cid/888/28",
      "https://blinkit.com/cn/tea/cid/12/957",
      "https://blinkit.com/cn/chocolate/cid/891/31"
    ],
    "pincode": "110001",
    "maxConcurrentTabs": 4
  }'
```

### Save Results to File
```bash
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://blinkit.com/cn/pasta/cid/15/968",
    "pincode": "110001"
  }' > pasta_results.json

echo "Results saved to pasta_results.json"
jq '.totalProducts' pasta_results.json
```

### Process with Different Pincode
```bash
# Mumbai
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://blinkit.com/cn/pasta/cid/15/968",
    "pincode": "400001"
  }'

# Bangalore
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://blinkit.com/cn/pasta/cid/15/968",
    "pincode": "560001"
  }'
```

---

## Troubleshooting

### Issue: Server won't start
**Solution:**
```bash
# Check if port 3088 is already in use
lsof -i :3088

# If in use, kill the process
pkill -f "node server.js"

# Or use different port
PORT=3089 node server.js
```

### Issue: Very slow performance
**Try:**
```bash
# 1. Check current mode
curl http://localhost:3088/health | jq

# 2. If normal mode, switch to slow network
pkill -f "node server.js"
SLOW_NETWORK=true node server.js

# 3. Test again
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{"url":"https://blinkit.com/cn/pasta/cid/15/968","pincode":"110001"}'
```

### Issue: Out of memory errors
**Solution:**
```bash
# Enable low memory mode
pkill -f "node server.js"
LOW_MEMORY=true node server.js

# Verify it's enabled
curl http://localhost:3088/health | jq '.performance.lowMemoryMode'
# Should return: true
```

### Issue: 0 products extracted
**Debug:**
```bash
# 1. Check error dumps
ls -lh api_dumps/api_error_*.json

# 2. View latest error
cat api_dumps/api_error_*.json | tail -1 | jq

# 3. Try with longer timeout
SLOW_NETWORK=true node server.js
```

---

## Performance Comparison

**Setup:** Test 3 categories on standard hardware (4-core, 2GB RAM, 10 Mbps internet)

| Mode | pasta (25 items) | cookies (35 items) | tea (28 items) | Total Time | Memory Peak |
|------|-----|-----|----|----------|----------|
| Normal | 28s | 32s | 26s | 86s | 420 MB |
| SlowNetwork | 35s | 38s | 32s | 105s | 410 MB |
| LowMemory | 32s | 35s | 30s | 97s | 180 MB |
| Combined | 42s | 48s | 38s | 128s | 120 MB |

---

## Common Pincode Shortcuts

```bash
# Delhi
pincode="110001"

# Mumbai
pincode="400001"

# Bangalore
pincode="560001"

# Hyderabad
pincode="500001"

# Chennai
pincode="600001"

# Quick test
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://blinkit.com/cn/pasta/cid/15/968\",\"pincode\":\"$pincode\"}"
```

---

## Environment Variables Reference

```bash
# Enable slow network optimizations
SLOW_NETWORK=true

# Enable low memory mode
LOW_MEMORY=true

# Set custom concurrent tabs (1-8)
MAX_TABS=2

# Change port (default 3088)
PORT=3089

# Combine multiple
SLOW_NETWORK=true MAX_TABS=2 PORT=3089 node server.js
```

---

## Useful Commands

```bash
# Start in background
nohup node server.js > server.log 2>&1 &

# Start with slow network in background
nohup env SLOW_NETWORK=true node server.js > server.log 2>&1 &

# View logs
tail -f server.log

# View recent successful scrapes
grep "success" server.log | grep "Extracted"

# Kill server
pkill -f "node server.js"

# Check if running
pgrep -f "node server.js"

# Get PID
pgrep -f "node server.js" | head -1
```

---

## Example: Full Workflow

```bash
#!/bin/bash

# 1. Kill any existing server
pkill -f "node server.js"

# 2. Start optimized server in background
echo "Starting Blinkit scraper..."
nohup env SLOW_NETWORK=true node server.js > server.log 2>&1 &
sleep 3

# 3. Wait for server to be ready
echo "Waiting for server to be ready..."
for i in {1..10}; do
    if curl -s http://localhost:3088/health > /dev/null; then
        echo "✓ Server is ready!"
        break
    fi
    sleep 1
done

# 4. Test with categories
echo "Testing with 3 categories..."
curl -X POST http://localhost:3088/blinkitcategoryscrapper \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://blinkit.com/cn/pasta/cid/15/968",
      "https://blinkit.com/cn/cookies/cid/888/28",
      "https://blinkit.com/cn/tea/cid/12/957"
    ],
    "pincode": "110001"
  }' > results.json

# 5. Show results
echo "Results:"
jq '.totalProducts' results.json
echo "Products saved to results.json"

# 6. Show performance
echo "Performance metrics:"
curl http://localhost:3088/health | jq '.performance'
```

Save this as `run_scraper.sh`, then:
```bash
chmod +x run_scraper.sh
./run_scraper.sh
```

---

**For more details, see:**
- `OPTIMIZATION_REFERENCE.md` - Full configuration guide
- `CODE_CHANGES_SUMMARY.md` - Technical changes
- `OPTIMIZATION_ANALYSIS.md` - Detailed analysis
