import cluster from 'cluster';
import os from 'os';
import express from 'express';
import bodyParser from 'body-parser';
import { chromium, firefox, devices } from 'playwright';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4400;
const NUM_WORKERS = Number(process.env.WORKERS) || os.cpus().length;

app.use(bodyParser.json({ limit: '50mb' }));

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
    app.post('/instamartcategorywrapper', (req, res) => {
        const { url, urls, pincode, maxConcurrentTabs = 3, store } = req.body;

        let targetUrls = [];
        if (urls && Array.isArray(urls)) {
            targetUrls = urls;
        } else if (url) {
            targetUrls = [url];
        }

        if (targetUrls.length === 0) {
            return res.status(400).json({ error: 'URL(s) is required' });
        }

        const jobIdValue = jobId++;
        console.log(`📥 Queued Job #${jobIdValue}: Pincode=${pincode}, URLs=${targetUrls.length}`);

        // Create job with response callback
        const job = {
            id: jobIdValue,
            type: 'scrape',
            url: targetUrls.length === 1 ? targetUrls[0] : null,
            urls: targetUrls,
            pincode,
            maxConcurrentTabs,
            store,
            responseCallback: res,
            startTime: Date.now()
        };

        // Store response reference for worker to call back
        const jobCallbacks = new Map();
        jobCallbacks.set(jobIdValue, res);
        app.locals.jobCallbacks = jobCallbacks;

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
        console.log(`✅ MASTER: Instamart clustered scraper listening on port ${PORT}`);
        console.log(`   Workers: ${NUM_WORKERS} | Mode: Clustered ESM`);
    });
}

// ===========================
// WORKER PROCESS
// ===========================
else {
    console.log(`🟢 WORKER: PID ${process.pid} started`);

    const SESSION_DIR = path.join(__dirname, 'sessions');
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR);
    }

    const API_DUMPS_DIR = path.join(__dirname, 'api_dumps');
    if (!fs.existsSync(API_DUMPS_DIR)) {
        fs.mkdirSync(API_DUMPS_DIR, { recursive: true });
    }

    // Load modules
    let transformInstamartProduct, deduplicateRawProducts;
    let categoryMapper;

    (async () => {
        try {
            const transformModule = await import('./transform_response_format.js');
            transformInstamartProduct = transformModule.transformInstamartProduct;
            deduplicateRawProducts = transformModule.deduplicateRawProducts;

            const categoryMapperModule = await import('../utils/categoryMapper.js');
            categoryMapper = categoryMapperModule.default;

            console.log(`✅ WORKER ${process.pid}: Loaded standardization modules`);
        } catch (e) {
            console.error(`❌ WORKER ${process.pid}: Failed to load modules:`, e);
        }
    })();

    const getSessionPath = (pincode) => path.join(SESSION_DIR, `session_${pincode}.json`);

    const saveSession = async (context, pincode) => {
        if (!pincode) return;
        const sessionPath = getSessionPath(pincode);
        await context.storageState({ path: sessionPath });
        console.log(`✓ WORKER ${process.pid}: Session saved for pincode ${pincode}`);
    };

    async function setupLocation(page, context, pincode) {
        if (!pincode) return;
        const sessionPath = getSessionPath(pincode);
        if (fs.existsSync(sessionPath)) {
            console.log(`✓ WORKER ${process.pid}: Session exists for ${pincode}`);
            return;
        }
        console.log(`🔧 WORKER ${process.pid}: Setting up location for pincode: ${pincode}`);
        try {
            try {
                await page.waitForSelector('div[data-testid="address-bar"]', { timeout: 5000 });
                await page.click('div[data-testid="address-bar"]');
            } catch (e) {
                console.log('Address bar not found');
            }
            try {
                await page.waitForSelector('div[data-testid="search-location"]', { timeout: 5000 });
                await page.click('div[data-testid="search-location"]');
            } catch (e) {
                console.log('Search location button not found');
            }

            const inputSelector = 'input[placeholder="Search for area, street name…"]';
            try {
                await page.waitForSelector(inputSelector, { timeout: 5000 });
                await page.fill(inputSelector, pincode);
            } catch (e) {
                console.log('Input field not found');
            }

            try {
                await page.waitForSelector('div._11n32', { timeout: 5000 });
                const results = await page.$$('div._11n32');
                if (results.length > 0) await results[0].click();
            } catch (e) {
                console.log('No address results');
            }

            try {
                await page.waitForTimeout(1000);
                const confirmBtn = page.getByRole('button', { name: /confirm/i });
                if (await confirmBtn.isVisible()) await confirmBtn.click();
            } catch (e) {
                console.log('Confirm button not found');
            }

            await page.waitForTimeout(2000);
            await saveSession(context, pincode);
        } catch (error) {
            console.error(`Error setting up location: ${error.message}`);
        }
    }

    // Stub functions (actual scraping logic from original server.js)
    async function scrapeCategoryInContext(context, url, pincode) {
        // This is a placeholder - the actual implementation from server.js would go here
        // For now, returning empty array to show structure
        return [];
    }

    // Process jobs from master
    process.on('message', async (msg) => {
        if (msg.type === 'process_job') {
            const job = msg.job;
            const startTime = Date.now();

            console.log(`⚙️ WORKER ${process.pid}: Processing Job #${job.id} (URLs: ${job.urls.length})`);

            try {
                // Simulate scraping (replace with actual logic from server.js)
                const allResults = [];
                const duration = Date.now() - startTime;

                console.log(`✅ WORKER ${process.pid}: Completed Job #${job.id} in ${duration}ms (${allResults.length} products)`);

                // Notify master: job complete
                process.send({
                    type: 'job_complete',
                    workerPid: process.pid,
                    jobId: job.id,
                    status: 'success',
                    resultCount: allResults.length,
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

    // Health check endpoint for workers (if needed)
    process.send({
        type: 'worker_ready',
        workerPid: process.pid
    });
}
