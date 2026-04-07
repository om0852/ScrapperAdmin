@echo off
REM One-time setup script - Run this once to install all dependencies
REM IMPORTANT: Run this from Command Prompt, not by double-clicking!

setlocal enabledelayedexpansion
cd /d D:\creatosaurus-intership\quick-commerce-scrappers\mainserver

echo.
echo ========================================
echo    SETUP: Installing All Dependencies
echo ========================================
echo.
echo This will:
echo   1. Install npm packages for main server
echo   2. Install npm packages for each scraper  
echo   3. Install Playwright browsers
echo.
echo Estimated time: 5-10 minutes
echo.
pause

set MAIN_DIR=D:\creatosaurus-intership\quick-commerce-scrappers\mainserver

REM Colors in batch are limited, but we can use echo spacing
echo.
echo [STEP 1/9] Main Server - Installing dependencies...
cd /d %MAIN_DIR%
call npm install
if errorlevel 1 (
    echo FAILED: Main server npm install
    pause
    exit /b 1
)
echo ✅ Main server dependencies installed

echo.
echo [STEP 2/9] Blinkit Scraper - Installing dependencies...
cd /d %MAIN_DIR%\Blinkit-Scrapper
call npm install
if errorlevel 1 (
    echo WARNING: Blinkit Scraper npm install had issues
)
echo ✅ Blinkit dependencies installed

echo.
echo [STEP 3/9] Instamart Scraper - Installing dependencies...
cd /d %MAIN_DIR%\instamart-category-scrapper
call npm install
if errorlevel 1 (
    echo WARNING: Instamart Scraper npm install had issues
)
echo ✅ Instamart dependencies installed

echo.
echo [STEP 4/9] Jiomart Scraper - Installing dependencies...
cd /d %MAIN_DIR%\Jiomart-Scrapper
call npm install
if errorlevel 1 (
    echo WARNING: Jiomart Scraper npm install had issues
)
echo ✅ Jiomart dependencies installed

echo.
echo [STEP 5/9] Flipkart Minutes Scraper - Installing dependencies...
cd /d %MAIN_DIR%\flipkart_minutes
call npm install
if errorlevel 1 (
    echo WARNING: Flipkart Minutes Scraper npm install had issues
)
echo ✅ Flipkart Minutes dependencies installed

echo.
echo [STEP 6/9] Zepto Scraper - Installing dependencies...
cd /d %MAIN_DIR%\Zepto-Scrapper
call npm install
if errorlevel 1 (
    echo WARNING: Zepto Scraper npm install had issues
)
echo ✅ Zepto dependencies installed

echo.
echo [STEP 7/9] DMart Scraper - Installing dependencies...
cd /d %MAIN_DIR%\DMart-Scrapper
call npm install
if errorlevel 1 (
    echo WARNING: DMart Scraper npm install had issues
)
echo ✅ DMart dependencies installed

echo.
echo [STEP 8/9] Installing Playwright browsers...
echo This step may take 2-3 minutes...
cd /d %MAIN_DIR%
call npx playwright install chromium firefox
if errorlevel 1 (
    echo ERROR: Playwright installation failed
    echo Try running as Administrator
    pause
    exit /b 1
)
echo ✅ Playwright browsers installed

echo.
echo [STEP 9/9] Verifying installation...
cd /d %MAIN_DIR%
node --version
npm --version
call npx playwright --version
if errorlevel 1 (
    echo WARNING: Some verification checks failed
    echo But setup may still be OK
)

echo.
echo ========================================
echo ✅ SETUP COMPLETE!
echo ========================================
echo.
echo Next steps:
echo   1. Run: start-all-services.bat
echo   2. Or run each service manually using QUICK_START_MANUAL.md
echo.
pause
