# Flipkart Minutes Scraper - Quick Deploy Guide

## 🚀 Deploy to Render (Updated)

### Step 1: Commit and Push Files

Make sure these files are in your repository:
```bash
git add Dockerfile render.yaml package.json .dockerignore
git commit -m "Add Docker deployment configuration"
git push origin main
```

### Step 2: Deploy on Render

**Option A: Using Render Dashboard (Recommended)**

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Find your existing service: `flipkart-minutes-scraper`
3. Go to **Settings** → **Delete Web Service** (we need to recreate it to use Docker)
4. Click **New +** → **Web Service**
5. Connect your repository
6. **Important Settings:**
   - **Name**: `flipkart-minutes-scraper`
   - **Runtime**: Select **Docker** (NOT Node)
   - **Dockerfile Path**: `./Dockerfile`
   - **Plan**: Free
7. Click **Create Web Service**

**Option B: Fresh Blueprint Deployment**

If you haven't deployed yet, or want to start fresh:
1. Push your code with `Dockerfile` and `render.yaml`
2. In Render: **New +** → **Blueprint**
3. Connect repository
4. Render will use `render.yaml` automatically

### Step 3: Verify Deployment

Once deployed, test with:
```bash
curl -X POST https://flipkartminutes-category-scrapper.onrender.com/scrape-flipkart-minutes \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.flipkart.com/hyperlocal/Oil-Ghee-Masala/pr?sid=hloc%2F0009&marketplace=HYPERLOCAL&param=193737489&BU=Minutes&pageUID=1768361581052",
    "pincode": "122016"
  }'
```

## ⚠️ Important Notes

### Why Docker?
- Standard Node.js environment on Render doesn't have system dependencies for Chromium
- Docker image includes all necessary libraries pre-installed
- More reliable and consistent deployments

### Session Files
Make sure your `sessions/` folder with session files is committed:
```bash
git add sessions/
git commit -m "Add session files"
git push
```

### First Deploy
- First request may take 30-60 seconds (cold start)
- Subsequent requests will be faster
- Free tier spins down after 15 minutes of inactivity

## 🔧 Troubleshooting

**Issue**: Still getting browser installation errors
- **Solution**: Make sure you selected **Docker** runtime, not Node.js

**Issue**: "Dockerfile not found"
- **Solution**: Ensure Dockerfile is committed and pushed to repository

**Issue**: Build takes too long
- **Solution**: Normal for first build. Docker layers are cached for subsequent builds.
