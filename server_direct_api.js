/**
 * Direct API Server for quick-commerce data
 * 
 * Replaces browser-based scraping with direct API calls
 * Supports Jiomart and Flipkart Minutes via direct HTTP requests
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Request modules for different platforms
const jiomartDirectAPI = require('./jiomart/direct_api_jiomart');
const flipkartDirectAPI = require('./flipkart_minutes/direct_api_flipkart');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Constants
const PORT = process.env.PORT || 5000;
const PINCODE = process.env.PINCODE || '110001';
const CONCURRENT_LIMIT = parseInt(process.env.CONCURRENT_LIMIT || '2');

/**
 * Validate required parameters
 */
function validateParams(urls, pincode) {
    if (!Array.isArray(urls) || urls.length === 0) {
        throw new Error('URLs must be a non-empty array');
    }
    
    if (!pincode || typeof pincode !== 'string' || pincode.length < 5) {
        throw new Error('Invalid pincode. Must be at least 5 digits');
    }
    
    return { urls, pincode };
}

/**
 * Detect platform from URL
 */
function detectPlatform(url) {
    if (url.includes('jiomart')) {
        return 'jiomart';
    } else if (url.includes('flipkart')) {
        return 'flipkart_minutes';
    }
    return null;
}

/**
 * Route: Health check
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        mode: 'direct_api',
        pincode: PINCODE
    });
});

/**
 * Route: Scrape Jiomart products (direct API)
 */
app.post('/api/jiomart/scrape', async (req, res) => {
    try {
        const { urls } = req.body;
        const pincode = req.query.pincode || PINCODE;
        
        // Validate input
        validateParams(urls, pincode);
        
        console.log(`🌐 Jiomart Direct API Scrape`);
        console.log(`URLs: ${urls.length} categories`);
        console.log(`Pincode: ${pincode}`);
        
        // Start scraping (non-blocking response)
        const sessionId = `jiomart_${Date.now()}`;
        res.json({
            success: true,
            message: 'Scraping started via direct API',
            sessionId,
            platform: 'jiomart',
            urlCount: urls.length,
            pincode
        });
        
        // Scrape in background
        jiomartDirectAPI.scrapeMultipleDirectAPI(urls, pincode, CONCURRENT_LIMIT)
            .then(results => {
                console.log(`✅ Jiomart scraping complete: ${results.flat().length} total products`);
                saveSessionResults(sessionId, 'jiomart', results, pincode);
            })
            .catch(error => {
                console.error(`❌ Jiomart scraping failed: ${error.message}`);
                saveSessionError(sessionId, error);
            });
            
    } catch (error) {
        console.error(`❌ Request validation failed: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Route: Scrape Flipkart Minutes products (direct API)
 */
app.post('/api/flipkart/scrape', async (req, res) => {
    try {
        const { urls } = req.body;
        const pincode = req.query.pincode || PINCODE;
        
        // Validate input
        validateParams(urls, pincode);
        
        console.log(`🌐 Flipkart Minutes Direct API Scrape`);
        console.log(`URLs: ${urls.length} categories`);
        console.log(`Pincode: ${pincode}`);
        
        // Start scraping (non-blocking response)
        const sessionId = `flipkart_${Date.now()}`;
        res.json({
            success: true,
            message: 'Scraping started via direct API',
            sessionId,
            platform: 'flipkart_minutes',
            urlCount: urls.length,
            pincode
        });
        
        // Scrape in background
        flipkartDirectAPI.scrapeMultipleDirectAPI(urls, pincode, CONCURRENT_LIMIT)
            .then(results => {
                console.log(`✅ Flipkart scraping complete: ${results.flat().length} total products`);
                saveSessionResults(sessionId, 'flipkart_minutes', results, pincode);
            })
            .catch(error => {
                console.error(`❌ Flipkart scraping failed: ${error.message}`);
                saveSessionError(sessionId, error);
            });
            
    } catch (error) {
        console.error(`❌ Request validation failed: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Route: Scrape both platforms in one request
 */
app.post('/api/scrape-all', async (req, res) => {
    try {
        const { urls } = req.body;
        const pincode = req.query.pincode || PINCODE;
        
        // Validate input
        validateParams(urls, pincode);
        
        // Separate URLs by platform
        const jiomartUrls = urls.filter(url => url.includes('jiomart'));
        const flipkartUrls = urls.filter(url => url.includes('flipkart'));
        
        console.log(`🌐 Multi-Platform Direct API Scrape`);
        console.log(`Jiomart URLs: ${jiomartUrls.length}`);
        console.log(`Flipkart URLs: ${flipkartUrls.length}`);
        
        // Start scraping
        const sessionId = `multi_${Date.now()}`;
        res.json({
            success: true,
            message: 'Scraping started via direct API for all platforms',
            sessionId,
            platforms: {
                jiomart: jiomartUrls.length,
                flipkart_minutes: flipkartUrls.length
            },
            pincode
        });
        
        // Scrape both platforms in parallel
        const promises = [];
        
        if (jiomartUrls.length > 0) {
            promises.push(
                jiomartDirectAPI.scrapeMultipleDirectAPI(jiomartUrls, pincode, CONCURRENT_LIMIT)
                    .then(results => ({ platform: 'jiomart', results }))
                    .catch(error => ({ platform: 'jiomart', error }))
            );
        }
        
        if (flipkartUrls.length > 0) {
            promises.push(
                flipkartDirectAPI.scrapeMultipleDirectAPI(flipkartUrls, pincode, CONCURRENT_LIMIT)
                    .then(results => ({ platform: 'flipkart_minutes', results }))
                    .catch(error => ({ platform: 'flipkart_minutes', error }))
            );
        }
        
        Promise.all(promises).then(results => {
            console.log(`✅ Multi-platform scraping complete`);
            results.forEach(result => {
                if (result.error) {
                    console.error(`  ✗ ${result.platform}: ${result.error.message}`);
                } else {
                    console.log(`  ✓ ${result.platform}: ${result.results.flat().length} products`);
                }
            });
            saveSessionResults(sessionId, 'multi', results, pincode);
        }).catch(error => {
            console.error(`❌ Multi-platform scraping failed: ${error.message}`);
            saveSessionError(sessionId, error);
        });
        
    } catch (error) {
        console.error(`❌ Request validation failed: ${error.message}`);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Route: Get session results
 */
app.get('/api/session/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const resultsDir = path.join(__dirname, 'session_results');
        const resultFile = path.join(resultsDir, `${sessionId}_results.json`);
        
        if (!fs.existsSync(resultFile)) {
            return res.status(404).json({
                success: false,
                error: 'Session not found or still processing'
            });
        }
        
        const results = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
        res.json({
            success: true,
            ...results
        });
        
    } catch (error) {
        console.error(`❌ Failed to retrieve session: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Route: Get session status
 */
app.get('/api/session/:sessionId/status', (req, res) => {
    try {
        const { sessionId } = req.params;
        const resultsDir = path.join(__dirname, 'session_results');
        const statusFile = path.join(resultsDir, `${sessionId}_status.json`);
        
        if (!fs.existsSync(statusFile)) {
            return res.json({
                status: 'processing',
                message: 'Session is currently processing'
            });
        }
        
        const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        res.json(status);
        
    } catch (error) {
        console.error(`❌ Failed to retrieve status: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Route: List all sessions
 */
app.get('/api/sessions', (req, res) => {
    try {
        const resultsDir = path.join(__dirname, 'session_results');
        
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
            return res.json({ sessions: [] });
        }
        
        const files = fs.readdirSync(resultsDir)
            .filter(f => f.endsWith('_results.json'))
            .map(f => f.replace('_results.json', ''))
            .sort()
            .reverse();
        
        res.json({
            sessions: files,
            count: files.length
        });
        
    } catch (error) {
        console.error(`❌ Failed to list sessions: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Save session results to disk
 */
function saveSessionResults(sessionId, platform, results, pincode) {
    try {
        const resultsDir = path.join(__dirname, 'session_results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }
        
        const resultFile = path.join(resultsDir, `${sessionId}_results.json`);
        const statusFile = path.join(resultsDir, `${sessionId}_status.json`);
        
        // Count products by platform
        const productCounts = {};
        let totalProducts = 0;
        
        if (Array.isArray(results)) {
            results.forEach(result => {
                if (result && result.results) {
                    const count = result.results.flat().length;
                    productCounts[result.platform] = count;
                    totalProducts += count;
                }
            });
        } else {
            totalProducts = results.flat().length;
            productCounts[platform] = totalProducts;
        }
        
        // Save results
        fs.writeFileSync(resultFile, JSON.stringify({
            sessionId,
            platform,
            pincode,
            productCounts,
            totalProducts,
            results,
            completedAt: new Date().toISOString()
        }, null, 2));
        
        // Save status
        fs.writeFileSync(statusFile, JSON.stringify({
            sessionId,
            status: 'completed',
            platform,
            totalProducts,
            productCounts,
            completedAt: new Date().toISOString()
        }, null, 2));
        
        console.log(`✓ Results saved for session ${sessionId}`);
    } catch (error) {
        console.error(`✗ Failed to save session results: ${error.message}`);
    }
}

/**
 * Save session error to disk
 */
function saveSessionError(sessionId, error) {
    try {
        const resultsDir = path.join(__dirname, 'session_results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }
        
        const statusFile = path.join(resultsDir, `${sessionId}_status.json`);
        
        fs.writeFileSync(statusFile, JSON.stringify({
            sessionId,
            status: 'error',
            error: error.message,
            errorAt: new Date().toISOString()
        }, null, 2));
        
        console.log(`✗ Error saved for session ${sessionId}`);
    } catch (err) {
        console.error(`✗ Failed to save error: ${err.message}`);
    }
}

/**
 * Default route
 */
app.get('/', (req, res) => {
    res.json({
        server: 'Quick Commerce Direct API Scraper v2.0',
        mode: 'direct_api',
        endpoints: {
            health: 'GET /health',
            scrapeJiomart: 'POST /api/jiomart/scrape',
            scrapeFlipkart: 'POST /api/flipkart/scrape',
            scrapeAll: 'POST /api/scrape-all',
            getSession: 'GET /api/session/:sessionId',
            listSessions: 'GET /api/sessions'
        },
        defaultPincode: PINCODE,
        concurrentLimit: CONCURRENT_LIMIT,
        note: 'Send JSON POST requests with { "urls": [...] } format'
    });
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
    console.error(`❌ Unhandled error: ${err.message}`);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

/**
 * Start server
 */
const server = app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║   Direct API Scraper Server Started    ║`);
    console.log(`╚════════════════════════════════════════╝`);
    console.log(`\n📍 Server running on http://localhost:${PORT}`);
    console.log(`🔑 Default Pincode: ${PINCODE}`);
    console.log(`⚡ Concurrent Limit: ${CONCURRENT_LIMIT}`);
    console.log(`\nAPI Endpoints:`);
    console.log(`  POST /api/jiomart/scrape     - Scrape Jiomart`);
    console.log(`  POST /api/flipkart/scrape    - Scrape Flipkart Minutes`);
    console.log(`  POST /api/scrape-all         - Scrape all platforms`);
    console.log(`  GET /api/sessions            - List sessions`);
    console.log(`  GET /api/session/:id         - Get session results`);
});

module.exports = { app, server };
