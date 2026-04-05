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
const API_ENDPOINT_PRIMARY = 'https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false';
const API_ENDPOINT_FALLBACK = 'https://2.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false';
const ENDPOINT_PREFERENCE_PATH = path.join(__dirname, 'pincode_api_endpoint_map.json');

function resolveApiEndpointUrl(value) {
    const input = String(value || '').trim();
    if (!input) {
        return '';
    }

    try {
        const parsed = new URL(input);
        if (!parsed.pathname.includes('/api/4/page/fetch')) {
            return '';
        }

        if (!parsed.searchParams.has('cacheFirst')) {
            parsed.searchParams.set('cacheFirst', 'false');
        }

        return parsed.toString();
    } catch (_) {
        return '';
    }
}

function loadEndpointPreferenceMap() {
    try {
        const raw = fs.readFileSync(ENDPOINT_PREFERENCE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsed)
                .map(([pin, endpoint]) => [String(pin).trim(), resolveApiEndpointUrl(endpoint)])
                .filter(([pin, endpoint]) => pin && endpoint)
        );
    } catch (_) {
        return {};
    }
}

function persistEndpointPreferenceMap() {
    try {
        fs.writeFileSync(ENDPOINT_PREFERENCE_PATH, JSON.stringify(endpointPreferenceMap, null, 2));
    } catch (error) {
        console.warn(`[FlipkartMinutes] Failed to save endpoint preference map: ${error.message}`);
    }
}

function normalizePincode(pincode) {
    return String(pincode || '').trim();
}

function extractActiveSessionPincode(storageState) {
    if (!storageState || !Array.isArray(storageState.origins)) {
        return '';
    }

    for (const originEntry of storageState.origins) {
        if (!originEntry || !Array.isArray(originEntry.localStorage)) {
            continue;
        }

        const myPinEntry = originEntry.localStorage.find((item) => item && item.name === 'mypin' && item.value);
        if (myPinEntry) {
            return normalizePincode(myPinEntry.value);
        }
    }

    return '';
}

let endpointPreferenceMap = loadEndpointPreferenceMap();

function getPinnedApiEndpoint(pincode) {
    const normalizedPin = normalizePincode(pincode);
    if (!normalizedPin) {
        return '';
    }

    return resolveApiEndpointUrl(endpointPreferenceMap[normalizedPin]);
}

function rememberApiEndpointForPin(pincode, requestUrl) {
    const normalizedPin = normalizePincode(pincode);
    const resolvedUrl = resolveApiEndpointUrl(requestUrl);

    if (!normalizedPin || !resolvedUrl) {
        return false;
    }

    const current = resolveApiEndpointUrl(endpointPreferenceMap[normalizedPin]);
    if (current === resolvedUrl) {
        return false;
    }

    endpointPreferenceMap[normalizedPin] = resolvedUrl;
    persistEndpointPreferenceMap();
    return true;
}

function swapApiEndpointHost(requestUrl, targetHost) {
    const resolvedUrl = resolveApiEndpointUrl(requestUrl);
    if (!resolvedUrl) {
        return '';
    }

    try {
        const parsed = new URL(resolvedUrl);
        parsed.host = targetHost;
        if (!parsed.searchParams.has('cacheFirst')) {
            parsed.searchParams.set('cacheFirst', 'false');
        }
        return parsed.toString();
    } catch (_) {
        return '';
    }
}

function getAlternateApiEndpoint(requestUrl) {
    const resolvedUrl = resolveApiEndpointUrl(requestUrl);
    if (!resolvedUrl) {
        return API_ENDPOINT_FALLBACK;
    }

    try {
        const parsed = new URL(resolvedUrl);
        if (parsed.host === '1.rome.api.flipkart.com') {
            return swapApiEndpointHost(resolvedUrl, '2.rome.api.flipkart.com');
        }
        if (parsed.host === '2.rome.api.flipkart.com') {
            return swapApiEndpointHost(resolvedUrl, '1.rome.api.flipkart.com');
        }
    } catch (_) {
        return API_ENDPOINT_FALLBACK;
    }

    return API_ENDPOINT_FALLBACK;
}

function extractDcIdFromJwtToken(token) {
    const rawToken = String(token || '').trim();
    if (!rawToken) {
        return '';
    }

    const tokenParts = rawToken.split('.');
    if (tokenParts.length < 2) {
        return '';
    }

    try {
        let payload = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
        payload += '='.repeat((4 - payload.length % 4) % 4);
        const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
        return String(decodedPayload?.z || '').trim();
    } catch (_) {
        return '';
    }
}

function extractDcIdFromCookies(cookies = []) {
    if (!Array.isArray(cookies)) {
        return '';
    }

    const atCookie = cookies.find((cookie) => cookie && cookie.name === 'at' && cookie.value);
    if (!atCookie) {
        return '';
    }

    return extractDcIdFromJwtToken(atCookie.value);
}

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
        log(`✓ API dump saved: ${filename}`, 'SUCCESS');
        return filename;
    } catch (err) {
        log(`✗ Failed to save API dump: ${err.message}`, 'ERROR');
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

async function repairLocationSession(sessionFile, pincode, reason = '', options = {}) {
    const launchHeadless = options.headless ?? true;
    const reasonSuffix = reason ? ` (${reason})` : '';
    log(`Refreshing Flipkart session location for ${pincode}${reasonSuffix}...`, 'INFO');

    const browser = await chromium.launch({
        headless: launchHeadless,
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
    } catch (error) {
        log(`Failed to refresh session for ${pincode}: ${error.message}`, 'ERROR');
        return false;
    } finally {
        if (context) {
            try { await context.close(); } catch (_) {}
        }
        try { await browser.close(); } catch (_) {}
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
async function setupSession(pincode, options = {}) {
    if (!pincode) throw new Error('Pincode is required for setup.');

    const sessionFile = path.join(SESSION_DIR, `flipkart_session_${pincode}.json`);
    const launchHeadless = options.headless ?? true;

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
        headless: launchHeadless,
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
        const unserviceableMsg = page.getByText(/Not serviceable|not available at this location|unable to service/i).first();

        if (await unserviceableMsg.isVisible()) {
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

async function scrapeUrlDirectApiInContext(context, url, pincode) {
    const page = await context.newPage();
    const storageState = await context.storageState();
    const activeSessionPincode = extractActiveSessionPincode(storageState);
    const effectivePincode = activeSessionPincode || normalizePincode(pincode);
    const sessionCookies = await context.cookies();
    const dcId = extractDcIdFromCookies(sessionCookies);
    const pinnedEndpoint = getPinnedApiEndpoint(effectivePincode);
    const API_PATH = '/api/4/page/fetch';
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
    const cloneJson = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    const deepMerge = (base, override) => {
        if (Array.isArray(override)) {
            return cloneJson(override);
        }
        if (!isPlainObject(base) || !isPlainObject(override)) {
            return cloneJson(override);
        }

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
    const normalizePageUri = (input) => {
        const raw = String(input || '').trim();
        if (!raw) {
            return '/?marketplace=HYPERLOCAL';
        }

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
    const LOCATION_GATE_PATTERN = /hyperlocal-preview-page|user-address-v\d|changeShippingAddress/i;
    const isLocationGatePageUri = (pageUri) => LOCATION_GATE_PATTERN.test(String(pageUri || ''));
    const buildFallbackRequestBody = (sourceUrl, pin) => {
        const parsedPin = Number.parseInt(String(pin || '').trim(), 10);
        const pincodeNumber = Number.isFinite(parsedPin) ? parsedPin : null;
        const locationContext = { pincode: pincodeNumber, changed: false };

        if (dcId) {
            locationContext.dcId = dcId;
        }

        return {
            pageUri: normalizePageUri(sourceUrl),
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
            locationContext
        };
    };
    const sanitizeCapturedRequestBody = (candidateBody, sourceUrl, pin) => {
        const fallback = buildFallbackRequestBody(sourceUrl, pin);
        if (!isPlainObject(candidateBody)) {
            return fallback;
        }

        const sanitized = cloneJson(candidateBody);
        const pageUri = normalizePageUri(candidateBody.pageUri || sourceUrl);
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

        if (dcId) {
            sanitized.locationContext.dcId = dcId;
        }

        return sanitized;
    };
    const normalizeRequestUrl = (requestUrl) =>
        resolveApiEndpointUrl(pinnedEndpoint)
        || resolveApiEndpointUrl(requestUrl)
        || API_ENDPOINT_PRIMARY;
    const buildEndpointCandidates = (requestUrl) => {
        const normalizedUrl = normalizeRequestUrl(requestUrl);
        const alternateUrl = resolveApiEndpointUrl(getAlternateApiEndpoint(normalizedUrl));
        return alternateUrl && alternateUrl !== normalizedUrl ? [normalizedUrl, alternateUrl] : [normalizedUrl];
    };
    const buildDirectHeaders = (captured) => {
        const headers = {
            accept: captured.accept || '*/*',
            'accept-language': captured['accept-language'] || 'en-GB,en-US;q=0.9,en;q=0.8',
            'content-type': 'application/json',
            'cache-control': 'no-cache',
            pragma: 'no-cache',
            flipkart_secure: captured.flipkart_secure || 'true',
            'x-user-agent': captured['x-user-agent'] || DEFAULT_X_USER_AGENT,
            origin: captured.origin || 'https://www.flipkart.com',
            referer: captured.referer || url
        };

        for (const key of ['x-partner-context', 'x-ack-response', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'user-agent']) {
            const value = captured[key];
            if (value !== undefined && value !== null && value !== '') {
                headers[key] = value;
            }
        }

        if (dcId) {
            headers['x-dc-id'] = dcId;
        }

        return headers;
    };
    const stableStringify = (value) => {
        if (value === null || value === undefined) return String(value);
        if (typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    };
    const extractRedirectPageUri = (payload) => {
        const redirectUrl =
            payload?.RESPONSE?.pageMeta?.redirectionObject?.url ||
            payload?.RESPONSE?.pageMeta?.redirectionObject?.redirectionAction?.url ||
            '';

        if (!redirectUrl) {
            return '';
        }

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
        if (!paginationState.hasMorePages) {
            return null;
        }

        const pageContextOverride = {
            pageNumber: getPageNumber(currentRequestBody) + 1,
            paginatedFetch: true,
            fetchAllPages: false
        };

        if (paginationState.pageHashKey) {
            pageContextOverride.pageHashKey = paginationState.pageHashKey;
        }
        if (paginationState.paginationContextMap) {
            pageContextOverride.paginationContextMap = paginationState.paginationContextMap;
        }

        return deepMerge(currentRequestBody, { pageContext: pageContextOverride });
    };
    const fetchPageOnce = async (requestUrl, headers, requestBody) =>
        page.evaluate(
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
                        try { data = JSON.parse(raw); } catch (_) { data = null; }
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
    const fetchPageWithRetry = async (requestUrl, headers, requestBody) => {
        for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
            const result = await fetchPageOnce(requestUrl, headers, requestBody);
            if (result.ok) {
                return result;
            }

            const retriable = result.status === 0 || result.status === 429 || result.status >= 500;
            if (!retriable || attempt === RETRY_COUNT) {
                return result;
            }

            const backoffMs = 400 * (2 ** (attempt - 1));
            log(`Direct API transient failure (${result.status || 'network'}). Retry ${attempt}/${RETRY_COUNT - 1} in ${backoffMs}ms`, 'WARN');
            await sleep(backoffMs);
        }

        return { ok: false, status: 0, requestUrl, data: null, error: 'Retry loop exhausted' };
    };
    const isDcChangeResult = (result) =>
        result?.status === 406 &&
        /DC Change/i.test(String(result?.data?.ERROR_MESSAGE || result?.data?.errorMessage || result?.error || ''));
    const formatApiFailure = (result) => {
        if (result?.data) {
            try { return JSON.stringify(result.data); } catch (_) {}
        }
        return result?.error || 'unknown error';
    };
    let requestUrl = normalizeRequestUrl(pinnedEndpoint || API_ENDPOINT_PRIMARY);
    const fetchPageWithEndpointFallback = async (headers, requestBody, phaseLabel) => {
        const candidateUrls = buildEndpointCandidates(requestUrl);
        let lastResult = null;

        for (let index = 0; index < candidateUrls.length; index += 1) {
            const candidateUrl = candidateUrls[index];
            const result = await fetchPageWithRetry(candidateUrl, headers, requestBody);
            if (result.ok && result.data) {
                requestUrl = resolveApiEndpointUrl(result.requestUrl || candidateUrl) || candidateUrl;
                rememberApiEndpointForPin(effectivePincode, requestUrl);
                return result;
            }

            lastResult = result;
            if (index < candidateUrls.length - 1) {
                const fromHost = new URL(candidateUrl).host;
                const nextHost = new URL(candidateUrls[index + 1]).host;
                if (isDcChangeResult(result)) {
                    requestUrl = candidateUrls[index + 1];
                    rememberApiEndpointForPin(effectivePincode, requestUrl);
                }
                log(`[${url}] ${phaseLabel} failed on ${fromHost} (${result.status || 'network'}). Retrying on ${nextHost}...`, 'WARN');
            }
        }

        return lastResult;
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
        requestUrl = normalizeRequestUrl(capturedRequestUrl || API_ENDPOINT_PRIMARY);
        const headers = buildDirectHeaders(capturedHeaders);
        let requestBody = sanitizeCapturedRequestBody(capturedRequestBody, url, effectivePincode);

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
            const bootstrapResult = await fetchPageWithEndpointFallback(headers, requestBody, 'bootstrap');
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

            const pageResult = await fetchPageWithEndpointFallback(headers, requestBody, phase);
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
                    effectivePincode,
                    sourceUrl: url,
                    endpoint: requestUrl,
                    pinnedEndpoint: getPinnedApiEndpoint(effectivePincode) || null,
                    mode: 'direct_api_pagination',
                    responsesCaptured: collectedData.length,
                    productsExtracted: finalProducts.length,
                    generatedAt: new Date().toISOString(),
                    dcId: dcId || null
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
    } catch (error) {
        if (error instanceof FlipkartScrapeSignalError) {
            throw error;
        }
        log(`Error scraping ${url}: ${error.message}`, 'ERROR');
        return [];
    } finally {
        await page.close();
    }
}

/**
 * Internal function to scrape a single URL given a browser context.
 * Used by both scrape() and scrapeMultiple().
 */
async function scrapeUrlInContext(context, url, pincode) {
    return scrapeUrlDirectApiInContext(context, url, pincode);

    const page = await context.newPage();

    // DON'T block resources during scraping - causes pages to not load properly
    // await interceptResources(page);

    try {
        // Setup API intercept
        const collectedData = [];
        const collectedPIDs = new Set();
        const API_ENDPOINT_PART = '/api/4/page/fetch';

        await page.route(`**${API_ENDPOINT_PART}*`, async route => {
            // NOTE: We must NOT block API requests here, so we wrap in try-catch
            // and fallback to standard fetch if our interceptLogic is complex.
            // But since 'interceptResources' handles images/fonts globally, 
            // we just need to handle the specific API interception here.

            // Wait: interceptResources uses page.route('**/*')... 
            // Playwright routing: specific routes should be defined BEFORE global catch-alls if priority matters,
            // OR we rely on how Playwright handles overrides.
            // Actually, declaring `page.route` multiple times works, the matching order is LIFO (last registered matches first).
            // So we register API interception LAST (effectively first priority for this specific URL pattern).

            try {
                const response = await route.fetch();
                try {
                    const json = await response.json();
                    collectedData.push(json);
                    // Save API dump
                    saveApiDump(pincode, url, json, 'api_response');
                } catch (e) { }
                await route.fulfill({ response });
            } catch (err) {
                // Handle socket hangup or network failures gracefully
                try { await route.continue(); } catch (e) { }
            }
        });

        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        // Click-and-Back Strategy
        try {
            const firstProduct = page.locator('a[href*="/p/"]').first();
            if (await firstProduct.count() > 0) {
                await firstProduct.click();
                await page.waitForTimeout(2000);
                await page.goBack({ waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(2000);
            }
        } catch (e) { log(`[${url}] Click-and-back skipped/failed: ${e.message}`, 'WARN'); }

        // Scroll Logic
        let previousHeight = 0;
        let sameHeightCount = 0;
        const maxSameHeight = 10;
        const scrollSelector = '.lQLKCP';

        while (true) {
            // Scrape DOM IDs
            const currentPIDs = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href*="pid="]'));
                return anchors.map(a => {
                    const href = a.getAttribute('href') || '';
                    const match = href.match(/pid=([^&]+)/);
                    return match ? match[1] : null;
                }).filter(id => id !== null);
            });
            currentPIDs.forEach(pid => collectedPIDs.add(pid));

            // Scroll
            const containerExists = await page.locator(scrollSelector).count() > 0;
            let currentScrollHeight;

            if (containerExists) {
                currentScrollHeight = await page.evaluate((selector) => {
                    const el = document.querySelector(selector);
                    if (el) { el.scrollTop = el.scrollHeight; return el.scrollHeight; }
                    return 0;
                }, scrollSelector);
            } else {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                currentScrollHeight = await page.evaluate(() => document.body.scrollHeight);
            }
            // Double tap window scroll
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

            if (currentScrollHeight === previousHeight) {
                sameHeightCount++;
                if (sameHeightCount >= maxSameHeight) break;
            } else {
                sameHeightCount = 0;
                previousHeight = currentScrollHeight;
            }
            await page.waitForTimeout(1500);
        }

        // Scrape Unavailable Items explicitly
        const unavailableItems = await page.evaluate(() => {
            const items = [];
            const headers = Array.from(document.querySelectorAll('div')).filter(el =>
                el.textContent && el.textContent.trim().includes('Few items are unavailable')
            );

            if (headers.length === 0) return items;

            const header = headers[0];
            const allParentCtrs = Array.from(document.querySelectorAll('#_parentCtr_'));

            // Find the _parentCtr_ that follows the header
            const container = allParentCtrs.find(ctr =>
                header.compareDocumentPosition(ctr) & 4 // Node.DOCUMENT_POSITION_FOLLOWING = 4
            );

            if (container) {
                const productCards = Array.from(container.children).filter(c => c.querySelector('img'));
                productCards.forEach((card, idx) => {
                    const img = card.querySelector('img');
                    if (!img) return;
                    const imageUrl = img.src || '';
                    const textLines = card.innerText.split('\n').filter(t => t.trim().length > 0);
                    const title = textLines.find(l => l.length >= 25 && !l.includes('₹')) || textLines[2] || 'Unknown Title';
                    const priceLine = textLines.find(l => l.includes('₹'));
                    const price = priceLine ? priceLine.replace(/[^0-9]/g, '') : null;
                    const imgIdMatch = imageUrl.match(/original-([a-zA-Z0-9]+)\./);
                    const domId = imgIdMatch ? imgIdMatch[1] : `unavailable_${idx}`;
                    items.push({
                        productId: domId,
                        productName: title,
                        productImage: imageUrl,
                        productWeight: "",
                        quantity: "",
                        deliveryTime: "N/A",
                        isAd: false,
                        rating: 0,
                        currentPrice: price ? parseFloat(price) : 0,
                        originalPrice: price ? parseFloat(price) : 0,
                        discountPercentage: 0,
                        isOutOfStock: true,
                        productUrl: null,
                        platform: "flipkart_minutes",
                        ranking: 9999 + idx
                    });
                });
            }
            return items;
        });

        log(`[${url}] Scrape Complete. API Pages: ${collectedData.length}, DOM IDs: ${collectedPIDs.size}, Unavailable Items: ${unavailableItems.length}`, 'SUCCESS');

        // Check extraction result
        let finalProducts = extractData(collectedData, Array.from(collectedPIDs), unavailableItems);

        // Add categoryUrl to each product
        finalProducts.forEach(p => p.categoryUrl = url);

        return finalProducts;

    } catch (e) {
        log(`Error scraping ${url}: ${e.message}`, 'ERROR');
        return [];
    } finally {
        await page.close();
    }
}

/**
 * Extracts delivery time from the main store page
 */
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
async function scrape(url, pincode, headless = true) {
    if (!url) throw new Error('URL is required');
    if (!pincode) throw new Error('Pincode is required');

    {
        let sessionRes;
        try {
            sessionRes = await setupSession(pincode, { headless });
        } catch (error) {
            log(`Failed to setup session for ${pincode}: ${error.message}`, 'ERROR');
            return [];
        }

        if (sessionRes.status === 'unserviceable') {
            log(`Pincode ${pincode} is unserviceable. Returning empty.`, 'WARN');
            return [];
        }

        const sessionFile = sessionRes.sessionFile;
        const browser = await chromium.launch({
            headless,
            args: SCRAPER_BROWSER_ARGS
        });

        try {
            const attemptScrape = async () => {
                const context = await createScraperContext(browser, sessionFile);
                try {
                    return await scrapeUrlDirectApiInContext(context, url, pincode);
                } finally {
                    await context.close();
                }
            };

            let finalProducts = [];
            let shouldRetryAfterRepair = false;

            try {
                finalProducts = await attemptScrape();
            } catch (error) {
                if (error instanceof FlipkartScrapeSignalError && error.code === 'LOCATION_NOT_SET') {
                    shouldRetryAfterRepair = await repairLocationSession(sessionFile, pincode, 'single scrape location gate', { headless });
                } else if (error instanceof FlipkartScrapeSignalError && error.code === 'DC_CHANGE') {
                    log(`[${url}] Rome API requested a fresh session. Refreshing saved storage and retrying once...`, 'WARN');
                    shouldRetryAfterRepair = await repairLocationSession(sessionFile, pincode, 'single scrape DC change', { headless });
                } else {
                    throw error;
                }
            }

            if ((!finalProducts || finalProducts.length === 0) && shouldRetryAfterRepair) {
                log('Retrying single scrape with refreshed Flipkart session...', 'INFO');
                finalProducts = await attemptScrape();
            }

            if (finalProducts) {
                finalProducts.forEach((product) => {
                    product.deliveryTime = 'N/A';
                });
            }

            return finalProducts;
        } finally {
            await browser.close();
        }
    }

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
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-client-side-phishing-detection',
            '--disable-sync',
            '--metrics-recording-only',
            '--no-first-run',
            '--no-default-browser-check'
        ]
    });

    try {
        const context = await browser.newContext({ storageState: sessionFile });

        // Skipped delivery time extraction as requested
        const globalDeliveryTime = "N/A";

        const finalProducts = await scrapeUrlInContext(context, url, pincode);

        // Inject Delivery Time
        if (finalProducts) finalProducts.forEach(p => p.deliveryTime = globalDeliveryTime);

        // Fallback logic specific to single scrape (retained for backward compatibility)
        if (finalProducts.length === 0) {
            log('No products extracted. Retrying with explicit location check...', 'WARN');
            const page = await context.newPage();
            // Don't block resources for location setup - need full rendering
            // await interceptResources(page);

            const locationFixed = await ensureLocation(page, pincode);

            if (locationFixed) {
                // **CRITICAL UPDATE**: Save the fixed session immediately!
                log('Location updated successfully. Saving session...', 'SUCCESS');
                await context.storageState({ path: sessionFile });
            }

            await page.close();

            if (locationFixed) {
                log('Retrying scrape after location update...', 'INFO');
                const retryProducts = await scrapeUrlInContext(context, url, pincode);
                if (retryProducts) retryProducts.forEach(p => p.deliveryTime = globalDeliveryTime);

                await browser.close();
                return retryProducts;
            }
        }
        await browser.close();
        return finalProducts;

    } catch (e) {
        await browser.close();
        throw e;
    }
}

/**
 * Scrape Multiple URLs concurrently
 */
async function scrapeMultiple(urls, pincode, maxConcurrentTabs, headless = true) {
    if (!urls || urls.length === 0) throw new Error('URLs array is required');
    if (!pincode) throw new Error('Pincode is required');

    {
        let sessionRes;
        try {
            sessionRes = await setupSession(pincode, { headless });
        } catch (error) {
            log(`Failed to setup session for ${pincode}: ${error.message}`, 'ERROR');
            return urls.map(() => []);
        }

        if (sessionRes.status === 'unserviceable') {
            log(`Pincode ${pincode} is unserviceable. Returning empty for all URLs.`, 'WARN');
            return urls.map(() => []);
        }

        const sessionFile = sessionRes.sessionFile;
        const requestedConcurrency = Number(maxConcurrentTabs);
        const concurrencyLimit = Number.isFinite(requestedConcurrency)
            ? Math.max(1, Math.min(requestedConcurrency, 6))
            : 2;
        const results = new Array(urls.length);
        const queue = urls.map((currentUrl, index) => ({ url: currentUrl, index }));
        let sharedRepairPromise = null;
        let sharedRepairAttempted = false;
        let sharedRepairSucceeded = false;
        let sharedSessionVersion = 0;

        log(`Starting parallel scrape for ${urls.length} URLs with Pincode: ${pincode}`, 'INFO');
        log(`Processing ${urls.length} URLs with concurrency ${concurrencyLimit}...`, 'INFO');

        const ensureLocationRepairedOnce = async (reason) => {
            if (sharedRepairSucceeded) {
                return true;
            }

            if (sharedRepairPromise) {
                return sharedRepairPromise;
            }

            sharedRepairAttempted = true;
            sharedRepairPromise = repairLocationSession(sessionFile, pincode, reason, { headless })
                .then((fixed) => {
                    sharedRepairSucceeded = fixed;
                    if (fixed) {
                        sharedSessionVersion += 1;
                    }
                    return fixed;
                })
                .finally(() => {
                    sharedRepairPromise = null;
                });

            return sharedRepairPromise;
        };

        const workers = Array(Math.min(urls.length, concurrencyLimit)).fill(null).map(async () => {
            let workerBrowser = null;
            let workerSessionVersion = -1;

            const ensureBrowser = async () => {
                const needsFreshBrowser = workerSessionVersion !== sharedSessionVersion;
                if (!workerBrowser || !workerBrowser.isConnected() || needsFreshBrowser) {
                    if (workerBrowser) {
                        try { await workerBrowser.close(); } catch (_) {}
                    }
                    workerBrowser = await chromium.launch({
                        headless,
                        args: SCRAPER_BROWSER_ARGS
                    });
                    workerBrowser.on('disconnected', () => {
                        log('DEBUG: Worker browser disconnected!', 'WARN');
                    });
                    workerSessionVersion = sharedSessionVersion;
                }

                return workerBrowser;
            };

            while (queue.length > 0) {
                const nextItem = queue.shift();
                if (!nextItem) {
                    break;
                }

                const { url, index } = nextItem;
                let attempts = 0;
                let success = false;
                let products = [];
                const maxAttempts = 3;

                while (attempts < maxAttempts && !success) {
                    attempts += 1;

                    try {
                        await new Promise((resolve) => setTimeout(resolve, index * 1000));

                        const currentBrowser = await ensureBrowser();
                        const context = await createScraperContext(currentBrowser, sessionFile);

                        try {
                            products = await scrapeUrlDirectApiInContext(context, url, pincode);

                            if (products && products.length > 0) {
                                success = true;
                                products.forEach((product) => {
                                    product.deliveryTime = 'N/A';
                                });
                            } else if (attempts < maxAttempts && !sharedRepairAttempted) {
                                log(`[${url}] Attempt ${attempts} returned 0 products. Retrying with a fresh context before mutating the saved session.`, 'WARN');
                            }
                        } catch (error) {
                            if (error instanceof FlipkartScrapeSignalError && error.code === 'LOCATION_NOT_SET') {
                                log(error.message, 'WARN');
                                if (attempts < maxAttempts) {
                                    const repaired = await ensureLocationRepairedOnce(`location gate detected from ${url}`);
                                    if (repaired && workerBrowser) {
                                        try { await workerBrowser.close(); } catch (_) {}
                                        workerBrowser = null;
                                    }
                                }
                            } else if (error instanceof FlipkartScrapeSignalError && error.code === 'DC_CHANGE') {
                                log(error.message, 'WARN');
                                if (attempts < maxAttempts) {
                                    if (sharedRepairSucceeded || sharedRepairAttempted) {
                                        log(`[${url}] DC changed after session refresh. Retrying with the newest saved session...`, 'INFO');
                                        if (workerBrowser) {
                                            try { await workerBrowser.close(); } catch (_) {}
                                            workerBrowser = null;
                                        }
                                    } else {
                                        const repaired = await ensureLocationRepairedOnce(`DC change detected from ${url}`);
                                        if (repaired && workerBrowser) {
                                            try { await workerBrowser.close(); } catch (_) {}
                                            workerBrowser = null;
                                        }
                                    }
                                }
                            } else {
                                throw error;
                            }
                        } finally {
                            await context.close();
                        }
                    } catch (error) {
                        log(`[${url}] Attempt ${attempts} failed: ${error.message}`, 'ERROR');
                        if (workerBrowser) {
                            try { await workerBrowser.close(); } catch (_) {}
                            workerBrowser = null;
                        }
                    }
                }

                if (products) {
                    products.forEach((product) => {
                        product.categoryUrl = url;
                        if (!product.deliveryTime) {
                            product.deliveryTime = 'N/A';
                        }
                    });
                }

                results[index] = products || [];
            }

            if (workerBrowser) {
                try { await workerBrowser.close(); } catch (_) {}
            }
        });

        await Promise.all(workers);
        return results;
    }

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
        const CONCURRENCY_LIMIT = 2; // Reduced from 4 to prevent browser crashes
        const results = new Array(urls.length);
        const queue = urls.map((url, index) => ({ url, index }));

        log(`Processing ${urls.length} URLs with concurrency ${CONCURRENCY_LIMIT}...`, 'INFO');

        const workers = Array(Math.min(urls.length, CONCURRENCY_LIMIT)).fill().map(async () => {
            let workerBrowser = null;

            const ensureBrowser = async () => {
                if (!workerBrowser || !workerBrowser.isConnected()) {
                    if (workerBrowser) {
                        try { await workerBrowser.close(); } catch (e) {}
                    }
                    workerBrowser = await chromium.launch({
                        headless: headless,
                        args: [
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
                        ]
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

                        const context = await currentBrowser.newContext({
                            storageState: sessionFile,
                            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                        });
                        await context.addInitScript(() => {
                            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                        });

                        products = await scrapeUrlInContext(context, url, pincode);

                        if (products && products.length > 0) {
                            success = true;
                            products.forEach(p => p.deliveryTime = globalDeliveryTime);
                        } else {
                            log(`[${url}] Attempt ${attempts} returned 0 products.`, 'WARN');
                            if (attempts < maxAttempts) {
                                log('Attempting location fix during retry...', 'INFO');
                                const fixPage = await context.newPage();
                                const fixed = await ensureLocation(fixPage, pincode);
                                if (fixed) {
                                    log('Location fix in worker successful. Saving session...', 'SUCCESS');
                                    await context.storageState({ path: sessionFile });
                                }
                                await fixPage.close();
                            }
                        }
                        await context.close();
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
            const unserviceableMsg = page.getByText(/Not serviceable|not available at this location|unable to service/i).first();

            if (await unserviceableMsg.isVisible()) {
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
    const seenIds = new Set();
    const domIdSet = new Set(domIds);
    const mergeUniqueEntries = (left, right, keyBuilder) => {
        const combined = [];
        const seen = new Set();

        for (const source of [left, right]) {
            if (!Array.isArray(source)) continue;
            source.forEach((entry) => {
                if (!entry) return;
                const key = keyBuilder(entry);
                if (!key || seen.has(key)) return;
                seen.add(key);
                combined.push(entry);
            });
        }

        return combined;
    };

    const upsertProduct = (product) => {
        if (!product?.productId) return;

        const parseComboCount = (value) => {
            const parsed = Number.parseInt(String(value ?? '').trim(), 10);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        };

        if (!productMap.has(product.productId)) {
            productMap.set(product.productId, product);
            return;
        }

        const existing = productMap.get(product.productId);
        productMap.set(product.productId, {
            ...existing,
            ...product,
            isAd: Boolean(existing?.isAd || product?.isAd),
            inStock: product?.inStock ?? existing?.inStock,
            isVariant: existing?.isVariant === false || product?.isVariant === false
                ? false
                : Boolean(existing?.isVariant || product?.isVariant),
            combo: Math.max(parseComboCount(existing?.combo), parseComboCount(product?.combo), 1),
            comboOfRefs: mergeUniqueEntries(
                existing?.comboOfRefs,
                product?.comboOfRefs,
                (entry) => `${entry?.productId || ''}|${entry?.productWeight || ''}`
            )
        });
    };

    const buildVariantRefs = (productSwatch) => {
        if (!productSwatch?.products || typeof productSwatch.products !== 'object') {
            return [];
        }

        return Object.entries(productSwatch.products).map(([variantId, variantValue]) => ({
            productId: variantValue?.id || variantId,
            productWeight: variantValue?.titles?.subtitle || variantValue?.subTitle || 'N/A',
            quantity: variantValue?.titles?.subtitle || variantValue?.subTitle || 'N/A',
            listingId: variantValue?.listingId || 'N/A',
            attributeIndexes: Array.isArray(variantValue?.attributeIndexes) ? variantValue.attributeIndexes : [],
            isPrimary: Array.isArray(variantValue?.attributeIndexes) && variantValue.attributeIndexes.length > 0
                ? Number(variantValue.attributeIndexes[0]) === 0
                : false
        }));
    };

    // Helper functions (Same as before, but scoped inside)
    function extractFromContext(ctx) {
        const id = ctx.productId;
        const product = extractProductData(ctx, id);
        if (product) upsertProduct(product);
    }

    function extractFromProduct(rawProduct) {
        const productInfo = rawProduct.productInfo;
        if (!productInfo) return;
        const value = productInfo.value;
        if (!value) return;
        const variantRefs = buildVariantRefs(value.productSwatch);
        const comboCount = Math.max(1, variantRefs.length);
        const selectedVariantRef = variantRefs.find((entry) => entry.productId === value.id);
        const mainIsVariant = variantRefs.length > 1 && selectedVariantRef
            ? !selectedVariantRef.isPrimary
            : false;

        // Main
        if (value.id) {
            const product = extractProductData(value, value.id, {
                isVariant: mainIsVariant,
                comboCount: comboCount,
                fallbackBrand: value.productBrand || value.brand || value.titles?.superTitle || '',
                comboOfRefs: mainIsVariant
                    ? []
                    : variantRefs.filter((entry) => entry.productId && entry.productId !== value.id),
                adInfo: rawProduct.adInfo || value.adInfo || null
            });
            if (product) {
                upsertProduct(product);
                seenIds.add(value.id);
            }
        }
        // Variants
        if (value.productSwatch && value.productSwatch.products) {
            Object.keys(value.productSwatch.products).forEach(vId => {
                const vData = value.productSwatch.products[vId];
                const cleanId = vData.id || vId;
                const vProd = extractProductData(vData, cleanId, {
                    isVariant: cleanId !== value.id ? true : mainIsVariant,
                    comboCount: comboCount,
                    parentProductId: value.id,
                    fallbackBrand: vData.productBrand || vData.brand || vData.titles?.superTitle || value.productBrand || value.brand || value.titles?.superTitle || '',
                    adInfo: vData.adInfo || rawProduct.adInfo || value.adInfo || null
                });
                if (vProd) {
                    upsertProduct(vProd);
                    seenIds.add(cleanId);
                }
            });
        }
    }

    function extractFromComponent(comp) {
        const value = comp.value;
        if (!value) return;
        if (value.id) {
            const variantRefs = buildVariantRefs(value.productSwatch);
            const comboCount = Math.max(1, variantRefs.length);
            const selectedVariantRef = variantRefs.find((entry) => entry.productId === value.id);
            const mainIsVariant = variantRefs.length > 1 && selectedVariantRef
                ? !selectedVariantRef.isPrimary
                : false;
            const product = extractProductData(value, value.id, {
                isVariant: mainIsVariant,
                comboCount: comboCount,
                fallbackBrand: value.productBrand || value.brand || value.titles?.superTitle || '',
                comboOfRefs: mainIsVariant
                    ? []
                    : variantRefs.filter((entry) => entry.productId && entry.productId !== value.id),
                adInfo: value.adInfo || null
            });
            if (product) {
                upsertProduct(product);
                seenIds.add(value.id);
            }
        }
    }

    // Process Pages
    pages.forEach(page => {
        if (page.RESPONSE && page.RESPONSE.pageData && page.RESPONSE.pageData.pageContext) {
            const ctx = page.RESPONSE.pageData.pageContext;
            if (ctx.productId) extractFromContext(ctx);
        }
        const slots = page.RESPONSE?.slots || [];
        slots.forEach(slot => {
            const widget = slot.widget;
            if (widget && widget.data) {
                if (widget.data.products) {
                    widget.data.products.forEach(p => extractFromProduct(p));
                }
                if (widget.data.renderableComponents) {
                    widget.data.renderableComponents.forEach(c => extractFromComponent(c));
                }
            }
        });
    });

    // Reconstruct Order
    let allProducts = [];
    const processedIds = new Set();

    // 1. Follow DOM Order
    domIds.forEach((id, index) => {
        if (productMap.has(id)) {
            const prod = productMap.get(id);
            prod.ranking = index + 1;
            allProducts.push(prod);
            processedIds.add(id);
        }
    });

    // 2. Append Orphans
    let orphans = [];
    for (const [id, prod] of productMap) {
        if (!processedIds.has(id)) {
            prod.ranking = allProducts.length + orphans.length + 1;
            orphans.push(prod);
        }
    }

    // 3. Append Unavailable Items (Dedup check)
    // Map existing products for quick lookup to avoid dupes if API actually HAD them
    const existingIds = new Set(allProducts.concat(orphans).map(p => p.productId));

    unavailableItems.forEach((item, idx) => {
        if (!existingIds.has(item.productId)) {
            item.ranking = allProducts.length + orphans.length + idx + 1;
            orphans.push(item);
        }
    });

    return allProducts.concat(orphans);
}

function extractProductData(data, id, options = {}) {
    if (!id) return null;

    const pickFirstText = (...values) => {
        for (const value of values) {
            const normalized = String(value ?? '').trim();
            if (normalized) {
                return normalized;
            }
        }
        return '';
    };

    let imageUrl = '';
    if (data.media && data.media.images && data.media.images.length > 0) {
        imageUrl = data.media.images[0].url;
    } else if (data.imageUrl) {
        imageUrl = data.imageUrl;
    }

    if (imageUrl) {
        imageUrl = imageUrl.replace(/{@width}/g, '400')
            .replace(/{@height}/g, '400')
            .replace('{@quality}', '70');
    }

    const pricing = data.pricing || {};
    const finalPrice = pricing.finalPrice?.value;
    const mrpObj = pricing.prices?.find(p => p.priceType === 'MRP');
    const mrp = mrpObj ? mrpObj.value : finalPrice;
    const discount = pricing.totalDiscount || 0;

    const titles = data.titles || {};
    const title = titles.title || data.title;
    const subtitle = titles.subtitle || data.subTitle;
    const brand = pickFirstText(
        data.productBrand,
        data.brand,
        titles.superTitle,
        data.tracking?.bn,
        data.tracking?.brand,
        data.action?.tracking?.bn,
        options.fallbackBrand
    );

    // Reject products whose name resolves to a plain number — this means the API
    // returned incomplete data and something like a discount % was mistaken for a title.
    if (!title || /^\d+$/.test(String(title).trim())) {
        return null;
    }

    let prodUrl = '/p/' + id;
    if (data.baseUrl) prodUrl = data.baseUrl;
    else if (data.smartUrl) prodUrl = data.smartUrl.replace('https://dl.flipkart.com/dl', '');

    if (!prodUrl.startsWith('http') && !prodUrl.startsWith('/')) prodUrl = '/' + prodUrl;
    if (!prodUrl.startsWith('http')) prodUrl = 'https://www.flipkart.com' + prodUrl;

    // Extract Quantity intelligently
    const quantityRegex = /(\d+(?:\.\d+)?\s*(?:g|kg|ml|l|pc|pcs|pack|units?|gms?)\b)/i;
    let extractedQty = '';
    let subT = subtitle || '';

    // 1. Try regex on subtitle
    let qMatch = (subT || '').match(quantityRegex);
    if (qMatch) {
        extractedQty = qMatch[0];
    } else {
        // 2. Try regex on title
        qMatch = (title || '').match(quantityRegex);
        if (qMatch) {
            extractedQty = qMatch[0];
        } else {
            // 3. Fallback: Use subtitle if it's NOT just text (likely a color)
            // If subtitle starts with a number, assume it's relevant
            if (subT && /^\d/.test(subT)) {
                extractedQty = subT;
            }
        }
    }

    // Attempt to extract category (vertical)
    let extractedCategory = 'N/A';
    // Check common locations for category in Flipkart data
    if (data.analyticsData) {
        extractedCategory = data.analyticsData.category || data.analyticsData.vertical || 'N/A';
    } else if (data.tracking) {
        extractedCategory = data.tracking.category || data.tracking.vertical || 'N/A';
    }

    const isAd = Boolean(data.adProductCard || data.adInfo || options.adInfo);
    const comboOfRefs = Array.isArray(options.comboOfRefs) ? options.comboOfRefs : [];
    const parsedComboCount = Number.parseInt(String(options.comboCount ?? '').trim(), 10);
    const comboCount = Number.isFinite(parsedComboCount) && parsedComboCount > 0 ? parsedComboCount : 1;

    return {
        productId: id,
        parentProductId: options.parentProductId || 'N/A',
        productName: title,
        brand: brand || 'N/A',
        productImage: imageUrl,
        productWeight: subtitle || "N/A",
        quantity: subtitle || "N/A",
        combo: comboCount,
        comboOfRefs: comboOfRefs,
        deliveryTime: "N/A",
        isAd: isAd,
        isVariant: options.isVariant === true,
        rating: data.rating?.average || 0,
        currentPrice: finalPrice,
        originalPrice: mrp,
        discountPercentage: discount,
        inStock: data.availability?.displayState === 'IN_STOCK',
        productUrl: prodUrl,
        platform: "flipkart_minutes",
        categoryName: extractedCategory // Return extracted category
    };
}


module.exports = { scrape, scrapeMultiple, setupSession, scrapeUrlInContext, ensureLocation };
