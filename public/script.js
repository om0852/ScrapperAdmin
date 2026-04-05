// Platform icons for better visualization
const platformIcons = {
    blinkit: '🛍️',
    dmart: '🏪',
    flipkart: '💳',
    instamart: '🍕',
    jiomart: '📦',
    zepto: '⚡'
};

// Platform order
const platformOrder = ['blinkit', 'dmart', 'flipkart', 'instamart', 'jiomart', 'zepto'];

// App state
const state = {
    platforms: {},
    refreshInterval: null
};

// Pause/Resume control for both scraping and ingestion
const jobControl = {
    ingestPaused: false,
    scrapePaused: false
};

const manualIngestProgress = {
    totalFiles: 0,
    completedFiles: 0,
    successCount: 0,
    failCount: 0,
    completedTotals: {
        totalProducts: 0,
        processedProducts: 0,
        inserted: 0,
        new: 0,
        updated: 0,
        newGroups: 0
    },
    currentJob: null,
    status: 'idle'
};

function clampPercent(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
}

function setManualIngestProgressVisible(visible) {
    const panel = document.getElementById('manualIngestProgressPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !visible);
}

function resetManualIngestProgress(totalFiles) {
    manualIngestProgress.totalFiles = totalFiles;
    manualIngestProgress.completedFiles = 0;
    manualIngestProgress.successCount = 0;
    manualIngestProgress.failCount = 0;
    manualIngestProgress.completedTotals = {
        totalProducts: 0,
        processedProducts: 0,
        inserted: 0,
        new: 0,
        updated: 0,
        newGroups: 0
    };
    manualIngestProgress.currentJob = null;
    manualIngestProgress.status = 'running';
    setManualIngestProgressVisible(true);
    renderManualIngestProgress();
}

function renderManualIngestProgress() {
    const panel = document.getElementById('manualIngestProgressPanel');
    if (!panel) return;

    const currentJob = manualIngestProgress.currentJob;
    const totalFiles = manualIngestProgress.totalFiles;
    const filesDone = manualIngestProgress.completedFiles;

    const displayInserted = manualIngestProgress.completedTotals.inserted + (currentJob?.inserted || 0);
    const displayNew = manualIngestProgress.completedTotals.new + (currentJob?.new || 0);
    const displayUpdated = manualIngestProgress.completedTotals.updated + (currentJob?.updated || 0);
    const displayGroups = manualIngestProgress.completedTotals.newGroups + (currentJob?.newGroups || 0);

    const currentProcessed = Number(currentJob?.processedProducts || 0);
    const currentTotal = Number(currentJob?.totalProducts || 0);
    const currentBatch = Number(currentJob?.currentBatch || 0);
    const totalBatches = Number(currentJob?.totalBatches || 0);

    const filesStat = document.getElementById('manualIngestFilesStat');
    const insertedStat = document.getElementById('manualIngestInsertedStat');
    const newStat = document.getElementById('manualIngestNewStat');
    const updatedStat = document.getElementById('manualIngestUpdatedStat');
    const groupsStat = document.getElementById('manualIngestGroupsStat');
    const currentFile = document.getElementById('manualIngestCurrentFile');
    const statusBadge = document.getElementById('manualIngestStatusBadge');
    const productsLabel = document.getElementById('manualIngestProductsLabel');
    const filesLabel = document.getElementById('manualIngestFilesLabel');
    const productsBar = document.getElementById('manualIngestProductsBar');
    const filesBar = document.getElementById('manualIngestFilesBar');
    const batchMeta = document.getElementById('manualIngestBatchMeta');

    filesStat.textContent = `${filesDone} / ${totalFiles}`;
    insertedStat.textContent = String(displayInserted);
    newStat.textContent = String(displayNew);
    updatedStat.textContent = String(displayUpdated);
    groupsStat.textContent = String(displayGroups);

    if (currentJob) {
        currentFile.textContent = `${currentJob.fileName || 'Current file'} (${currentJob.fileIndex || filesDone + 1}/${totalFiles})`;
        productsLabel.textContent = `${currentProcessed} / ${currentTotal || 0} products`;
        batchMeta.textContent = totalBatches > 0
            ? `Batch ${currentBatch}/${totalBatches} • ${currentJob.message || 'Processing'}`
            : (currentJob.message || 'Processing');
    } else if (manualIngestProgress.status === 'success') {
        currentFile.textContent = 'All selected files processed successfully';
        productsLabel.textContent = 'Completed';
        batchMeta.textContent = `${manualIngestProgress.successCount} succeeded • ${manualIngestProgress.failCount} failed`;
    } else if (manualIngestProgress.status === 'warning') {
        currentFile.textContent = 'Batch completed with some failures';
        productsLabel.textContent = 'Completed with warnings';
        batchMeta.textContent = `${manualIngestProgress.successCount} succeeded • ${manualIngestProgress.failCount} failed`;
    } else if (manualIngestProgress.status === 'error') {
        currentFile.textContent = 'Current ingestion job failed';
        productsLabel.textContent = `${currentProcessed} / ${currentTotal || 0} products`;
        batchMeta.textContent = currentJob?.error || 'Ingestion failed';
    } else {
        currentFile.textContent = 'No active ingestion job';
        productsLabel.textContent = '0 / 0 products';
        batchMeta.textContent = 'Waiting to start...';
    }

    filesLabel.textContent = `${filesDone} / ${totalFiles} files`;
    productsBar.style.width = `${clampPercent(currentTotal > 0 ? (currentProcessed / currentTotal) * 100 : 0)}%`;
    filesBar.style.width = `${clampPercent(totalFiles > 0 ? (filesDone / totalFiles) * 100 : 0)}%`;

    statusBadge.className = `ingest-status-badge ${manualIngestProgress.status}`;
    statusBadge.textContent =
        manualIngestProgress.status === 'running' ? 'Running' :
        manualIngestProgress.status === 'success' ? 'Completed' :
        manualIngestProgress.status === 'warning' ? 'Completed' :
        manualIngestProgress.status === 'error' ? 'Failed' :
        'Idle';
}

function updateManualIngestProgressFromJob(fileContext, jobStatus) {
    manualIngestProgress.status = jobStatus.status === 'failed' ? 'error' : 'running';
    manualIngestProgress.currentJob = {
        ...jobStatus,
        fileIndex: fileContext.fileIndex,
        fileName: fileContext.fileName
    };
    renderManualIngestProgress();
}

function finalizeManualIngestProgress(fileContext, jobStatus, success) {
    const stats = jobStatus?.result?.stats || jobStatus?.stats || {};

    manualIngestProgress.completedFiles += 1;
    manualIngestProgress.completedTotals.totalProducts += Number(stats.totalProducts || jobStatus?.totalProducts || 0);
    manualIngestProgress.completedTotals.processedProducts += Number(stats.processedProducts || jobStatus?.processedProducts || 0);
    manualIngestProgress.completedTotals.inserted += Number(stats.inserted || jobStatus?.inserted || 0);
    manualIngestProgress.completedTotals.new += Number(stats.new || jobStatus?.new || 0);
    manualIngestProgress.completedTotals.updated += Number(stats.updated || jobStatus?.updated || 0);
    manualIngestProgress.completedTotals.newGroups += Number(stats.newGroups || jobStatus?.newGroups || 0);

    if (success) {
        manualIngestProgress.successCount += 1;
    } else {
        manualIngestProgress.failCount += 1;
    }

    manualIngestProgress.currentJob = null;

    if (manualIngestProgress.completedFiles >= manualIngestProgress.totalFiles) {
        manualIngestProgress.status = manualIngestProgress.failCount > 0 ? 'warning' : 'success';
    } else {
        manualIngestProgress.status = 'running';
    }

    renderManualIngestProgress();
}

async function waitForManualIngestJob(jobId, fileContext) {
    let transientFailures = 0;

    while (true) {
        try {
            const response = await fetch(`/api/manual-ingest-v2/status/${encodeURIComponent(jobId)}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch ingestion progress');
            }

            transientFailures = 0;
            updateManualIngestProgressFromJob(fileContext, data);

            if (data.status === 'completed') {
                return data;
            }

            if (data.status === 'failed') {
                const jobError = new Error(data.error || data.message || 'Ingestion job failed');
                jobError.jobStatus = data;
                throw jobError;
            }
        } catch (error) {
            transientFailures += 1;
            if (transientFailures >= 5) {
                throw error;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 1200));
    }
}

// Auto-pause ingestion when network goes offline
window.addEventListener('offline', () => {
    if (!jobControl.ingestPaused) {
        jobControl.ingestPaused = true;
        addLog('⚠️ Network disconnected — ingestion AUTO-PAUSED.', 'error');
        setIngestPauseUI(true);
    }
});
window.addEventListener('online', () => {
    addLog('🌐 Network back online. Click Resume when ready.', 'info');
});

// Initialize app
const PINCODES = ['122010', '201303', '201014', '122008', '122016', '401202', '400070', '400703', '400706', '401101'];

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    addLog('Initializing Server Manager...', 'info');
    await refreshPlatforms();
    await loadCategories();
    await loadManualIngestCategories();
    renderPincodes();
    setupEventListeners();
    setDefaultScrapeTime();
    startAutoRefresh();
}

function setDefaultScrapeTime() {
    const overrideInput = document.getElementById('manualDateOverride');
    if (!overrideInput) return;

    const now = new Date();
    // Set to today at 08:00 AM local time
    now.setHours(8, 0, 0, 0);

    // Format required by datetime-local: YYYY-MM-DDThh:mm
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    overrideInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

function renderPincodes() {
    const container = document.getElementById('pincodeCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    PINCODES.forEach(pin => {
        const div = document.createElement('div');
        div.className = 'w-full check-pill';
        div.innerHTML = `
            <label class="check-pill" style="display:flex; height:100%;">
                <input type="checkbox" id="pin_${pin}" value="${pin}">
                <div class="pill-box" style="width:100%;">
                    ${pin}
                </div>
            </label>
        `;
        container.appendChild(div);
    });
}

function setupEventListeners() {
    document.getElementById('refreshBtn').addEventListener('click', refreshPlatforms);
    document.getElementById('stopAllBtn').addEventListener('click', stopAllServers);
    document.getElementById('massScrapeForm').addEventListener('submit', handleMassScrape);

    // Scrape pause/resume button
    document.getElementById('pauseMassScrapeBtn').addEventListener('click', handleScrapeTogglePause);

    // Manual DB Ingestion Listeners
    document.getElementById('manualCategorySelect').addEventListener('change', handleManualCategoryChange);
    document.getElementById('platformFilterSelect').addEventListener('change', handlePlatformFilterChange);
    document.getElementById('manualIngestForm').addEventListener('submit', handleManualIngest);
    document.getElementById('pauseIngestBtn').addEventListener('click', handleIngestTogglePause);

    // Tab Buttons Event Listeners
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => switchTab(e.target.closest('.tab-button').dataset.tab));
    });

    // Terminal Toggle Event Listener
    document.getElementById('toggleTerminalBtn').addEventListener('click', toggleTerminal);
}

// ── Pause/Resume UI Helpers ────────────────────────────────────────────────
function setIngestPauseUI(isPaused) {
    const btn = document.getElementById('pauseIngestBtn');
    const icon = document.getElementById('pauseIngestIcon');
    const text = document.getElementById('pauseIngestText');
    if (isPaused) {
        icon.textContent = 'play_arrow';
        text.textContent = 'Resume';
        btn.style.background = 'rgba(34,197,94,0.12)';
        btn.style.color = '#22c55e';
        btn.style.border = '1px solid rgba(34,197,94,0.3)';
    } else {
        icon.textContent = 'pause';
        text.textContent = 'Pause';
        btn.style.background = 'rgba(250,204,21,0.12)';
        btn.style.color = '#facc15';
        btn.style.border = '1px solid rgba(250,204,21,0.3)';
    }
}

function setScrapePauseUI(isPaused) {
    const btn = document.getElementById('pauseMassScrapeBtn');
    const icon = document.getElementById('pauseScrapeIcon');
    const text = document.getElementById('pauseScrapeText');
    if (isPaused) {
        icon.textContent = 'play_arrow';
        text.textContent = 'Resume';
        btn.style.background = 'rgba(34,197,94,0.2)';
        btn.style.color = '#22c55e';
    } else {
        icon.textContent = 'pause';
        text.textContent = 'Pause';
        btn.style.background = '';
        btn.style.color = '';
    }
}

async function handleIngestTogglePause() {
    if (!jobControl.ingestPaused) {
        // Pause
        jobControl.ingestPaused = true;
        setIngestPauseUI(true);
        addLog('⏸ Ingestion PAUSED. Click Resume when ready.', 'warning');
    } else {
        // Check connectivity before resuming
        addLog('🔍 Checking connectivity before resume...', 'info');
        try {
            const health = await fetch('/api/health/check').then(r => r.json());
            if (!health.healthy) {
                addLog(`❌ Cannot resume: ${!health.internet ? 'No internet' : ''}${!health.internet && !health.mongodb ? ' + ' : ''}${!health.mongodb ? 'MongoDB disconnected' : ''}. Fix and try again.`, 'error');
                return;
            }
        } catch (err) {
            addLog(`❌ Cannot reach server to check health: ${err.message}`, 'error');
            return;
        }
        jobControl.ingestPaused = false;
        setIngestPauseUI(false);
        addLog('▶ Ingestion RESUMED — connectivity confirmed.', 'success');
    }
}

async function handleScrapeTogglePause() {
    if (!jobControl.scrapePaused) {
        // Send pause to backend
        jobControl.scrapePaused = true;
        setScrapePauseUI(true);
        fetch('/api/job/pause?type=scrape', { method: 'POST' });
        addLog('⏸ Mass scrape PAUSED. Click Resume when ready.', 'warning');
    } else {
        // Ask backend to resume (it checks its own health)
        addLog('🔍 Checking connectivity before resume...', 'info');
        try {
            const res = await fetch('/api/job/resume?type=scrape', { method: 'POST' });
            const data = await res.json();
            if (!data.success) {
                addLog(`❌ Cannot resume: ${data.error}`, 'error');
                return;
            }
        } catch (err) {
            addLog(`❌ Cannot reach server to resume: ${err.message}`, 'error');
            return;
        }
        jobControl.scrapePaused = false;
        setScrapePauseUI(false);
        addLog('▶ Mass scrape RESUMED — connectivity confirmed.', 'success');
    }
}
// ─────────────────────────────────────────────────────────────────────────────

function switchTab(tabName) {
    // Hide all panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    // Deactivate all buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });

    // Show selected panel
    const selectedPanel = document.getElementById(`tab-${tabName}`);
    if (selectedPanel) {
        selectedPanel.classList.add('active');
    }

    // Activate selected button
    const selectedButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (selectedButton) {
        selectedButton.classList.add('active');
    }
}

function toggleTerminal() {
    const container = document.getElementById('terminalContainer');
    const logArea = document.getElementById('activityLog');
    const btnIcon = document.querySelector('#toggleTerminalBtn span');

    if (container.classList.contains('h-64')) {
        // Collapse it
        container.classList.remove('h-64');
        container.classList.add('h-10'); // Just enough for the header
        logArea.classList.add('hidden');
        btnIcon.textContent = 'expand_less';
    } else {
        // Expand it
        container.classList.remove('h-10');
        container.classList.add('h-64');
        logArea.classList.remove('hidden');
        btnIcon.textContent = 'expand_more';
        // Auto scroll to bottom when opened
        logArea.scrollTop = logArea.scrollHeight;
    }
}

async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        const data = await response.json();

        // Render platforms
        const pfContainer = document.getElementById('platformCheckboxes');
        pfContainer.innerHTML = '';
        data.platforms.forEach(pf => {
            const div = document.createElement('div');
            div.className = 'check-pill';
            div.innerHTML = `
                <label>
                    <input type="checkbox" id="pf_${pf}" value="${pf}">
                    <div class="pill-box">
                        ${pf}
                    </div>
                </label>
            `;
            pfContainer.appendChild(div);
        });

        // Render categories
        const catContainer = document.getElementById('categoryCheckboxes');
        catContainer.innerHTML = '';
        data.categories.forEach(cat => {
            const catId = cat.replace(/[^a-zA-Z0-9]/g, '_');
            const div = document.createElement('label');
            div.className = 'checkbox-item';
            div.innerHTML = `
                <input type="checkbox" id="cat_${catId}" value="${cat}">
                <span>${cat}</span>
            `;
            catContainer.appendChild(div);
        });

    } catch (e) {
        addLog(`Failed to load categories: ${e.message}`, 'error');
        document.getElementById('platformCheckboxes').innerHTML = '<div class="loading-text" style="color:var(--danger-color)">Error loading platforms</div>';
        document.getElementById('categoryCheckboxes').innerHTML = '<div class="loading-text" style="color:var(--danger-color)">Error loading categories</div>';
    }
}

async function handleMassScrape(e) {
    e.preventDefault();

    // Get checked platforms
    const pfNodes = document.querySelectorAll('#platformCheckboxes input[type="checkbox"]:checked');
    const selectedPlatforms = Array.from(pfNodes).map(n => n.value);

    // Get checked categories
    const catNodes = document.querySelectorAll('#categoryCheckboxes input[type="checkbox"]:checked');
    const selectedCategories = Array.from(catNodes).map(n => n.value);

    // Get checked pincodes
    const pinNodes = document.querySelectorAll('#pincodeCheckboxes input[type="checkbox"]:checked');
    const selectedPincodes = Array.from(pinNodes).map(n => n.value);

    const autoIngest = document.getElementById('autoIngestToggle').checked;
    const headless = document.getElementById('headlessToggle').checked;

    if (selectedPlatforms.length === 0) {
        alert('Please select at least one platform');
        return;
    }
    if (selectedCategories.length === 0) {
        alert('Please select at least one category');
        return;
    }
    if (selectedPincodes.length === 0) {
        alert('Please enter at least one pincode');
        return;
    }

    const btn = document.getElementById('startMassScrapeBtn');
    const pauseBtn = document.getElementById('pauseMassScrapeBtn');
    btn.disabled = true;
    btn.classList.add('loading');
    jobControl.scrapePaused = false;
    setScrapePauseUI(false);
    pauseBtn.style.display = 'inline-flex';

    addLog(`Initiating mass scrape for ${selectedPlatforms.length} platforms, ${selectedCategories.length} categories, Auto Ingest: ${autoIngest ? 'ON' : 'OFF'}, Headless: ${headless ? 'ON' : 'OFF'}...`, 'info');

    try {
        const res = await fetch('/api/mass-scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                platforms: selectedPlatforms,
                categories: selectedCategories,
                pincodes: selectedPincodes,
                autoIngest: autoIngest,
                headless: headless
            })
        });

        const data = await res.json();
        if (data.success) {
            addLog(`Mass scrape job started. Pause button is active — use it to pause/resume at any pincode boundary.`, 'success');
        } else {
            addLog(`Failed to start mass scrape: ${data.error}`, 'error');
            pauseBtn.style.display = 'none';
        }
    } catch (e) {
        addLog(`Error triggering mass scrape: ${e.message}`, 'error');
        pauseBtn.style.display = 'none';
    } finally {
        setTimeout(() => {
            btn.disabled = false;
            btn.classList.remove('loading');
            // Poll until scrape job finishes, then hide pause button
            const pollInterval = setInterval(async () => {
                try {
                    const status = await fetch('/api/job/status').then(r => r.json());
                    if (!status.scrape?.running) {
                        pauseBtn.style.display = 'none';
                        jobControl.scrapePaused = false;
                        clearInterval(pollInterval);
                    }
                } catch (_) { /* ignore */ }
            }, 5000);
        }, 2000);
    }
}

async function loadManualIngestCategories() {
    try {
        const response = await fetch('/api/scraped-folders');
        const folders = await response.json();

        const select = document.getElementById('manualCategorySelect');
        select.innerHTML = '<option value="">Select a category folder...</option>';

        folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder;
            option.textContent = folder;
            select.appendChild(option);
        });
    } catch (e) {
        addLog(`Failed to load manual ingestion folders: ${e.message}`, 'error');
    }
}

// Store current files for platform filtering
let currentManualFiles = [];

async function handleManualCategoryChange(e) {
    const folder = e.target.value;
    const checkboxContainer = document.getElementById('manualFileCheckboxes');

    // Reset platform filter
    document.getElementById('platformFilterSelect').value = '';

    if (!folder) {
        checkboxContainer.innerHTML = '<div class="loading-text">Select a category first</div>';
        currentManualFiles = [];
        return;
    }

    checkboxContainer.innerHTML = '<div class="loading-text">Loading files...</div>';

    try {
        const response = await fetch(`/api/scraped-files?folder=${encodeURIComponent(folder)}`);
        const files = await response.json();
        currentManualFiles = files;

        renderManualFileCheckboxes(files);

    } catch (e) {
        addLog(`Failed to load files for folder: ${e.message}`, 'error');
        checkboxContainer.innerHTML = '<div class="loading-text" style="color:var(--danger-color)">Error loading files</div>';
    }
}

function renderManualFileCheckboxes(files) {
    const checkboxContainer = document.getElementById('manualFileCheckboxes');
    checkboxContainer.innerHTML = '';

    if (files.length === 0) {
        checkboxContainer.innerHTML = '<div class="loading-text">No JSON files found</div>';
        return;
    }

    // Add Select All Option
    const selectAllDiv = document.createElement('label');
    selectAllDiv.className = 'checkbox-item';
    selectAllDiv.style.borderBottom = '1px solid var(--border-dark)';
    selectAllDiv.style.marginBottom = '1rem';
    selectAllDiv.style.paddingBottom = '1rem';
    selectAllDiv.innerHTML = `
        <input type="checkbox" id="selectAllManualFiles">
        <span style="font-weight: 700; color: var(--primary);">✓ Select All ${files.length} Files</span>
    `;
    checkboxContainer.appendChild(selectAllDiv);

    const selectAllCb = document.getElementById('selectAllManualFiles');
    selectAllCb.addEventListener('change', (ev) => {
        const allFileCbs = document.querySelectorAll('.manual-file-cb');
        allFileCbs.forEach(cb => cb.checked = ev.target.checked);
    });

    files.forEach((file, index) => {
        const div = document.createElement('label');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" id="mfile_${index}" class="manual-file-cb" value="${file}">
            <span>${file}</span>
        `;
        checkboxContainer.appendChild(div);
    });
}

function handlePlatformFilterChange(e) {
    const platform = e.target.value;
    
    if (!platform) {
        // Show all files
        renderManualFileCheckboxes(currentManualFiles);
        return;
    }

    // Filter files by platform
    const filteredFiles = currentManualFiles.filter(file => {
        const platformName = platform.toLowerCase();
        return file.toLowerCase().includes(platformName);
    });

    renderManualFileCheckboxes(filteredFiles);
}

async function handleManualIngestLegacy(e) {
    e.preventDefault();

    const category = document.getElementById('manualCategorySelect').value;
    const checkedNodes = document.querySelectorAll('.manual-file-cb:checked');
    const selectedFiles = Array.from(checkedNodes).map(n => n.value);
    const dateOverride = document.getElementById('manualDateOverride').value;

    if (!category || selectedFiles.length === 0) {
        alert('Please select both a category and at least one file.');
        return;
    }

    const btn = document.getElementById('startManualIngestBtn');
    const pauseBtn = document.getElementById('pauseIngestBtn');
    btn.disabled = true;
    const originalText = btn.innerHTML;

    // Reset pause state and show pause button
    jobControl.ingestPaused = false;
    setIngestPauseUI(false);
    pauseBtn.style.display = 'inline-flex';

    const total = selectedFiles.length;
    let successCount = 0;
    let failCount = 0;

    addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    addLog(`🗂️  Starting batch ingestion — ${total} file${total > 1 ? 's' : ''} queued`, 'info');
    addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const current = i + 1;

        // ── Pause Guard ── wait here if paused until resumed + connectivity OK
        if (jobControl.ingestPaused) {
            btn.innerHTML = `⏸ Paused (${current}/${total})`;
            addLog(`⏸ [${current}/${total}] Paused before: ${file}. Click Resume to continue.`, 'warning');

            // Poll until ingestPaused is cleared and connectivity is confirmed
            await new Promise(resolve => {
                const interval = setInterval(async () => {
                    if (!jobControl.ingestPaused) {
                        // Check connectivity
                        try {
                            const health = await fetch('/api/health/check').then(r => r.json());
                            if (health.healthy) {
                                addLog(`▶ [${current}/${total}] Connectivity OK — resuming from: ${file}`, 'success');
                                clearInterval(interval);
                                resolve();
                            } else {
                                const reason = !health.internet ? 'No internet' : 'MongoDB offline';
                                addLog(`⚠ [${current}/${total}] ${reason} — waiting...`, 'warning');
                                // Re-pause and wait again
                                jobControl.ingestPaused = true;
                                setIngestPauseUI(true);
                            }
                        } catch (_) {
                            addLog(`⚠ [${current}/${total}] Server unreachable — waiting...`, 'warning');
                        }
                    }
                }, 2000);
            });
        }

        // Update button to show progress
        btn.innerHTML = `⚙️ Processing... (${current}/${total})`;

        addLog(`▶ [${current}/${total}] Ingesting: ${file}`, 'info');

        try {
            const res = await fetch('/api/manual-ingest-v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, file, dateOverride })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                const s = data.stats || {};
                addLog(`✅ [${current}/${total}] Done: ${file}`, 'success');
                addLog(`   📦 New: ${s.new ?? 0}  |  🔄 Updated: ${s.updated ?? 0}  |  🆕 New Groups: ${s.newGroups ?? 0}`, 'success');
                successCount++;
            } else {
                addLog(`❌ [${current}/${total}] Failed: ${file}`, 'error');
                addLog(`   Reason: ${data.error || data.message || 'Unknown error'}`, 'error');
                failCount++;
            }
        } catch (e) {
            // Auto-pause on network error
            addLog(`❌ [${current}/${total}] Network error: ${e.message} — AUTO-PAUSING`, 'error');
            jobControl.ingestPaused = true;
            setIngestPauseUI(true);
            failCount++;
        }
    }

    addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    addLog(`🏁 Batch complete — ✅ ${successCount} succeeded  |  ❌ ${failCount} failed  |  📁 ${total} total`, successCount > 0 && failCount === 0 ? 'success' : 'info');
    addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');

    // Clean up UI
    jobControl.ingestPaused = false;
    pauseBtn.style.display = 'none';
    btn.disabled = false;
    btn.innerHTML = originalText;
}

async function handleManualIngest(e) {
    e.preventDefault();

    const category = document.getElementById('manualCategorySelect').value;
    const checkedNodes = document.querySelectorAll('.manual-file-cb:checked');
    const selectedFiles = Array.from(checkedNodes).map(node => node.value);
    const dateOverride = document.getElementById('manualDateOverride').value;

    if (!category || selectedFiles.length === 0) {
        alert('Please select both a category and at least one file.');
        return;
    }

    const btn = document.getElementById('startManualIngestBtn');
    const pauseBtn = document.getElementById('pauseIngestBtn');
    btn.disabled = true;
    const originalText = btn.innerHTML;

    jobControl.ingestPaused = false;
    setIngestPauseUI(false);
    pauseBtn.style.display = 'inline-flex';

    const total = selectedFiles.length;
    let successCount = 0;
    let failCount = 0;

    resetManualIngestProgress(total);

    addLog(`Manual ingestion queued for ${total} file${total > 1 ? 's' : ''}.`, 'info');

    for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        const current = index + 1;
        const fileContext = {
            fileIndex: current,
            fileName: file
        };

        if (jobControl.ingestPaused) {
            btn.innerHTML = `Paused (${current}/${total})`;
            addLog(`[${current}/${total}] Paused before: ${file}. Click Resume to continue.`, 'warning');

            await new Promise(resolve => {
                const interval = setInterval(async () => {
                    if (jobControl.ingestPaused) {
                        return;
                    }

                    try {
                        const health = await fetch('/api/health/check').then(response => response.json());
                        if (health.healthy) {
                            addLog(`[${current}/${total}] Connectivity OK. Resuming ${file}.`, 'success');
                            clearInterval(interval);
                            resolve();
                        } else {
                            const reason = !health.internet ? 'No internet' : 'MongoDB offline';
                            addLog(`[${current}/${total}] ${reason}. Waiting...`, 'warning');
                            jobControl.ingestPaused = true;
                            setIngestPauseUI(true);
                        }
                    } catch (_) {
                        addLog(`[${current}/${total}] Server unreachable. Waiting...`, 'warning');
                    }
                }, 2000);
            });
        }

        btn.innerHTML = `Processing... (${current}/${total})`;
        addLog(`[${current}/${total}] Ingesting ${file}`, 'info');

        try {
            const startResponse = await fetch('/api/manual-ingest-v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, file, dateOverride })
            });

            const startData = await startResponse.json();

            if (!startResponse.ok || !startData.success || !startData.jobId) {
                finalizeManualIngestProgress(fileContext, startData || {}, false);
                addLog(`[${current}/${total}] Failed to start ${file}`, 'error');
                addLog(`Reason: ${startData.error || startData.message || 'Unknown error'}`, 'error');
                failCount += 1;
                continue;
            }

            updateManualIngestProgressFromJob(fileContext, startData.job || {
                status: 'queued',
                fileName: file,
                processedProducts: 0,
                totalProducts: 0,
                inserted: 0,
                new: 0,
                updated: 0,
                newGroups: 0,
                currentBatch: 0,
                totalBatches: 0,
                message: 'Queued'
            });

            const finalJob = await waitForManualIngestJob(startData.jobId, fileContext);
            const stats = finalJob.result?.stats || finalJob.stats || {};

            finalizeManualIngestProgress(fileContext, finalJob, true);
            addLog(`[${current}/${total}] Done: ${file}`, 'success');
            addLog(`Inserted: ${stats.inserted ?? 0} | New: ${stats.new ?? 0} | Updated: ${stats.updated ?? 0} | Groups: ${stats.newGroups ?? 0}`, 'success');
            successCount += 1;
        } catch (error) {
            finalizeManualIngestProgress(fileContext, error.jobStatus || manualIngestProgress.currentJob || { error: error.message }, false);
            addLog(`[${current}/${total}] Network or job error for ${file}: ${error.message}`, 'error');
            jobControl.ingestPaused = true;
            setIngestPauseUI(true);
            failCount += 1;
        }
    }

    addLog(`Batch complete. ${successCount} succeeded, ${failCount} failed, ${total} total.`, successCount > 0 && failCount === 0 ? 'success' : 'info');

    jobControl.ingestPaused = false;
    pauseBtn.style.display = 'none';
    btn.disabled = false;
    btn.innerHTML = originalText;
}

function startAutoRefresh() {
    // Refresh every 3 seconds
    state.refreshInterval = setInterval(() => {
        refreshPlatforms();
        fetchLogs();
    }, 3000);
}

async function refreshPlatforms() {
    try {
        const response = await fetch('/api/platforms');
        const platforms = await response.json();

        state.platforms = platforms.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
        }, {});

        renderPlatforms();
        updateSummary();
        updateLastUpdate();
    } catch (error) {
        addLog(`Failed to fetch platforms: ${error.message}`, 'error');
    }
}

function renderPlatforms() {
    const grid = document.querySelector('.platforms-grid');
    grid.innerHTML = '';

    platformOrder.forEach(platformId => {
        const platform = state.platforms[platformId];
        if (platform) {
            grid.appendChild(createPlatformCard(platform));
        }
    });
}

function createPlatformCard(platform) {
    const card = document.createElement('div');
    card.className = "platform-card";

    const isRunning = platform.status === 'running';
    const uptimeText = isRunning ? formatUptime(platform.uptime) : '-';

    const statusClass = isRunning ? "running" : "stopped";
    const statusText = isRunning ? "Running" : "Stopped";
    const initial = platform.name.charAt(0).toUpperCase();

    // Map Icon bg/text colors directly using inline style based on platform ID
    let iconBgColor, iconTextColor;
    switch (platform.id) {
        case 'blinkit': iconBgColor = "rgba(245, 158, 11, 0.2)"; iconTextColor = "var(--color-warning)"; break;
        case 'dmart': iconBgColor = "rgba(22, 163, 74, 0.2)"; iconTextColor = "var(--color-success)"; break;
        case 'flipkart': iconBgColor = "rgba(59, 130, 246, 0.2)"; iconTextColor = "var(--color-info)"; break;
        case 'instamart': iconBgColor = "rgba(249, 115, 22, 0.2)"; iconTextColor = "#f97316"; break;
        case 'jiomart': iconBgColor = "rgba(220, 38, 38, 0.2)"; iconTextColor = "var(--color-danger)"; break;
        case 'zepto': iconBgColor = "rgba(168, 85, 247, 0.2)"; iconTextColor = "#a855f7"; break;
        default: iconBgColor = "rgba(100, 116, 139, 0.2)"; iconTextColor = "#64748b"; break;
    }

    card.innerHTML = `
        <div class="p-card-header">
            <div class="p-card-title-group">
                <div class="p-card-icon" style="background-color: ${iconBgColor}; color: ${iconTextColor};">
                    ${initial}
                </div>
                <div>
                    <h3 class="p-card-name">${platform.name}</h3>
                    <p class="text-xs text-muted">Port :${platform.port}</p>
                </div>
            </div>
            <div class="status-badge ${statusClass}">
                <div class="dot"></div>
                ${statusText}
            </div>
        </div>
        
        <div class="p-card-footer">
            <div class="uptime">
                <span class="material-symbols-outlined">timer</span>
                ${uptimeText}
            </div>
            <div class="p-actions">
                ${isRunning ? `
                    <button class="btn-action stop" onclick="stopServer('${platform.id}')" title="Stop">Stop</button>
                    <button class="btn-action open" onclick="openServer('${platform.id}')" title="Open URL">Open URL</button>
                ` : `
                    <button class="btn-action start" onclick="startServer('${platform.id}')" title="Start">Start</button>
                `}
            </div>
        </div>
    `;

    return card;
}

async function startServer(platformId) {
    const platform = state.platforms[platformId];
    addLog(`Starting ${platform.name}...`, 'info');

    try {
        const response = await fetch(`/api/start/${platformId}`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        const result = await response.json();
        addLog(`[SUCCESS] ${platform.name} started on port ${platform.port}`, 'success');

        await new Promise(resolve => setTimeout(resolve, 1000));
        await refreshPlatforms();
    } catch (error) {
        addLog(`[ERROR] Failed to start ${platform.name}: ${error.message}`, 'error');
    }
}

async function stopServer(platformId) {
    const platform = state.platforms[platformId];
    addLog(`Stopping ${platform.name}...`, 'info');

    try {
        const response = await fetch(`/api/stop/${platformId}`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        const result = await response.json();
        addLog(`[SUCCESS] ${platform.name} stopped`, 'success');

        await new Promise(resolve => setTimeout(resolve, 500));
        await refreshPlatforms();
    } catch (error) {
        addLog(`[ERROR] Failed to stop ${platform.name}: ${error.message}`, 'error');
    }
}

async function stopAllServers() {
    if (!confirm('Are you sure you want to stop all servers?')) {
        return;
    }

    addLog('Stopping all servers...', 'warning');

    try {
        const response = await fetch('/api/stopall', {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Failed to stop all servers');
        }

        const result = await response.json();
        addLog('[SUCCESS] All servers stopped', 'success');

        await new Promise(resolve => setTimeout(resolve, 1000));
        await refreshPlatforms();
    } catch (error) {
        addLog(`[ERROR] Error stopping servers: ${error.message}`, 'error');
    }
}

function openServer(platformId) {
    const platform = state.platforms[platformId];
    if (platform.status === 'running') {
        const url = `http://localhost:${platform.port}`;
        window.open(url, '_blank');
        addLog(`Opened ${platform.name} in browser`, 'info');
    }
}

function updateSummary() {
    const activeCount = Object.values(state.platforms).filter(p => p.status === 'running').length;
    document.getElementById('activeCount').textContent = activeCount;
}

function updateLastUpdate() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('lastUpdate').textContent = time;
}

function formatUptime(ms) {
    if (!ms || ms < 0) return '-';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

let lastSeenLogTime = null;

function getLogStyle(type) {
    switch (type) {
        case 'success': return { color: 'text-emerald-400', tag: '[SUCCESS]' };
        case 'error': return { color: 'text-rose-400', tag: '[ERROR]' };
        case 'warning': return { color: 'text-amber-400', tag: '[WARN]' };
        default: return { color: 'text-blue-400', tag: '[INFO]' };
    }
}

async function fetchLogs() {
    try {
        const response = await fetch('/api/logs');
        if (!response.ok) return;
        const logs = await response.json();

        let newLogs = [];
        if (!lastSeenLogTime) {
            newLogs = logs;
        } else {
            newLogs = logs.filter(l => new Date(l.time) > new Date(lastSeenLogTime));
        }

        if (newLogs.length > 0) {
            lastSeenLogTime = newLogs[newLogs.length - 1].time;

            const logContainer = document.getElementById('activityLog');

            newLogs.forEach(l => {
                const entry = document.createElement('div');
                const date = new Date(l.time);
                const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const style = getLogStyle(l.type);

                entry.className = "log-entry";
                entry.innerHTML = `
                    <span class="log-time">[${timeStr}]</span>
                    <span class="log-tag ${style.color}">${style.tag}</span>
                    <span class="log-msg">${l.message}</span>
                `;
                logContainer.insertBefore(entry, logContainer.firstChild);
            });

            while (logContainer.children.length > 200) {
                logContainer.removeChild(logContainer.lastChild);
            }
        }
    } catch (e) {
        // silently fail on log fetch
    }
}

function addLog(message, type = 'info') {
    const logContainer = document.getElementById('activityLog');
    const entry = document.createElement('div');

    const now = new Date();
    const time = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const style = getLogStyle(type);

    entry.className = "log-entry fade-in";
    entry.innerHTML = `
        <span class="log-time">[${time}]</span>
        <span class="log-tag ${style.color}">${style.tag}</span>
        <span class="log-msg">${message}</span>
    `;

    logContainer.insertBefore(entry, logContainer.firstChild);

    // Keep only last 200 entries
    while (logContainer.children.length > 200) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

// Cleanup on page unload
window.addEventListener('unload', () => {
    if (state.refreshInterval) {
        clearInterval(state.refreshInterval);
    }
});

// Handle visibility change to pause/resume auto-refresh
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (state.refreshInterval) {
            clearInterval(state.refreshInterval);
        }
    } else {
        startAutoRefresh();
        refreshPlatforms();
        fetchLogs();
    }
});
