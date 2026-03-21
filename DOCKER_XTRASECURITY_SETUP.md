# Docker Setup for XtraSecurity.in Deployment

## Overview

Your project is configured to work with **XtraSecurity.in platform** which automatically injects environment variables (like `MONGODB_URI`, `API_KEYS`, etc.) when you run `npm start`.

This Docker setup is optimized for your remote MongoDB setup.

---

## Setup Steps

### 1. Update `.env` Locally (Optional - for local testing)

If you want to test locally before pushing to XtraSecurity:

```bash
# Create or update .env file
cat > .env << EOF
PORT=7000
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@your-mongodb-host/quickcommerce
LOG_LEVEL=info
EOF
```

### 2. Build Docker Image

```bash
# Build the Docker image
docker build -t quickcommerce-mainserver:latest .

# Or use docker-compose
docker-compose build
```

### 3. Run Locally (with remote MongoDB)

```bash
# Option A: Using docker-compose
docker-compose up -d mainserver

# Option B: Using docker run directly
docker run -d \
  -p 7000:7000 \
  -p 3088:3088 \
  -p 3089:3089 \
  -p 3090:3090 \
  -p 3091:3091 \
  -p 3092:3092 \
  -p 4199:4199 \
  --env-file .env \
  --name quickcommerce-mainserver \
  quickcommerce-mainserver:latest
```

### 4. Deploy to XtraSecurity.in

```bash
# 1. Log in to XtraSecurity
xtra login

# 2. Set your secrets in XtraSecurity dashboard:
xtra secret set MONGODB_URI "mongodb+srv://xxx:xxx@xxx/quickcommerce"

# 3. Deploy (it will automatically inject secrets)
# xtra run npm start
```

---

## Environment Variables

The following variables are injected by XtraSecurity platform:

| Variable | Type | Required | Example |
|----------|------|----------|---------|
| `MONGODB_URI` | Secret | ✅ Yes | `mongodb+srv://user:pass@host/db` |
| `PORT` | Env | ⚠️  Optional | `7000` |
| `NODE_ENV` | Env | ⚠️  Optional | `production` |
| `LOG_LEVEL` | Env | ⚠️  Optional | `info` (or `debug`) |

**Note:** The `npm start` command automatically reads these from XtraSecurity's environment.

---

## How It Works

### Local Development Flow:
```
npm start 
  ↓
.env file loaded (dotenv)
  ↓
orchestrator.js starts
  ↓
Connects to remote MongoDB using MONGODB_URI
  ↓
All services running
```

### XtraSecurity Deployment Flow:
```
xtra run npm start
  ↓
XtraSecurity injects environment secrets
  ↓
.env file + injected secrets merged
  ↓
orchestrator.js starts
  ↓
Connects to remote MongoDB
  ↓
All services running
```

---

## Docker Image Structure

The Dockerfile uses multi-stage builds:

### Stage 1: `base`
- Node 18 Alpine
- Installs Playwright dependencies
- Optimized size

### Stage 2: `deps`
- Production dependencies only
- Minimal image for production

### Stage 3: `development` (optional)
- Full dependencies (with dev packages)
- For local development

### Stage 4: `production` (default)
- Production node modules
- Runs `npm start` (which loads env secrets)
- Exposes all scraper ports

---

## Quick Commands Reference

```bash
# Build the image
docker-compose build

# Start the app (connects to remote MongoDB)
docker-compose up -d mainserver

# View logs in real-time
docker-compose logs -f mainserver

# Check container status
docker-compose ps

# Stop the app
docker-compose down

# Rebuild without cache
docker-compose build --no-cache

# Run development mode
docker-compose --profile dev up mainserver-dev

# Execute command in running container
docker-compose exec mainserver npm list

# View environment variables inside container
docker-compose exec mainserver env
```

---

## Troubleshooting

### Container exits immediately

```bash
# Check logs
docker-compose logs mainserver

# If MONGODB_URI error:
# 1. Verify MongoDB URI is correct
# 2. Check if MongoDB host is reachable
# 3. Verify credentials are correct
```

### "Cannot connect to MongoDB"

```bash
# Test MongoDB connection from container
docker-compose exec mainserver node -e "
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected!'))
    .catch(e => console.log('❌', e.message));
"
```

### Port already in use

Edit `docker-compose.yml`:
```yaml
ports:
  - "7500:7000"  # Use 7500 instead of 7000
```

Then access at: `http://localhost:7500`

---

## Environment Variable Injection

### For XtraSecurity Platform:

1. **Set secrets in dashboard:**
   ```bash
   xtra secret set MONGODB_URI "your-mongodb-uri"
   ```

2. **Deploy:**
   ```bash
   xtra run npm start
   // Automatically injects MONGODB_URI before running npm start
   ```

3. **Verify in logs:**
   ```bash
   xtra logs
   // Should see successful MongoDB connection
   ```

### For Local Testing:

Create `.env` file:
```env
MONGODB_URI=mongodb+srv://user:pass@host/quickcommerce
PORT=7000
NODE_ENV=development
LOG_LEVEL=debug
```

Then run:
```bash
docker-compose up mainserver
```

---

## Port Mappings

| Service | Internal Port | External Port | URL |
|---------|---------------|---------------|-----|
| Main Orchestrator | 7000 | 7000 | http://localhost:7000 |
| Blinkit | 3088 | 3088 | http://localhost:3088 |
| Instamart | 3089 | 3089 | http://localhost:3089 |
| Jiomart | 3090 | 3090 | http://localhost:3090 |
| Flipkart Minutes | 3091 | 3091 | http://localhost:3091 |
| Zepto | 3092 | 3092 | http://localhost:3092 |
| DMart | 4199 | 4199 | http://localhost:4199 |

---

## File Structure

```
mainserver/
├── Dockerfile              # Optimized for remote MongoDB
├── docker-compose.yml      # No local MongoDB service
├── .dockerignore
├── orchestrator.js         # Connects to MONGODB_URI env var
├── package.json
├── .env                    # Local testing only (not committed)
├── .env.example            # Template for reference
└── ... (scrapers and other files)
```

---

## Security Notes

⚠️ **IMPORTANT:**

1. **Never commit `.env` file** (add to `.gitignore`)
2. **Use XtraSecurity secrets** for production
3. **Database credentials** should only be in environment variables
4. **Don't hardcode** MongoDB URI in code

---

## Production Checklist

- [ ] XtraSecurity account set up
- [ ] `MONGODB_URI` secret configured in XtraSecurity
- [ ] Dockerfile built and tested locally
- [ ] `.env` file is in `.gitignore`
- [ ] `npm start` command runs successfully
- [ ] All 7 services start up
- [ ] Logs show successful MongoDB connection

---

## Deployment Steps

1. **Prepare code:**
   ```bash
   git add .
   git commit -m "Add Docker support"
   git push
   ```

2. **Deploy to XtraSecurity:**
   ```bash
   xtra deploy
   ```

3. **Monitor logs:**
   ```bash
   xtra logs -f
   ```

4. **Check status:**
   ```bash
   xtra status
   ```

5. **Access your app:**
   ```
   https://your-xtra-url.xtrasecurity.in
   ```

---

## Support

For issues:
1. Check logs: `xtra logs`
2. Verify MongoDB URI: `xtra secret list`
3. Test locally first: `docker-compose up`
4. Check XtraSecurity documentation: https://docs.xtrasecurity.in

---

**Ready to deploy!** 🚀
