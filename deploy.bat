@echo off
cd /d "D:\creatosaurus-intership\quick-commerce-scrappers\mainserver"
echo Deploying mainserver container...
C:\PROGRA~1\Docker\Docker\resources\bin\docker.exe compose up -d mainserver
pause
