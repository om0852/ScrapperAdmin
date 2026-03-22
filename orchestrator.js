import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dataRoutes from './routes/dataRoutes.js';
import ProductSnapshot from './models/ProductSnapshot.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 7000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB Backend successfully.');
    }).catch(err => {
        console.error('❌ Failed to connect to MongoDB Backend:', err);
    });

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Internal API routes
app.use('/api/data', dataRoutes);
app.use(bodyParser.json());
app.use(express.static('public'));

// Platform configuration
const platforms = {
    blinkit: {
        name: 'Blinkit',
        port: 3088,
        path: './Blinkit-Scrapper',
        process: null,
        status: 'stopped'
    },
    dmart: {
        name: 'DMart',
        port: 4199,
        path: './DMart-Scrapper',
        process: null,
        status: 'stopped'
    },
    flipkart: {
        name: 'FlipkartMinutes',
        port: 3089,
        path: './flipkart_minutes',
        process: null,
        status: 'stopped'
    },
    instamart: {
        name: 'Instamart',
        port: 3090,
        path: './instamart-category-scrapper',
        process: null,
        status: 'stopped'
    },
    jiomart: {
        name: 'Jiomart',
        port: 3091,
        path: './Jiomart-Scrapper',
        process: null,
        status: 'stopped'
    },
    zepto: {
        name: 'Zepto',
        port: 3092,
        path: './Zepto-Scrapper',
        process: null,
        status: 'stopped'
    }
};

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m"
};

const systemLogs = [];

const log = (type, prefix, message) => {
    const timestamp = new Date().toISOString();
    const colorMap = {
        'INFO': colors.blue,
        'SUCCESS': colors.green,
        'ERROR': colors.red,
        'WARNING': colors.yellow,
        'DEBUG': colors.cyan,
        'STARTED': colors.magenta
    };
    const colorCode = colorMap[type] || colors.reset;
    console.log(`${colors.bright}[${timestamp}] ${colorCode}[${type}]${colors.reset} [${prefix}] ${message}`);

    // Store for frontend
    let uiType = 'info';
    if (type === 'ERROR') uiType = 'error';
    if (type === 'WARNING') uiType = 'warning';
    if (type === 'SUCCESS') uiType = 'success';

    systemLogs.push({ time: timestamp, type: uiType, message: `[${prefix}] ${message}` });
    if (systemLogs.length > 200) systemLogs.shift();
};

// ── Job Pause/Resume State ─────────────────────────────────────────────────
// Shared state that backend loops check between iterations to honour pausing.
const jobState = {
    scrape: { paused: false, running: false },
    ingest: { paused: false, running: false }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Validates productName to ensure it's not a price or invalid value.
 * Skips products where productName is empty, "N/A", or looks like a price (₹XX, $XX, etc.)
 */
const isValidProductName = (productName) => {
    if (!productName || productName === 'N/A' || productName.trim() === '') {
        return false;
    }
    
    const trimmed = String(productName).trim();
    
    // Check if it looks like a price (currency symbol + numbers)
    const pricePattern = /^[₹$£€¥₺₽₩₪₫₦]\d+(\.\d{1,2})?$/;
    if (pricePattern.test(trimmed)) {
        return false;
    }
    
    // Check if it's purely numeric (like just "62")
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return false;
    }
    
    return true;
};

/**
 * Blocks the calling async loop until the specified job is no longer paused.
 * Before unblocking it will verify internet + MongoDB are healthy.
 */
async function awaitResume(type) {
    if (!jobState[type].paused) return; // fast path

    log('WARNING', 'JobControl', `⏸ ${type} is PAUSED. Waiting for resume signal...`);
    // Wait until paused flag is cleared
    while (jobState[type].paused) {
        await sleep(2000);
    }
    // Once unpaused, resume immediately without connectivity checks
    log('SUCCESS', 'JobControl', `▶ ${type} resumed.`);
}
// ─────────────────────────────────────────────────────────────────────────────

// --- Helper Functions ---

const startServer = (platformKey) => {
    return new Promise((resolve, reject) => {
        const platform = platforms[platformKey];

        if (platform.process && platform.status === 'running') {
            reject(new Error(`${platform.name} server is already running`));
            return;
        }

        const serverPath = path.join(__dirname, platform.path, 'server.js');

        // Check if server.js exists
        if (!fs.existsSync(serverPath)) {
            reject(new Error(`Server file not found for ${platform.name}`));
            return;
        }

        try {
            log('INFO', 'Orchestrator', `Starting ${platform.name} server on port ${platform.port}...`);

            const child = spawn('node', [serverPath], {
                cwd: path.join(__dirname, platform.path),
                env: {
                    ...process.env,
                    PORT: platform.port
                },
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Log stdout
            child.stdout.on('data', (data) => {
                console.log(`${colors.cyan}[${platform.name}]${colors.reset} ${data}`);
            });

            // Log stderr
            child.stderr.on('data', (data) => {
                console.log(`${colors.yellow}[${platform.name}]${colors.reset} ${data}`);
            });

            // Handle process exit
            child.on('exit', (code, signal) => {
                log('WARNING', 'Orchestrator', `${platform.name} server stopped (exit code: ${code})`);
                platform.status = 'stopped';
                platform.process = null;
            });

            // Handle process error
            child.on('error', (err) => {
                log('ERROR', 'Orchestrator', `Failed to start ${platform.name}: ${err.message}`);
                platform.status = 'stopped';
                platform.process = null;
                reject(err);
            });

            platform.process = child;
            platform.status = 'running';
            platform.startTime = new Date();

            log('INFO', 'Orchestrator', `Waiting for ${platform.name} server to be healthy...`);

            // Poll /health Endpoint up to 60 seconds
            let attempts = 0;
            const maxAttempts = 30; // 30 * 2s = 60 seconds
            const pollInterval = setInterval(async () => {
                attempts++;
                try {
                    const res = await fetch(`http://127.0.0.1:${platform.port}/health`);
                    if (res.ok) {
                        clearInterval(pollInterval);
                        log('SUCCESS', 'Orchestrator', `${platform.name} server started successfully`);
                        resolve({
                            success: true,
                            platform: platform.name,
                            port: platform.port,
                            status: 'running',
                            message: `${platform.name} server is now running`
                        });
                    }
                } catch (e) {
                    // Fetch failed (server not listening yet)
                    if (attempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        log('ERROR', 'Orchestrator', `${platform.name} server health check timed out`);
                        platform.status = 'stopped';
                        reject(new Error(`${platform.name} server failed to start within time limit`));
                    }
                }
            }, 2000);

        } catch (error) {
            log('ERROR', 'Orchestrator', `Error starting ${platform.name}: ${error.message}`);
            platform.status = 'stopped';
            reject(error);
        }
    });
};

const stopServer = (platformKey) => {
    return new Promise((resolve, reject) => {
        const platform = platforms[platformKey];

        if (!platform.process || platform.status === 'stopped') {
            reject(new Error(`${platform.name} server is not running`));
            return;
        }

        try {
            log('INFO', 'Orchestrator', `Stopping ${platform.name} server...`);

            platform.process.kill('SIGTERM');

            // Give it 5 seconds to stop gracefully
            const timeout = setTimeout(() => {
                if (platform.process && !platform.process.killed) {
                    platform.process.kill('SIGKILL');
                    log('WARNING', 'Orchestrator', `Force killed ${platform.name} server`);
                }
            }, 5000);

            platform.process.on('exit', () => {
                clearTimeout(timeout);
                platform.status = 'stopped';
                platform.process = null;
                log('SUCCESS', 'Orchestrator', `${platform.name} server stopped`);
                resolve({
                    success: true,
                    platform: platform.name,
                    message: `${platform.name} server stopped successfully`
                });
            });

        } catch (error) {
            log('ERROR', 'Orchestrator', `Error stopping ${platform.name}: ${error.message}`);
            platform.status = 'stopped';
            platform.process = null;
            reject(error);
        }
    });
};

// --- API Routes ---

app.get('/api/platforms', (req, res) => {
    const platformsList = Object.entries(platforms).map(([key, config]) => ({
        id: key,
        name: config.name,
        port: config.port,
        status: config.status,
        uptime: config.startTime ? new Date() - config.startTime : 0
    }));
    res.json(platformsList);
});

app.get('/api/logs', (req, res) => {
    res.json(systemLogs);
});

// Health check: verifies internet + MongoDB
app.get('/api/health/check', async (req, res) => {
    let internet = false;
    try {
        await fetch('https://www.google.com', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        internet = true;
    } catch (_) { /* offline */ }
    const mongodb = mongoose.connection.readyState === 1;
    res.json({ internet, mongodb, healthy: internet && mongodb });
});

// Job pause/resume control
app.get('/api/job/status', (req, res) => {
    res.json(jobState);
});

app.post('/api/job/pause', (req, res) => {
    const type = req.query.type;
    if (!jobState[type]) return res.status(400).json({ error: 'Invalid job type' });
    jobState[type].paused = true;
    log('WARNING', 'JobControl', `⏸ ${type} job PAUSED by user`);
    res.json({ success: true, state: jobState[type] });
});

app.post('/api/job/resume', async (req, res) => {
    const type = req.query.type;
    if (!jobState[type]) return res.status(400).json({ error: 'Invalid job type' });

    // Check connectivity before allowing resume
    let internet = false;
    try {
        await fetch('https://www.google.com', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        internet = true;
    } catch (_) { /* offline */ }
    const mongodb = mongoose.connection.readyState === 1;

    if (!internet || !mongodb) {
        return res.status(503).json({
            success: false,
            internet,
            mongodb,
            error: `Cannot resume: ${!internet ? 'No internet' : ''}${!internet && !mongodb ? ' + ' : ''}${!mongodb ? 'MongoDB disconnected' : ''}`
        });
    }

    jobState[type].paused = false;
    log('SUCCESS', 'JobControl', `▶ ${type} job RESUMED by user`);
    res.json({ success: true, state: jobState[type] });
});

app.get('/api/categories', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'categories_with_urls.json');
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'categories_with_urls.json not found' });
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        const platformsAvailable = Object.keys(data);
        const categories = new Set();

        platformsAvailable.forEach(platform => {
            if (Array.isArray(data[platform])) {
                data[platform].forEach(item => {
                    const cat = item.masterCategory || item.officalCategory || item.category;
                    if (cat) categories.add(cat);
                });
            }
        });

        res.json({
            platforms: platformsAvailable,
            categories: Array.from(categories).sort()
        });
    } catch (error) {
        log('ERROR', 'API', `Error reading categories: ${error.message}`);
        res.status(500).json({ error: 'Failed to read categories' });
    }
});

app.post('/api/mass-scrape', async (req, res) => {
    const { platforms: selectedPlatforms, categories: selectedCategories, pincodes: selectedPincodes, autoIngest } = req.body;

    if (!Array.isArray(selectedPlatforms) || !Array.isArray(selectedCategories) || !Array.isArray(selectedPincodes)) {
        return res.status(400).json({ error: 'platforms, categories, and pincodes must be arrays' });
    }

    // Acknowledge the request immediately so the frontend doesn't hang
    res.json({ success: true, message: 'Mass scrape started', jobId: Date.now() });

    // Put this in an async IIFE to run in the background
    (async () => {
        log('INFO', 'MassScrape', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        log('INFO', 'MassScrape', `Starting mass scrape — ${selectedPlatforms.length} platform(s), ${selectedCategories.length} category(s), ${selectedPincodes.length} pincode(s) | AutoIngest: ${autoIngest ? 'ON' : 'OFF'}`);
        log('INFO', 'MassScrape', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        jobState.scrape.running = true;
        jobState.scrape.paused = false;

        try {
            const filePath = path.join(__dirname, 'categories_with_urls.json');
            const urlData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            const totalPlatforms = selectedPlatforms.length;
            for (let pIdx = 0; pIdx < selectedPlatforms.length; pIdx++) {
                const platformKey = selectedPlatforms[pIdx];
                const pKeyLower = platformKey.toLowerCase();
                const platformConfigKey = Object.keys(platforms).find(k => k.toLowerCase() === pKeyLower || platforms[k].name.toLowerCase() === pKeyLower);

                if (!platformConfigKey) {
                    log('WARNING', 'MassScrape', `[Platform ${pIdx + 1}/${totalPlatforms}] Config not found for: ${platformKey}`);
                    continue;
                }

                const pConfig = platforms[platformConfigKey];
                log('INFO', 'MassScrape', `▶ [Platform ${pIdx + 1}/${totalPlatforms}] Starting: ${pConfig.name}`);

                // Start the server if it's not running
                if (pConfig.status !== 'running') {
                    try {
                        await startServer(platformConfigKey);
                    } catch (err) {
                        log('ERROR', 'MassScrape', `[Platform ${pIdx + 1}/${totalPlatforms}] Failed to start server ${pConfig.name}: ${err.message}`);
                        continue;
                    }
                }

                // Mapping for specific platform endpoint paths
                let endpoint = `/${platformConfigKey}categoryscrapper`;
                if (platformConfigKey === 'instamart') endpoint = '/instamartcategorywrapper';
                if (platformConfigKey === 'flipkart') endpoint = '/scrape-flipkart-minutes';

                const totalCategories = selectedCategories.length;
                for (let cIdx = 0; cIdx < selectedCategories.length; cIdx++) {
                    const category = selectedCategories[cIdx];
                    const safeCategoryName = category.replace(/[^a-zA-Z0-9_\- ]/g, '_').trim();
                    const categoryDirPath = path.join(__dirname, 'scraped_data', safeCategoryName);
                    if (!fs.existsSync(categoryDirPath)) {
                        fs.mkdirSync(categoryDirPath, { recursive: true });
                    }

                    const platformUrlsData = urlData[platformKey] || urlData[pConfig.name] || [];
                    const urlsToScrape = platformUrlsData
                        .filter(item => (item.masterCategory === category || item.officalCategory === category || item.category === category) && item.url)
                        .map(item => item.url);

                    if (urlsToScrape.length === 0) {
                        log('WARNING', 'MassScrape', `  [Cat ${cIdx + 1}/${totalCategories}] No URLs found — ${pConfig.name} / ${category}`);
                        continue;
                    }

                    log('INFO', 'MassScrape', `  [Cat ${cIdx + 1}/${totalCategories}] ${urlsToScrape.length} URLs — ${pConfig.name} / ${category}`);

                    const totalPincodes = selectedPincodes.length;
                    for (let pinIdx = 0; pinIdx < selectedPincodes.length; pinIdx++) {
                        const pincode = selectedPincodes[pinIdx];
                        // ── Pause Guard ── check before each pincode
                        await awaitResume('scrape');

                        try {
                            log('INFO', 'MassScrape', `    [Pin ${pinIdx + 1}/${totalPincodes}] Scraping: ${pConfig.name} | ${category} | ${pincode}`);

                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 10800000); // 3 hour timeout

                            let response;
                            try {
                                response = await fetch(`http://127.0.0.1:${pConfig.port}${endpoint}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        pincode: pincode.trim(),
                                        urls: urlsToScrape,
                                        store: false // DO NOT store individually inside the scraper codebase
                                    }),
                                    signal: controller.signal
                                });
                            } finally {
                                clearTimeout(timeoutId);
                            }

                            if (!response.ok) {
                                const errText = await response.text();
                                log('ERROR', 'MassScrape', `    [Pin ${pinIdx + 1}/${totalPincodes}] Scraper API Error (${pConfig.name}): ${errText}`);
                            } else {
                                const data = await response.json();

                                // Save data directly in mainserver/scraped_data/<Category>
                                const safePincode = pincode.trim().replace(/[^0-9a-zA-Z]/g, '');
                                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                const fileName = `${pConfig.name}_${safePincode}_${timestamp}.json`;
                                const outPath = path.join(categoryDirPath, fileName);

                                // --- Post-process categories before saving ---
                                if (data && data.products && Array.isArray(data.products)) {
                                    // For finding mappings, use the platform key if available
                                    let platformKey = pConfig.name;
                                    if (platformKey === 'flipkartMinutes') platformKey = 'Flipkart';
                                    if (platformKey === 'instamart') platformKey = 'Instamart';
                                    if (platformKey === 'blinkit') platformKey = 'Blinkit';
                                    if (platformKey === 'zepto') platformKey = 'Zepto';
                                    if (platformKey === 'jiomart') platformKey = 'Jiomart';
                                    if (platformKey === 'dmart') platformKey = 'DMart';

                                    let allMappings = [];
                                    if (urlData[platformKey]) {
                                        allMappings = urlData[platformKey];
                                    } else {
                                        Object.values(urlData).forEach(platformArr => {
                                            if (Array.isArray(platformArr)) allMappings.push(...platformArr);
                                        });
                                    }

                                    const newProducts = [];
                                    for (const prod of data.products) {
                                        // ── Skip products with invalid productName ──
                                        if (!isValidProductName(prod.productName || prod.name)) {
                                            log('WARNING', 'MassScrape', `    [Pin ${pinIdx + 1}/${totalPincodes}] Skipping product with invalid productName: "${prod.productName || prod.name}"`);
                                            continue;
                                        }

                                        const url = prod.categoryUrl;
                                        let mapping = null;

                                        if (url && url !== 'N/A') {
                                            const urlWithoutQuery = url.split('?')[0];
                                            mapping = allMappings.find(m => {
                                                if (!m.url) return false;
                                                return m.url === url || m.url.split('?')[0] === urlWithoutQuery;
                                            });
                                        }

                                        let newCategory = prod.category || 'Unknown';
                                        let newSubCategory = 'N/A';
                                        let newOfficialCategory = 'N/A';
                                        let newOfficialSubCategory = 'N/A';

                                        if (mapping) {
                                            newCategory = mapping.masterCategory || newCategory;
                                            newSubCategory = mapping.subCategory || mapping.officalSubCategory || 'N/A';
                                            newOfficialCategory = mapping.officalCategory || mapping.officialCategory || 'N/A';
                                            newOfficialSubCategory = mapping.officalSubCategory || mapping.officialSubCategory || 'N/A';
                                        }

                                        // Build the officialSubCategory suffix and update productId
                                        // Keep hyphens to differentiate multi-word categories (e.g., fresh-vegetables, not freshvegetables)
                                        const subCatSuffix = (newOfficialSubCategory && newOfficialSubCategory !== 'N/A')
                                            ? '__' + newOfficialSubCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                                            : '';
                                        // Strip any existing suffix (starting with '__') then re-append
                                        const baseProductId = String(prod.productId || prod.id || '').replace(/__.*$/, '');
                                        const updatedProductId = baseProductId + subCatSuffix;

                                        // NO DB CHECKS DURING SCRAPING — new field will be set during manual insertion
                                        let finalWeight = prod.productWeight || prod.weight || 'N/A';
                                        if (finalWeight === 'N/A' || finalWeight === '') {
                                            finalWeight = prod.quantity || 'N/A';
                                        }

                                        newProducts.push({
                                            ...prod,
                                            productId: updatedProductId,
                                            category: newCategory,
                                            subCategory: newSubCategory,
                                            officialCategory: newOfficialCategory,
                                            officialSubCategory: newOfficialSubCategory,
                                            productWeight: finalWeight,
                                            new: false
                                            // new field will be set to true during manual insertion only
                                        });
                                    }
                                    data.products = newProducts;
                                }
                                // ---------------------------------------------

                                fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

                                log('SUCCESS', 'MassScrape', `    [Pin ${pinIdx + 1}/${totalPincodes}] ✅ Scrape done — ${pConfig.name} | ${category} | ${pincode} → ${fileName}`);

                                // ---- SKIP AUTOMATIC INGEST DURING MASS SCRAPING ----
                                // Files are saved for manual ingestion later to avoid MongoDB timeouts
                                log('INFO', 'MassScrape', `    [Pin ${pinIdx + 1}/${totalPincodes}] File saved. Use /api/manual-ingest for MongoDB operations.`);
                            }
                        } catch (err) {
                            const isNetworkErr = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message?.includes('fetch failed') || (err.name === 'AbortError' && err.message?.includes('network'));
                            const isTimeoutErr = err.name === 'AbortError' && (err.message?.includes('timeout') || err.message?.includes('signal'));
                            
                            if (isNetworkErr && !jobState.scrape.paused) {
                                jobState.scrape.paused = true;
                                log('ERROR', 'MassScrape', `    [Pin ${pinIdx + 1}/${totalPincodes}] ⚡ Network error — scrape AUTO-PAUSED: ${err.message}`);
                                log('WARNING', 'MassScrape', `    Waiting for resume signal via /api/job/resume?type=scrape ...`);
                            } else if (isTimeoutErr) {
                                log('ERROR', 'MassScrape', `    [Pin ${pinIdx + 1}/${totalPincodes}] ⏱️ Request timeout (large category) — ${pConfig.name} / ${category} / ${pincode} — retrying...`);
                            } else {
                                log('ERROR', 'MassScrape', `    [Pin ${pinIdx + 1}/${totalPincodes}] Failed: ${pConfig.name} / ${pincode} — ${err.message}`);
                            }
                        }

                        // Add a small delay between hitting the same scraper for different pincodes
                        await new Promise(res => setTimeout(res, 5000));
                    }
                }

                // Auto-stop the platform server right after it finishes its job for all categories & pincodes
                log('INFO', 'MassScrape', `[Platform ${pIdx + 1}/${totalPlatforms}] Auto-stopping ${pConfig.name} server...`);
                try {
                    await stopServer(platformConfigKey);
                    log('SUCCESS', 'MassScrape', `[Platform ${pIdx + 1}/${totalPlatforms}] ✅ ${pConfig.name} stopped.`);
                } catch (e) {
                    log('ERROR', 'MassScrape', `[Platform ${pIdx + 1}/${totalPlatforms}] Failed to stop ${pConfig.name}: ${e.message}`);
                }
            }

            log('INFO', 'MassScrape', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            log('SUCCESS', 'MassScrape', `🏁 All mass scraping tasks completed!`);
            log('INFO', 'MassScrape', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        } catch (error) {
            log('ERROR', 'MassScrape', `Critical Error in Mass Scrape loop: ${error.message}`);
        } finally {
            jobState.scrape.running = false;
            jobState.scrape.paused = false;
        }
    })();
});

app.post('/api/start/:platform', async (req, res) => {
    const { platform } = req.params;

    if (!platforms[platform]) {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    try {
        const result = await startServer(platform);
        res.json(result);
    } catch (error) {
        log('ERROR', 'API', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stop/:platform', async (req, res) => {
    const { platform } = req.params;

    if (!platforms[platform]) {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    try {
        const result = await stopServer(platform);
        res.json(result);
    } catch (error) {
        log('ERROR', 'API', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/status/:platform', async (req, res) => {
    const { platform } = req.params;

    if (!platforms[platform]) {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    const config = platforms[platform];
    const baseInfo = {
        name: config.name,
        port: config.port,
        status: config.status,
        url: config.status === 'running' ? `http://localhost:${config.port}` : null,
        uptime: config.startTime ? new Date() - config.startTime : 0
    };

    if (config.status === 'running') {
        try {
            // Fetch live scraper stats using 127.0.0.1 to avoid ipv6 resolution issues in fetch
            const response = await fetch(`http://127.0.0.1:${config.port}/status`);
            if (response.ok) {
                const scraperStatus = await response.json();
                return res.json({ ...baseInfo, scraper: scraperStatus });
            }
        } catch (e) {
            // Ignore fetch errors, just return base info
            baseInfo.scraperError = `Error fetching scraper live status: ${e.message}`;
        }
    }
    res.json(baseInfo);
});

app.get('/api/health/:platform', async (req, res) => {
    const { platform } = req.params;

    if (!platforms[platform]) {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    const config = platforms[platform];

    if (config.status === 'running') {
        try {
            const response = await fetch(`http://127.0.0.1:${config.port}/health`);
            if (response.ok) {
                const health = await response.json();
                return res.json(health);
            } else {
                return res.status(response.status).json({ error: 'Health check failed' });
            }
        } catch (e) {
            return res.status(500).json({ error: 'Could not connect to scraper server' });
        }
    }

    res.status(503).json({ error: 'Server is not running' });
});

app.get('/api/scraped-folders', (req, res) => {
    const scrapedDir = path.join(__dirname, 'scraped_data');
    if (!fs.existsSync(scrapedDir)) return res.json([]);
    const folders = fs.readdirSync(scrapedDir).filter(f => fs.statSync(path.join(scrapedDir, f)).isDirectory());
    res.json(folders);
});

app.get('/api/scraped-files', (req, res) => {
    const { folder } = req.query;
    if (!folder) return res.status(400).json({ error: 'Folder required' });
    const targetDir = path.join(__dirname, 'scraped_data', folder);
    if (!fs.existsSync(targetDir)) return res.json([]);
    const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.json'));
    res.json(files);
});

app.post('/api/manual-ingest', async (req, res) => {
    const { category, file, dateOverride } = req.body;
    if (!category || !file) return res.status(400).json({ error: 'Category and file required' });

    // ── Pause Guard for Ingestion ──
    await awaitResume('ingest');

    const filePath = path.join(__dirname, 'scraped_data', category, file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Infer platform name from data or file string
        let platformName = data.platform;
        if (!platformName) {
            const fileParts = file.split('_');
            if (fileParts.length > 0) platformName = fileParts[0];
        }

        const PLATFORM_ENUM = ['zepto', 'blinkit', 'jiomart', 'dmart', 'instamart', 'flipkartMinutes'];
        const normalizedPlatform = PLATFORM_ENUM.find(p => p.toLowerCase() === platformName.toLowerCase()) || platformName.toLowerCase();

        // Let's load categories_with_urls.json to map category exactly like orchestrator does
        const mapPath = path.join(__dirname, 'categories_with_urls.json');
        let allMappings = [];
        if (fs.existsSync(mapPath)) {
            const parsedConfig = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
            if (Array.isArray(parsedConfig)) {
                allMappings = parsedConfig;
            } else {
                // Flatten the object keys into a single array
                for (const platKey of Object.keys(parsedConfig)) {
                    if (Array.isArray(parsedConfig[platKey])) {
                        allMappings = allMappings.concat(parsedConfig[platKey]);
                    }
                }
            }
        }

        // Apply advanced mappings and calculate `new` flag
        if (data.products && Array.isArray(data.products)) {
            const newProducts = [];
            for (const prod of data.products) {
                // ── Skip products with invalid productName ──
                if (!isValidProductName(prod.productName || prod.name)) {
                    log('WARNING', 'ManualIngest', `Skipping product with invalid productName: "${prod.productName || prod.name}"`);
                    continue;
                }

                // Apply Date Override if provided
                if (dateOverride) {
                    prod.scrapedAt = new Date(dateOverride).toISOString();
                }

                const url = prod.categoryUrl;
                let mapping = null;

                if (url && url !== 'N/A') {
                    const urlWithoutQuery = url.split('?')[0];
                    mapping = allMappings.find(m => {
                        if (!m.url) return false;
                        return m.url === url || m.url.split('?')[0] === urlWithoutQuery;
                    });
                }

                let newCategory = prod.category || 'Unknown';
                let newSubCategory = 'N/A';
                let newOfficialCategory = 'N/A';
                let newOfficialSubCategory = 'N/A';

                if (mapping) {
                    newCategory = mapping.masterCategory || newCategory;
                    newSubCategory = mapping.subCategory || mapping.officalSubCategory || 'N/A';
                    newOfficialCategory = mapping.officalCategory || mapping.officialCategory || 'N/A';
                    newOfficialSubCategory = mapping.officalSubCategory || mapping.officialSubCategory || 'N/A';
                }

                // Build the officialSubCategory suffix and update productId
                // Keep hyphens to differentiate multi-word categories (e.g., fresh-vegetables, not freshvegetables)
                const subCatSuffix = (newOfficialSubCategory && newOfficialSubCategory !== 'N/A')
                    ? '__' + newOfficialSubCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                    : '';
                // Strip any existing suffix (starting with '__') then re-append
                const baseProductId = String(prod.productId || prod.id || '').replace(/__.*$/, '');
                const updatedProductId = baseProductId + subCatSuffix;

                // Calculate productWeight fallback
                let finalWeight = prod.productWeight || prod.weight || 'N/A';
                if (finalWeight === 'N/A' || finalWeight === '') {
                    finalWeight = prod.quantity || 'N/A';
                }

                // Check DB for new flag during manual insertion - match dataController logic
                // Resolve the scraped timestamp
                const resolvedScrapedAt = prod.time || prod.scrapedAt || prod.date || new Date();
                
                // Step 1: Find the LATEST scrape date BEFORE the insertion date for this category
                const latestPreviousDate = await ProductSnapshot.findOne({
                    platform: normalizedPlatform,
                    pincode: (data.pincode || 'Unknown').trim(),
                    category: newCategory.trim(),
                    scrapedAt: { $lt: new Date(resolvedScrapedAt) }
                }).sort({ scrapedAt: -1 }).lean();

                // Step 2: Compare product ONLY with the latest previous date
                let lastSnapshot = null;
                if (latestPreviousDate) {
                    lastSnapshot = await ProductSnapshot.findOne({
                        productId: prod.id || prod.productId,
                        platform: normalizedPlatform,
                        pincode: (data.pincode || 'Unknown').trim(),
                        category: newCategory.trim(),
                        scrapedAt: latestPreviousDate.scrapedAt  // ONLY this latest previous date
                    }).lean();
                }

                newProducts.push({
                    ...prod,
                    productId: updatedProductId,
                    category: newCategory,
                    subCategory: newSubCategory,
                    officialCategory: newOfficialCategory,
                    officialSubCategory: newOfficialSubCategory,
                    productWeight: finalWeight,
                    new: !lastSnapshot  // TRUE if product is new, FALSE if already exists
                });
            }
            data.products = newProducts;
        }

        log('INFO', 'Orchestrator', `Manual Ingestion triggered for ${file} with overrideDate: ${dateOverride || 'none'}`);

        // Use the real category name from the mapped products (avoids folder-name
        // sanitization where & → _ on Windows). Fall back to decoding " _ " → " & ".
        const resolvedCategory = (data.products && data.products.length > 0 && data.products[0].category)
            ? data.products[0].category
            : category.replace(/ _ /g, ' & ');

        const ingestRes = await fetch(`http://localhost:${PORT}/api/data/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pincode: data.pincode || 'Unknown',
                platform: normalizedPlatform,
                category: resolvedCategory,
                products: data.products
            })
        });

        if (ingestRes.ok) {
            const ingestJson = await ingestRes.json();
            log('SUCCESS', 'Orchestrator', `Ingestion complete for ${file}! New: ${ingestJson.stats.new}, Updated: ${ingestJson.stats.updated}, New Groups: ${ingestJson.stats.newGroups}`);
            return res.json(ingestJson);
        } else {
            const errStatus = ingestRes.status;
            const isConnErr = errStatus === 503 || errStatus === 504;
            if (isConnErr && !jobState.ingest.paused) {
                jobState.ingest.paused = true;
                log('ERROR', 'Orchestrator', `⚡ Ingestion error (Status ${errStatus}) — ingestion AUTO-PAUSED for ${file}`);
                log('WARNING', 'Orchestrator', `Waiting for resume signal via /api/job/resume?type=ingest ...`);
            } else {
                log('ERROR', 'Orchestrator', `Database Ingestion Failed with Status: ${errStatus}`);
            }
            return res.status(errStatus).json({ error: 'Database ingestion failed internally.' });
        }
    } catch (err) {
        log('ERROR', 'Orchestrator', `Manual ingest error: ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/stopall', async (req, res) => {
    const results = [];

    for (const [key, platform] of Object.entries(platforms)) {
        if (platform.status === 'running') {
            try {
                await stopServer(key);
                results.push({ platform: platform.name, status: 'stopped' });
            } catch (error) {
                results.push({ platform: platform.name, error: error.message });
            }
        }
    }

    log('SUCCESS', 'Orchestrator', 'All servers stopped');
    res.json({ success: true, results });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// --- Startup ---

app.listen(PORT, () => {
    log('SUCCESS', 'Orchestrator', `🚀 Main Server running on http://localhost:${PORT}`);
    log('INFO', 'Orchestrator', 'Available platforms:');
    Object.values(platforms).forEach(p => {
        log('INFO', 'Orchestrator', `  - ${p.name} (port ${p.port})`);
    });
    log('INFO', 'Orchestrator', '');
    log('INFO', 'Orchestrator', 'Open your browser to control all servers');
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    log('WARNING', 'Orchestrator', 'Shutting down gracefully...');

    for (const [key] of Object.entries(platforms)) {
        const platform = platforms[key];
        if (platform.process && platform.status === 'running') {
            try {
                await stopServer(key);
            } catch (err) {
                log('ERROR', 'Orchestrator', err.message);
            }
        }
    }

    log('SUCCESS', 'Orchestrator', 'All servers stopped. Exiting...');
    process.exit(0);
});

export default app;
