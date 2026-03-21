# Docker Deployment - Recovery Guide

## Current Issue
The Docker daemon backend (WSL2 Linux Engine) is returning `500 Internal Server Error` persistently.
This suggests the Linux engine or Docker daemon has crashed and cannot be recovered with simple restarts.

## Error
```
error returned 500 Internal Server Error for API route and version
http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.53/containers/json
```

## Solution Options (In Order of Preference)

### Option 1: Full Docker Reset (Recommended)
1. Open PowerShell as Administrator
2. Run:
   ```powershell
   # This will wipe all Docker settings but preserve images
   & "C:\PROGRA~1\Docker\Docker\Docker Desktop.exe" --remove-dev-env
   ```
3. Restart Docker Desktop manually
4. Wait 90 seconds for full initialization
5. Then run: `docker compose up -d mainserver`

### Option 2: Manual WSL2 Engine Reset
1. Open PowerShell as Administrator
2. Stop Docker Desktop completely
3. Run:
   ```powershell
   wsl --shutdown
   ```
4. Start Docker Desktop
5. Wait 60+ seconds
6. Then try deployment

### Option 3: If Still Failing - System Restart Required
If the above don't work, **restart your Windows machine**:
- This clears all WSL2/Docker state
- Often fixes persistent daemon issues
- After restart, try deployment immediately

### Option 4: Reinstall Docker Desktop
As a last resort:
1. Uninstall Docker Desktop
2. Restart Windows
3. Download and reinstall from https://www.docker.com/products/docker-desktop
4. Launch and configured
5. Then deploy

## Quick Deployment Commands (Once Docker is Fixed)
```batch
cd D:\creatosaurus-intership\quick-commerce-scrappers\mainserver

REM Option A: Using the updated batch script
deploy-clean.bat

REM Option B: Direct command
C:\PROGRA~1\Docker\Docker\resources\bin\docker.exe compose up -d mainserver

REM Option C: Check status after deploy
C:\PROGRA~1\Docker\Docker\resources\bin\docker.exe compose ps
C:\PROGRA~1\Docker\Docker\resources\bin\docker.exe compose logs -f mainserver
```

## Testing Docker Connection
```batch
C:\PROGRA~1\Docker\Docker\resources\bin\docker.exe version
C:\PROGRA~1\Docker\Docker\resources\bin\docker.exe ps
```

If these commands return data (not 500 error), Docker is ready for deployment.

## Files Ready for Deployment
- ✅ `.env` - MongoDB URI configured
- ✅ `Dockerfile` - Multi-stage production build
- ✅ `docker-compose.yml` - Service config
- ✅ `.dockerignore` - Optimized to exclude 5GB data folders
- ✅ `deploy-clean.bat` - Automated deployment script (with fixes)
- ✅ `deploy.bat` - Simple deployment script (with fixes)

## Next Steps
1. Try Option 1 (Docker reset) first
2. If that fails, try Option 2 (WSL shutdown)
3. If still failing, restart Windows (Option 3)
4. Once Docker responds to `docker version` without 500 error, deployment will succeed
