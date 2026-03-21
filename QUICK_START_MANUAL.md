# ⚡ Quick Command Reference - Copy & Paste

## One-Time Setup (First Time Only)

Open PowerShell and run these in sequence:

```powershell
# 1. Navigate to project
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver"

# 2. Install dependencies
npm install

# 3. Install browsers
npx playwright install chromium firefox

# Verify setup
node --version
npm --version
```

**Estimated time:** 5-10 minutes

---

## Terminal 1: Start Orchestrator

```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver"
npm start
```

Wait for:
```
🎯 Main Server running on http://localhost:7000
📡 Connected to MongoDB Backend successfully
```

✅ Leave this terminal open. Open NEW terminals for scrapers.

---

## Terminal 2: Blinkit Scraper (Port 3088)

```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\Blinkit-Scrapper"
npm install
npm start
```

Wait for: `🎯 Blinkit Scraper API running on http://localhost:3088`

---

## Terminal 3: Instamart Scraper (Port 3089)

```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\instamart-category-scrapper"
npm install
npm start
```

Wait for: `🎯 Instamart Scraper API running on http://localhost:3089`

---

## Terminal 4: Jiomart Scraper (Port 3090)

```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\Jiomart-Scrapper"
npm install
npm start
```

Wait for: `🎯 Jiomart Scraper running on http://localhost:3090`

---

## Terminal 5: Flipkart Minutes Scraper (Port 3091)

```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\flipkart_minutes"
npm install
npm start
```

Wait for: `🎯 Flipkart Minutes API running on http://localhost:3091`

---

## Terminal 6: Zepto Scraper (Port 3092)

```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\Zepto-Scrapper"
npm install
npm start
```

Wait for: `🎯 Zepto Scraper API running on http://localhost:3092`

---

## Terminal 7: DMart Scraper (Port 4199)

```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver\DMart-Scrapper"
npm install
npm start
```

Wait for: `🎯 DMart Scraper running on http://localhost:4199`

---

## Verify All Running

In any terminal:

```powershell
# Test orchestrator
curl http://localhost:7000/health

# Test all scrapers
curl http://localhost:3088/health
curl http://localhost:3089/health
curl http://localhost:3090/health
curl http://localhost:3091/health
curl http://localhost:3092/health
curl http://localhost:4199/health
```

All should return: `{"status":"ok"}`

---

## Stopping Everything

In each terminal: `Ctrl + C`

---

## Restarting (Next Time)

Just repeat the 8 terminal commands above (no npm install needed again).
