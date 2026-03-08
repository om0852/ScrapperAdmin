# Flipkart Minutes Scraper - Render Deployment Guide

## Prerequisites

Before deploying to Render, you need to **generate session files locally** for each pincode you want to scrape.

### Step 1: Generate Session Files Locally

Since the session setup requires browser interaction (selecting pincode), you must create these sessions on your local machine first:

1. **Temporarily revert to non-headless mode** (only for session generation):
   - In `scraper_service.js`, line 30, change `headless: true` to `headless: false`

2. **Run the session setup** for each pincode:
   ```bash
   node -e "const {scrape} = require('./scraper_service'); scrape('https://www.flipkart.com/flipkart-minutes-store?marketplace=HYPERLOCAL', '122016').then(() => console.log('Done')).catch(console.error);"
   ```

3. **Session files will be created** in `sessions/` folder:
   - `flipkart_session_122016.json`
   - Repeat for each pincode you need

4. **Revert back to headless mode**:
   - Change `headless: false` back to `headless: true`

5. **Commit session files** to your repository:
   ```bash
   git add sessions/
   git commit -m "Add session files for deployment"
   ```

## Step 2: Deploy to Render

### Option A: Using Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub/GitLab repository
4. Configure the service:
   - **Name**: `flipkart-minutes-scraper`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Choose based on your needs (Free tier available)

5. Click **"Create Web Service"**

### Option B: Using render.yaml (Infrastructure as Code)

1. The `render.yaml` file is already created in your project
2. Push your code to GitHub
3. In Render Dashboard, click **"New +"** → **"Blueprint"**
4. Connect your repository
5. Render will automatically detect and use `render.yaml`

## Step 3: Test Your Deployment

Once deployed, Render will provide you with a URL like:
```
https://flipkart-minutes-scraper.onrender.com
```

Test the scraper with a POST request:

```bash
curl -X POST https://your-app.onrender.com/scrape-flipkart-minutes \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.flipkart.com/flipkart-minutes-store?marketplace=HYPERLOCAL",
    "pincode": "122016"
  }'
```

## Important Notes

### Session Management
- **Sessions are pincode-specific**: Each pincode needs its own session file
- **Sessions may expire**: If scraping fails, you may need to regenerate sessions locally and redeploy
- **Security**: Session files contain cookies. Keep your repository private if it contains sensitive data

### Performance Considerations
- **First request may be slow**: Render's free tier spins down after inactivity
- **Memory usage**: Playwright/Chromium requires significant memory. Consider upgrading instance type if needed
- **Timeout**: Render has a 30-second timeout for free tier. Optimize scraping if needed

### Troubleshooting

**Issue**: "Session file not found"
- **Solution**: Make sure session files are committed and pushed to your repository

**Issue**: "Browser launch failed"
- **Solution**: Check Render logs. The `postinstall` script should install Chromium automatically

**Issue**: "Request timeout"
- **Solution**: The scraping process may take too long. Consider:
  - Reducing scroll iterations
  - Implementing pagination
  - Using a paid Render plan with longer timeouts

## Environment Variables (Optional)

You can set these in Render Dashboard under "Environment":

- `NODE_ENV=production`
- `PORT` (automatically set by Render)

## Monitoring

Check logs in Render Dashboard:
- **Deploy Logs**: Shows build and installation process
- **Service Logs**: Shows runtime logs from your application

## Updating Sessions

When you need to update sessions (e.g., they expire):

1. Pull latest code
2. Generate new sessions locally (Step 1 above)
3. Commit and push
4. Render will auto-deploy the update
