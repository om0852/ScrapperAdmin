# Quick Start Guide - Server Setup

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Main Server Dependencies
```bash
cd mainserver
npm install
```

### Step 2: Install Platform Server Dependencies
```bash
cd mainserver/blinkit && npm install
cd ../dmart && npm install
cd ../flipkart && npm install
cd ../instamart && npm install
cd ../jiomart && npm install
cd ../zepto && npm install
```

Or use the convenience script below.

### Step 3: Start the Main Server
```bash
cd mainserver
npm start
```

You'll see output like:
```
[2026-03-01T10:30:00.000Z] [SUCCESS] [Orchestrator] 🚀 Main Server running on http://localhost:3000
```

### Step 4: Open the Web UI
Open your browser and go to:
```
http://localhost:3000
```

### Step 5: Start Platform Servers
Click the "Start Server" button on any platform card to launch that server.

---

## 📋 Batch Setup Script (Windows PowerShell)

Create a file `setup-all.ps1`:

```powershell
# Install all dependencies
Write-Host "Installing Main Server Dependencies..." -ForegroundColor Green
Set-Location mainserver
npm install

Write-Host "Installing Platform Dependencies..." -ForegroundColor Green
@("blinkit", "dmart", "flipkart", "instamart", "jiomart", "zepto") | ForEach-Object {
    Write-Host "Installing $_ dependencies..." -ForegroundColor Cyan
    Set-Location $_
    npm install
    Set-Location ..
}

Write-Host "Setup Complete! Run 'npm start' to launch the server." -ForegroundColor Green
```

Then run:
```bash
powershell -ExecutionPolicy Bypass -File setup-all.ps1
```

---

## 📋 Batch Setup Script (macOS/Linux)

Create a file `setup-all.sh`:

```bash
#!/bin/bash

echo -e "\033[32mInstalling Main Server Dependencies...\033[0m"
cd mainserver
npm install

echo -e "\033[32mInstalling Platform Dependencies...\033[0m"
for platform in blinkit dmart flipkart instamart jiomart zepto; do
    echo -e "\033[36mInstalling $platform dependencies...\033[0m"
    cd $platform
    npm install
    cd ..
done

echo -e "\033[32mSetup Complete! Run 'npm start' to launch the server.\033[0m"
```

Then run:
```bash
chmod +x setup-all.sh
./setup-all.sh
```

---

## 🎯 Common Tasks

### Start Main Server and All Platform Servers
```bash
cd mainserver
npm start
```
Then open http://localhost:3000 and click "Start Server" for each platform.

### Stop All Servers
- Option 1: Click "Stop All" button in the UI
- Option 2: Press Ctrl+C in the terminal

### Start Only Specific Platforms
```bash
cd mainserver
npm start
```
Then in the UI, click "Start Server" only on the platforms you need.

### Run in Development Mode (with auto-reload)
```bash
cd mainserver
npm run dev
```

---

## 🔧 Troubleshooting

### Error: "Cannot find module"
```bash
cd mainserver
npm install
```

### Error: "Port 3000 already in use"
Edit `mainserver/.env`:
```env
PORT=3100
```

### Platform not starting from UI
1. Check if platform folder exists
2. Run: `cd mainserver/[platform] && npm install`
3. Try starting again

### Web UI not loading
- Clear browser cache (Ctrl+Shift+Delete)
- Ensure `public/` folder exists in mainserver
- Check browser console for errors (F12)

---

## 📊 Monitoring

### Check Server Status
Open http://localhost:3000/api/platforms in browser to see JSON response.

### Check Individual Platform Health
```bash
curl http://localhost:3088/health  # Blinkit
curl http://localhost:4199/health  # DMart
curl http://localhost:3089/health  # Flipkart
curl http://localhost:3090/health  # Instamart
curl http://localhost:3091/health  # Jiomart
curl http://localhost:3092/health  # Zepto
```

---

## 📁 What Was Created

```
mainserver/
├── orchestrator.js         ✅ Main server
├── package.json           ✅ Dependencies
├── .env.example           ✅ Config template
├── README.md              ✅ Full documentation
├── QUICKSTART.md          ✅ This file
├── public/
│   ├── index.html        ✅ Web UI
│   ├── styles.css        ✅ Styling
│   └── script.js         ✅ Frontend logic
├── blinkit/
│   ├── server.js         ✅ Platform server
│   ├── package.json      ✅ Dependencies
│   ├── .env.example      ✅ Config
│   └── README.md         ✅ Docs
├── dmart/                ✅ Similar structure
├── flipkart/             ✅ Similar structure
├── instamart/            ✅ Similar structure
├── jiomart/              ✅ Similar structure
└── zepto/                ✅ Similar structure
```

---

## 🌐 Accessing Your Servers

### Main Control Panel
```
http://localhost:3000
```

### Individual Platform Servers (when running)
- Blinkit: `http://localhost:3088`
- DMart: `http://localhost:4199`
- Flipkart: `http://localhost:3089`
- Instamart: `http://localhost:3090`
- Jiomart: `http://localhost:3091`
- Zepto: `http://localhost:3092`

---

## 💡 Tips

1. **First Time Setup**: Run the batch script once to install all dependencies
2. **Daily Usage**: Just run `npm start` in mainserver folder
3. **Multiple Instances**: You can run main server on port 3000 and 3001 simultaneously
4. **Memory Issues**: Reduce `MAX_CONCURRENT_TABS` in `.env` files if needed
5. **Logs**: Check browser console (F12) and terminal for detailed logs

---

## ❓ Need Help?

1. Check the full [README.md](./README.md)
2. Read individual platform READMEs in their folders
3. Check console logs (F12 in browser, or terminal output)
4. Verify all Node.js modules installed: `npm list`

---

**Ready?** Run this command to get started:
```bash
cd mainserver && npm install && npm start
```

Then open: **http://localhost:3000**

Happy scraping! 🚀
