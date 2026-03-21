@echo off
REM Docker Helper Script for Quick Commerce Scrapers (Windows)
REM Makes it easier to manage Docker containers on Windows

setlocal enabledelayedexpansion

:menu
cls
echo.
echo ========================================
echo Quick Commerce Docker Manager
echo ========================================
echo.
echo 1) Start all services
echo 2) Stop all services
echo 3) View logs
echo 4) Check status
echo 5) Rebuild images
echo 6) Clean everything (remove volumes)
echo 7) Run development mode
echo 8) Access MongoDB shell
echo 9) View resource usage
echo 0) Exit
echo.
set /p choice="Select option: "

if "%choice%"=="1" goto start_services
if "%choice%"=="2" goto stop_services
if "%choice%"=="3" goto view_logs
if "%choice%"=="4" goto check_status
if "%choice%"=="5" goto rebuild_images
if "%choice%"=="6" goto clean_everything
if "%choice%"=="7" goto start_dev
if "%choice%"=="8" goto access_mongodb
if "%choice%"=="9" goto resource_usage
if "%choice%"=="0" goto end
goto menu

:start_services
cls
echo.
echo ========================================
echo Starting Services...
echo ========================================
docker-compose up -d
echo.
echo All services started!
echo.
timeout /t 3
docker-compose ps
pause
goto menu

:stop_services
cls
echo.
echo ========================================
echo Stopping Services...
echo ========================================
docker-compose down
echo.
echo Services stopped!
echo.
pause
goto menu

:view_logs
cls
echo.
echo 1) Mainserver logs
echo 2) MongoDB logs
echo 3) All services logs
echo 4) Back to menu
set /p log_choice="Select: "

if "%log_choice%"=="1" (
    docker-compose logs -f mainserver
) else if "%log_choice%"=="2" (
    docker-compose logs -f mongodb
) else if "%log_choice%"=="3" (
    docker-compose logs -f
) else if "%log_choice%"=="4" (
    goto menu
)
pause
goto menu

:check_status
cls
echo.
echo ========================================
echo Service Status
echo ========================================
docker-compose ps
echo.
pause
goto menu

:rebuild_images
cls
echo.
echo ========================================
echo Rebuilding Images...
echo ========================================
docker-compose down
docker-compose build --no-cache
echo.
echo Images rebuilt!
echo.
pause
goto menu

:clean_everything
cls
echo.
echo ========================================
echo ^^! Full Cleanup
echo ========================================
echo This will remove all containers, volumes, and data.
set /p confirm="Continue? (y/N): "
if /i "%confirm%"=="y" (
    docker-compose down -v
    docker system prune -f
    echo.
    echo Everything cleaned!
) else (
    echo Cleanup cancelled.
)
echo.
pause
goto menu

:start_dev
cls
echo.
echo ========================================
echo Starting Development Mode
echo ========================================
docker-compose --profile dev up mainserver-dev
pause
goto menu

:access_mongodb
cls
echo.
echo ========================================
echo Accessing MongoDB
echo ========================================
echo Connecting to MongoDB shell...
docker-compose exec mongodb mongosh -u root -p password123 --authenticationDatabase admin quickcommerce
pause
goto menu

:resource_usage
cls
echo.
echo ========================================
echo Resource Usage
echo ========================================
docker stats
pause
goto menu

:end
cls
echo.
echo Goodbye!
echo.
exit /b 0
