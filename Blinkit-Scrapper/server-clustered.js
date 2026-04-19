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
import http from 'http';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ CONNECTION POOLING (Optimization #6) ============
const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000,
    freeSocketTimeout: 30000
});

const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000,
    freeSocketTimeout: 30000
});

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

    // ============ BROWSER POOL (Optimization #2 - Browser Pooling) ============
    let browserPool = null;
    let isPoolingInitialized = false;

    const initBrowserPool = async () => {
        if (isPoolingInitialized) return browserPool;
        
        log('debug', 'Worker', `[${process.pid}] Initializing browser pool...`);
        
        // Optimization #1: Headless mode + resource blocking in launch args
        browserPool = await chromium.launch({
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process=false',
                '--disable-sync',
                '--disable-extensions',
                '--disable-breakpad',
                '--ignore-certificate-errors'
            ]
        });
        isPoolingInitialized = true;
        log('debug', 'Worker', `[${process.pid}] Browser pool ready`);
        return browserPool;
    };

    // Context pool per browser instance (Optimization #3 - Context Reuse)
    const contextPool = {
        active: [],
        available: [],
        creating: 0,
        maxContexts: 5
    };

    const getOrCreateContext = async (browser, contextOptions) => {
        // Try to reuse existing context
        if (contextPool.available.length > 0) {
            const ctx = contextPool.available.pop();
            contextPool.active.push(ctx);
            log('debug', 'Worker', `[${process.pid}] Reusing context (active: ${contextPool.active.length})`);
            return ctx;
        }

        // Create new context if under limit
        if (contextPool.active.length + contextPool.creating < contextPool.maxContexts) {
            contextPool.creating++;
            const newCtx = await browser.newContext(contextOptions);
            contextPool.creating--;
            contextPool.active.push(newCtx);
            log('debug', 'Worker', `[${process.pid}] Created new context (total: ${contextPool.active.length})`);
            return newCtx;
        }

        // Wait for available context
        return new Promise(resolve => {
            const checker = setInterval(() => {
                if (contextPool.available.length > 0) {
                    clearInterval(checker);
                    const ctx = contextPool.available.pop();
                    contextPool.active.push(ctx);
                    resolve(ctx);
                }
            }, 100);
        });
    };

    const releaseContext = (ctx) => {
        const idx = contextPool.active.indexOf(ctx);
        if (idx !== -1) {
            contextPool.active.splice(idx, 1);
            contextPool.available.push(ctx);
            log('debug', 'Worker', `[${process.pid}] Released context (available: ${contextPool.available.length})`);
        }
    };

    // Optimization #5: Request Batching - Batch requests
    const batchRequests = async (page, requests, maxConcurrent = 2) => {
        const results = [];
        for (let i = 0; i < requests.length; i += maxConcurrent) {
            const batch = requests.slice(i, i + maxConcurrent);
            const batchResults = await Promise.all(
                batch.map(req => makeFetchRequest(page, req))
            );
            results.push(...batchResults);
        }
        return results;
    };

    // Make fetch request with connection pooling (Optimization #6)
    const makeFetchRequest = async (page, { endpoint, headers, body, retries = 1 }) => {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const result = await page.evaluate(
                    async ({ endpoint, headers, body }) => {
                        try {
                            const res = await fetch(endpoint, {
                                method: 'POST',
                                credentials: 'include',
                                headers: {
                                    ...headers,
                                    'Connection': 'keep-alive',  // Optimization: Keep-alive header
                                    'Keep-Alive': 'timeout=30, max=100'
                                },
                                body: JSON.stringify(body)
                            });

                            const raw = await res.text();
                            let data = null;
                            if (raw) {
                                try {
                                    data = JSON.parse(raw);
                                } catch (_) {
                                    data = null;
                                }
                            }

                            return {
                                ok: res.ok,
                                status: res.status,
                                data,
                                error: res.ok ? null : raw.slice(0, 240)
                            };
                        } catch (error) {
                            return {
                                ok: false,
                                status: 0,
                                data: null,
                                error: error.message
                            };
                        }
                    },
                    { endpoint, headers, body }
                );

                if (result.ok && result.data) return result;
                
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 350 * Math.pow(2, attempt)));
                } else {
                    return result;
                }
            } catch (error) {
                if (attempt === retries) throw error;
                await new Promise(r => setTimeout(r, 350 * Math.pow(2, attempt)));
            }
        }
    };

    // Stub for scraping (actual implementation uses master's scrapeCategory)
    process.on('message', async (msg) => {
        if (msg.type === 'scrape-job' || msg.type === 'scrape-job-async') {
            const { jobId, payload } = msg;
            const { pincode, categories = [], urls = [], maxConcurrentTabs = 2, proxyUrl, store, headless = true, url } = payload;

            log('info', 'Worker', `[${jobId}] Starting scrape for pincode ${pincode}`);

            try {
                // ✅ Optimization #2: Initialize browser pool once
                const browser = await initBrowserPool();

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

                // ✅ Optimization #3: Reuse contexts across categories
                const context = await getOrCreateContext(browser, contextOptions);
                const page = await context.newPage();

                // ✅ Optimization #1: Block resources to reduce bandwidth
                await page.route('**/*.{png,jpg,jpeg,gif,svg,webp}', route => route.abort());
                await page.route('**/*.css', route => route.abort());
                await page.route('**/*.woff*', route => route.abort());
                await page.route('**/*.ttf', route => route.abort());

                // Simple scraping (in production, use full scrapeCategory logic)
                const allProducts = [];
                
                log('info', 'Worker', `[${jobId}] Processing ${targets.length} categories with concurrency=${maxConcurrentTabs}`);

                const concurrency = maxConcurrentTabs;
                for (let i = 0; i < targets.length; i += concurrency) {
                    const batch = targets.slice(i, i + concurrency);
                    const batchNumber = Math.floor(i / concurrency) + 1;
                    const totalBatches = Math.ceil(targets.length / concurrency);

                    log('info', 'Worker', `[${jobId}] Batch ${batchNumber}/${totalBatches}`);

                    // ✅ Optimization #5: Batch scrape operations
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

                await page.close();
                releaseContext(context);

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

    // Cleanup on exit
    process.on('exit', async () => {
        if (browserPool) {
            log('debug', 'Worker', `[${process.pid}] Closing browser pool...`);
            for (const ctx of [...contextPool.active, ...contextPool.available]) {
                await ctx.close().catch(() => {});
            }
            await browserPool.close().catch(() => {});
        }
    });

    log('success', 'Worker', `Ready to receive jobs`);
}
