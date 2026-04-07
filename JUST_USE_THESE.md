# 🚀 Simple Setup Instructions

## Problem Solved ✅

Created new batch files that work when **double-clicked**:

- `setup-quick.bat` - ONE-CLICK SETUP
- `start-quick.bat` - ONE-CLICK START

---

## 👉 What To Do NOW

### Step 1: First-Time Setup Only

**Double-click this file in Windows Explorer:**
```
setup-quick.bat
```

**OR** Navigate to folder and run:
```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver"
.\setup-quick.bat
```

✅ Wait for "SETUP COMPLETE!" message
✅ This installs all dependencies (takes 5-10 minutes)

---

### Step 2: Start All Services

**Double-click this file in Windows Explorer:**
```
start-quick.bat
```

**OR** Navigate to folder and run:
```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver"
.\start-quick.bat
```

✅ Will open 7 terminals automatically
✅ Wait 30 seconds for all to start
✅ Then open: **http://localhost:7000**

---

## 🎯 Quick Summary

| Stage | File | Double-Click? |
|-------|------|---------------|
| **First Setup** | `setup-quick.bat` | ✅ YES |
| **Start Services** | `start-quick.bat` | ✅ YES |
| **Next Time** | Just re-run `start-quick.bat` | ✅ YES |

---

## ✅ You Should See

After `setup-quick.bat`:
```
==================================================
SETUP COMPLETE!
==================================================

Next step: Double-click "start-all-services.bat"
to start all services!
```

After `start-quick.bat`:
- 7 terminal windows open automatically
- Each shows: `🎯 ... running on http://localhost:XXXX`
- Main page opens at: http://localhost:7000

---

## 🔍 Testing After Start

Open PowerShell and test:
```powershell
curl http://localhost:7000/health
```

Should return: `{"status":"ok","message":"..."}`

---

## ❌ If Still Nothing Happens

### Try Method 1: PowerShell
```powershell
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver"
npm install
npx playwright install chromium firefox
```

### Try Method 2: Command Prompt
```cmd
cd /d "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver"
npm install
npx playwright install chromium firefox
```

### Try Method 3: Check Node Installation
```powershell
node --version
npm --version
```

If these don't work → Download Node.js: https://nodejs.org/

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| **Double-click does nothing** | Right-click → Open with → Command Prompt |
| **npm command not found** | Install Node.js from https://nodejs.org/ |
| **Port 7000 already in use** | Check TROUBLESHOOTING.md |
| **Playwright install fails** | Run PowerShell as Administrator |

---

## 📁 Original Files (Don't Delete)

- `setup-all-dependencies.bat` - Original version (slower)
- `start-all-services.bat` - Original version
- `MANUAL_SETUP.md` - Full detailed guide
- `QUICK_START_MANUAL.md` - Copy-paste commands
- `TROUBLESHOOTING.md` - Problem solving

---

**USE THESE NEW FILES:**
- ✅ `setup-quick.bat` ← For setup
- ✅ `start-quick.bat` ← For starting services

**SIMPLER. FASTER. WORKS.**
