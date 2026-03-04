import express from 'express';
import { processScrapedData } from '../controllers/dataController.js';

const router = express.Router();

router.post('/ingest', async (req, res) => {
    try {
        const { pincode, platform, category, products } = req.body;

        if (!pincode || !platform || !category || !products || !Array.isArray(products)) {
            return res.status(400).json({ error: 'Missing required fields or invalid products array' });
        }

        const result = await processScrapedData({ pincode, platform, category, products });
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in /ingest route:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
