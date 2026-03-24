import express from 'express';
import processScrapedDataOptimized from '../controllers/dataControllerOptimized.js';
import { ingestJsonFile, ingestDirectory, getReadyFiles } from '../utils/manualIngest.js';

const router = express.Router();

router.post('/ingest', async (req, res) => {
    try {
        const { pincode, platform, category, products } = req.body;

        if (!pincode || !platform || !category || !products || !Array.isArray(products)) {
            return res.status(400).json({ error: 'Missing required fields or invalid products array' });
        }

        // ✅ Use optimized controller with Redis caching & bulk operations
        const result = await processScrapedDataOptimized({ pincode, platform, category, products });
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in /ingest route:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Manual ingestion from file
 * POST /api/data/ingest-file
 * Body: { filePath: '/path/to/file.json', platform?: 'blinkit', pincode?: '110001' }
 */
router.post('/ingest-file', async (req, res) => {
    try {
        const { filePath, platform, pincode } = req.body;

        if (!filePath) {
            return res.status(400).json({ error: 'filePath is required' });
        }

        console.log(`\n📂 Manual ingestion request for: ${filePath}`);
        const result = await ingestJsonFile(filePath, pincode, platform);

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
 * Batch ingest directory
 * POST /api/data/ingest-directory
 * Body: { dirPath: '/path/to/dir' }
 */
router.post('/ingest-directory', async (req, res) => {
    try {
        const { dirPath } = req.body;

        if (!dirPath) {
            return res.status(400).json({ error: 'dirPath is required' });
        }

        console.log(`\n📂 Batch ingestion request for: ${dirPath}`);
        const result = await ingestDirectory(dirPath);

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
