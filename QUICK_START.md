# Direct API Scraper - Quick Start Guide

Get started with Direct API scraping in **5 minutes**.

## Prerequisites

- Node.js 14+
- npm or yarn
- curl or Postman (for testing)

## Installation (2 minutes)

```bash
# 1. Install dependencies
npm install express cors dotenv node-fetch

# 2. Create .env file
cat > .env << EOF
PORT=5000
PINCODE=110001
CONCURRENT_LIMIT=2
EOF

# 3. Start the server
node server_direct_api.js
```

**Expected Output:**
```
╔════════════════════════════════════════╗
║   Direct API Scraper Server Started    ║
╚════════════════════════════════════════╝

📍 Server running on http://localhost:5000
```

## Your First Scrape (3 minutes)

### Option A: Using cURL

```bash
# Scrape Jiomart categories
curl -X POST http://localhost:5000/api/jiomart/scrape?pincode=110001 \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.jiomart.com/c/groceries/grains",
      "https://www.jiomart.com/c/groceries/vegetables"
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Scraping started via direct API",
  "sessionId": "jiomart_1705312200000",
  "platform": "jiomart",
  "urlCount": 2,
  "pincode": "110001"
}
```

### Option B: Using Node.js

```javascript
// quick_test.js
const fetch = require('node-fetch');

async function quickTest() {
  const response = await fetch('http://localhost:5000/api/jiomart/scrape?pincode=110001', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls: ['https://www.jiomart.com/c/groceries/grains']
    })
  });
  
  const result = await response.json();
  console.log('Session ID:', result.sessionId);
  return result.sessionId;
}

quickTest().then(sessionId => {
  console.log(`Check results: http://localhost:5000/api/session/${sessionId}`);
});
```

Run it:
```bash
node quick_test.js
```

### Option C: Using Python

```python
# quick_test.py
import requests

response = requests.post(
    'http://localhost:5000/api/jiomart/scrape?pincode=110001',
    json={'urls': ['https://www.jiomart.com/c/groceries/grains']}
)

session_id = response.json()['sessionId']
print(f"Session ID: {session_id}")
```

Run it:
```bash
python quick_test.py
```

## Check Your Results

Once scraping starts, use the sessionId to check results:

```bash
# Check status (while processing)
curl http://localhost:5000/api/session/jiomart_1705312200000/status

# Sample response while processing:
# {"status":"processing","message":"Session is currently processing"}

# Get full results (when complete)
curl http://localhost:5000/api/session/jiomart_1705312200000
```

**Full Results Format:**
```json
{
  "sessionId": "jiomart_1705312200000",
  "platform": "jiomart",
  "totalProducts": 245,
  "results": [
    {
      "productId": "123456",
      "productName": "Basmati Rice 1kg",
      "currentPrice": 250,
      "originalPrice": 300,
      "discountPercentage": 17,
      "rating": 4.5,
      "platform": "jiomart",
      "scrapedAt": "2024-01-15T10:30:00.000Z"
    },
    // ... more products
  ],
  "completedAt": "2024-01-15T10:35:30.000Z"
}
```

## Common Tasks

### Scrape Flipkart Minutes

```bash
curl -X POST http://localhost:5000/api/flipkart/scrape?pincode=110001 \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.flipkart.com/fm/api/4/page/fetch?pageUID=1640000000000"
    ]
  }'
```

### Scrape Multiple Platforms at Once

```bash
curl -X POST http://localhost:5000/api/scrape-all?pincode=110001 \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.jiomart.com/c/groceries/grains",
      "https://www.flipkart.com/fm/api/4/page/fetch?pageUID=1640000000000"
    ]
  }'
```

### Use Different Pincode

```bash
# Just add ?pincode=XXX to the URL
curl -X POST http://localhost:5000/api/jiomart/scrape?pincode=560001 \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://www.jiomart.com/c/groceries/grains"]}'
```

### List All Sessions

```bash
curl http://localhost:5000/api/sessions
```

**Response:**
```json
{
  "sessions": [
    "jiomart_1705312200000",
    "flipkart_1705312000000",
    "multi_1705311800000"
  ],
  "count": 3
}
```

## Monitoring & Debugging

### Real-Time Status Polling

```bash
#!/bin/bash
SESSION_ID="jiomart_1705312200000"

# Poll every 3 seconds until complete
while true; do
  curl -s http://localhost:5000/api/session/$SESSION_ID/status | jq '.'
  sleep 3
done
```

### View API Dumps

```bash
# See what was sent to and received from APIs
ls -la api_dumps/

# View a specific dump
cat api_dumps/dump_110001_response_*.json | jq '.' | less
```

### Check Session Files

```bash
# View all session results
ls -la session_results/

# View a specific session's status
cat session_results/jiomart_1705312200000_status.json | jq '.'

# View complete results
cat session_results/jiomart_1705312200000_results.json | jq '.results[0]'
```

## Performance Tips

### 1. Increase Concurrency

```bash
# .env
CONCURRENT_LIMIT=5  # Increased from 2
```

⚠️ **Warning**: Too high may trigger rate limits. Start with 2-3.

### 2. Batch Large URL Lists

```bash
# Instead of 1000 URLs, split into batches of 100
curl ... -d '{"urls": [...100 URLs...]}'
curl ... -d '{"urls": [...100 more URLs...]}'
```

### 3. Monitor Memory Usage

```bash
# Watch memory in real-time
node --max-old-space-size=2048 server_direct_api.js
```

## Troubleshooting

### Server won't start

```bash
# Error: EADDRINUSE: address already in use
# Solution: Kill process using port 5000
lsof -i :5000
kill -9 <PID>

# Or use different port
PORT=5001 node server_direct_api.js
```

### Get "Session not found"

```bash
# Wait longer - scraping may still be in progress
sleep 10
curl http://localhost:5000/api/session/{sessionId}/status

# Check if session file was created
ls session_results/*{sessionId}*
```

### Get rate limit errors

```bash
# Reduce concurrency in .env
CONCURRENT_LIMIT=1

# Add delays in your code
# (Built-in 2s delay, but you can edit direct_api_*.js)
```

### Memory issues

```bash
# Clean old sessions
find session_results -mtime +7 -delete
find api_dumps -mtime +1 -delete

# Increase memory limit
node --max-old-space-size=4096 server_direct_api.js
```

## Advanced: Integrate with Your App

### As a Microservice

```javascript
// app.js
const express = require('express');
const fetch = require('node-fetch');

const app = express();

app.post('/scrape-products', async (req, res) => {
  const { urls, pincode } = req.body;
  
  try {
    // Call direct API server
    const response = await fetch(`http://localhost:5000/api/jiomart/scrape?pincode=${pincode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    });
    
    const { sessionId } = await response.json();
    
    // Wait for results (polling)
    const results = await pollResults(sessionId);
    
    // Insert to your database
    await saveProducts(results);
    
    res.json({ success: true, products: results.results });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function pollResults(sessionId, timeout = 300000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const response = await fetch(`http://localhost:5000/api/session/${sessionId}/status`);
    const status = await response.json();
    
    if (status.status === 'completed') {
      const fullResponse = await fetch(`http://localhost:5000/api/session/${sessionId}`);
      return await fullResponse.json();
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  throw new Error('Timeout waiting for scraping results');
}

app.listen(3000);
```

## Next Steps

1. ✅ Server running
2. ✅ First scrape working
3. → Read [DIRECT_API_DOCUMENTATION.md](DIRECT_API_DOCUMENTATION.md) for full details
4. → Read [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) if migrating from browser scraper
5. → Deploy to production

## Tech Stack

| Component | Version | Purpose |
|-----------|---------|---------|
| Node.js | 14+ | Runtime |
| Express.js | 4.18+ | Web server |
| node-fetch | 2.7+ | HTTP requests |
| CORS | 2.8+ | Cross-origin requests |
| dotenv | 16.0+ | Environment vars |

## File Structure

```
mainserver/
├── server_direct_api.js                # Main server
├── test_direct_api.js                  # Test suite
├── DIRECT_API_DOCUMENTATION.md         # Full docs
├── QUICK_START.md                      # This file
├── MIGRATION_GUIDE.md                  # For upgrading
├── .env                                # Config
│
├── jiomart/
│   └── direct_api_jiomart.js          # Jiomart module
│
├── flipkart_minutes/
│   └── direct_api_flipkart.js         # Flipkart module
│
├── session_results/                    # Results storage
└── api_dumps/                          # Debug logs
```

## Support

**Something not working?**

1. Check server health:
   ```bash
   curl http://localhost:5000/health
   ```

2. Check logs:
   ```bash
   node server_direct_api.js  # See console output
   ls api_dumps/               # Check API responses
   cat session_results/*_status.json  # Check session status
   ```

3. Read full docs: [DIRECT_API_DOCUMENTATION.md](DIRECT_API_DOCUMENTATION.md)

4. Check migrations: [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)

## Quick Reference

| Task | Command |
|------|---------|
| Start server | `node server_direct_api.js` |
| Health check | `curl localhost:5000/health` |
| Scrape Jiomart | `curl -X POST localhost:5000/api/jiomart/scrape` |
| Check results | `curl localhost:5000/api/session/{id}` |
| List sessions | `curl localhost:5000/api/sessions` |
| Run tests | `node test_direct_api.js` |
| View API dumps | `ls api_dumps/` |
| View sessions | `ls session_results/` |

---

**Ready to scrape?** 🚀

```bash
# 1. Install
npm install express cors dotenv node-fetch

# 2. Configure
echo "PORT=5000\nPINCODE=110001\nCONCURRENT_LIMIT=2" > .env

# 3. Start
node server_direct_api.js

# 4. Scrape
curl -X POST http://localhost:5000/api/jiomart/scrape?pincode=110001 \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://www.jiomart.com/c/groceries/grains"]}'
```

**That's it!** Check the status to see your results.
