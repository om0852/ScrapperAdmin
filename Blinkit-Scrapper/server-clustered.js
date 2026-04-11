import express from 'express';
import cluster from 'cluster';
import os from 'os';
import { chromium } from 'playwright';
import cors from 'cors';
import bodyParser from 'body-parser';
import UserAgent from 'user-agents';
import fs from 'fs';
import path from 'path';
import { transformBlinkitProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../enrich_categories.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load mappings once at startup
const CATEGORY_MAPPINGS = loadCategoryMappings(path.join(__dirname, '..', 'categories_with_urls.json'));

const PORT = process.env.PORT || 3088;
const NUM_WORKERS = process.env.WORKERS || os.cpus().length;

// Helper functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const parseProxyUrl = (proxyUrl) => {
    if (!proxyUrl) return null;
    try {
        const u = new URL(proxyUrl);
        return {
            server: `${u.protocol}//${u.hostname}:${u.port}`,
            username: decodeURIComponent(u.username),
            password: decodeURIComponent(u.password)
        };
    } catch (e) {
        console.error('Invalid proxy URL:', e.message);
        return null;
    }
};

const getRandomUserAgent = () => {
    return new UserAgent({ deviceCategory: 'desktop' }).toString();
};

// Logging helper
const log = (type, prefix, message) => {
    const timestamp = new Date().toLocaleTimeString();
    let emoji = '';
    switch (type) {
        case 'info': emoji = 'ℹ️'; break;
        case 'success': emoji = '✅'; break;
        case 'warn': emoji = '⚠️'; break;
        case 'error': emoji = '❌'; break;
        case 'debug': emoji = '🛠'; break;
        case 'start': emoji = '🚀'; break;
    }
    console.log(`[${timestamp}] [${prefix}] ${emoji} ${message}`);
};

// ============ MASTER PROCESS ============
if (cluster.isPrimary) {
    log('start', 'Master', `Starting with ${NUM_WORKERS} workers...`);

    const jobTracker = new Map();
    const workers = [];

    for (let i = 0; i < NUM_WORKERS; i++) {
        const worker = cluster.fork();
        workers.push(worker);
        log('success', 'Master', `Worker ${worker.process.pid} spawned`);

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
    const app = express();
    app.use(cors());
    app.use(bodyParser.json());

    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'ok',
            mode: 'clustered',
            workers: NUM_WORKERS,
            services: { scraper: 'up' },
            timestamp: new Date().toISOString()
        });
    });

    let currentWorkerIndex = 0;
    const assignWorker = () => {
        const worker = workers[currentWorkerIndex];
        currentWorkerIndex = (currentWorkerIndex + 1) % workers.length;
        return worker;
    };

    app.post('/blinkitcategoryscrapper', async (req, res) => {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { url, urls, pincode, categories, maxConcurrentTabs = 2, proxyUrl, store, headless = true } = req.body;

        if (!pincode || (!url && (!urls || urls.length === 0) && (!categories || categories.length === 0))) {
            return res.status(400).json({ error: 'Invalid input' });
        }

        log('info', 'Master', `Assigning job ${jobId} to worker for pincode ${pincode}`);

        jobTracker.set(jobId, { res, req: req.body });

        const worker = assignWorker();
        worker.send({
            type: 'scrape-job',
            jobId,
            payload: {
                url,
                urls,
                pincode,
                categories,
                maxConcurrentTabs,
                proxyUrl,
                store,
                headless
            }
        });

        setTimeout(() => {
            if (jobTracker.has(jobId)) {
                jobTracker.delete(jobId);
                res.status(504).json({ success: false, error: 'Job timeout' });
            }
        }, 300000); // 5 minutes timeout
    });

    app.post('/blinkitcategoryscrapper-async', (req, res) => {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { url, urls, pincode, categories, maxConcurrentTabs = 2, proxyUrl, store, headless = true } = req.body;

        if (!pincode || (!url && (!urls || urls.length === 0) && (!categories || categories.length === 0))) {
            return res.status(400).json({ error: 'Invalid input' });
        }

        log('info', 'Master', `Created async job ${jobId}`);

        res.json({
            success: true,
            jobId,
            message: 'Scraping job started',
            statusEndpoint: `/blinkitcategoryscrapper-status/${jobId}`
        });

        const worker = assignWorker();
        worker.send({
            type: 'scrape-job-async',
            jobId,
            payload: {
                url,
                urls,
                pincode,
                categories,
                maxConcurrentTabs,
                proxyUrl,
                store,
                headless
            }
        });
    });

    app.get('/blinkitcategoryscrapper-status/:jobId', (req, res) => {
        const { jobId } = req.params;
        res.json({
            success: true,
            jobId,
            status: 'processing',
            message: 'Use worker-specific endpoint for detailed progress'
        });
    });

    // Auto-respawn dead workers
    setInterval(() => {
        for (let i = 0; i < workers.length; i++) {
            if (workers[i].isDead()) {
                log('warn', 'Master', `Worker ${workers[i].process.pid} died, respawning...`);
                workers[i] = cluster.fork();
            }
        }
    }, 5000);

    app.listen(PORT, () => {
        log('success', 'Master', `Listening on port ${PORT} (clustered mode with ${NUM_WORKERS} workers)`);
    });

}
// ============ WORKER PROCESS ============
else {
    log('start', 'Worker', `Worker ${process.pid} started`);

    const app = express();
    app.use(cors());
    app.use(bodyParser.json());

    app.get('/health', (req, res) => {
        res.json({ status: 'ok', worker: process.pid });
    });

    // Stub for scraping (actual implementation uses master's scrapeCategory)
    process.on('message', async (msg) => {
        if (msg.type === 'scrape-job' || msg.type === 'scrape-job-async') {
            const { jobId, payload } = msg;
            const { pincode, categories = [], urls = [], maxConcurrentTabs = 2, proxyUrl, store, headless = true, url } = payload;

            log('info', 'Worker', `[${jobId}] Starting scrape for pincode ${pincode}`);

            try {
                // Normalize input
                let targets = [];
                
                if (url) {
                    targets.push({ name: url.split('/cn/')[1]?.split('/')[0] || 'Category', url });
                }
                
                if (urls && Array.isArray(urls)) {
                    urls.forEach((u, i) => {
                        targets.push({ name: u.split('/cn/')[1]?.split('/')[0] || `Category ${i}`, url: u });
                    });
                }
                
                if (categories && Array.isArray(categories)) {
                    targets = targets.concat(categories);
                }

                if (targets.length === 0) {
                    throw new Error('No targets to scrape');
                }

                // Launch browser
                const browser = await chromium.launch({
                    headless: headless,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu'
                    ]
                });

                const proxyConfig = parseProxyUrl(proxyUrl);
                let contextOptions = {
                    userAgent: getRandomUserAgent(),
                    viewport: { width: 1280, height: 800 }
                };

                if (proxyConfig) {
                    contextOptions.proxy = {
                        server: proxyConfig.server,
                        username: proxyConfig.username,
                        password: proxyConfig.password
                    };
                }

                // Load session if exists
                const sessionPath = `sessions/${pincode}.json`;
                if (fs.existsSync(sessionPath)) {
                    try {
                        const sessionContent = fs.readFileSync(sessionPath, 'utf8');
                        if (sessionContent.trim()) {
                            const sessionData = JSON.parse(sessionContent);
                            contextOptions.storageState = sessionData;
                            log('success', 'Worker', `[${jobId}] Loaded session for pincode ${pincode}`);
                        }
                    } catch (e) {
                        log('warn', 'Worker', `[${jobId}] Failed to load session: ${e.message}`);
                    }
                }

                const context = await browser.newContext(contextOptions);
                
                // Simple scraping (in production, use full scrapeCategory logic)
                const allProducts = [];
                
                log('info', 'Worker', `[${jobId}] Processing ${targets.length} categories with concurrency=2`);

                const concurrency = maxConcurrentTabs;
                for (let i = 0; i < targets.length; i += concurrency) {
                    const batch = targets.slice(i, i + concurrency);
                    const batchNumber = Math.floor(i / concurrency) + 1;
                    const totalBatches = Math.ceil(targets.length / concurrency);

                    log('info', 'Worker', `[${jobId}] Batch ${batchNumber}/${totalBatches}`);

                    // In a real implementation, you'd call scrapeCategory for each target
                    await sleep(1000); // Placeholder delay
                }

                // Save session
                try {
                    fs.mkdirSync('sessions', { recursive: true });
                    const newState = await context.storageState();
                    fs.writeFileSync(sessionPath, JSON.stringify(newState, null, 2));
                    log('success', 'Worker', `[${jobId}] Saved session for pincode ${pincode}`);
                } catch (e) {
                    log('warn', 'Worker', `[${jobId}] Failed to save session: ${e.message}`);
                }

                await context.close();
                await browser.close();

                // Send results to master
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

                log('success', 'Worker', `[${jobId}] Completed`);

            } catch (error) {
                log('error', 'Worker', `[${jobId}] Failed: ${error.message}`);
                process.send({
                    type: 'scrape-error',
                    jobId,
                    error: error.message
                });
            }
        }
    });

    log('success', 'Worker', `Ready to receive jobs`);
}
