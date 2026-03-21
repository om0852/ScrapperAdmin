# 🚀 Manual Setup - Start Here

## Current Status

- ✅ Project is ready
- ✅ .env file configured (MongoDB URI set)
- ❌ Dependencies NOT installed yet
- ❌ Services NOT running yet

---

## 📋 What You Need

**On your machine:**
- ✅ Windows 10 or 11
- ✅ 8GB+ RAM (minimum)
- ✅ 20GB free disk space
- ❓ Node.js (check if installed)

**Quick check:**
```powershell
node --version
npm --version
```

If commands not found: Download from https://nodejs.org/ (LTS version)

---

## 🎯 Your Quick Action Plan

### Phase 1: One-Time Setup (First Time Only)

**Double-click this file:**
```
start-all-dependencies.bat
```

This will:
1. ✅ Install npm packages for main server
2. ✅ Install npm packages for each scraper (7 total)
3. ✅ Install Playwright browsers (Chromium, Firefox)
4. ✅ Verify everything

**Estimated time:** 5-10 minutes

---

### Phase 2: Start All Services

**Double-click this file:**
```
start-all-services.bat
```

This will:
- 🎯 Open 8 terminals automatically
- 🚀 Start orchestrator (port 7000)
- 🚀 Start Blinkit scraper (port 3088)
- 🚀 Start Instamart scraper (port 3089)
- 🚀 Start Jiomart scraper (port 3090)
- 🚀 Start Flipkart scraper (port 3091)
- 🚀 Start Zepto scraper (port 3092)
- 🚀 Start DMart scraper (port 4199)

**Wait 30 seconds** for all to start, then open: **http://localhost:7000**

---

## 📁 Important Files Created For You

| File | Purpose |
|------|---------|
| `MANUAL_SETUP.md` | Detailed step-by-step guide |
| `QUICK_START_MANUAL.md` | Copy-paste command reference |
| `start-all-services.bat` | ⭐ One-click to start everything |
| `setup-all-dependencies.bat` | ⭐ One-click to install dependencies |
| `TROUBLESHOOTING.md` | Solve common problems |
| `.env` | MongoDB configuration (already set) |

---

## ✅ Beginner Path (Easiest)

**Step 1:** Double-click `setup-all-dependencies.bat`
- Wait for completion ✅

**Step 2:** Double-click `start-all-services.bat`
- Wait 30 seconds ✅

**Step 3:** Open http://localhost:7000 in browser
- Done! ✅

---

## 🔧 Advanced Path (Manual Control)

Want to understand what's happening?

**Read:** `QUICK_START_MANUAL.md`

- Has all copy-paste commands
- Shows what each command does
- Better for troubleshooting

---

## ❌ Manual Path (Full Control)

Want to do it step by step?

**Read:** `MANUAL_SETUP.md`

- 6-step detailed walkthrough
- Terminal-by-terminal instructions
- Best for learning

---

## 🆘 If Something Goes Wrong

**Check:** `TROUBLESHOOTING.md`

- Issue 1-10 with solutions
- Port conflicts?
- MongoDB connection issues?
- npm problems?

All covered!

---

## 🔍 How to Know It's Working

✅ **All 8 terminals show:**
```
🎯 [Service Name] running on http://localhost:XXXX
```

✅ **Can access:**
```
http://localhost:7000        ← Main page
http://localhost:7000/health ← Health check
```

✅ **Can test scrapers:**
```powershell
curl http://localhost:3088/health  # Blinkit
curl http://localhost:3089/health  # Instamart
curl http://localhost:3090/health  # Jiomart
curl http://localhost:3091/health  # Flipkart
curl http://localhost:3092/health  # Zepto
curl http://localhost:4199/health  # DMart
```

All should return: `{"status":"ok"}`

---

## 🚫 The Only Requirement

**Never close the terminals!**

All 8 terminals must stay open while you're using it:
- Orchestrator (7000)
- Blinkit (3088)
- Instamart (3089)
- Jiomart (3090)
- Flipkart (3091)
- Zepto (3092)
- DMart (4199)

Close them = services stop.

---

## 👥 Sharing With Friends

Send them:

1. **This entire folder**
2. **This file** (`README_MANUAL.md`)
3. **These batch files:**
   - `setup-all-dependencies.bat`
   - `start-all-services.bat`

**Their steps:**
1. Make sure Node.js installed
2. Double-click `setup-all-dependencies.bat`
3. Double-click `start-all-services.bat`
4. Wait 30 seconds
5. Open http://localhost:7000

---

## 💡 Pro Tips

**Tip 1:** Arrange terminals on screen
- Use Windows Snap (Win+Arrow keys)
- Tile all 8 for easy monitoring

**Tip 2:** Keep these running 24/7?
- Too slow for laptop
- Better to deploy to cloud (xtrasecurity.in)
- Or use Docker on a server
- Need help? Let me know!

**Tip 3:** Testing a scraper?
- Keep only that terminal
- Stop others to save RAM
- Run 1-2 at a time if low on memory

**Tip 4:** Laptop slow?
- Close Chrome, Discord, other apps
- Stop unnecessary terminals
- Run on SSD (not HDD)

---

## 📊 Resources Guide

| Need | Link |
|------|------|
| Node.js Download | https://nodejs.org/ |
| Express Docs | https://expressjs.com/ |
| Playwright Docs | https://playwright.dev/ |
| MongoDB Atlas | https://www.mongodb.com/cloud/atlas |
| npm Commands | https://docs.npmjs.com/cli/commands |

---

## 🎓 Next Steps After Setup

**Once running, you can:**

1. **Test a scraper** - Send POST request to `/zeptocategoryscrapper`
2. **Monitor logs** - Watch terminal output in real-time
3. **Deploy to cloud** - Set up on xtrasecurity.in for 24/7
4. **Containerize** - Use Docker for sharing (optional)
5. **Share with friends** - Send this folder + batch files

---

## 🔔 Important Reminders

- ⚠️ Requires **8GB+ RAM** minimum
- ⚠️ Requires **stable internet** (for MongoDB + scraping)
- ⚠️ Requires **20GB+ free disk space**
- ⚠️ Requires **Node.js v18** or higher
- ⚠️ Keep **all 8 terminals open** while using

---

## 📞 Ready?

**Choose your path:**

✅ **Easiest:** Double-click `start-all-services.bat`

✅ **With learning:** Read `QUICK_START_MANUAL.md` first

✅ **Step-by-step:** Read `MANUAL_SETUP.md` for complete guide

---

**Let me know if you hit any issues!**

All problems documented in `TROUBLESHOOTING.md` ✅
