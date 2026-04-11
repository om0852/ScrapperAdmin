const express = require('express');
const cluster = require('cluster');
const os = require('os');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { scrapeMultiple, setupSession } = require('./scraper_service');

const app = express();
const PORT = process.env.PORT || 5500;
const NUM_WORKERS = process.env.WORKERS || os.cpus().length;

app.use(bodyParser.json());

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

    // Handle scraping jobs from master
    process.on('message', async (msg) => {
        if (msg.type === 'scrape-job' || msg.type === 'scrape-job-async') {
            const { jobId, payload } = msg;
            const { url, urls, pincode, store, maxConcurrentTabs = 3, headless = true } = payload;

            const targetUrls = urls || [url];
            log('info', 'Worker', `[${jobId}] Starting scrape for pincode ${pincode} with ${targetUrls.length} URLs`);

            try {
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

    log('success', 'Worker', `Ready to receive jobs`);
}
