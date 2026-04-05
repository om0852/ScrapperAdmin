import express from 'express';
import processScrapedDataOptimized from '../controllers/dataControllerOptimized.js';
import {
    ingestFilePayload,
    ingestJsonFile,
    ingestDirectory,
    getReadyFiles,
    startIngestJsonFileJob,
    getIngestJobStatus
} from '../utils/manualIngest.js';

const router = express.Router();

router.post('/ingest', async (req, res) => {
    try {
        const { pincode, platform, category, products, dateOverride } = req.body;

        if (!pincode || !platform || !category || !products || !Array.isArray(products)) {
            return res.status(400).json({ error: 'Missing required fields or invalid products array' });
        }

        // ✅ Use optimized controller with Redis caching & bulk operations
        const result = await processScrapedDataOptimized({ pincode, platform, category, products, dateOverride });
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in /ingest route:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Manual ingestion from file
 * POST /api/data/ingest-file
 * Body: { filePath: '/path/to/file.json', platform?: 'blinkit', pincode?: '110001', dateOverride?: '2026-03-25T10:00:00Z' }
 */
router.post('/ingest-file', async (req, res) => {
    try {
        const { filePath, platform, pincode, dateOverride } = req.body;

        if (!filePath) {
            return res.status(400).json({ error: 'filePath is required' });
        }

        console.log(`\n📂 Manual ingestion request for: ${filePath}`);
        if (dateOverride) {
            console.log(`⏰ Date override: ${dateOverride}`);
        }
        const result = await ingestJsonFile(filePath, pincode, platform, false, dateOverride);

        if (!result.success) {
            return res.status(500).json({ error: result.error, file: result.file });
        }

        res.status(200).json(result);
    } catch (error) {
        console.error('Error in /ingest-file route:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Manual ingestion job from file with progress tracking
 * POST /api/data/ingest-file-job
 * Body: { filePath: '/path/to/file.json', platform?: 'blinkit', pincode?: '110001', dateOverride?: '2026-03-25T10:00:00Z', batchSize?: 250 }
 */
router.post('/ingest-file-job', async (req, res) => {
    try {
        const { filePath, platform, pincode, dateOverride, batchSize } = req.body;

        if (!filePath) {
            return res.status(400).json({ error: 'filePath is required' });
        }

        console.log(`\n📂 Manual ingestion job request for: ${filePath}`);
        if (dateOverride) {
            console.log(`⏰ Date override: ${dateOverride}`);
        }

        const job = startIngestJsonFileJob({
            filePath,
            pincode,
            platform,
            dateOverride,
            batchSize
        });

        res.status(202).json({
            success: true,
            jobId: job.jobId,
            job
        });
    } catch (error) {
        console.error('Error in /ingest-file-job route:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/ingest-file-job/:jobId', (req, res) => {
    try {
        const job = getIngestJobStatus(req.params.jobId);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.status(200).json({
            success: true,
            ...job
        });
    } catch (error) {
        console.error('Error in /ingest-file-job/:jobId route:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Manual ingestion from raw file payload
 * POST /api/data/ingest-file-payload
 * Body: { fileName, categoryFolder, fileData, pincode?, platform?, dateOverride? }
 */
router.post('/ingest-file-payload', async (req, res) => {
    try {
        const { fileName, categoryFolder, fileData, pincode, platform, dateOverride } = req.body;

        if (!fileName || !categoryFolder || !fileData) {
            return res.status(400).json({ error: 'fileName, categoryFolder and fileData are required' });
        }

        console.log(`\n📂 Manual ingestion payload received for: ${categoryFolder}/${fileName}`);
        if (dateOverride) {
            console.log(`⏰ Date override: ${dateOverride}`);
        }

        const result = await ingestFilePayload({
            fileName,
            categoryFolder,
            fileData,
            pincode,
            platform,
            dateOverride
        });

        if (!result.success) {
            return res.status(500).json({ error: result.error, file: result.file });
        }

        res.status(200).json(result);
    } catch (error) {
        console.error('Error in /ingest-file-payload route:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Batch ingest directory
 * POST /api/data/ingest-directory
 * Body: { dirPath: '/path/to/dir', dateOverride?: '2026-03-25T10:00:00Z' }
 */
router.post('/ingest-directory', async (req, res) => {
    try {
        const { dirPath, dateOverride } = req.body;

        if (!dirPath) {
            return res.status(400).json({ error: 'dirPath is required' });
        }

        console.log(`\n📂 Batch ingestion request for: ${dirPath}`);
        if (dateOverride) {
            console.log(`⏰ Date override: ${dateOverride}`);
        }
        const result = await ingestDirectory(dirPath, false, dateOverride);

        res.status(200).json(result);
    } catch (error) {
        console.error('Error in /ingest-directory route:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * List files ready for ingestion
 * GET /api/data/ready-files?dir=/path/to/dir
 */
router.get('/ready-files', (req, res) => {
    try {
        const { dir } = req.query;

        if (!dir) {
            return res.status(400).json({ error: 'dir query parameter is required' });
        }

        const result = getReadyFiles(dir);
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        console.error('Error in /ready-files route:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
