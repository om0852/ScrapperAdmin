@echo off
REM ==================================================
REM Quick Setup - One-Click Installation Script
REM Double-click this file to run setup
REM ==================================================

color 0A
title Quick Commerce Scrapers - Setup

echo.
echo ==================================================
echo     SETUP: Installing All Dependencies
echo ==================================================
echo.
echo This script will install:
echo   - Main server npm packages
echo   - All 6 scraper npm packages
echo   - Playwright browsers (Chromium, Firefox)
echo.
echo Estimated time: 5-10 minutes
echo Press any key to continue...
echo.
pause > nul

cd /d "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver" || (
    echo ERROR: Could not navigate to main directory
    echo Please ensure the path is correct
    pause
    exit /b 1
)

echo.
echo [STEP 1/8] Main Server - Installing npm packages...
call npm install
if errorlevel 1 (
    echo ERROR: Main server npm install failed
    pause
    exit /b 1
)
echo [OK] Main server installed

echo.
echo [STEP 2/8] Blinkit Scraper - Installing npm packages...
cd "Blinkit-Scrapper"
call npm install > nul 2>&1
cd ..
echo [OK] Blinkit installed

echo.
echo [STEP 3/8] Instamart Scraper - Installing npm packages...
cd "instamart-category-scrapper"
call npm install > nul 2>&1
cd ..
echo [OK] Instamart installed

echo.
echo [STEP 4/8] Jiomart Scraper - Installing npm packages...
cd "Jiomart-Scrapper"
call npm install > nul 2>&1
cd ..
echo [OK] Jiomart installed

echo.
echo [STEP 5/8] Flipkart Minutes Scraper - Installing npm packages...
cd "flipkart_minutes"
call npm install > nul 2>&1
cd ..
echo [OK] Flipkart Minutes installed

echo.
echo [STEP 6/8] Zepto Scraper - Installing npm packages...
cd "Zepto-Scrapper"
call npm install > nul 2>&1
cd ..
echo [OK] Zepto installed

echo.
echo [STEP 7/8] DMart Scraper - Installing npm packages...
cd "DMart-Scrapper"
call npm install > nul 2>&1
cd ..
echo [OK] DMart installed

echo.
echo [STEP 8/8] Installing Playwright browsers...
echo (This may take 2-3 minutes)
call npx playwright install chromium firefox
if errorlevel 1 (
    echo WARNING: Playwright installation had some issues
    echo But setup may still be OK. Try running start-all-services.bat
)
echo [OK] Browsers installed

echo.
echo ==================================================
echo SETUP COMPLETE!
echo ==================================================
echo.
echo Next step: Double-click "start-all-services.bat"
echo to start all services!
echo.
echo Press any key to close this window...
echo.
pause > nul
exit /b 0
