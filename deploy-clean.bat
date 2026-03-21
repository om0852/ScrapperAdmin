@echo off
REM Clean Docker deployment script for mainserver
REM Bypasses PowerShell wrapper issues by using CMD directly

setlocal enabledelayedexpansion
cd /d "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver"

echo.
echo ========================================
echo Docker Deployment for mainserver
echo ========================================
echo.
echo Container will be built with optimized .dockerignore
echo Build context size reduced to exclude data folders
echo.

REM Set Docker path using short format to avoid space issues
REM PROGRA~1 = Program Files (8.3 format)
set "DOCKER_BIN=C:\PROGRA~1\Docker\Docker\resources\bin\docker.exe"

echo [1/3] Checking Docker daemon...
"%DOCKER_BIN%" ps >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker daemon not responding!
    echo Please ensure Docker Desktop is running.
    pause
    exit /b 1
)
echo ✓ Docker daemon is running

echo.
echo [2/3] Building and starting container...
"%DOCKER_BIN%" compose up -d mainserver
if errorlevel 1 (
    echo ERROR: Docker compose failed!
    echo Check logs with: docker compose logs mainserver
    pause
    exit /b 1
)

echo.
echo [3/3] Verifying deployment...
timeout /t 3 /nobreak
"%DOCKER_BIN%" compose ps mainserver

echo.
echo ========================================
echo ✓ Deployment complete!
echo ========================================
echo.
echo Next steps:
echo  - Check logs: docker compose logs -f mainserver
echo  - Access: http://localhost:7000
echo  - Stop: docker compose down
echo.

pause
