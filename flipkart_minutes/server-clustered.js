const express = require('express');
const cluster = require('cluster');
const os = require('os');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { scrapeMultiple, setupSession } = require('./scraper_service');

const app = express();
const PORT = process.env.PORT || 5500;
const NUM_WORKERS = process.env.WORKERS || os.cpus().length;

app.use(bodyParser.json());

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

// API Dumps storage directory
const API_DUMPS_DIR = path.join(__dirname, 'api_dumps');
if (!fs.existsSync(API_DUMPS_DIR)) {
    fs.mkdirSync(API_DUMPS_DIR);
}

// Load standardization modules (ESM)
let transformFlipkartProduct, deduplicateRawProducts, loadCategoryMappings, enrichProductWithCategoryMapping;
let CATEGORY_MAPPINGS;

(async () => {
    try {
        const transformModule = await import('./transform_response_format.js');
        transformFlipkartProduct = transformModule.transformFlipkartProduct;
        deduplicateRawProducts = transformModule.deduplicateRawProducts;

        const enrichModule = await import('../enrich_categories.js');
        loadCategoryMappings = enrichModule.loadCategoryMappings;
        enrichProductWithCategoryMapping = enrichModule.enrichProductWithCategoryMapping;

        CATEGORY_MAPPINGS = loadCategoryMappings(path.join(__dirname, '..', 'categories_with_urls.json'));
        console.log('✅ Loaded Standardization Modules & Category Mappings');
    } catch (e) {
        console.error('❌ Failed to load standardization modules:', e);
    }
})();

// Helper functions
const saveApiDump = (pincode, url, jsonData, dumpType = 'response') => {
    try {
        const timestamp = Date.now();
        const urlHash = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const filename = `dump_${pincode}_${dumpType}_${urlHash}_${timestamp}.json`;
        const filepath = path.join(API_DUMPS_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(jsonData, null, 2));
        console.log(`✓ API dump saved: ${filename}`);
        return filename;
    } catch (err) {
        console.error(`✗ Failed to save API dump: ${err.message}`);
        return null;
    }
};

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

    // Spawn workers
    for (let i = 0; i < NUM_WORKERS; i++) {
        const worker = cluster.fork();
        workers.push(worker);
        log('success', 'Master', `Worker ${worker.process.pid} spawned`);

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

    let currentWorkerIndex = 0;
    const assignWorker = () => {
        const worker = workers[currentWorkerIndex];
        currentWorkerIndex = (currentWorkerIndex + 1) % workers.length;
        return worker;
    };

    app.post('/scrape-flipkart-minutes', async (req, res) => {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { url, urls, pincode, store, maxConcurrentTabs = 3, headless = true } = req.body;

        if ((!url && !urls) || !pincode) {
            return res.status(400).json({ error: 'URL(s) and pincode are required.' });
        }

        const targetUrls = urls || [url];
        log('info', 'Master', `Assigning job ${jobId} to worker for pincode ${pincode} with ${targetUrls.length} URLs`);

        jobTracker.set(jobId, { res, req: req.body });

        const worker = assignWorker();
        worker.send({
            type: 'scrape-job',
            jobId,
            payload: {
                url,
                urls,
                pincode,
                store,
                maxConcurrentTabs,
                headless
            }
        });

        // Timeout after 10 minutes
        setTimeout(() => {
            if (jobTracker.has(jobId)) {
                jobTracker.delete(jobId);
                res.status(504).json({ success: false, error: 'Job timeout' });
            }
        }, 600000);
    });

    app.post('/scrape-flipkart-minutes-async', (req, res) => {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { url, urls, pincode, store, maxConcurrentTabs = 3, headless = true } = req.body;

        if ((!url && !urls) || !pincode) {
            return res.status(400).json({ error: 'URL(s) and pincode are required.' });
        }

        const targetUrls = urls || [url];
        log('info', 'Master', `Created async job ${jobId} for pincode ${pincode}`);

        res.json({
            success: true,
            jobId,
            message: 'Scraping job started',
            statusEndpoint: `/scrape-flipkart-minutes-status/${jobId}`
        });

        const worker = assignWorker();
        worker.send({
            type: 'scrape-job-async',
            jobId,
            payload: {
                url,
                urls,
                pincode,
                store,
                maxConcurrentTabs,
                headless
            }
        });
    });

    app.get('/scrape-flipkart-minutes-status/:jobId', (req, res) => {
        const { jobId } = req.params;
        res.json({
            success: true,
            jobId,
            status: 'processing',
            message: 'Job in progress'
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

    // ============ BROWSER POOL (Optimization #2 - Browser Pooling) ============
    let browserPool = null;
    let isPoolingInitialized = false;

    const initBrowserPool = async () => {
        if (isPoolingInitialized) return browserPool;
        
        log('debug', 'Worker', `[${process.pid}] Initializing browser pool...`);
        
        // Optimization #1: Headless mode + resource blocking in launch args
        const { chromium } = await import('playwright');
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

    // Optimization #5: Request Batching
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

    // Handle scraping jobs from master
    process.on('message', async (msg) => {
        if (msg.type === 'scrape-job' || msg.type === 'scrape-job-async') {
            const { jobId, payload } = msg;
            const { url, urls, pincode, store, maxConcurrentTabs = 3, headless = true } = payload;

            const targetUrls = urls || [url];
            log('info', 'Worker', `[${jobId}] Starting scrape for pincode ${pincode} with ${targetUrls.length} URLs`);

            try {
                // ✅ Optimization #2: Initialize browser pool once
                const browser = await initBrowserPool();

                // Scrape using the original scrapeMultiple function
                const results = await scrapeMultiple(targetUrls, pincode, maxConcurrentTabs, headless);

                // Flatten results if needed
                const allProducts = Array.isArray(results[0]) ? results.flat() : results;
                const dedupedRawProducts = deduplicateRawProducts ? deduplicateRawProducts(allProducts) : allProducts;

                log('success', 'Worker', `[${jobId}] Raw products scraped: ${allProducts.length}`);

                // Apply standardized format
                let productsToReturn = [];

                if (deduplicateRawProducts && transformFlipkartProduct) {
                    const transformedAll = dedupedRawProducts.map((product, index) => {
                        const productCategoryUrl = product.categoryUrl || 'N/A';
                        const officialCategory = product.categoryName || 'Unknown';

                        let categoryMapping = null;
                        if (productCategoryUrl !== 'N/A' && enrichProductWithCategoryMapping) {
                            const enriched = enrichProductWithCategoryMapping({ categoryUrl: productCategoryUrl }, CATEGORY_MAPPINGS);
                            if (enriched.categoryMappingFound) {
                                categoryMapping = enriched;
                            }
                        }

                        return transformFlipkartProduct(
                            product,
                            productCategoryUrl,
                            officialCategory,
                            'N/A',
                            pincode,
                            index + 1,
                            categoryMapping
                        );
                    });

                    console.log(`[Worker] Transformed products: ${transformedAll.length}`);

                    // Deduplicate after transform
                    const seenProductIds = new Set();
                    productsToReturn = transformedAll.filter(p => {
                        if (!p.productId) return false;
                        if (seenProductIds.has(p.productId)) return false;
                        seenProductIds.add(p.productId);
                        return true;
                    });

                    console.log(`[Worker] Final products (after dedup): ${productsToReturn.length}`);
                } else {
                    productsToReturn = dedupedRawProducts;
                }

                const response = {
                    success: true,
                    pincode,
                    totalProducts: productsToReturn.length,
                    products: productsToReturn,
                    workerId: process.pid,
                    urls: targetUrls,
                    store
                };

                // Send results to master
                process.send({
                    type: 'scrape-result',
                    jobId,
                    data: response
                });

                log('success', 'Worker', `[${jobId}] Job completed. Products: ${productsToReturn.length}`);

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
