# Troubleshooting Guide - Manual Setup

## Issue 1: `npm install` Fails or Hangs

### Error: `npm ERR! code ERESOLVE` or `npm ERR!`

**Solution:**
```powershell
# Clear npm cache
npm cache clean --force

# Try install again
npm install

# If still failing, use legacy peer deps
npm install --legacy-peer-deps
```

### Error: Out of memory during install

**Solution:**
```powershell
# Increase Node memory
$env:NODE_OPTIONS = '--max-old-space-size=4096'
npm install
```

---

## Issue 2: Playwright Installation Fails

### Error: `ERR! gyp ERR!` or `python not found`

**Solution 1:** Run PowerShell as Administrator
```powershell
# Close PowerShell
# Right-click on PowerShell > Run as Administrator
# Then run:
npx playwright install chromium firefox
```

**Solution 2:** Install missing tools
```powershell
# Install Python (if needed)
# Download from https://www.python.org/ and install

# Install C++ build tools
# Download from https://visualstudio.microsoft.com/downloads/
# Choose "Desktop development with C++"
```

---

## Issue 3: `npm start` Fails - Port Already in Use

### Error: `EADDRINUSE :::7000` or similar

**Find and kill the process:**
```powershell
# Find process using the port (example: port 7000)
netstat -ano | findstr :7000

# Kill the process (replace PID_NUMBER with actual number)
taskkill /PID PID_NUMBER /F

# Example:
# Output: TCP  0.0.0.0:7000  0.0.0.0:0  LISTENING  12345
# Command: taskkill /PID 12345 /F
```

**Or: Change the port**
```powershell
# Set different port before running
$env:PORT=8000
npm start
```

---

## Issue 4: MongoDB Connection Fails

### Error: `MongooseError: Cannot connect to MongoDB`

**Check .env file:**
```powershell
# Verify .env exists and has correct URI
cat .\.env

# Should contain:
# MONGODB_URI=mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce
```

### Error: `ENOTFOUND` or network error

**Possible causes:**
1. **No internet connection** - Check your WiFi
2. **MongoDB server down** - Wait or contact admin
3. **Wrong credentials in URI** - Verify .env file

**Test connection:**
```powershell
# Test network connectivity
ping 8.8.8.8

# Test MongoDB directly (if you need to debug)
# Use MongoDB Compass: https://www.mongodb.com/products/compass
```

---

## Issue 5: Node Version Issues

### Error: `npm ERR! The engines in this package wanted`

**Check Node version:**
```powershell
node --version
npm --version
```

**Should be:**
- Node: v18.x or higher
- npm: v9.x or higher

**Update Node.js:**
1. Download from https://nodejs.org/
2. Choose LTS version
3. Install and restart PowerShell
4. Verify: `node --version`

---

## Issue 6: Scrapers Not Responding

### Error: `curl: (7) Failed to connect`

**Check if service is actually running:**
```powershell
# See if node processes are running
Get-Process node

# Expected output: Multiple node.exe processes
```

**Check logs in the terminal:**
- Look for errors or crashes
- Check if port is different than expected

**Restart the service:**
1. In that terminal: `Ctrl + C`
2. Run: `npm start`
3. Wait for "running on port X" message

---

## Issue 7: Playwright Browsers Won't Download

### Error: `ECONNREFUSED` or `ERR_FILE_DOWNLOAD_FAILED`

**Solutions:**
```powershell
# Clear playwright cache
rm -r ~/.cache/ms-playwright
rm -r $env:APPDATA\..\Local\pw-browsers

# Download browsers with verbose output
npx playwright install chromium firefox --with-deps

# If still failing, download manually
npx playwright install --verbose
```

---

## Issue 8: Script Execution Policy Error

### Error: `cannot be loaded because running scripts is disabled`

**Solution:**
```powershell
# Check current policy
Get-ExecutionPolicy

# Set to allow scripts (temporary - this session only)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process

# Now run your script
.\start-all-services.bat
```

---

## Issue 9: Out of Memory / System Slow

### Symptoms: System freezes, tasks manager shows high RAM usage

**Solution:**
```powershell
# Check how many node processes are running
Get-Process node | Measure-Object

# Kill all node processes if needed
Get-Process node | Stop-Process -Force

# Restart with fewer scrapers (test one at a time)
```

**For friends' machines:**
- Close unnecessary apps (Chrome with many tabs, etc.)
- Ensure 8GB+ RAM available
- Use SSD storage (faster than HDD)

---

## Issue 10: Scrapers Don't Work (Health Check Fails)

### Error: All services running but curl returns error

**Check logs in each terminal:**
1. Look for any error messages
2. Common issues:
   - Missing dependencies in that scraper
   - Database connection problem
   - Browser (Chromium/Firefox) not loaded

**Verify all terminals started correctly:**
```powershell
# Each terminal should show:
# 🎯 [Service Name] running on http://localhost:XXXX

# If you see errors, read them carefully
```

**Restart that service:**
```powershell
# In that terminal:
Ctrl + C
npm install  # Re-install just in case
npm start
```

---

## Quick Health Check Commands

Use these to debug:

```powershell
# Check all processes
Get-Process node

# Check all ports in use
netstat -ano | grep LISTENING

# Check Node installation
node -e "console.log('Node working')"

# Check npm
npm -v

# Test MongoDB connection (from main dir)
node -e "require('mongoose').connect(process.env.MONGODB_URI)"

# List running npm scripts
npm ls
```

---

## When All Else Fails

### Complete Reset:

```powershell
# 1. Kill all node processes
Get-Process node | Stop-Process -Force

# 2. Delete all node_modules (fresh install)
cd "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver"
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json

# 3. Clear npm cache
npm cache clean --force

# 4. Fresh install
npm install
npx playwright install chromium firebase

# 5. Run setup script
.\setup-all-dependencies.bat

# 6. Try again
.\start-all-services.bat
```

---

## Getting Help

If you're still stuck:

1. **Check logs** - Read terminal output carefully
2. **Google the error** - Copy exact error message
3. **Check Node.js docs** - https://nodejs.org/docs/
4. **Check Express docs** - https://expressjs.com/
5. **Check Playwright docs** - https://playwright.dev/

---

## System Requirements Minimum

- **RAM:** 8GB (4GB min, but slow)
- **CPU:** 4 cores (Dual-core struggles with 7 scrapers)
- **Storage:** 20GB free (for node_modules + browsers)
- **Network:** Stable internet (required for MongoDB + scraping)
- **OS:** Windows 10/11, macOS 10.15+, Linux

For **friend's laptops:** Verify they meet these minimums!
