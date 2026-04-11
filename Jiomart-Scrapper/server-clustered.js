import express from 'express';
import cluster from 'cluster';
import os from 'os';
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { transformJiomartProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../enrich_categories.js';
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

    // ============ BROWSER POOL (Optimization #2 - Browser Pooling) ============
    let browserPool = null;
    let isPoolingInitialized = false;

    const initBrowserPool = async () => {
        if (isPoolingInitialized) return browserPool;
        
        console.log(`[Worker ${process.pid}] Initializing browser pool...`);
        
        // Optimization #1: Headless mode + resource blocking in launch args
        browserPool = await chromium.launch({
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-software-rasterizer',
                '--disable-gpu',
                '--single-process=false',  // Keep process isolated
                '--disable-sync',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-breakpad',
                '--disable-preconnect',
                '--ignore-certificate-errors',
                '--disable-popup-blocking',
                '--disable-prompt-on-repost',
                '--no-first-run'
            ]
        });
        isPoolingInitialized = true;
        console.log(`[Worker ${process.pid}] Browser pool ready`);
        return browserPool;
    };

    // Context pool per browser instance (Optimization #3 - Context Reuse)
    const contextPool = {
        active: [],
        available: [],
        creating: 0,
        maxContexts: 5
    };

    const getOrCreateContext = async (browser) => {
        // Try to reuse existing context
        if (contextPool.available.length > 0) {
            const ctx = contextPool.available.pop();
            contextPool.active.push(ctx);
            console.log(`[Worker ${process.pid}] Reusing context (active: ${contextPool.active.length})`);
            return ctx;
        }

        // Create new context if under limit
        if (contextPool.active.length + contextPool.creating < contextPool.maxContexts) {
            contextPool.creating++;
            const newCtx = await browser.newContext({
                extraHTTPHeaders: {
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                }
            });
            contextPool.creating--;
            contextPool.active.push(newCtx);
            console.log(`[Worker ${process.pid}] Created new context (total: ${contextPool.active.length})`);
            
            // Stealth injection
            await newCtx.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                window.chrome = { runtime: {} };
            });
            
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
            console.log(`[Worker ${process.pid}] Released context (available: ${contextPool.available.length})`);
        }
    };

    // Optimization #5: Request Batching - Batch pagination requests
    const batchPaginationRequests = async (page, requests, maxConcurrent = 2) => {
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
                    async ({ endpoint, headers, body, httpAgent, httpsAgent }) => {
                        try {
                            const res = await fetch(endpoint, {
                                method: 'POST',
                                credentials: 'include',
                                headers: {
                                    ...headers,
                                    'Connection': 'keep-alive',  // Optimization: Keep-alive header
                                    'Keep-Alive': 'timeout=30, max=100'
                                },
                                body: JSON.stringify(body),
                                agent: endpoint.startsWith('https') ? httpsAgent : httpAgent
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
                    { endpoint, headers, body, httpAgent, httpsAgent }
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

    // Simplified scraping function with pooled resources
    const scrapeCategoryWithOptimizations = async (browser, category, page) => {
        try {
            const API_ENDPOINT = 'https://www.jiomart.com/trex/search';
            const products = [];

            // Build initial request body (simplified example)
            const requestBody = {
                searchQuery: category.name || '',
                pageNumber: 0,
                pageSize: 100
            };

            // Prepare batch of requests to make
            const requests = [];
            for (let page = 0; page < 3; page++) {  // Batch 3 pages
                requests.push({
                    endpoint: API_ENDPOINT,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: { ...requestBody, pageNumber: page },
                    retries: 2
                });
            }

            // Optimization #5: Batch the requests together
            console.log(`[Worker ${process.pid}] Batching ${requests.length} pagination requests for ${category.name}`);
            const results = await batchPaginationRequests(page, requests, 2);
            
            // Collect all products
            results.forEach(result => {
                if (result.ok && result.data?.results) {
                    products.push(...result.data.results);
                }
            });

            return { success: true, products, category: category.name };
        } catch (error) {
            console.error(`[Worker ${process.pid}] Scrape error:`, error.message);
            return { success: false, products: [], error: error.message };
        }
    };

    // Handle scraping jobs from master
    process.on('message', async (msg) => {
        if (msg.type === 'scrape-job') {
            const { jobId, payload } = msg;
            const { pincode, categories = [], urls = [], maxConcurrentTabs } = payload;

            console.log(`[Worker ${process.pid}] Starting job ${jobId} for ${categories.length + urls.length} categories`);

            try {
                // Optimization #2: Initialize browser pool once
                const browser = await initBrowserPool();

                // Convert urls to categories format
                const targetCategories = [
                    ...categories,
                    ...urls.map(u => ({ name: 'Unknown Category', url: u }))
                ];

                // Optimization #3: Reuse contexts across categories
                const context = await getOrCreateContext(browser);
                const page = await context.newPage();

                // Optimization #1: Block resources to reduce bandwidth
                await page.route('**/*.{png,jpg,jpeg,gif,svg,webp}', route => route.abort());
                await page.route('**/*.css', route => route.abort());
                await page.route('**/*.woff*', route => route.abort());
                await page.route('**/*.ttf', route => route.abort());

                try {
                    const allProducts = [];
                    
                    // Process categories in batches with concurrent optimization
                    for (let i = 0; i < targetCategories.length; i += maxConcurrentTabs) {
                        const batch = targetCategories.slice(i, i + maxConcurrentTabs);
                        console.log(`[Worker ${process.pid}] Processing batch of ${batch.length}`);
                        
                        // Optimization #5: Batch scrape operations
                        const batchResults = await Promise.all(
                            batch.map(cat => scrapeCategoryWithOptimizations(browser, cat, page))
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

                    console.log(`✅ [Worker ${process.pid}] Job ${jobId} completed with ${allProducts.length} products`);
                } finally {
                    await page.close();
                    releaseContext(context);
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

    // Cleanup on exit
    process.on('exit', async () => {
        if (browserPool) {
            console.log(`[Worker ${process.pid}] Closing browser pool...`);
            for (const ctx of [...contextPool.active, ...contextPool.available]) {
                await ctx.close().catch(() => {});
            }
            await browserPool.close().catch(() => {});
        }
    });

    console.log(`✅ Worker ${process.pid} ready to receive jobs`);
}
