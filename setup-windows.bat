@echo off
REM Quick Setup Script for Windows
REM This script installs all dependencies and sets up the server environment

echo.
echo ========================================
echo Quick Commerce Server Setup Script
echo ========================================
echo.

cd mainserver

echo [1/7] Installing Main Server Dependencies...
call npm install
if %errorlevel% neq 0 (
    echo Error installing main server dependencies
    pause
    exit /b 1
)

echo.
echo [2/7] Installing Blinkit dependencies...
cd blinkit
call npm install
cd ..
if %errorlevel% neq 0 (
    echo Error installing Blinkit dependencies
    pause
    exit /b 1
)

echo.
echo [3/7] Installing DMart dependencies...
cd dmart
call npm install
cd ..
if %errorlevel% neq 0 (
    echo Error installing DMart dependencies
    pause
    exit /b 1
)

echo.
echo [4/7] Installing Flipkart dependencies...
cd flipkart
call npm install
cd ..
if %errorlevel% neq 0 (
    echo Error installing Flipkart dependencies
    pause
    exit /b 1
)

echo.
echo [5/7] Installing Instamart dependencies...
cd instamart
call npm install
cd ..
if %errorlevel% neq 0 (
    echo Error installing Instamart dependencies
    pause
    exit /b 1
)

echo.
echo [6/7] Installing Jiomart dependencies...
cd jiomart
call npm install
cd ..
if %errorlevel% neq 0 (
    echo Error installing Jiomart dependencies
    pause
    exit /b 1
)

echo.
echo [7/7] Installing Zepto dependencies...
cd zepto
call npm install
cd ..
if %errorlevel% neq 0 (
    echo Error installing Zepto dependencies
    pause
    exit /b 1
)

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next Steps:
echo 1. Run: npm start
echo 2. Open: http://localhost:3000
echo 3. Start your platform servers from the UI
echo.
pause
