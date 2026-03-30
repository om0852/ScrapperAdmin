const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR);
}

// Ensure output dir exists (optional, mostly for debugging dumps)
const DATA_DIR = path.join(__dirname, 'scraped_data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// API Dumps storage directory
const API_DUMPS_DIR = path.join(__dirname, 'api_dumps');
if (!fs.existsSync(API_DUMPS_DIR)) {
    fs.mkdirSync(API_DUMPS_DIR);
}

const SCRAPER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
const SCRAPER_BROWSER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process,InProductHelp',
    '--disable-site-isolation-trials',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-client-side-phishing-detection',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--no-default-browser-check'
];

class FlipkartScrapeSignalError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'FlipkartScrapeSignalError';
        this.code = code;
        this.details = details;
    }
}

// Function to save API dumps
function saveApiDump(pincode, url, jsonData, dumpType = 'response') {
    try {
        const timestamp = Date.now();
        const urlHash = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const filename = `dump_${pincode}_${dumpType}_${urlHash}_${timestamp}.json`;
        const filepath = path.join(API_DUMPS_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(jsonData, null, 2));
        log(`âœ“ API dump saved: ${filename}`, 'SUCCESS');
        return filename;
    } catch (err) {
        log(`âœ— Failed to save API dump: ${err.message}`, 'ERROR');
        return null;
    }
}

/**
 * Enhanced Logger
 */
function log(msg, type = 'INFO') {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    let color = '';
    const reset = '\x1b[0m';

    switch (type) {
        case 'INFO': color = '\x1b[36m'; break; // Cyan
        case 'SUCCESS': color = '\x1b[32m'; break; // Green
        case 'WARN': color = '\x1b[33m'; break; // Yellow
        case 'ERROR': color = '\x1b[31m'; break; // Red
        default: color = '\x1b[37m'; // White
    }

    const logString = `[${timestamp}] ${color}[${type}]${reset} ${msg}`;
    console.log(logString);
    fs.appendFileSync('scraper_service.log', logString + '\n');
}

async function createScraperContext(browser, sessionFile) {
    const context = await browser.newContext({
        storageState: sessionFile,
        userAgent: SCRAPER_USER_AGENT
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    return context;
}

async function repairLocationSession(sessionFile, pincode, reason = '') {
    const reasonSuffix = reason ? ` (${reason})` : '';
    log(`Refreshing Flipkart session location for ${pincode}${reasonSuffix}...`, 'INFO');

    const browser = await chromium.launch({
        headless: false,
        args: SCRAPER_BROWSER_ARGS
    });

    let context = null;
    try {
        context = await createScraperContext(browser, sessionFile);
        const page = await context.newPage();
        const fixed = await ensureLocation(page, pincode);

        if (fixed) {
            await context.storageState({ path: sessionFile });
            log(`Session refresh saved for pincode ${pincode}`, 'SUCCESS');
        } else {
            log(`Session refresh did not confirm location for pincode ${pincode}`, 'WARN');
        }

        return fixed;
    } catch (e) {
        log(`Failed to refresh session for ${pincode}: ${e.message}`, 'ERROR');
        return false;
    } finally {
        if (context) {
            try { await context.close(); } catch (e) {}
        }
        try { await browser.close(); } catch (e) {}
    }
}

/**
 * Resource interception logic: Block Images & Media, Allow CSS & Scripts
 */
async function interceptResources(page) {
    await page.route('**/*', async (route) => {
        const resourceType = route.request().resourceType();
        // Block heavy media but ALLOW CSS for proper rendering
        if (['image', 'media', 'font'].includes(resourceType)) {
            await route.abort();
        } else {
            await route.continue();
        }
    });
}

/**
 * Ensures a valid session exists for the given pincode.
 * If not, it launches a browser to perform the setup.
 */
async function setupSession(pincode) {
    if (!pincode) throw new Error('Pincode is required for setup.');

    const sessionFile = path.join(SESSION_DIR, `flipkart_session_${pincode}.json`);

    // Check if session exists AND is valid (file size > 100 bytes)
    if (fs.existsSync(sessionFile)) {
        const stats = fs.statSync(sessionFile);
        if (stats.size > 100) {
            log(`Session already exists for pincode ${pincode} (${stats.size} bytes)`, 'INFO');
            return { sessionFile, status: 'serviceable' };
        } else {
            log(`Session file exists but is too small (${stats.size} bytes). Re-creating for ${pincode}`, 'WARN');
        }
    }

    log(`Starting Session Setup for Pincode: ${pincode}`, 'INFO');
    const browser = await chromium.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-client-side-phishing-detection',
            '--disable-default-apps',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-sync',
            '--metrics-recording-only',
            '--no-first-run',
            '--no-default-browser-check',
            '--password-store=basic',
            '--use-mock-keychain',
            '--disable-domain-reliability'
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });

    // Add stealth scripts
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    // DON'T block resources during session setup - need full page rendering for interaction
    // await interceptResources(page);

    try {
        log('Navigating to Flipkart Homepage first...', 'INFO');
        await page.goto('https://www.flipkart.com/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        log('Navigating to Location Setup Page...', 'INFO');
        const TARGET_URL = 'https://www.flipkart.com/rv/checkout/changeShippingAddress/add?marketplace=HYPERLOCAL&source=entry&originalUrl=%2Fflipkart-minutes-store%3Fmarketplace%3DHYPERLOCAL&hideAddressForm=true&isMap=true&addressBSTouchpoint=ENTER_LOCATION_MANUALLY';

        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);

        // Check for Block
        if (await page.getByText('Something is not right', { exact: false }).count() > 0) {
            log('Caught Bot Detection Screen on Setup!', 'ERROR');
            await page.screenshot({ path: 'setup_blocked.png' });
            throw new Error('Blocked by Flipkart during session setup');
        }

        const searchInput = page.locator('input#search, input[placeholder*="pincode"], input[placeholder*="location"]');
        await searchInput.first().waitFor({ state: 'visible', timeout: 10000 });
        await searchInput.first().click();
        await searchInput.first().clear();
        await page.waitForTimeout(500);
        await searchInput.first().pressSequentially(pincode, { delay: 150 });
        await page.waitForTimeout(1000);

        const suggestionItem = page.locator('li._2APc3k, div._2APc3k, .suggestion-item');
        await suggestionItem.first().waitFor({ state: 'visible', timeout: 8000 });

        // Select logic
        const correctSuggestion = suggestionItem.filter({ hasText: pincode }).first();
        if (await correctSuggestion.isVisible()) {
            await correctSuggestion.click();
        } else {
            if (await suggestionItem.count() > 1) await suggestionItem.nth(1).click();
            else await suggestionItem.first().click();
        }
        await page.waitForTimeout(2000);

        // Check for Serviceability Error (Try again / Not available)
        const unserviceableMsg = page.getByText('Not serviceable', { exact: false }).first();
        const tryAgainBtn = page.getByRole('button', { name: /Try Again|Retry/i }).first();

        if (await unserviceableMsg.isVisible() || await tryAgainBtn.isVisible()) {
            log(`[Setup] Location ${pincode} appears to be UNSERVICEABLE. Aborting setup.`, 'ERROR');
            throw new Error(`Location ${pincode} is not serviceable on Flipkart Minutes.`);
        }

        // Confirm
        const confirmBtn = page.getByRole('button', { name: /Confirm|Save|Proceed/i }).first();
        let confirmed = false;
        if (await confirmBtn.isVisible({ timeout: 5000 })) {
            await confirmBtn.click();
            confirmed = true;
        } else {
            const textBtn = page.getByText('Confirm', { exact: false });
            if (await textBtn.count() > 0) {
                await textBtn.first().click();
                confirmed = true;
            }
        }

        if (!confirmed) {
            log('[Setup] Warning: Could not find Confirm button. Checking if already redirected...', 'WARN');
        }

        await page.waitForTimeout(3000); // Wait for session cookie to set

        await context.storageState({ path: sessionFile });
        log(`Session saved: ${sessionFile}`, 'SUCCESS');
        await browser.close();
        return { sessionFile, status: 'serviceable' };

    } catch (e) {
        log(`Error in setupSession: ${e.message}`, 'ERROR');
        await browser.close();

        // Check specifically for unserviceable error
        if (e.message.includes('not serviceable')) {
            return { sessionFile: null, status: 'unserviceable' };
        }

        // Ensure we don't leave a partial/bad session file
        if (fs.existsSync(sessionFile)) {
            try { fs.unlinkSync(sessionFile); } catch (err) { }
        }
        throw e;
    }
}

/**
 * Internal function to scrape a single URL given a browser context.
 * Used by both scrape() and scrapeMultiple().
 */
async function scrapeUrlInContext(context, url, pincode) {
    const page = await context.newPage();

    const API_PATH = '/api/4/page/fetch';
    const API_ENDPOINT = 'https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false';
    const DEFAULT_X_USER_AGENT =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 FKUA/msite/0.0.4/msite/Mobile';

    const HEADER_KEYS = [
        'flipkart_secure',
        'x-user-agent',
        'x-partner-context',
        'x-ack-response',
        'referer',
        'origin',
        'accept',
        'accept-language',
        'sec-ch-ua',
        'sec-ch-ua-mobile',
        'sec-ch-ua-platform',
        'user-agent'
    ];

    const MAX_REDIRECT_DEPTH = Number.isFinite(Number(process.env.FLIPKART_MAX_REDIRECT_DEPTH))
        ? Math.max(0, Number(process.env.FLIPKART_MAX_REDIRECT_DEPTH))
        : 5;
    const MAX_PAGINATION_PAGES = Number.isFinite(Number(process.env.FLIPKART_MAX_PAGINATION_PAGES))
        ? Math.max(1, Number(process.env.FLIPKART_MAX_PAGINATION_PAGES))
        : 20;
    const RETRY_COUNT = Number.isFinite(Number(process.env.FLIPKART_RETRY_COUNT))
        ? Math.max(1, Number(process.env.FLIPKART_RETRY_COUNT))
        : 3;
    const INTER_REQUEST_DELAY_MS = Number.isFinite(Number(process.env.FLIPKART_INTER_REQUEST_DELAY_MS))
        ? Math.max(0, Number(process.env.FLIPKART_INTER_REQUEST_DELAY_MS))
        : 500;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const cloneJson = (value) => {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    };

    const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

    const deepMerge = (base, override) => {
        if (Array.isArray(override)) return cloneJson(override);
        if (!isPlainObject(base) || !isPlainObject(override)) return cloneJson(override);

        const merged = cloneJson(base);
        for (const [key, value] of Object.entries(override)) {
            if (isPlainObject(value) && isPlainObject(merged[key])) {
                merged[key] = deepMerge(merged[key], value);
            } else {
                merged[key] = cloneJson(value);
            }
        }
        return merged;
    };

    const extractPageUriFromInput = (input) => {
        const raw = String(input || '').trim();
        if (!raw) return '/?marketplace=HYPERLOCAL';

        let pageUri = raw;
        if (raw.startsWith('http://') || raw.startsWith('https://')) {
            try {
                const parsed = new URL(raw);
                pageUri = `${parsed.pathname}${parsed.search}`;
            } catch (_) {
                pageUri = '/?marketplace=HYPERLOCAL';
            }
        } else if (!raw.startsWith('/')) {
            pageUri = `/${raw}`;
        }

        try {
            const parsedPageUri = new URL(pageUri, 'https://www.flipkart.com');
            parsedPageUri.searchParams.delete('pageUID');
            return `${parsedPageUri.pathname}${parsedPageUri.search}`;
        } catch (_) {
            return pageUri;
        }
    };

    const buildFallbackRequestBody = (sourceUrl, pin) => {
        const parsedPin = Number.parseInt(String(pin || ''), 10);
        const pincodeNumber = Number.isFinite(parsedPin) ? parsedPin : null;

        return {
            pageUri: extractPageUriFromInput(sourceUrl),
            pageContext: {
                pageNumber: 1,
                paginatedFetch: true,
                fetchAllPages: false,
                slotContextMap: {}
            },
            requestContext: {
                type: 'BROWSE_PAGE',
                marketPlace: 'HYPERLOCAL'
            },
            locationContext: {
                pincode: pincodeNumber,
                changed: false
            }
        };
    };

    const LOCATION_GATE_PATTERN = /hyperlocal-preview-page|user-address-v\d|changeShippingAddress/i;

    const isLocationGatePageUri = (pageUri) => LOCATION_GATE_PATTERN.test(String(pageUri || ''));

    const sanitizeCapturedRequestBody = (candidateBody, sourceUrl, pin) => {
        const fallback = buildFallbackRequestBody(sourceUrl, pin);
        if (!isPlainObject(candidateBody)) {
            return fallback;
        }

        const sanitized = cloneJson(candidateBody);
        const pageUri = extractPageUriFromInput(candidateBody.pageUri || sourceUrl);
        const existingPageContext = isPlainObject(candidateBody.pageContext) ? candidateBody.pageContext : {};
        const existingRequestContext = isPlainObject(candidateBody.requestContext) ? candidateBody.requestContext : {};
        const existingLocationContext = isPlainObject(candidateBody.locationContext) ? candidateBody.locationContext : {};

        sanitized.pageUri = isLocationGatePageUri(pageUri) ? fallback.pageUri : pageUri;
        sanitized.pageContext = {
            ...existingPageContext,
            pageNumber: 1,
            paginatedFetch: true,
            fetchAllPages: false,
            slotContextMap: isPlainObject(existingPageContext.slotContextMap) ? existingPageContext.slotContextMap : {}
        };
        delete sanitized.pageContext.pageHashKey;
        delete sanitized.pageContext.paginationContextMap;

        sanitized.requestContext = {
            ...existingRequestContext,
            ...fallback.requestContext,
            type: 'BROWSE_PAGE',
            marketPlace: 'HYPERLOCAL'
        };

        sanitized.locationContext = {
            ...existingLocationContext,
            pincode: fallback.locationContext.pincode,
            changed: false
        };

        return sanitized;
    };

    const normalizeRequestUrl = (requestUrl) => {
        if (!requestUrl) return API_ENDPOINT;
        try {
            const parsed = new URL(requestUrl);
            if (!parsed.searchParams.has('cacheFirst')) {
                parsed.searchParams.set('cacheFirst', 'false');
            }
            return parsed.toString();
        } catch (_) {
            return API_ENDPOINT;
        }
    };

    const buildDirectHeaders = (captured, sourceUrl) => {
        const headers = {
            accept: captured.accept || '*/*',
            'accept-language': captured['accept-language'] || 'en-GB,en-US;q=0.9,en;q=0.8',
            'content-type': 'application/json',
            'cache-control': 'no-cache',
            pragma: 'no-cache',
            flipkart_secure: captured.flipkart_secure || 'true',
            'x-user-agent': captured['x-user-agent'] || DEFAULT_X_USER_AGENT,
            origin: captured.origin || 'https://www.flipkart.com',
            referer: captured.referer || sourceUrl
        };

        const optionalKeys = ['x-partner-context', 'x-ack-response', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'user-agent'];
        for (const key of optionalKeys) {
            const value = captured[key];
            if (value !== undefined && value !== null && value !== '') {
                headers[key] = value;
            }
        }

        return headers;
    };

    const stableStringify = (value) => {
        if (value === null || value === undefined) return String(value);
        if (typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) {
            return `[${value.map((item) => stableStringify(item)).join(',')}]`;
        }
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    };

    const extractRedirectPageUri = (payload) => {
        const redirectUrl =
            payload?.RESPONSE?.pageMeta?.redirectionObject?.url ||
            payload?.RESPONSE?.pageMeta?.redirectionObject?.redirectionAction?.url ||
            '';

        if (!redirectUrl) return '';

        try {
            const parsed = new URL(redirectUrl);
            return `${parsed.pathname}${parsed.search}`;
        } catch (_) {
            return String(redirectUrl).trim();
        }
    };

    const isLocationGatePayload = (payload) => {
        const redirectPageUri = extractRedirectPageUri(payload);
        if (isLocationGatePageUri(redirectPageUri)) {
            return true;
        }

        const originalUrl =
            payload?.RESPONSE?.pageMeta?.redirectionObject?.redirectionAction?.originalUrl ||
            payload?.RESPONSE?.pageMeta?.redirectionObject?.originalUrl ||
            '';

        return isLocationGatePageUri(originalUrl);
    };

    const getPageNumber = (requestBody) => {
        const parsed = Number(requestBody?.pageContext?.pageNumber);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    };

    const extractPaginationState = (payload) => {
        const pageData = payload?.RESPONSE?.pageData;
        const paginationContextMap = pageData?.paginationContextMap;

        return {
            hasMorePages: pageData?.hasMorePages === true,
            pageHashKey: pageData?.pageHash ? String(pageData.pageHash) : '',
            paginationContextMap: isPlainObject(paginationContextMap) ? paginationContextMap : null
        };
    };

    const buildNextPaginatedRequestBody = (currentRequestBody, payload) => {
        const paginationState = extractPaginationState(payload);
        if (!paginationState.hasMorePages) return null;

        const nextPageNumber = getPageNumber(currentRequestBody) + 1;
        const pageContextOverride = {
            pageNumber: nextPageNumber,
            paginatedFetch: true,
            fetchAllPages: false
        };

        if (paginationState.pageHashKey) {
            pageContextOverride.pageHashKey = paginationState.pageHashKey;
        }

        if (paginationState.paginationContextMap) {
            pageContextOverride.paginationContextMap = paginationState.paginationContextMap;
        }

        return deepMerge(currentRequestBody, {
            pageContext: pageContextOverride
        });
    };

    const fetchPageOnce = async (requestUrl, headers, requestBody) => {
        return page.evaluate(
            async ({ requestUrl, headers, requestBody }) => {
                try {
                    const response = await fetch(requestUrl, {
                        method: 'POST',
                        credentials: 'include',
                        headers,
                        body: JSON.stringify(requestBody)
                    });

                    const raw = await response.text();
                    let data = null;
                    if (raw) {
                        try {
                            data = JSON.parse(raw);
                        } catch (_) {
                            data = null;
                        }
                    }

                    return {
                        ok: response.ok,
                        status: response.status,
                        requestUrl: response.url || requestUrl,
                        data,
                        error: response.ok ? null : raw.slice(0, 300)
                    };
                } catch (error) {
                    return {
                        ok: false,
                        status: 0,
                        requestUrl,
                        data: null,
                        error: error.message
                    };
                }
            },
            { requestUrl, headers, requestBody }
        );
    };

    const fetchPageWithRetry = async (requestUrl, headers, requestBody) => {
        for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
            const result = await fetchPageOnce(requestUrl, headers, requestBody);
            if (result.ok) {
                return result;
            }

            const retriable = result.status === 0 || result.status === 403 || result.status === 429 || result.status >= 500;
            if (!retriable || attempt === RETRY_COUNT) {
                return result;
            }

            const backoffMs = 400 * (2 ** (attempt - 1));
            log(`Direct API transient failure (${result.status || 'network'}). Retry ${attempt}/${RETRY_COUNT - 1} in ${backoffMs}ms`, 'WARN');
            await sleep(backoffMs);
        }

        return {
            ok: false,
            status: 0,
            requestUrl,
            data: null,
            error: 'Retry loop exhausted'
        };
    };

    const isDcChangeResult = (result) =>
        result?.status === 406 &&
        /DC Change/i.test(
            String(result?.data?.ERROR_MESSAGE || result?.data?.errorMessage || result?.error || '')
        );

    const formatApiFailure = (result) => {
        if (result?.data) {
            try {
                return JSON.stringify(result.data);
            } catch (_) {}
        }
        return result?.error || 'unknown error';
    };

    try {
        await page.route('**/*', async (route) => {
            const resourceType = route.request().resourceType();
            if (['image', 'font', 'media'].includes(resourceType)) {
                await route.abort();
            } else {
                await route.continue();
            }
        });

        const capturedHeaders = {};
        let capturedRequestBody = null;
        let capturedRequestUrl = null;

        const captureTemplateFromRequest = (request) => {
            if (request.method() !== 'POST' || !request.url().includes(API_PATH)) {
                return false;
            }

            capturedRequestUrl = request.url();

            const headers = request.headers();
            for (const key of HEADER_KEYS) {
                const value = headers[key];
                if (value !== undefined && value !== null && value !== '') {
                    capturedHeaders[key] = value;
                }
            }

            if (!capturedRequestBody) {
                const postData = request.postData();
                if (postData && postData.length > 2) {
                    try {
                        capturedRequestBody = JSON.parse(postData);
                    } catch (_) {
                        capturedRequestBody = null;
                    }
                }
            }

            return true;
        };

        const requestWait = page.waitForRequest(
            (request) => captureTemplateFromRequest(request),
            { timeout: 25000 }
        ).catch(() => null);

        const responseWait = page.waitForResponse(
            (response) =>
                response.url().includes(API_PATH) &&
                response.request().method() === 'POST' &&
                response.status() === 200,
            { timeout: 25000 }
        ).catch(() => null);

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        } catch (navError) {
            log(`[${url}] Navigation fallback: ${navError.message}`, 'WARN');
            await page.goto(url, { waitUntil: 'commit', timeout: 45000 });
        }

        await page.waitForTimeout(1200);

        const [warmRequest, warmResponse] = await Promise.all([requestWait, responseWait]);
        if (warmRequest) {
            captureTemplateFromRequest(warmRequest);
        }

        let firstPayload = null;
        if (warmResponse) {
            try {
                const raw = await warmResponse.text();
                firstPayload = raw ? JSON.parse(raw) : null;
            } catch (_) {
                firstPayload = null;
            }
        }

        const capturedTemplatePageNumber = getPageNumber(capturedRequestBody);
        const requestUrl = normalizeRequestUrl(capturedRequestUrl || API_ENDPOINT);
        const headers = buildDirectHeaders(capturedHeaders, url);
        let requestBody = sanitizeCapturedRequestBody(capturedRequestBody, url, pincode);

        if (capturedTemplatePageNumber > 1) {
            log(`[${url}] Captured API template started at page ${capturedTemplatePageNumber}. Resetting replay to page 1.`, 'INFO');
            firstPayload = null;
        }

        if (firstPayload?.RESPONSE?.pageMeta?.pageNotChanged === true) {
            log(`[${url}] Warm response was pageNotChanged. Replaying with a clean page-1 request.`, 'INFO');
            firstPayload = null;
        }

        const collectedData = [];
        const responseEntries = [];
        const seenRequestBodies = new Set([stableStringify(requestBody)]);
        const seenPageUris = new Set();
        let redirectDepth = 0;
        let fetchedPageCount = 1;

        if (!firstPayload || !firstPayload.RESPONSE) {
            const bootstrapResult = await fetchPageWithRetry(requestUrl, headers, requestBody);
            if (!bootstrapResult.ok || !bootstrapResult.data) {
                if (isDcChangeResult(bootstrapResult)) {
                    throw new FlipkartScrapeSignalError(
                        'DC_CHANGE',
                        `[${url}] Rome API requested a fresh browser session after location change`,
                        { status: bootstrapResult.status, response: bootstrapResult.data || bootstrapResult.error }
                    );
                }

                log(`[${url}] Direct API bootstrap failed (${bootstrapResult.status}): ${formatApiFailure(bootstrapResult)}`, 'ERROR');
                return [];
            }
            firstPayload = bootstrapResult.data;
        }

        if (isLocationGatePayload(firstPayload)) {
            throw new FlipkartScrapeSignalError(
                'LOCATION_NOT_SET',
                `[${url}] Session redirected to the Flipkart location selection flow`,
                { redirect: extractRedirectPageUri(firstPayload) }
            );
        }

        collectedData.push(firstPayload);
        responseEntries.push({
            phase: 'initial',
            status: 200,
            pageNumber: getPageNumber(requestBody),
            requestBody: cloneJson(requestBody),
            response: firstPayload
        });

        let currentPayload = firstPayload;

        while (currentPayload) {
            const nextRedirectPageUri = extractRedirectPageUri(currentPayload);
            let nextRequestBody = null;
            let phase = '';

            if (nextRedirectPageUri && !seenPageUris.has(nextRedirectPageUri) && redirectDepth < MAX_REDIRECT_DEPTH) {
                redirectDepth += 1;
                seenPageUris.add(nextRedirectPageUri);
                nextRequestBody = deepMerge(requestBody, { pageUri: nextRedirectPageUri });
                phase = `redirect-${redirectDepth}`;
            } else {
                const paginatedBody = buildNextPaginatedRequestBody(requestBody, currentPayload);
                const nextBodyKey = paginatedBody ? stableStringify(paginatedBody) : '';

                if (!paginatedBody || fetchedPageCount >= MAX_PAGINATION_PAGES || seenRequestBodies.has(nextBodyKey)) {
                    break;
                }

                seenRequestBodies.add(nextBodyKey);
                nextRequestBody = paginatedBody;
                fetchedPageCount += 1;
                phase = `page-${getPageNumber(paginatedBody)}`;
            }

            requestBody = nextRequestBody;

            if (INTER_REQUEST_DELAY_MS > 0) {
                await sleep(INTER_REQUEST_DELAY_MS);
            }

            const pageResult = await fetchPageWithRetry(requestUrl, headers, requestBody);
            if (!pageResult.ok || !pageResult.data) {
                if (isDcChangeResult(pageResult)) {
                    throw new FlipkartScrapeSignalError(
                        'DC_CHANGE',
                        `[${url}] Rome API requested a fresh browser session while paginating`,
                        { status: pageResult.status, response: pageResult.data || pageResult.error }
                    );
                }

                log(`[${url}] Request stopped at ${phase} (${pageResult.status}): ${formatApiFailure(pageResult)}`, 'WARN');
                break;
            }

            currentPayload = pageResult.data;
            if (!currentPayload?.RESPONSE) {
                log(`[${url}] Non-product response at ${phase}. Stopping.`, 'WARN');
                break;
            }

            if (isLocationGatePayload(currentPayload)) {
                throw new FlipkartScrapeSignalError(
                    'LOCATION_NOT_SET',
                    `[${url}] Pagination redirected back to the Flipkart location flow`,
                    { redirect: extractRedirectPageUri(currentPayload), phase }
                );
            }

            collectedData.push(currentPayload);
            responseEntries.push({
                phase,
                status: pageResult.status,
                pageNumber: getPageNumber(requestBody),
                requestBody: cloneJson(requestBody),
                response: currentPayload
            });
        }

        const finalProducts = extractData(collectedData, [], []);
        finalProducts.forEach((product) => {
            product.categoryUrl = url;
        });

        saveApiDump(
            pincode,
            url,
            {
                metadata: {
                    pincode,
                    sourceUrl: url,
                    endpoint: requestUrl,
                    mode: 'direct_api_pagination',
                    responsesCaptured: collectedData.length,
                    productsExtracted: finalProducts.length,
                    generatedAt: new Date().toISOString()
                },
                requestTemplate: {
                    headers: capturedHeaders,
                    requestBody: capturedRequestBody || null
                },
                responses: responseEntries
            },
            'direct_api'
        );

        log(`[${url}] Direct API scrape complete. Responses: ${collectedData.length}, products: ${finalProducts.length}`, 'SUCCESS');
        return finalProducts;

    } catch (e) {
        if (e instanceof FlipkartScrapeSignalError) {
            throw e;
        }
        log(`Error scraping ${url}: ${e.message}`, 'ERROR');
        return [];
    } finally {
        await page.close();
    }
}

async function getDeliveryTime(context) {
    const page = await context.newPage();
    const STORE_URL = 'https://www.flipkart.com/flipkart-minutes-store?marketplace=HYPERLOCAL';
    let deliveryTime = "N/A";

    try {
        log(`Navigating to store page to Extract Delivery Time...`, 'INFO');
        await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Check for Block
        if (await page.getByText('Something is not right', { exact: false }).count() > 0) {
            console.log('[Delivery] Caught Bot Detection Screen!');
            // Dump verify
            const fs = require('fs');
            fs.writeFileSync('debug_blocked_delivery.html', await page.content());
            return "BLOCKED";
        }

        // Strategy: Look for specific time patterns in the full page text
        // formats: "12 mins", "15 min", "Delivery in 10 mins"
        const bodyText = await page.innerText('body');

        // Regex for "X min"
        const timeRegex = /(\d+(?:-\d+)?)\s*(?:mins?|minutes?)/i;
        const match = bodyText.match(timeRegex);

        if (match) {
            deliveryTime = `${match[1]} min`;
        } else {
            // Fallback: Look for "Tomorrow" or "Today"
            if (/tomorrow/i.test(bodyText)) deliveryTime = "Tomorrow";
            else if (/today/i.test(bodyText)) deliveryTime = "Today";

            if (deliveryTime === 'N/A') {
                log('Regex failed. Dumping body text for debugging...', 'WARN');
                const fs = require('fs');
                fs.writeFileSync('debug_body_text.txt', bodyText);
            }
        }

        log(`Extracted Delivery Time: ${deliveryTime}`, 'SUCCESS');

    } catch (e) {
        log(`Failed to extract delivery time: ${e.message}`, 'WARN');
    } finally {
        await page.close();
    }
    return deliveryTime;
}

/**
 * Main Scrape Function (Single URL)
 */
async function scrape(url, pincode) {
    if (!url) throw new Error('URL is required');
    if (!pincode) throw new Error('Pincode is required');

    // 1. Session Management
    let sessionRes;
    try {
        sessionRes = await setupSession(pincode);
    } catch (e) {
        log(`Failed to setup session for ${pincode}: ${e.message}`, 'ERROR');
        return [];
    }

    if (sessionRes.status === 'unserviceable') {
        log(`Pincode ${pincode} is unserviceable. Returning empty.`, 'WARN');
        return [];
    }
    const sessionFile = sessionRes.sessionFile;

    // 2. Launch Scraper
    log(`Scraping URL: ${url} with Pincode: ${pincode}`, 'INFO');
    const browser = await chromium.launch({
        headless: false,
        args: SCRAPER_BROWSER_ARGS
    });

    try {
        // Skipped delivery time extraction as requested
        const globalDeliveryTime = "N/A";
        const attemptScrape = async () => {
            const context = await createScraperContext(browser, sessionFile);
            try {
                return await scrapeUrlInContext(context, url, pincode);
            } finally {
                await context.close();
            }
        };

        let finalProducts = [];
        let shouldRetryAfterRepair = false;

        try {
            finalProducts = await attemptScrape();
        } catch (e) {
            if (e instanceof FlipkartScrapeSignalError && e.code === 'LOCATION_NOT_SET') {
                shouldRetryAfterRepair = await repairLocationSession(sessionFile, pincode, 'single scrape location gate');
            } else if (e instanceof FlipkartScrapeSignalError && e.code === 'DC_CHANGE') {
                log(`[${url}] Rome API requested a fresh session. Refreshing saved storage and retrying once...`, 'WARN');
                shouldRetryAfterRepair = await repairLocationSession(sessionFile, pincode, 'single scrape DC change');
            } else {
                throw e;
            }
        }

        if ((!finalProducts || finalProducts.length === 0) && shouldRetryAfterRepair) {
            log('Retrying single scrape with refreshed Flipkart session...', 'INFO');
            finalProducts = await attemptScrape();
        }

        if (finalProducts) {
            finalProducts.forEach((product) => {
                product.deliveryTime = globalDeliveryTime;
            });
        }

        return finalProducts;

    } catch (e) {
        throw e;
    } finally {
        await browser.close();
    }
}

/**
 * Scrape Multiple URLs concurrently
 */
async function scrapeMultiple(urls, pincode, maxConcurrentTabs = 2) {
    if (!urls || urls.length === 0) throw new Error('URLs array is required');
    if (!pincode) throw new Error('Pincode is required');

    // 1. Session Management (Single Check)
    let sessionRes;
    try {
        sessionRes = await setupSession(pincode);
    } catch (e) {
        log(`Failed to setup session for ${pincode}: ${e.message}`, 'ERROR');
        return urls.map(() => []); // Fail all
    }

    if (sessionRes.status === 'unserviceable') {
        log(`Pincode ${pincode} is unserviceable. Returning empty for all URLs.`, 'WARN');
        return urls.map(() => []);
    }
    const sessionFile = sessionRes.sessionFile;

    // 2. Process concurrently with limit and retry
    log(`Starting parallel scrape for ${urls.length} URLs with Pincode: ${pincode}`, 'INFO');

    try {
        const globalDeliveryTime = "N/A";
        const requestedConcurrency = Number(maxConcurrentTabs);
        const CONCURRENCY_LIMIT = Number.isFinite(requestedConcurrency)
            ? Math.max(1, Math.min(requestedConcurrency, 6))
            : 2;
        const results = new Array(urls.length);
        const queue = urls.map((url, index) => ({ url, index }));
        let sharedRepairPromise = null;
        let sharedRepairAttempted = false;
        let sharedRepairSucceeded = false;

        log(`Processing ${urls.length} URLs with concurrency ${CONCURRENCY_LIMIT}...`, 'INFO');

        const ensureLocationRepairedOnce = async (reason) => {
            if (sharedRepairSucceeded) {
                return true;
            }

            if (sharedRepairPromise) {
                return sharedRepairPromise;
            }

            sharedRepairAttempted = true;
            sharedRepairPromise = repairLocationSession(sessionFile, pincode, reason)
                .then((fixed) => {
                    sharedRepairSucceeded = fixed;
                    return fixed;
                })
                .finally(() => {
                    sharedRepairPromise = null;
                });

            return sharedRepairPromise;
        };

        const workers = Array(Math.min(urls.length, CONCURRENCY_LIMIT)).fill().map(async () => {
            let workerBrowser = null;

            const ensureBrowser = async () => {
                if (!workerBrowser || !workerBrowser.isConnected()) {
                    if (workerBrowser) {
                        try { await workerBrowser.close(); } catch (e) {}
                    }
                    workerBrowser = await chromium.launch({
                        headless: false,
                        args: SCRAPER_BROWSER_ARGS
                    });
                    workerBrowser.on('disconnected', () => {
                        log('DEBUG: Worker browser disconnected!', 'WARN');
                    });
                }
                return workerBrowser;
            };

            while (queue.length > 0) {
                const { url, index } = queue.shift();
                let attempts = 0;
                let success = false;
                let products = [];
                const maxAttempts = 2;

                while (attempts < maxAttempts && !success) {
                    attempts++;
                    try {
                        // Small staggered delay
                        await new Promise(r => setTimeout(r, index * 1000));

                        const currentBrowser = await ensureBrowser();
                        const context = await createScraperContext(currentBrowser, sessionFile);

                        try {
                            products = await scrapeUrlInContext(context, url, pincode);

                            if (products && products.length > 0) {
                                success = true;
                                products.forEach(p => p.deliveryTime = globalDeliveryTime);
                            } else {
                                log(`[${url}] Attempt ${attempts} returned 0 products.`, 'WARN');
                                if (attempts < maxAttempts && !sharedRepairAttempted) {
                                    log(`[${url}] Retrying once with a fresh context before mutating the saved session.`, 'INFO');
                                }
                            }
                        } catch (e) {
                            if (e instanceof FlipkartScrapeSignalError && e.code === 'LOCATION_NOT_SET') {
                                log(e.message, 'WARN');
                                if (attempts < maxAttempts) {
                                    await ensureLocationRepairedOnce(`location gate detected from ${url}`);
                                }
                            } else if (e instanceof FlipkartScrapeSignalError && e.code === 'DC_CHANGE') {
                                log(e.message, 'WARN');
                                if (attempts < maxAttempts) {
                                    if (sharedRepairSucceeded || sharedRepairAttempted) {
                                        log(`[${url}] DC changed after session refresh. Retrying with the newest saved session...`, 'INFO');
                                    } else {
                                        await ensureLocationRepairedOnce(`DC change detected from ${url}`);
                                    }
                                }
                            } else {
                                throw e;
                            }
                        } finally {
                            await context.close();
                        }
                    } catch (e) {
                        log(`[${url}] Attempt ${attempts} failed: ${e.message}`, 'ERROR');
                        // Force browser recreation on next attempt to recover from fatal hangs/crashes
                        if (workerBrowser) {
                            try { await workerBrowser.close(); } catch (err) {}
                            workerBrowser = null;
                        }
                    }
                }

                // Add categoryUrl (safeguard)
                if (products) products.forEach(p => {
                    p.categoryUrl = url;
                    if (!p.deliveryTime) p.deliveryTime = globalDeliveryTime;
                });

                results[index] = products || [];
            }

            // Cleanup worker browser
            if (workerBrowser) {
                try { await workerBrowser.close(); } catch (e) {}
            }
        });

        await Promise.all(workers);
        return results;

    } catch (e) {
        log(`Fatal error in scrapeMultiple: ${e.message}`, 'ERROR');
        throw e;
    }
}

/**
 * Fallback to ensure location is set if strict product check fails
 */
async function ensureLocation(page, pincode) {
    log(`Ensuring location is set to ${pincode}...`, 'INFO');
    // Try a simpler URL first if possible, but keeping the known working one for now
    const TARGET_URL = 'https://www.flipkart.com/rv/checkout/changeShippingAddress/add?marketplace=HYPERLOCAL&source=entry&originalUrl=%2Fflipkart-minutes-store%3Fmarketplace%3DHYPERLOCAL&hideAddressForm=true&isMap=true&addressBSTouchpoint=ENTER_LOCATION_MANUALLY';
    const originalUrl = page.url();

    try {
        log(`Navigating to location setup page...`, 'INFO');
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);

        // Try multiple selectors for the input
        const searchInput = page.locator('input#search, input[placeholder*="pincode"], input[placeholder*="location"]');
        if (await searchInput.first().isVisible({ timeout: 10000 })) {
            log('Found search input, typing pincode...', 'INFO');
            await searchInput.first().click(); // ensure focus
            await searchInput.first().clear();
            await page.waitForTimeout(500);
            await searchInput.first().pressSequentially(pincode, { delay: 200 }); // slower typing
            await page.waitForTimeout(1500);

            log('Waiting for suggestions...', 'INFO');
            const suggestionItem = page.locator('li._2APc3k, div._2APc3k, .suggestion-item'); // broader selector
            await suggestionItem.first().waitFor({ state: 'visible', timeout: 8000 });

            log(`Found ${await suggestionItem.count()} suggestions. Selecting best match...`, 'INFO');
            const correctSuggestion = suggestionItem.filter({ hasText: pincode }).first();
            if (await correctSuggestion.isVisible()) {
                log('Clicking exact match...', 'INFO');
                await correctSuggestion.click();
            } else {
                log('Exact match not found, clicking first/second option...', 'WARN');
                if (await suggestionItem.count() > 1) await suggestionItem.nth(1).click();
                else await suggestionItem.first().click();
            }
            await page.waitForTimeout(2000);

            // Check for Serviceability Error (Try again / Not available)
            const unserviceableMsg = page.getByText('Not serviceable', { exact: false }).first();
            const tryAgainBtn = page.getByRole('button', { name: /Try Again|Retry/i }).first();

            if (await unserviceableMsg.isVisible() || await tryAgainBtn.isVisible()) {
                log(`Location ${pincode} appears to be UNSERVICEABLE. Aborting.`, 'ERROR');
                return false;
            }

            log('Checking for Confirm button...', 'INFO');
            const confirmBtn = page.getByRole('button', { name: /Confirm|Save|Proceed/i }).first();
            if (await confirmBtn.isVisible({ timeout: 5000 })) {
                log('Clicking Confirm button...', 'INFO');
                await confirmBtn.click();
            } else {
                const textBtn = page.getByText('Confirm', { exact: false });
                if (await textBtn.count() > 0) {
                    log('Clicking Confirm text button...', 'INFO');
                    await textBtn.first().click();
                } else {
                    log('No explicit confirm button found (maybe auto-submitted?)', 'WARN');
                }
            }
            await page.waitForTimeout(4000); // reduced wait

            log(`Navigating back to ${originalUrl}`, 'INFO');
            await page.goto(originalUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            return true;
        } else {
            log('Search input NOT visible on location page.', 'WARN');
        }
        return false;
    } catch (e) {
        log(`Error ensuring location: ${e.message}`, 'ERROR');
        try { await page.goto(originalUrl); } catch (err) { }
        return false;
    }
}

/**
 * Extraction Logic (In-Memory)
 */
function extractData(pages, domIds, unavailableItems = []) {
    const productMap = new Map();
    const discoveryOrder = [];

    function rememberProduct(product) {
        if (!product || !product.productId) return;

        if (!productMap.has(product.productId)) {
            productMap.set(product.productId, product);
            discoveryOrder.push(product.productId);
            return;
        }

        const existing = productMap.get(product.productId);
        const mergeFields = [
            'skuId',
            'brand',
            'productName',
            'productImage',
            'productWeight',
            'quantity',
            'rating',
            'currentPrice',
            'originalPrice',
            'discountPercentage',
            'productUrl',
            'categoryName'
        ];

        mergeFields.forEach((field) => {
            const currentValue = existing[field];
            const nextValue = product[field];
            if (
                (currentValue === undefined || currentValue === null || currentValue === '' || currentValue === 'N/A') &&
                nextValue !== undefined &&
                nextValue !== null &&
                nextValue !== '' &&
                nextValue !== 'N/A'
            ) {
                existing[field] = nextValue;
            }
        });

        if (!existing.inStock && product.inStock) {
            existing.inStock = true;
        }
        existing.isAd = Boolean(existing.isAd || product.isAd);
    }

    function walkNodes(value, visitor, seen = new Set()) {
        if (!value || typeof value !== 'object') return;
        if (seen.has(value)) return;
        seen.add(value);

        visitor(value);

        if (Array.isArray(value)) {
            value.forEach((item) => walkNodes(item, visitor, seen));
            return;
        }

        Object.values(value).forEach((child) => walkNodes(child, visitor, seen));
    }

    pages.forEach((page) => {
        walkNodes(page, (node) => {
            if (!looksLikeProductNode(node)) {
                return;
            }

            const product = extractProductData(node);
            rememberProduct(product);
        });
    });

    const allProducts = [];
    const processedIds = new Set();

    domIds.forEach((id, index) => {
        if (!productMap.has(id)) return;
        const product = productMap.get(id);
        product.ranking = index + 1;
        allProducts.push(product);
        processedIds.add(id);
    });

    const orphans = [];
    discoveryOrder.forEach((id) => {
        if (!productMap.has(id) || processedIds.has(id)) return;
        const product = productMap.get(id);
        product.ranking = allProducts.length + orphans.length + 1;
        orphans.push(product);
        processedIds.add(id);
    });

    const existingIds = new Set(allProducts.concat(orphans).map((p) => p.productId));
    unavailableItems.forEach((item, idx) => {
        if (!item || !item.productId || existingIds.has(item.productId)) return;
        item.ranking = allProducts.length + orphans.length + idx + 1;
        orphans.push(item);
    });

    return allProducts.concat(orphans);
}

function getPathValue(input, pathExpression) {
    if (!pathExpression) return undefined;

    const parts = String(pathExpression).split('.');
    let current = input;

    for (const part of parts) {
        if (current === null || current === undefined) return undefined;

        if (Array.isArray(current) && /^\d+$/.test(part)) {
            current = current[Number(part)];
            continue;
        }

        current = current[part];
    }

    return current;
}

function extractPrimitive(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value).trim();
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const extracted = extractPrimitive(item);
            if (extracted) return extracted;
        }
        return '';
    }

    if (typeof value === 'object') {
        for (const key of ['text', 'value', 'amount', 'formattedValue', 'displayText', 'title', 'url']) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                const extracted = extractPrimitive(value[key]);
                if (extracted) return extracted;
            }
        }
    }

    return '';
}

function pickFirstValue(input, paths) {
    for (const currentPath of paths) {
        const value = extractPrimitive(getPathValue(input, currentPath));
        if (value) return value;
    }
    return '';
}

function pickPriceFromCollections(input, collectionPaths, acceptedTypes = []) {
    const normalizedTypes = acceptedTypes.map((type) => String(type).toUpperCase());

    for (const currentPath of collectionPaths) {
        const collection = getPathValue(input, currentPath);
        if (!Array.isArray(collection)) continue;

        for (const entry of collection) {
            const typeLabel = String(entry?.priceType || entry?.name || '').toUpperCase();
            const matchesType =
                normalizedTypes.length === 0 ||
                normalizedTypes.some((type) => typeLabel === type || typeLabel.includes(type));

            if (!matchesType) continue;

            const value = extractPrimitive(entry?.value ?? entry?.decimalValue ?? entry);
            if (value) return value;
        }
    }

    return '';
}

function pickBooleanValue(input, paths) {
    for (const currentPath of paths) {
        const rawValue = getPathValue(input, currentPath);

        if (typeof rawValue === 'boolean') return rawValue;

        const normalized = String(rawValue || '').trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }

    return null;
}

function normalizeProductUrl(url) {
    let productUrl = String(url || '').trim();
    if (!productUrl) return 'N/A';

    if (productUrl.includes('https://dl.flipkart.com/dl')) {
        productUrl = productUrl.replace('https://dl.flipkart.com/dl', '');
    }

    if (!productUrl.startsWith('http://') && !productUrl.startsWith('https://')) {
        if (!productUrl.startsWith('/')) {
            productUrl = `/${productUrl}`;
        }
        productUrl = `https://www.flipkart.com${productUrl}`;
    }

    return productUrl;
}

function normalizeImageUrl(url) {
    return String(url || '')
        .trim()
        .replace(/{@width}/g, '400')
        .replace(/{@height}/g, '400')
        .replace(/{@quality}/g, '70');
}

function normalizeDiscountValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;

    const numeric = raw.replace(/[^\d.]+/g, '');
    return numeric || 0;
}

function inferStockState(data) {
    const explicitBoolean = pickBooleanValue(data, [
        'available',
        'inStock',
        'serviceable',
        'isAvailable',
        'isServiceable',
        'availability.isAvailable',
        'availability.serviceable',
        'pls.isAvailable',
        'pls.isServiceable',
        'trackingDataV2.serviceable'
    ]);

    const stockLabel = pickFirstValue(data, [
        'availability.displayState',
        'availabilityStatus',
        'pls.availabilityStatus',
        'buyability.message',
        'buyability.intent',
        'stepperData_0.action.tracking.listingState',
        'status'
    ]).toUpperCase();

    if (
        stockLabel.includes('OUT_OF_STOCK') ||
        stockLabel.includes('OUT OF STOCK') ||
        stockLabel.includes('UNAVAILABLE') ||
        stockLabel.includes('NOT_AVAILABLE') ||
        stockLabel.includes('SOLD_OUT')
    ) {
        return false;
    }

    if (stockLabel.includes('IN_STOCK') || stockLabel.includes('AVAILABLE')) {
        return true;
    }

    if (explicitBoolean !== null) {
        return explicitBoolean;
    }

    return true;
}

function looksLikeProductNode(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;

    const id = pickFirstValue(node, [
        'value.productMeta.productId',
        'value.id',
        'productMeta.productId',
        'productId',
        'itemId',
        'id'
    ]);
    const name = pickFirstValue(node, [
        'value.titles.title',
        'value.titles.newTitle',
        'titles.title',
        'title',
        'name',
        'productName',
        'label_2.value.text'
    ]);
    const price =
        pickFirstValue(node, [
            'value.pricing.finalPrice',
            'value.pricing.displayPrice',
            'pricing.finalPrice',
            'sellingPrice',
            'offerPrice',
            'finalPrice',
            'price',
            'stepperData_0.action.params.price',
            'label_5.value.UNLOCKED.value.text',
            'label_5.value.LOCKED.value.text'
        ]) ||
        pickPriceFromCollections(node, ['pricing.prices', 'value.pricing.prices'], ['SPECIAL_PRICE', 'FINAL', 'TOTAL', 'FSP']);
    const image = pickFirstValue(node, [
        'value.images.0.imageUrl',
        'value.images.0.url',
        'images.0.url',
        'imageUrl',
        'stepperData_0.action.params.productImage'
    ]);
    const url = pickFirstValue(node, [
        'value.baseUrl',
        'value.smartUrl',
        'baseUrl',
        'smartUrl',
        'url',
        'stepperData_0.action.params.url'
    ]);

    let score = 0;
    if (id) score += 1;
    if (name && !/^\d+$/.test(name)) score += 1;
    if (price) score += 1;
    if (image || url) score += 1;

    return score >= 3 || ((id || name || url) && price);
}

function extractProductData(data, id) {
    const resolvedId = id || pickFirstValue(data, [
        'value.productMeta.productId',
        'value.id',
        'productMeta.productId',
        'productId',
        'itemId',
        'id'
    ]);
    if (!resolvedId) return null;

    const title = pickFirstValue(data, [
        'titles.title',
        'titles.newTitle',
        'value.titles.title',
        'value.titles.newTitle',
        'title',
        'name',
        'productName',
        'productTitle',
        'displayName',
        'itemName',
        'label_2.value.text'
    ]);

    if (!title || /^\d+$/.test(String(title).trim())) {
        return null;
    }

    const subtitle = pickFirstValue(data, [
        'titles.subtitle',
        'value.titles.subtitle',
        'subTitle',
        'subtitle',
        'variant',
        'variantText',
        'unit',
        'packSize',
        'productSwatch.attributeOptions.0.0.value',
        'productSwatch.attributeOptions.0.0.text',
        'tagData_3.value.text'
    ]);

    const quantityRegex = /(\d+(?:\.\d+)?\s*(?:g|kg|ml|l|pc|pcs|pack|packs|units?|gms?)\b)/i;
    let extractedQty = '';
    let qMatch = (subtitle || '').match(quantityRegex);
    if (!qMatch) {
        qMatch = (title || '').match(quantityRegex);
    }
    if (qMatch) {
        extractedQty = qMatch[0];
    } else if (subtitle && /^\d/.test(subtitle)) {
        extractedQty = subtitle;
    }

    const finalPrice =
        pickFirstValue(data, [
            'pricing.finalPrice.value',
            'pricing.finalPrice',
            'value.pricing.finalPrice.value',
            'value.pricing.finalPrice',
            'value.pricing.displayPrice',
            'sellingPrice',
            'offerPrice',
            'finalPrice',
            'price',
            'stepperData_0.action.params.price',
            'label_5.value.UNLOCKED.value.text',
            'label_5.value.LOCKED.value.text'
        ]) ||
        pickPriceFromCollections(
            data,
            ['pricing.prices', 'value.pricing.prices', 'productPricingSection.prices', 'productPricingSection.priceInfo.prices'],
            ['SPECIAL_PRICE', 'FINAL', 'TOTAL', 'FSP']
        );

    const mrp =
        pickFirstValue(data, [
            'pricing.mrp.value',
            'pricing.mrp',
            'value.pricing.strikeOffPrice',
            'mrp',
            'price.mrp',
            'price.originalPrice',
            'stepperData_0.action.tracking.mrp',
            'label_4.value.text'
        ]) ||
        pickPriceFromCollections(
            data,
            ['pricing.prices', 'value.pricing.prices', 'productPricingSection.prices', 'productPricingSection.priceInfo.prices'],
            ['MRP', 'MAXIMUM RETAIL PRICE']
        ) ||
        finalPrice;

    const imageUrl = normalizeImageUrl(
        pickFirstValue(data, [
            'media.images.0.url',
            'value.images.0.imageUrl',
            'value.images.0.url',
            'images.0.url',
            'images.0.imageUrl',
            'imageUrl',
            'image.url',
            'stepperData_0.action.params.productImage',
            'hp_reco_pmu_product-card_image_0.value.image_0.value.dynamicImageUrl'
        ])
    );

    const extractedCategory = pickFirstValue(data, [
        'analyticsData.category',
        'analyticsData.vertical',
        'value.analyticsData.category',
        'value.analyticsData.vertical',
        'tracking.category',
        'tracking.vertical',
        'stepperData_0.action.tracking.category',
        'stepperData_0.action.tracking.vertical'
    ]) || 'N/A';

    return {
        productId: resolvedId,
        skuId: pickFirstValue(data, ['listingId', 'productMeta.listingId', 'value.productMeta.listingId']) || 'N/A',
        brand: pickFirstValue(data, [
            'productBrand',
            'value.productBrand',
            'titles.superTitle',
            'value.titles.superTitle',
            'stepperData_0.action.tracking.bn',
            'brand',
            'brandName'
        ]) || 'N/A',
        productName: title,
        productImage: imageUrl || 'N/A',
        productWeight: subtitle || extractedQty || 'N/A',
        quantity: extractedQty || subtitle || 'N/A',
        deliveryTime: 'N/A',
        isAd: pickBooleanValue(data, ['adProductCard', 'adInfo.adProductCard']) === true,
        rating: pickFirstValue(data, ['rating.average', 'ratingData_0.value.rating']) || 0,
        currentPrice: finalPrice || 'N/A',
        originalPrice: mrp || 'N/A',
        discountPercentage: normalizeDiscountValue(
            pickFirstValue(data, [
                'pricing.totalDiscount',
                'value.pricing.discountPercentage',
                'value.pricing.discount',
                'discount',
                'label_15.value.UNLOCKED.value.text',
                'label_15.value.LOCKED.value.text'
            ])
        ),
        inStock: inferStockState(data),
        productUrl: normalizeProductUrl(
            pickFirstValue(data, [
                'baseUrl',
                'value.baseUrl',
                'smartUrl',
                'value.smartUrl',
                'productUrl',
                'stepperData_0.action.params.url',
                'url',
                'listingUrl',
                'deeplink'
            ]) || `/p/${resolvedId}`
        ),
        platform: 'flipkart_minutes',
        categoryName: extractedCategory
    };
}

module.exports = { scrape, scrapeMultiple, setupSession, scrapeUrlInContext, ensureLocation };

