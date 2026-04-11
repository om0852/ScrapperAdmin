import express from 'express';
import cluster from 'cluster';
import os from 'os';
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { transformJiomartProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../enrich_categories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load mappings once at startup
const CATEGORY_MAPPINGS = loadCategoryMappings(path.join(__dirname, '..', 'categories_with_urls.json'));

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4099;
const STORAGE_MAP_FILE = path.join(__dirname, 'jiomart_storage_map.json');
const SESSION_FILE = path.join(__dirname, 'jiomart_sessions.json');
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const NUM_WORKERS = process.env.WORKERS || os.cpus().length; // Default: CPU cores

let PRELOADED_SESSIONS = {};

// Load preloaded sessions
(async () => {
    try {
        const data = await fs.readFile(SESSION_FILE, 'utf8');
        PRELOADED_SESSIONS = JSON.parse(data);
        console.log(`Loaded ${Object.keys(PRELOADED_SESSIONS).length} preloaded sessions.`);
    } catch (e) {
        console.log('No preloaded sessions file found or empty.');
    }
})();

// Ensure sessions directory exists
try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
} catch (e) {
    console.error('Failed to create sessions directory:', e);
}

// User Agents for rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

const delay = (min = 1000, max = 3000) => {
    const time = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, time));
};

const safeFilePart = (value) => {
    const cleaned = String(value || 'unknown')
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    return cleaned || 'unknown';
};

const parseProxy = (proxyUrl) => {
    if (!proxyUrl) return undefined;
    try {
        const u = new URL(proxyUrl);
        if (u.username || u.password) {
            return {
                server: `${u.protocol}//${u.host}`,
                username: decodeURIComponent(u.username),
                password: decodeURIComponent(u.password)
            };
        }
        return { server: proxyUrl };
    } catch (e) {
        console.warn('⚠️ Invalid proxy URL format, using as-is');
        return { server: proxyUrl };
    }
};

// ============ MASTER PROCESS ============
if (cluster.isPrimary) {
    console.log(`🚀 Master process ${process.pid} starting with ${NUM_WORKERS} workers...`);

    // Track job assignments
    const jobTracker = new Map();
    const workers = [];

    // Spawn worker processes
    for (let i = 0; i < NUM_WORKERS; i++) {
        const worker = cluster.fork();
        workers.push(worker);
        console.log(`✅ Worker ${worker.process.pid} spawned`);

        // Handle messages from workers
        worker.on('message', (msg) => {
            if (msg.type === 'scrape-result') {
                const job = jobTracker.get(msg.jobId);
                if (job && job.res) {
                    job.res.json(msg.data);
                    jobTracker.delete(msg.jobId);
                }
            } else if (msg.type === 'scrape-error') {
                const job = jobTracker.get(msg.jobId);
                if (job && job.res) {
                    job.res.status(500).json({ success: false, error: msg.error });
                    jobTracker.delete(msg.jobId);
                }
            }
        });
    }

    // ============ MASTER HTTP SERVER ============
    app.get('/health', (req, res) => {
        res.status(200).json({ 
            status: 'ok', 
            mode: 'clustered',
            workers: NUM_WORKERS,
            timestamp: new Date().toISOString() 
        });
    });

    // Round-robin worker assignment
    let currentWorkerIndex = 0;

    const assignWorker = () => {
        const worker = workers[currentWorkerIndex];
        currentWorkerIndex = (currentWorkerIndex + 1) % workers.length;
        return worker;
    };

    app.post('/jiomartcategoryscrapper', async (req, res) => {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { pincode, categories = [], urls = [], maxConcurrentTabs = 3, proxyUrl, store } = req.body;

        if (!pincode || (categories.length === 0 && urls.length === 0)) {
            return res.status(400).json({ success: false, message: 'Invalid input' });
        }

        console.log(`📋 [Master] Assigning job ${jobId} to worker for pincode ${pincode}`);

        // Store response object to send result later
        jobTracker.set(jobId, { res, req: req.body });

        // Send to an available worker
        const worker = assignWorker();
        worker.send({
            type: 'scrape-job',
            jobId,
            payload: {
                pincode,
                categories,
                urls,
                maxConcurrentTabs,
                proxyUrl,
                store
            }
        });

        // Timeout after 5 minutes
        setTimeout(() => {
            if (jobTracker.has(jobId)) {
                jobTracker.delete(jobId);
                res.status(504).json({ success: false, error: 'Job timeout' });
            }
        }, 300000);
    });

    app.post('/jiomartcategoryscrapper-async', (req, res) => {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { pincode, categories, urls, proxyUrl = '', maxConcurrentTabs = 3 } = req.body;

        if (!pincode || (!categories?.length && !urls?.length)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Required: pincode, categories array or urls array' 
            });
        }

        console.log(`📋 [Master] Created async job ${jobId}, assigning to worker`);

        res.json({ 
            success: true, 
            jobId, 
            message: 'Scraping job started',
            statusEndpoint: `/jiomartcategoryscrapper-status/${jobId}`
        });

        const worker = assignWorker();
        worker.send({
            type: 'scrape-job-async',
            jobId,
            payload: {
                pincode,
                categories,
                urls,
                proxyUrl,
                maxConcurrentTabs
            }
        });
    });

    app.get('/jiomartcategoryscrapper-status/:jobId', (req, res) => {
        const { jobId } = req.params;
        // In a real implementation, you'd track async job status
        // For now, return a placeholder
        res.json({ 
            success: true, 
            jobId, 
            status: 'processing',
            message: 'Use worker-specific status endpoint to check progress'
        });
    });

    // Health check for worker processes
    setInterval(() => {
        for (let i = 0; i < workers.length; i++) {
            if (workers[i].isDead()) {
                console.log(`🔴 Worker ${workers[i].process.pid} died, respawning...`);
                workers[i] = cluster.fork();
            }
        }
    }, 5000);

    app.listen(PORT, () => {
        console.log(`✅ Master listening on port ${PORT} (clustered mode with ${NUM_WORKERS} workers)`);
    });

} 
// ============ WORKER PROCESS ============
else {
    console.log(`⚙️ Worker process ${process.pid} started`);

    // Import scraping functions (simplified - reuse from original server)
    const scrapeCategoryForWorker = async (browser, category, contextOptions) => {
        // This is a simplified version - in production, extract the full scrapeCategory function
        console.log(`[Worker ${process.pid}] Scraping: ${category.name}`);
        return { success: true, products: [], category: category.name };
    };

    // Handle scraping jobs from master
    process.on('message', async (msg) => {
        if (msg.type === 'scrape-job') {
            const { jobId, payload } = msg;
            const { pincode, categories = [], urls = [], maxConcurrentTabs, proxyUrl } = payload;

            console.log(`[Worker ${process.pid}] Starting job ${jobId} for ${categories.length + urls.length} categories`);

            try {
                // Convert urls to categories format
                const targetCategories = [
                    ...categories,
                    ...urls.map(u => ({ name: 'Unknown Category', url: u }))
                ];

                // Launch browser in this worker
                const browser = await chromium.launch({
                    headless: true,
                    args: [
                        '--disable-blink-features=AutomationControlled',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                    ]
                });

                try {
                    // Process categories (using same scraping logic as original server)
                    const allProducts = [];
                    
                    for (let i = 0; i < targetCategories.length; i += maxConcurrentTabs) {
                        const batch = targetCategories.slice(i, i + maxConcurrentTabs);
                        console.log(`[Worker ${process.pid}] Processing batch of ${batch.length}`);
                        
                        // Scrape each category in batch
                        const batchResults = await Promise.all(
                            batch.map(cat => scrapeCategoryForWorker(browser, cat, {}))
                        );

                        batchResults.forEach(r => {
                            if (r.success && r.products) {
                                allProducts.push(...r.products);
                            }
                        });
                    }

                    // Send results back to master
                    process.send({
                        type: 'scrape-result',
                        jobId,
                        data: {
                            success: true,
                            pincode,
                            totalProducts: allProducts.length,
                            products: allProducts,
                            workerId: process.pid
                        }
                    });

                    console.log(`✅ [Worker ${process.pid}] Job ${jobId} completed`);
                } finally {
                    await browser.close();
                }
            } catch (error) {
                console.error(`❌ [Worker ${process.pid}] Job ${jobId} failed:`, error.message);
                process.send({
                    type: 'scrape-error',
                    jobId,
                    error: error.message
                });
            }
        }
    });

    // Worker health check
    console.log(`✅ Worker ${process.pid} ready to receive jobs`);
}
