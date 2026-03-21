@echo off
REM Deploy script for XtraSecurity.in platform (Windows)
REM Usage: deploy-xtra.bat

setlocal enabledelayedexpansion

cls
echo.
echo ==========================================
echo XtraSecurity Deployment Script (Windows)
echo ==========================================
echo.

REM Check if xtra CLI is installed
where xtra >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ^❌ XtraSecurity CLI not found.
    echo Install it from: https://docs.xtrasecurity.in
    pause
    exit /b 1
)

echo ^✅ XtraSecurity CLI ready
echo.

REM Step 1: Ensure secrets are set
echo Step 1: Setting up secrets...
echo.
set /p MONGODB_URI="Enter your MongoDB URI: "

if "!MONGODB_URI!"=="" (
    echo ^❌ MongoDB URI cannot be empty
    pause
    exit /b 1
)

echo.
echo Setting secret in XtraSecurity...
xtra secret set MONGODB_URI "!MONGODB_URI!"

echo ^✅ Secret set!
echo.

REM Step 2: Build Docker image
echo Step 2: Building Docker image...
docker build -t quickcommerce-mainserver:latest .
if %ERRORLEVEL% NEQ 0 (
    echo ^❌ Docker build failed
    pause
    exit /b 1
)
echo ^✅ Docker image built!
echo.

REM Step 3: Tag for XtraSecurity registry
echo Step 3: Preparing for deployment...
docker tag quickcommerce-mainserver:latest quickcommerce-mainserver:production
echo ^✅ Image tagged!
echo.

REM Step 4: Deploy
echo Step 4: Deploying to XtraSecurity...
echo.
echo Running: xtra run npm start
echo.
xtra run npm start

echo.
echo ==========================================
echo ^✅ Deployment initiated!
echo ==========================================
echo.
echo Monitor logs:
echo   xtra logs -f
echo.
echo Check status:
echo   xtra status
echo.
echo Access your app at:
echo   https://your-project.xtrasecurity.in
echo.
pause
