# Docker Setup Guide - Quick Commerce Scrapers

## Overview
This project is now fully containerized with Docker. Your friend can run the entire mainserver project on any machine with Docker installed, without worrying about dependencies or configuration.

## Prerequisites
- **Docker**: [Download & Install](https://www.docker.com/products/docker-desktop)
- **Docker Compose**: Usually comes with Docker Desktop

Verify installation:
```bash
docker --version
docker-compose --version
```

## Quick Start (Friend's Laptop)

### 1. Clone/Copy the Project
```bash
# Copy the project to friend's machine
cd /path/to/mainserver
```

### 2. Build & Run (One Command)
```bash
# Build the Docker image and start all services
docker-compose up -d

# Or if you want to see logs:
docker-compose up
```

This will:
- ✅ Start MongoDB database
- ✅ Build the Node.js application
- ✅ Start all scrapers (Blinkit, DMart, Instamart, Jiomart, Flipkart, Zepto)
- ✅ Create necessary volumes for data persistence

### 3. Check Status
```bash
# See if all services are running
docker-compose ps

# View logs in real-time
docker-compose logs -f mainserver

# View MongoDB logs
docker-compose logs -f mongodb
```

### 4. Stop Everything
```bash
# Stop all containers
docker-compose down

# Stop and remove data
docker-compose down -v
```

## Access Points

Once running, access services at:

| Service | URL/Port |
|---------|----------|
| **Main Orchestrator** | `http://localhost:7000` |
| **Blinkit Scraper** | `http://localhost:3088` |
| **DMart Scraper** | `http://localhost:4199` |
| **Instamart Scraper** | `http://localhost:3089` |
| **Jiomart Scraper** | `http://localhost:3090` |
| **Flipkart Minutes** | `http://localhost:3091` |
| **Zepto Scraper** | `http://localhost:3092` |
| **MongoDB** | `mongodb://root:password123@localhost:27017/quickcommerce` |

## Environment Variables

The docker-compose.yml includes:
```
NODE_ENV: production
MONGODB_URI: mongodb://root:password123@mongodb:27017/quickcommerce?authSource=admin
```

To customize, edit `docker-compose.yml` and modify the `environment` section.

## Development Mode (Optional)

If you want live code changes without rebuilding:

```bash
# Run the dev service (runs on different ports)
docker-compose --profile dev up mainserver-dev

# Dev ports:
# - 7001 (Main)
# - 3188 (Blinkit)
# - 3189 (Instamart)
# - 3190 (Jiomart)
# - 3191 (Flipkart)
# - 3192 (Zepto)
# - 4299 (DMart)
```

## Data Persistence

- **MongoDB Data**: Stored in Docker volume `quickcommerce_mongodb_data`
- **Scraped Data**: Stored in `./scraped_data/` folder (local mount)
- **API Dumps**: Stored in `./flipkart_minutes/api_dumps/` (local mount)

Data persists even if containers are stopped (unless you run `docker-compose down -v`).

## Troubleshooting

### MongoDB Connection Issues
```bash
# Check MongoDB logs
docker-compose logs mongodb

# Verify MongoDB is healthy
docker-compose ps
# Status should say "healthy"
```

### Application Won't Start
```bash
# Check application logs
docker-compose logs mainserver

# Rebuild from scratch
docker-compose down
docker-compose up --build
```

### Port Conflicts
If ports are already in use on friend's machine:

Edit `docker-compose.yml`:
```yaml
ports:
  - "7000:7000"  # Change first 7000 to available port (e.g., 7500:7000)
```

### Clean Complete Rebuild
```bash
# Remove all containers, images, and volumes
docker-compose down -v
docker system prune

# Then rebuild
docker-compose up -d --build
```

## Performance Tips

1. **Give Docker enough resources**
   - Docker Desktop → Preferences → Resources
   - Recommended: 4+ GB RAM, 2+ CPU cores

2. **Monitor resource usage**
   ```bash
   docker stats
   ```

3. **Disable Dev Service** if not needed (remove `--profile dev` section in docker-compose.yml)

## Sharing with Friends

To package for your friend:

```bash
# Create a compressed archive
tar -czf mainserver-docker.tar.gz . --exclude=node_modules --exclude=.git

# Friend extracts and runs:
tar -xzf mainserver-docker.tar.gz
cd mainserver
docker-compose up -d
```

## File Structure

```
mainserver/
├── Dockerfile              # Build instructions
├── docker-compose.yml      # Orchestration config
├── .dockerignore          # Files to exclude from build
├── orchestrator.js        # Main entry point
├── package.json
├── flipkart_minutes/
├── Blinkit-Scrapper/
├── DMart-Scrapper/
├── instamart-category-scrapper/
├── Jiomart-Scrapper/
├── Zepto-Scrapper/
├── scraped_data/          # Mounted locally
└── ...
```

## Common Commands Reference

```bash
# Start everything
docker-compose up -d

# Stop everything
docker-compose down

# View logs
docker-compose logs -f

# Rebuild image
docker-compose build --no-cache

# Execute command in container
docker-compose exec mainserver npm run dev

# View env variables
docker-compose exec mainserver env

# Check disk usage
docker system df
```

## Security Notes

⚠️ **For Production**: Change these in `docker-compose.yml`:
- MongoDB credentials: `MONGO_INITDB_ROOT_PASSWORD`
- Consider using `.env` file instead of hardcoded values

Example `.env`:
```
MONGODB_PASSWORD=your-secure-password
MONGODB_USERNAME=root
```

Then in docker-compose.yml:
```yaml
environment:
  MONGO_INITDB_ROOT_PASSWORD: ${MONGODB_PASSWORD}
```

## Support

If your friend encounters issues:
1. Check logs: `docker-compose logs -f`
2. Verify Docker is running properly
3. Ensure no port conflicts
4. Check available disk space and RAM
5. Try clean rebuild: `docker-compose down -v && docker-compose up --build`

---

**Ready for your friend's laptop!** 🚀
