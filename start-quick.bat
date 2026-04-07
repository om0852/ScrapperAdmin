@echo off
REM ==================================================
REM Start All Services - Quick Launch Script
REM Double-click this file to start all services
REM ==================================================

setlocal enabledelayedexpansion
color 0B
title Quick Commerce Scrapers - Launcher

echo.
echo ==================================================
echo     Launching All Services
echo ==================================================
echo.
echo This will open 8 terminals:
echo   1. Orchestrator (Port 7000)
echo   2. Blinkit Scraper (Port 3088)
echo   3. Instamart Scraper (Port 3089)
echo   4. Jiomart Scraper (Port 3090)
echo   5. Flipkart Minutes (Port 3091)
echo   6. Zepto Scraper (Port 3092)
echo   7. DMart Scraper (Port 4199)
echo.
echo Wait for all to show "running on port X" messages
echo Then open: http://localhost:7000
echo.
echo Press any key to continue...
echo.
pause > nul

set MAIN_DIR=D:\creatosaurus-intership\quick-commerce-scrappers\mainserver

REM Check if npm is installed
where npm > nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if main directory exists
if not exist "%MAIN_DIR%" (
    echo ERROR: Main directory not found: %MAIN_DIR%
    pause
    exit /b 1
)

echo [1/7] Starting Orchestrator (Port 7000)...
start "🎯 Orchestrator-7000" cmd /k "cd /d "%MAIN_DIR%" && npm start"
timeout /t 4 /nobreak

echo.
echo [2/7] Starting Blinkit Scraper (Port 3088)...
start "📦 Blinkit-3088" cmd /k "cd /d "%MAIN_DIR%\Blinkit-Scrapper" && npm start"
timeout /t 3 /nobreak

echo.
echo [3/7] Starting Instamart Scraper (Port 3089)...
start "📦 Instamart-3089" cmd /k "cd /d "%MAIN_DIR%\instamart-category-scrapper" && npm start"
timeout /t 3 /nobreak

echo.
echo [4/7] Starting Jiomart Scraper (Port 3090)...
start "📦 Jiomart-3090" cmd /k "cd /d "%MAIN_DIR%\Jiomart-Scrapper" && npm start"
timeout /t 3 /nobreak

echo.
echo [5/7] Starting Flipkart Minutes Scraper (Port 3091)...
start "📦 Flipkart-3091" cmd /k "cd /d "%MAIN_DIR%\flipkart_minutes" && npm start"
timeout /t 3 /nobreak

echo.
echo [6/7] Starting Zepto Scraper (Port 3092)...
start "📦 Zepto-3092" cmd /k "cd /d "%MAIN_DIR%\Zepto-Scrapper" && npm start"
timeout /t 3 /nobreak

echo.
echo [7/7] Starting DMart Scraper (Port 4199)...
start "📦 DMart-4199" cmd /k "cd /d "%MAIN_DIR%\DMart-Scrapper" && npm start"
timeout /t 3 /nobreak

echo.
echo ==================================================
echo ✅ All services launched!
echo ==================================================
echo.
echo Terminals should be opening now...
echo Wait 30 seconds for all services to start
echo Then open: http://localhost:7000
echo.
echo If a terminal fails to open:
echo   - Check your Node.js installation
echo   - Run setup-quick.bat first
echo   - Check TROUBLESHOOTING.md for help
echo.
echo This launcher window will close in 10 seconds...
echo.
timeout /t 10 /nobreak
exit /b 0
