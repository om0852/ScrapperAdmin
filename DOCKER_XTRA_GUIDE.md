# Docker + XtraSecurity.in Setup Guide

## Your Setup

You have deployed MongoDB remotely on **xtrasecurity.in** platform and use `npm start` which automatically injects environment secrets.

This is now fully configured in your Docker setup!

---

## How It Works

### Before (Local MongoDB):
```
docker-compose up
    ↓
Starts local MongoDB + Node app
    ↓
Apps connect locally
    ↓
Works but needs MongoDB storage locally
```

### Now (Remote MongoDB + XtraSecurity):
```
npm start (with xtra secrets injected)
    ↓
.env / environment variables loaded
    ↓
Connects to remote MongoDB on xtrasecurity.in
    ↓
All apps running with cloud database
    ↓
No local setup needed!
```

---

## Quick Start Commands

### Run Your Project Locally (with remote MongoDB)

```bash
# Create .env file for local testing
cat > .env << EOF
MONGODB_URI=your-remote-mongodb-uri
PORT=7000
NODE_ENV=development
EOF

# Start with docker-compose
docker-compose up -d mainserver

# Or direct npm start
npm start

# Or test the Docker image
docker build -t mainserver .
docker run -d \
  --env-file .env \
  -p 7000:7000 \
  -p 3088:3088 \
  -p 3089:3089 \
  -p 3090:3090 \
  -p 3091:3091 \
  -p 3092:3092 \
  -p 4199:4199 \
  mainserver
```

### Deploy on XtraSecurity

```bash
# Fastest way - use the deployment script
bash deploy-xtra.sh

# Or step by step:
xtra secret set MONGODB_URI "your-mongodb-uri"
xtra run npm start
```

---

## What Changed

| Before | Now |
|--------|-----|
| Docker ran local MongoDB | Docker connects to remote MongoDB |
| `.env` was inside docker-compose | `.env` kept locally, secrets injected by xtra |
| Required MongoDB Docker image | No MongoDB Docker service needed |
| `npm run dev` or `node orchestrator.js` | `npm start` (loads environment) |

---

## File Changes Made

### ✅ Dockerfile
- Changed to run `npm start` (not `npm run dev` or `node orchestrator.js`)
- Removed build step (no need to rebuild code)
- Removed healthcheck (MongoDB is external now)
- Smaller final image

### ✅ docker-compose.yml
- Removed MongoDB service entirely
- App now connects to remote MongoDB via `MONGODB_URI` env var
- Simplified configuration
- No `depends_on` MongoDB anymore

### ✅ .env.example
- Updated to show format for remote MongoDB URI
- Clear comments about XtraSecurity injection
- Instructions for `xtra secret set`

### ✅ New Files
- `DOCKER_XTRASECURITY_SETUP.md` - Detailed setup guide
- `deploy-xtra.sh` - Automated deployment (Mac/Linux)
- `deploy-xtra.bat` - Automated deployment (Windows)

---

## Use Cases

### Case 1: Friend's Laptop (Local Testing)

Your friend has `.env` file with MongoDB URI:

```bash
cd mainserver
docker-compose up -d mainserver
# Access at http://localhost:7000
```

That's it! All 7 services run with YOUR remote MongoDB.

### Case 2: XtraSecurity Production Deployment

```bash
# Step 1: Set secret in XtraSecurity
xtra secret set MONGODB_URI "mongodb+srv://user:pass@host/db"

# Step 2: Deploy
bash deploy-xtra.sh

# Step 3: Monitor
xtra logs -f

# App runs with automatic secret injection
```

### Case 3: Your Laptop (Development)

Just run normally:
```bash
npm start
# .env loaded → connects to remote MongoDB → works!
```

---

## Environment Variables Explained

### Your Current Setup:

```env
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/quickcommerce
PORT=7000
NODE_ENV=production
LOG_LEVEL=info
```

**Where it comes from:**
- **Local (development)**: Read from `.env` file
- **Docker (local testing)**: Passed via `--env-file .env`
- **XtraSecurity (production)**: Injected by `xtra run npm start`

### XtraSecurity Injection Flow:

```bash
xtra run npm start
    ↓
XtraSecurity looks up secrets:
  - MONGODB_URI ✓ Found!
  - PORT ✓ Found!
  - NODE_ENV ✓ Found!
    ↓
Injects them into environment
    ↓
npm start runs
    ↓
.env merged with injected secrets
    ↓
orchestrator.js starts
    ↓
mongoose.connect(process.env.MONGODB_URI)  ✓ Uses injected value!
```

---

## No Local MongoDB = Benefits

✅ **Smaller Docker image** (no MongoDB layer)  
✅ **Faster startup** (no database initialization)  
✅ **Easier deployment** (stateless containers)  
✅ **Better scaling** (can run multiple instances)  
✅ **Centralized data** (one remote MongoDB for team)  
✅ **No storage conflicts** (MongoDB on cloud, not local)  

---

## Deployment Checklist

### For Friend's Laptop:

- [ ] Docker installed
- [ ] `.env` file created with `MONGODB_URI`
- [ ] Run `docker-compose up -d mainserver`
- [ ] Visit http://localhost:7000
- [ ] See logs: `docker-compose logs -f mainserver`
- [ ] Stop with: `docker-compose down`

### For XtraSecurity:

- [ ] XtraSecurity account created
- [ ] XtraSecurity CLI installed: `xtra`
- [ ] Logged in: `xtra login`
- [ ] MongoDB URI ready
- [ ] Run: `bash deploy-xtra.sh`
- [ ] Monitor: `xtra logs -f`
- [ ] Access: `https://your-url.xtrasecurity.in`

---

## Testing Connection

Verify MongoDB is reachable:

```bash
# Inside Docker container
docker-compose exec mainserver node -e "
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB!'))
    .catch(e => console.log('❌ Error:', e.message));
"

# Or just check logs
docker-compose logs mainserver
# Should show: "Connected to MongoDB Backend successfully"
```

---

## Common Issues & Fixes

### Docker Can't Connect to MongoDB

**Problem:** `Error: connect ENOTFOUND mongodb:27017`

**Fix:**
1. Verify `MONGODB_URI` in `.env` is correct
2. Check if MongoDB host is reachable from your network
3. Verify credentials are correct
4. Check firewall/security group allows your IP

### Port Conflicts

**Problem:** `Port 7000 already in use`

**Fix:** Edit `docker-compose.yml`:
```yaml
ports:
  - "7500:7000"  # Use 7500 instead
```

### Secrets Not Injected (XtraSecurity)

**Problem:** `MONGODB_URI undefined`

**Fix:**
```bash
# Check secrets are set
xtra secret list

# If missing, add it
xtra secret set MONGODB_URI "your-uri"

# Verify
xtra secret get MONGODB_URI
```

---

## Architecture Diagram

```
Your Setup:
┌─────────────────────────────────────────┐
│         Friend's Laptop                 │
│  ┌──────────────────────────────────┐  │
│  │  Docker Container (mainserver)   │  │
│  │  ├─ Blinkit Scraper (3088)       │  │
│  │  ├─ DMart Scraper (4199)         │  │
│  │  ├─ Instamart Scraper (3089)     │  │
│  │  ├─ Jiomart Scraper (3090)       │  │
│  │  ├─ Flipkart Minutes (3091)      │  │
│  │  ├─ Zepto Scraper (3092)         │  │
│  │  └─ Orchestrator (7000)          │  │
│  └──────────────────────────────────┘  │
│             │                            │
│             │ Connect via MONGODB_URI    │
│             │ from .env file             │
│             ↓                            │
└─────────────────────────────────────────┘
          Internet
             ↓
    ┌─────────────────────┐
    │  xtrasecurity.in    │
    │  │                  │
    │  ├─ Remote MongoDB  │
    │  ├─ Secrets Store   │
    │  │  (MONGODB_URI)   │
    │  └─ More services   │
    └─────────────────────┘
```

---

## Summary

Your Docker setup now works perfectly with XtraSecurity:

1. **Local Testing**: Friend gets `.env` + runs `docker-compose up`
2. **Production**: Uses `npm start` with xtra-injected secrets
3. **No local MongoDB**: Smaller, faster, cleaner
4. **Stateless**: Can deploy multiple instances easily
5. **Scalable**: Ready for production workloads

---

**Ready to use!** 🚀

For detailed setup, see:
- `DOCKER_SETUP.md` - General Docker info
- `DOCKER_XTRASECURITY_SETUP.md` - Advanced XtraSecurity setup
- `deploy-xtra.sh` / `deploy-xtra.bat` - Automated deployment
