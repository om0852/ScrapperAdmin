# Manual Setup & Deployment Guide

## System Requirements Check

Before starting, verify you have installed:
- ✅ Node.js (v18 or higher) - Download from https://nodejs.org/
- ✅ npm (comes with Node.js)
- ✅ Git (for version control, optional)

Quick check commands:
```powershell
node --version    # Should be v18+
npm --version     # Should be v9+
npm list -g       # Check global packages
```

---

## Step 1: Verify Environment Configuration

**File: `.env`**
Location: `D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\.env`

Must contain:
```env
PORT=7000
MONGODB_URI=mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce
NODE_ENV=production
```

✅ Already configured? Proceed to Step 2.

---

## Step 2: Install Project Dependencies

### Command 1: Navigate to project folder
```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver"
```

### Command 2: Install all dependencies
```powershell
npm install
```

**What this does:**
- Reads `package.json`
- Downloads all packages (Express, Playwright, MongoDB drivers, etc.)
- Creates `node_modules/` folder (~500MB)
- Creates `package-lock.json`

**Estimated time:** 3-5 minutes on first run

**Expected output:**
```
added 200+ packages in 180s
```

---

## Step 3: Install Browser Dependencies (One-time Setup)

Playwright needs browser binaries. Run this **once**:

```powershell
npx playwright install chromium firefox
```

**Expected output:**
```
✓ chromium downloaded
✓ firefox downloaded
```

**Estimated time:** 2-3 minutes
**Disk space:** ~1.5GB for browsers

---

## Step 4: Run the Orchestrator (Main Server)

This is your central hub that coordinates all scrapers.

### Command:
```powershell
npm start
```

**Wait for output like:**
```
🎯 Main Server running on http://localhost:7000
📡 Connected to MongoDB Backend successfully
All 7 services registered and ready
```

✅ **Don't close this terminal. Keep it open.**

---

## Step 5: Run Each Scraper (In Separate Terminals)

Open **7 NEW PowerShell windows** and run each command in order.

### Scraper 1: Blinkit (Port 3088)
```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\Blinkit-Scrapper"
npm install  # First time only
npm start
```
Wait for: `🎯 Blinkit Scraper API running on http://localhost:3088`

### Scraper 2: Instamart (Port 3089)
```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\instamart-category-scrapper"
npm install  # First time only
npm start
```
Wait for: `🎯 Instamart Scraper API running on http://localhost:3089`

### Scraper 3: Jiomart (Port 3090)
```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\Jiomart-Scrapper"
npm install  # First time only
npm start
```
Wait for: `🎯 Jiomart Scraper running on http://localhost:3090`

### Scraper 4: Flipkart Minutes (Port 3091)
```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\flipkart_minutes"
npm install  # First time only
npm start
```
Wait for: `🎯 Flipkart Minutes API running on http://localhost:3091`

### Scraper 5: Zepto (Port 3092)
```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\Zepto-Scrapper"
npm install  # First time only
npm start
```
Wait for: `🎯 Zepto Scraper API running on http://localhost:3092`

### Scraper 6: DMart (Port 4199)
```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\DMart-Scrapper"
npm install  # First time only
npm start
```
Wait for: `🎯 DMart Scraper running on http://localhost:4199`

---

## Step 6: Verify Everything is Running

Once all terminals show "running" status, verify connectivity:

### In any terminal:
```powershell
# Test orchestrator
curl http://localhost:7000/health

# Test each scraper
curl http://localhost:3088/health
curl http://localhost:3089/health
curl http://localhost:3090/health
curl http://localhost:3091/health
curl http://localhost:3092/health
curl http://localhost:4199/health
```

**Expected response:** `{"status":"ok"}`

---

## Terminal Layout (Recommended)

Arrange your terminals like this for easy monitoring:

```
┌─────────────────────┬─────────────────────┐
│  MAIN ORCHESTRATOR  │   Blinkit (3088)    │
│  PORT 7000          │                     │
├─────────────────────┼─────────────────────┤
│  Instamart (3089)   │   Jiomart (3090)    │
├─────────────────────┼─────────────────────┤
│ Flipkart Min (3091) │   Zepto (3092)      │
├─────────────────────┼─────────────────────┤
│  DMart (4199)       │  [Monitor/Testing]  │
└─────────────────────┴─────────────────────┘
```

Use Windows Snap features (Win+Arrow keys) to tile terminals.

---

## Testing Scrapers

Once all running, test a scraper:

```powershell
# Example: Blinkit scraper request
$body = @{
    pincode = "411001"
    categories = @(@{name="Fruits & Vegetables"; url="https://blinkit.com/fruits-vegetables"})
    maxProductsPerSearch = 50
} | ConvertTo-Json

curl -X POST http://localhost:3088/blinkitcategoryscrapper `
     -Headers @{"Content-Type"="application/json"} `
     -Body $body
```

---

## Common Issues & Solutions

### Issue: `npm install` stuck or slow
**Solution:** Clear npm cache
```powershell
npm cache clean --force
npm install
```

### Issue: `playwright install` fails
**Solution:** Run as Administrator
```powershell
# Close and reopen PowerShell as Administrator, then:
npx playwright install chromium firefox
```

### Issue: Port already in use (Error: EADDRINUSE)
**Solution:** Kill process using that port
```powershell
# Example: Kill process on port 7000
netstat -ano | findstr :7000
taskkill /PID <PID_NUMBER> /F
```

### Issue: MongoDB connection fails
**Solution:** Verify .env file has correct URI
```powershell
cat .\.env
```
Should show:
```
MONGODB_URI=mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce
```

### Issue: Node command not found
**Solution:** Node.js not installed. Download from https://nodejs.org/ and install.

---

## To Share With Friends

Send them this setup:

**Files to share:**
1. Entire project folder (except `node_modules/`)
2. `.env` file (or `.env.example` + instructions to add URI)
3. This guide

**Send them command:**
```powershell
# In project root
npm install
npx playwright install chromium firefox

# Then run orchestrator + 6 scrapers in separate terminals (as listed above)
```

---

## Performance Tips

**For better stability:**
- Use SSD for `node_modules/` (faster startup)
- Close other heavy apps (Chrome with many tabs, etc.)
- Allocate 8GB+ RAM (for browser instances)
- Use Windows 10/11 for best performance

**For faster startup on second run:**
- Don't reinstall dependencies
- Just run `npm start` in each terminal
- Dependencies cache locally

---

## Stopping Everything

To stop all services cleanly:

1. In each terminal running a scraper: `Ctrl + C`
2. Last, in orchestrator terminal: `Ctrl + C`
3. Verify all closed: `netstat -ano | findstr :7000` (should return empty)

---

## Starting Again (Next Time)

After first setup, to run everything again:

**Terminal 1 (Orchestrator):**
```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver"
npm start
```

**Terminals 2-7 (Each Scraper):**
```powershell
# Blinkit
cd "Blinkit-Scrapper" && npm start

# Instamart
cd "instamart-category-scrapper" && npm start

# Jiomart
cd "Jiomart-Scrapper" && npm start

# Flipkart
cd "flipkart_minutes" && npm start

# Zepto
cd "Zepto-Scrapper" && npm start

# DMart
cd "DMart-Scrapper" && npm start
```

---

## Monitoring & Logs

Each terminal shows real-time logs:
- 🎯 Service started
- 📡 Request incoming
- ✅ Successful operations
- ❌ Errors (if any)

Monitor all 8 terminals to see what's happening live.
