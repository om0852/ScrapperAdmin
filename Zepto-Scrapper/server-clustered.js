import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { transformZeptoProduct, deduplicateRawProducts } from './transform_response_format.js';
import { loadCategoryMappings, enrichProductWithCategoryMapping } from '../enrich_categories.js';
import { fileURLToPath } from 'url';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4089;
const NUM_WORKERS = Number(process.env.WORKERS) || os.cpus().length;

// Load mappings once at startup
const CATEGORY_MAPPINGS = loadCategoryMappings(path.join(__dirname, '..', 'categories_with_urls.json'));

// Load storage states if available
let STORAGE_MAP = {};
try {
    const storageData = fs.readFileSync(path.join(__dirname, 'pincodes_storage_map.json'), 'utf8');
    STORAGE_MAP = JSON.parse(storageData);
    console.log(`✅ Loaded storage states for pincodes: ${Object.keys(STORAGE_MAP).join(', ')}`);
} catch (e) {
    console.warn('⚠️ Could not load pincodes_storage_map.json. Storage optimization will be disabled.');
}

const ZEPTO_BASE_ORIGIN = 'https://www.zepto.com';
const ZEPTO_CDN_ORIGIN = 'https://cdn.zeptonow.com/production/';

// ===========================
// MASTER PROCESS
// ===========================
if (cluster.isPrimary) {
    console.log(`🔴 MASTER: PID ${process.pid} - Starting with ${NUM_WORKERS} workers on port ${PORT}`);

    // Job queue & worker management
    const jobQueue = [];
    const workers = [];
    let nextWorkerIndex = 0;
    let jobId = 0;

    // Fork workers
    for (let i = 0; i < NUM_WORKERS; i++) {
        const worker = cluster.fork();
        workers.push({
            id: worker.process.pid,
            worker,
            busy: false,
            jobsProcessed: 0
        });

        // Listen for job completion
        worker.on('message', (msg) => {
            if (msg.type === 'job_complete') {
                const workerInfo = workers.find(w => w.id === msg.workerPid);
                if (workerInfo) {
                    workerInfo.busy = false;
                    workerInfo.jobsProcessed++;
                }
                processNextJob();
            }
        });

        worker.on('disconnect', () => {
            console.warn(`⚠️ Worker ${worker.process.pid} disconnected. Restarting...`);
            const idx = workers.findIndex(w => w.id === worker.process.pid);
            if (idx !== -1) workers.splice(idx, 1);
            const newWorker = cluster.fork();
            workers.splice(idx, 0, {
                id: newWorker.process.pid,
                worker: newWorker,
                busy: false,
                jobsProcessed: 0
            });
            newWorker.on('message', (msg) => {
                if (msg.type === 'job_complete') {
                    const wi = workers.find(w => w.id === msg.workerPid);
                    if (wi) {
                        wi.busy = false;
                        wi.jobsProcessed++;
                    }
                    processNextJob();
                }
            });
        });
    }

    // Process jobs from queue with round-robin
    function processNextJob() {
        if (jobQueue.length === 0) return;

        // Find next available worker
        let attempts = 0;
        while (attempts < workers.length) {
            const worker = workers[nextWorkerIndex % workers.length];
            nextWorkerIndex++;
            attempts++;

            if (!worker.busy) {
                const job = jobQueue.shift();
                worker.busy = true;
                worker.worker.send({
                    type: 'process_job',
                    job: job
                });
                console.log(`📤 Assigned Job #${job.id} to Worker ${worker.id} (Queue: ${jobQueue.length})`);
                return;
            }
        }

        // All workers busy, job stays in queue
        console.log(`⏳ All workers busy. Waiting... (Queue: ${jobQueue.length})`);
    }

    // Express server
    app.post('/zeptocategoryscrapper', (req, res) => {
        const {
            pincode = '411001',
            categories = [],
            urls = [],
            scrollCount = null,
            maxProductsPerSearch = 100,
            maxConcurrentTabs = 3,
            headless = true,
            navigationTimeout = 60000,
            proxyUrl = null,
            store = false
        } = req.body;

        // Normalize input
        let targetCategories = [...categories];
        if (urls && Array.isArray(urls) && urls.length > 0) {
            urls.forEach(u => {
                targetCategories.push({
                    name: 'Unknown Category',
                    url: u
                });
            });
        }

        if (targetCategories.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No categories or urls provided',
                message: 'Please provide `urls` array or `categories` array'
            });
        }

        const jobIdValue = jobId++;
        console.log(`📥 Queued Job #${jobIdValue}: Pincode=${pincode}, Categories=${targetCategories.length}`);

        const job = {
            id: jobIdValue,
            type: 'scrape',
            pincode,
            categories: targetCategories,
            scrollCount,
            maxProductsPerSearch,
            maxConcurrentTabs,
            headless,
            navigationTimeout,
            proxyUrl,
            store,
            responseCallback: res,
            startTime: Date.now()
        };

        jobQueue.push(job);
        processNextJob();
    });

    app.get('/health', (req, res) => {
        const busyWorkers = workers.filter(w => w.busy).length;
        res.json({
            status: 'healthy',
            master_pid: process.pid,
            workers: {
                total: workers.length,
                busy: busyWorkers,
                idle: workers.length - busyWorkers
            },
            queue_length: jobQueue.length,
            workers_stats: workers.map(w => ({
                pid: w.id,
                busy: w.busy,
                jobs_processed: w.jobsProcessed
            }))
        });
    });

    app.get('/status', (req, res) => {
        res.json({
            mode: 'clustered',
            master_pid: process.pid,
            num_workers: workers.length,
            queue_length: jobQueue.length,
            active_workers: workers.filter(w => w.busy).length,
            total_jobs_queued: jobIdValue
        });
    });

    createServer(app).listen(PORT, () => {
        console.log(`✅ MASTER: Zepto clustered scraper listening on port ${PORT}`);
        console.log(`   Workers: ${NUM_WORKERS} | Mode: Clustered ESM`);
    });
}

// ===========================
// WORKER PROCESS
// ===========================
else {
    console.log(`🟢 WORKER: PID ${process.pid} started`);

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const SELECTORS = {
        locationButton: [
            '[data-testid="user-address"]',
            'button:has([data-testid="user-address"])',
            'button[aria-label="Select Location"]',
            'button.__4y7HY',
            'div.a0Ppr button'
        ],
        locationModal: 'div[data-testid="address-modal"]',
        searchInput: 'div[data-testid="address-search-input"] input[type="text"]',
        searchResultItem: 'div[data-testid="address-search-item"]',
        productLink: 'a.B4vNQ',
        productCard: 'div.cTH4Df',
        productName: [
            'div[data-slot-id="ProductName"] span',
            'div.cQAjo6.ch5GgP span',
            'h3',
            'h2'
        ],
        productImage: 'img',
        priceSpan: '[data-slot-id="EdlpPrice"] span, span',
        packSize: '[data-slot-id="PackSize"] span',
        rating: '[data-slot-id="RatingInformation"]',
        sponsorTag: '[data-slot-id="SponsorTag"]',
        eta: '[data-slot-id="EtaInformation"]',
        searchResultsContainer: 'div.grid',
    };

    async function setPincode(page, targetPincode) {
        try {
            console.log(`🟢 WORKER ${process.pid}: Setting location to pincode: ${targetPincode}`);

            await page.waitForLoadState('domcontentloaded');
            await delay(500);

            // Click location button
            let clicked = false;
            for (const selector of SELECTORS.locationButton) {
                try {
                    const button = page.locator(selector).first();
                    if (await button.count() > 0) {
                        await button.click({ timeout: 3000 });
                        console.log(`🟢 WORKER ${process.pid}: Clicked location button`);
                        clicked = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!clicked) {
                console.error(`🟢 WORKER ${process.pid}: Could not find location button`);
                return false;
            }
            await delay(1000);

            try {
                await page.waitForSelector(SELECTORS.locationModal, { timeout: 10000 });
                console.log(`🟢 WORKER ${process.pid}: Location modal opened`);
            } catch (e) {
                console.error(`🟢 WORKER ${process.pid}: Location modal timeout`);
                return false;
            }

            // Fill search input
            try {
                const searchInput = page.locator(SELECTORS.searchInput).first();
                if (await searchInput.count() > 0) {
                    await searchInput.fill(targetPincode, { timeout: 5000 });
                    console.log(`🟢 WORKER ${process.pid}: Filled pincode input`);
                }
            } catch (e) {
                console.error(`🟢 WORKER ${process.pid}: Could not fill search input`);
                return false;
            }

            // Wait for results and select first one
            try {
                await page.waitForSelector(SELECTORS.searchResultItem, { timeout: 5000 });
                const firstResult = page.locator(SELECTORS.searchResultItem).first();
                if (await firstResult.count() > 0) {
                    await firstResult.click({ timeout: 3000 });
                    await delay(2000);
                    console.log(`✓ WORKER ${process.pid}: Selected location`);
                    return true;
                }
            } catch (e) {
                console.error(`🟢 WORKER ${process.pid}: Could not select location from results`);
                return false;
            }

            return false;
        } catch (error) {
            console.error(`🟢 WORKER ${process.pid}: setPincode error:`, error.message);
            return false;
        }
    }

    async function scrapeZepto(pincode, categories, maxConcurrentTabs, navigationTimeout, proxyUrl, headless) {
        let browser;
        const allProducts = [];

        try {
            console.log(`🟢 WORKER ${process.pid}: Launching browser for Zepto (pincode: ${pincode})...`);

            const launchOptions = {
                headless,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-gpu',
                ],
            };

            if (proxyUrl) {
                try {
                    const parsedProxy = new URL(proxyUrl);
                    launchOptions.proxy = {
                        server: `${parsedProxy.protocol}//${parsedProxy.host}`,
                        username: parsedProxy.username,
                        password: parsedProxy.password
                    };
                } catch (e) {
                    console.error(`🟢 WORKER ${process.pid}: Invalid proxy URL`);
                }
            }

            browser = await chromium.launch(launchOptions);

            // Stub implementation - actual scraping logic from original server.js
            // For production, copy the full scraping logic from server.js
            console.log(`🟢 WORKER ${process.pid}: Browser launched. Processing ${categories.length} categories...`);
            
            await delay(1000); // Placeholder
            
            console.log(`✓ WORKER ${process.pid}: Scraping complete`);
            return allProducts;

        } catch (error) {
            console.error(`✗ WORKER ${process.pid}: scrapeZepto failed:`, error.message);
            return [];
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (e) {
                    console.error(`WORKER ${process.pid}: Error closing browser:`, e.message);
                }
            }
        }
    }

    // Process jobs from master
    process.on('message', async (msg) => {
        if (msg.type === 'process_job') {
            const job = msg.job;
            const startTime = Date.now();

            console.log(`⚙️ WORKER ${process.pid}: Processing Job #${job.id} (Pincode: ${job.pincode}, Categories: ${job.categories.length})`);

            try {
                const rawProducts = await scrapeZepto(
                    job.pincode,
                    job.categories,
                    job.maxConcurrentTabs,
                    job.navigationTimeout,
                    job.proxyUrl,
                    job.headless
                );
                const duration = Date.now() - startTime;

                console.log(`✅ WORKER ${process.pid}: Completed Job #${job.id} in ${duration}ms (${rawProducts.length} products)`);

                // Notify master: job complete
                process.send({
                    type: 'job_complete',
                    workerPid: process.pid,
                    jobId: job.id,
                    status: 'success',
                    resultCount: rawProducts.length,
                    duration
                });
            } catch (err) {
                console.error(`❌ WORKER ${process.pid}: Job #${job.id} failed:`, err.message);

                process.send({
                    type: 'job_complete',
                    workerPid: process.pid,
                    jobId: job.id,
                    status: 'error',
                    error: err.message
                });
            }
        }
    });

    process.send({
        type: 'worker_ready',
        workerPid: process.pid
    });
}
