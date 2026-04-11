import express from 'express';
import cluster from 'cluster';
import os from 'os';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { transformDMartProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../Blinkit-Scrapper/enrich_categories.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4199;
const NUM_WORKERS = process.env.WORKERS || os.cpus().length;

// Load mappings
const CATEGORY_MAPPINGS = loadCategoryMappings(path.join(__dirname, '..', 'categories_with_urls.json'));

// Pincode → Store ID mapping
const PINCODE_STORE_MAP = {
    "400706": "10718",
    "400703": "10718",
    "401101": "10706",
    "401202": "10706",
    "400070": "10734",
};

// Helper functions
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = (type, prefix, message) => {
    const timestamp = new Date().toLocaleTimeString();
    let emoji = '';
    switch (type) {
        case 'info': emoji = 'ℹ️'; break;
        case 'success': emoji = '✅'; break;
        case 'warn': emoji = '⚠️'; break;
        case 'error': emoji = '❌'; break;
        case 'start': emoji = '🚀'; break;
    }
    console.log(`[${timestamp}] [${prefix}] ${emoji} ${message}`);
};

function getSlugFromUrl(url) {
    const match = url.match(/\/category\/([^\/]+)/);
    return match ? match[1] : null;
}

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
    app.use(express.json());

    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'ok',
            mode: 'clustered',
            workers: NUM_WORKERS,
            timestamp: new Date().toISOString()
        });
    });

    app.get('/status', (req, res) => {
        res.json({
            status: 'ok',
            mode: 'clustered',
            workers_active: workers.filter(w => !w.isDead()).length,
            workers_total: NUM_WORKERS
        });
    });

    let currentWorkerIndex = 0;
    const assignWorker = () => {
        const worker = workers[currentWorkerIndex];
        currentWorkerIndex = (currentWorkerIndex + 1) % workers.length;
        return worker;
    };

    app.post('/dmartcategoryscrapper', async (req, res) => {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { pincode, url, urls, store, maxConcurrentTabs = 1 } = req.body;

        if (!pincode || (!url && !urls)) {
            return res.status(400).json({ error: 'Pincode and URL(s) are required.' });
        }

        const targetUrls = urls || (url ? [url] : []);
        log('info', 'Master', `Assigning job ${jobId} to worker for pincode ${pincode} with ${targetUrls.length} URLs`);

        jobTracker.set(jobId, { res, req: req.body });

        const worker = assignWorker();
        worker.send({
            type: 'scrape-job',
            jobId,
            payload: {
                pincode,
                url,
                urls,
                store,
                maxConcurrentTabs
            }
        });

        // Timeout after 15 minutes (DMart can be slow)
        setTimeout(() => {
            if (jobTracker.has(jobId)) {
                jobTracker.delete(jobId);
                res.status(504).json({ success: false, error: 'Job timeout' });
            }
        }, 900000);
    });

    app.post('/dmartcategoryscrapper-async', (req, res) => {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { pincode, url, urls, store, maxConcurrentTabs = 1 } = req.body;

        if (!pincode || (!url && !urls)) {
            return res.status(400).json({ error: 'Pincode and URL(s) are required.' });
        }

        const targetUrls = urls || (url ? [url] : []);
        log('info', 'Master', `Created async job ${jobId} for pincode ${pincode}`);

        res.json({
            success: true,
            jobId,
            message: 'Scraping job started',
            statusEndpoint: `/dmartcategoryscrapper-status/${jobId}`
        });

        const worker = assignWorker();
        worker.send({
            type: 'scrape-job-async',
            jobId,
            payload: {
                pincode,
                url,
                urls,
                store,
                maxConcurrentTabs
            }
        });
    });

    app.get('/dmartcategoryscrapper-status/:jobId', (req, res) => {
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

    // Handle scraping jobs from master
    process.on('message', async (msg) => {
        if (msg.type === 'scrape-job' || msg.type === 'scrape-job-async') {
            const { jobId, payload } = msg;
            const { pincode, url, urls, store, maxConcurrentTabs = 1 } = payload;

            const targetUrls = urls || (url ? [url] : []);
            log('info', 'Worker', `[${jobId}] Starting scrape for pincode ${pincode} with ${targetUrls.length} URLs`);

            try {
                // Call scrapeDMart (simplified - actual implementation should use full scrapeD                Mart function)
                const allProducts = [];
                let browser;

                try {
                    browser = await chromium.launch({
                        headless: true,
                        args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
                    });

                    const context = await browser.newContext({ viewport: null });
                    const page = await context.newPage();

                    await page.goto("https://www.dmart.in/", { waitUntil: "domcontentloaded", timeout: 60000 });
                    await sleep(3000);

                    // Handle Pincode Dialog
                    try {
                        const pincodeInput = await page.$("#pincodeInput");
                        if (pincodeInput) {
                            await pincodeInput.fill(pincode);
                            await sleep(1500);

                            const firstResult = await page.$("ul.list-none > li:first-child > button");
                            if (firstResult) {
                                await firstResult.click();
                                await sleep(2000);

                                try {
                                    const confirmBtn = await page.$("button:has-text('START SHOPPING'), button:has-text('Start Shopping')");
                                    if (confirmBtn) {
                                        await confirmBtn.click();
                                        await sleep(3000);
                                    }
                                } catch (e) { /* confirm button optional */ }
                            }
                        }
                    } catch (e) {
                        console.error("Error handling pincode dialog:", e.message);
                    }

                    // Resolve Store ID
                    let STORE_ID = PINCODE_STORE_MAP[pincode] || "10706";
                    log('info', 'Worker', `[${jobId}] Using Store ID: ${STORE_ID}`);

                    try {
                        const Cookies = await context.cookies();
                        const dmStoreId = Cookies.find((c) => c.name === "dm_store_id");
                        if (dmStoreId && !PINCODE_STORE_MAP[pincode]) {
                            STORE_ID = dmStoreId.value;
                        }
                    } catch (e) { /* ignore */ }

                    // Scrape URLs
                    for (const urlItem of targetUrls) {
                        const urlStr = typeof urlItem === 'string' ? urlItem : urlItem.url;
                        const slug = getSlugFromUrl(urlStr);
                        if (!slug) {
                            log('warn', 'Worker', `[${jobId}] Invalid URL, skipping: ${urlStr}`);
                            continue;
                        }

                        try {
                            log('info', 'Worker', `[${jobId}] Scraping: ${slug}`);
                            
                            // Scrape category page (simplified)
                            await page.goto(urlStr, { waitUntil: "domcontentloaded", timeout: 60000 });
                            await sleep(2000);

                            // In production, use full scrapeDMart logic here
                            // For now, this is a placeholder
                        } catch (e) {
                            log('warn', 'Worker', `[${jobId}] Error scraping ${slug}: ${e.message}`);
                        }
                    }

                    await context.close();
                } finally {
                    if (browser) await browser.close();
                }

                // Apply standardized format
                let productsToReturn = [];
                if (deduplicateRawProducts && transformDMartProduct) {
                    const transformedAll = allProducts.map((product, index) => {
                        const productCategoryUrl = product.categoryUrl || 'N/A';
                        const officialCategory = product.categoryName || 'Unknown';

                        let categoryMapping = null;
                        if (productCategoryUrl !== 'N/A' && enrichProductWithCategoryMapping) {
                            const enriched = enrichProductWithCategoryMapping({ categoryUrl: productCategoryUrl }, CATEGORY_MAPPINGS);
                            if (enriched.categoryMappingFound) {
                                categoryMapping = enriched;
                            }
                        }

                        return transformDMartProduct(
                            product,
                            productCategoryUrl,
                            officialCategory,
                            'N/A',
                            pincode,
                            index + 1,
                            categoryMapping
                        );
                    });

                    const seenProductIds = new Set();
                    productsToReturn = transformedAll.filter(p => {
                        if (!p.productId) return false;
                        if (seenProductIds.has(p.productId)) return false;
                        seenProductIds.add(p.productId);
                        return true;
                    });
                } else {
                    productsToReturn = allProducts;
                }

                const response = {
                    success: true,
                    pincode,
                    totalProducts: productsToReturn.length,
                    products: productsToReturn,
                    workerId: process.pid,
                    store
                };

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

    log('success', 'Worker', `Ready to receive jobs`);
}
