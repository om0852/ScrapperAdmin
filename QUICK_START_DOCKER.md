# Docker Quick Start Guide

## TL;DR - The Fastest Way to Get Started

Your friend just needs to do 3 things:

### 1️⃣ Install Docker
Download from: https://www.docker.com/products/docker-desktop

### 2️⃣ Run One Command
```bash
docker-compose up -d
```

### 3️⃣ Access at
```
http://localhost:7000
```

✨ **Done!** Everything is running.

---

## What Just Happened?

When you run `docker-compose up -d`, Docker automatically:
- ✅ Downloaded and started MongoDB database
- ✅ Built the Node.js app from source code
- ✅ Started all scrapers (Blinkit, DMart, Flipkart, etc.)
- ✅ Connected everything together
- ✅ Saved all data persistently

No manual setup needed!

---

## Commands Your Friend Will Need

```bash
# Start everything (run once)
docker-compose up -d

# Stop everything
docker-compose down

# See what's running
docker-compose ps

# Watch the logs live
docker-compose logs -f

# Stop watching logs
CTRL + C
```

---

## Services Running

| Service | Where | Port |
|---------|-------|------|
| Main Dashboard | http://localhost:7000 | 7000 |
| Blinkit | http://localhost:3088 | 3088 |
| DMart | http://localhost:4199 | 4199 |
| Instamart | http://localhost:3089 | 3089 |
| Jiomart | http://localhost:3090 | 3090 |
| Flipkart Minutes | http://localhost:3091 | 3091 |
| Zepto | http://localhost:3092 | 3092 |
| Database | localhost:27017 | 27017 |

---

## If Something Goes Wrong

### "Port already in use"
Edit `docker-compose.yml` and change the first port number:
```yaml
# Change this:
ports:
  - "7000:7000"

# To this:
ports:
  - "7500:7000"  # Now use http://localhost:7500
```

### "Docker won't start"
```bash
# Full reset
docker-compose down -v
docker-compose up --build -d
```

### "Not responding"
```bash
# Check logs
docker-compose logs mainserver

# Give it more time (wait 30 seconds)
docker-compose ps  # Should say "healthy"
```

---

## File Storage

- **Database**: Saved in Docker volume (persists automatically)
- **Scraped data**: In `./scraped_data/` folder
- **API dumps**: In `./flipkart_minutes/api_dumps/` folder

Everything is saved locally even if containers stop!

---

## Helper Script (Optional)

For easier management, your friend can use:

**On Mac/Linux:**
```bash
chmod +x docker-helper.sh
./docker-helper.sh
```

**On Windows:**
```bash
docker-helper.bat
```

This gives an interactive menu instead of typing commands.

---

## System Requirements

- **RAM**: 4 GB minimum (8 GB recommended)
- **Disk Space**: 5 GB free
- **CPU**: 2+ cores
- **OS**: Windows 10+, Mac, or Linux

---

## Troubleshooting Checklist

- [ ] Docker is running (check Docker Desktop is open on Windows/Mac)
- [ ] Internet connection is working
- [ ] No apps are using ports 7000, 3088-3092, 27017
- [ ] At least 4GB RAM available
- [ ] At least 5GB disk space free

---

## Support Resources

- **Docker Docs**: https://docs.docker.com
- **Docker Desktop**: https://www.docker.com/products/docker-desktop
- **See more details**: Read `DOCKER_SETUP.md`

---

## Example: First-Time Setup

```bash
# Friend's steps:

# 1. Install Docker from docker.com

# 2. Go to project folder
cd mainserver

# 3. Start everything
docker-compose up -d

# 4. Wait 30 seconds for startup
sleep 30

# 5. Check status
docker-compose ps

# 6. Visit the app
# Open browser → http://localhost:7000

# 7. Done! 🎉
```

---

## Make it Easier for Your Friend

Share these files with your friend:
1. `docker-compose.yml` - How services connect
2. `Dockerfile` - How to build the app
3. `This file` - Quick reference

Your friend only needs Docker installed. That's it!

---

**Have fun scraping! 🚀**
