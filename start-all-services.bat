@echo off
REM This script opens all required terminals and starts each service
REM Run this from the mainserver directory

echo ========================================
echo Quick Commerce Scrapers - Multi Terminal Launcher
echo ========================================
echo.
echo This will open 8 terminals and start all services
echo Keep all terminals open while working
echo.
pause

REM Main project directory
set MAIN_DIR=D:\creatosaurus-intership\quick-commerce-scrappers\mainserver

REM Color codes (optional)
echo [1/8] Starting Orchestrator (Port 7000)...
start "Orchestrator-7000" cmd /k "cd /d %MAIN_DIR% && npm start"
timeout /t 3

echo [2/8] Starting Blinkit Scraper (Port 3088)...
start "Blinkit-3088" cmd /k "cd /d %MAIN_DIR%\Blinkit-Scrapper && npm install > nul 2>&1 && npm start"
timeout /t 2

echo [3/8] Starting Instamart Scraper (Port 3089)...
start "Instamart-3089" cmd /k "cd /d %MAIN_DIR%\instamart-category-scrapper && npm install > nul 2>&1 && npm start"
timeout /t 2

echo [4/8] Starting Jiomart Scraper (Port 3090)...
start "Jiomart-3090" cmd /k "cd /d %MAIN_DIR%\Jiomart-Scrapper && npm install > nul 2>&1 && npm start"
timeout /t 2

echo [5/8] Starting Flipkart Minutes Scraper (Port 3091)...
start "Flipkart-3091" cmd /k "cd /d %MAIN_DIR%\flipkart_minutes && npm install > nul 2>&1 && npm start"
timeout /t 2

echo [6/8] Starting Zepto Scraper (Port 3092)...
start "Zepto-3092" cmd /k "cd /d %MAIN_DIR%\Zepto-Scrapper && npm install > nul 2>&1 && npm start"
timeout /t 2

echo [7/8] Starting DMart Scraper (Port 4199)...
start "DMart-4199" cmd /k "cd /d %MAIN_DIR%\DMart-Scrapper && npm install > nul 2>&1 && npm start"
timeout /t 2

echo.
echo ========================================
echo ✅ All terminals opened!
echo ========================================
echo.
echo Monitor these terminals:
echo   - Orchestrator-7000 (http://localhost:7000)
echo   - Blinkit-3088 (http://localhost:3088)
echo   - Instamart-3089 (http://localhost:3089)
echo   - Jiomart-3090 (http://localhost:3090)
echo   - Flipkart-3091 (http://localhost:3091)
echo   - Zepto-3092 (http://localhost:3092)
echo   - DMart-4199 (http://localhost:4199)
echo.
echo Wait 30 seconds for all services to start, then
echo access http://localhost:7000 in your browser.
echo.
echo To stop everything: Close all terminal windows and run 'taskkill /F /IM node.exe'
echo.
pause
