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
            <label class="cursor-pointer relative flex items-center h-full">
                <input type="checkbox" id="pin_${pin}" value="${pin}" class="peer sr-only">
                <div class="rounded-md border border-border-dark bg-surface-dark px-3 py-2 w-full text-center text-sm font-medium text-slate-300 transition-all hover:bg-surface-darker peer-focus:ring-2 peer-focus:ring-primary/50">
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

    // Manual DB Ingestion Listeners
    document.getElementById('manualCategorySelect').addEventListener('change', handleManualCategoryChange);
    document.getElementById('manualIngestForm').addEventListener('submit', handleManualIngest);

    // Terminal Toggle Event Listener
    document.getElementById('toggleTerminalBtn').addEventListener('click', toggleTerminal);
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
                <label class="cursor-pointer relative flex items-center">
                    <input type="checkbox" id="pf_${pf}" value="${pf}" class="peer sr-only">
                    <div class="rounded-lg border border-border-dark bg-surface-darker px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-primary/50 peer-focus:ring-2 peer-focus:ring-primary/50">
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
            div.className = 'flex items-center gap-3 p-2 hover:bg-surface-dark rounded cursor-pointer';
            div.innerHTML = `
                <input type="checkbox" id="cat_${catId}" value="${cat}" class="rounded border-border-dark bg-surface-dark text-primary focus:ring-primary focus:ring-offset-surface-darker">
                <span class="text-sm font-mono text-slate-300 break-all">${cat}</span>
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
    btn.disabled = true;
    btn.classList.add('loading');
    addLog(`Initiating mass scrape for ${selectedPlatforms.length} platforms, ${selectedCategories.length} categories, Auto Ingest: ${autoIngest ? 'ON' : 'OFF'}...`, 'info');

    try {
        const res = await fetch('/api/mass-scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                platforms: selectedPlatforms,
                categories: selectedCategories,
                pincodes: selectedPincodes,
                autoIngest: autoIngest
            })
        });

        const data = await res.json();
        if (data.success) {
            addLog(`Mass scrape job started. Watch the backend terminal for detailed progress.`, 'success');
        } else {
            addLog(`Failed to start mass scrape: ${data.error}`, 'error');
        }
    } catch (e) {
        addLog(`Error triggering mass scrape: ${e.message}`, 'error');
    } finally {
        setTimeout(() => {
            btn.disabled = false;
            btn.classList.remove('loading');
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

async function handleManualCategoryChange(e) {
    const folder = e.target.value;
    const checkboxContainer = document.getElementById('manualFileCheckboxes');

    if (!folder) {
        checkboxContainer.innerHTML = '<div class="loading-text">Select a category first</div>';
        return;
    }

    checkboxContainer.innerHTML = '<div class="loading-text">Loading files...</div>';

    try {
        const response = await fetch(`/api/scraped-files?folder=${encodeURIComponent(folder)}`);
        const files = await response.json();

        checkboxContainer.innerHTML = '';

        if (files.length === 0) {
            checkboxContainer.innerHTML = '<div class="loading-text">No JSON files found</div>';
            return;
        }

        // Add Select All Option
        const selectAllDiv = document.createElement('label');
        selectAllDiv.className = 'flex items-center gap-3 p-2 mb-2 pb-2 border-b border-border-dark hover:bg-surface-dark rounded cursor-pointer';
        selectAllDiv.innerHTML = `
            <input type="checkbox" id="selectAllManualFiles" class="rounded border-border-dark bg-surface-dark text-primary focus:ring-primary focus:ring-offset-surface-darker">
            <span class="text-sm font-bold text-primary">✓ Select All ${files.length} Files</span>
        `;
        checkboxContainer.appendChild(selectAllDiv);

        const selectAllCb = document.getElementById('selectAllManualFiles');
        selectAllCb.addEventListener('change', (ev) => {
            const allFileCbs = document.querySelectorAll('.manual-file-cb');
            allFileCbs.forEach(cb => cb.checked = ev.target.checked);
        });

        files.forEach((file, index) => {
            const div = document.createElement('label');
            div.className = 'flex items-center gap-3 p-2 hover:bg-surface-dark rounded cursor-pointer';
            div.innerHTML = `
                <input type="checkbox" id="mfile_${index}" class="manual-file-cb rounded border-border-dark bg-surface-dark text-primary focus:ring-primary focus:ring-offset-surface-darker" value="${file}">
                <span class="text-sm font-mono text-slate-300 break-all">${file}</span>
            `;
            checkboxContainer.appendChild(div);
        });

    } catch (e) {
        addLog(`Failed to load files for folder: ${e.message}`, 'error');
        checkboxContainer.innerHTML = '<div class="loading-text" style="color:var(--danger-color)">Error loading files</div>';
    }
}

async function handleManualIngest(e) {
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
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '⚙️ Processing Injection...';

    addLog(`Initiating manual DB ingestion for ${selectedFiles.length} files...`, 'info');

    let successCount = 0;
    let failCount = 0;

    for (const file of selectedFiles) {
        try {
            const res = await fetch('/api/manual-ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, file, dateOverride })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                addLog(`[SUCCESS] Ingested ${file}! New: ${data.stats?.new || 0}, Updated: ${data.stats?.updated || 0}, New Groups: ${data.stats?.newGroups || 0}`, 'success');
                successCount++;
            } else {
                addLog(`Failed to strictly ingest ${file}: ${data.error || data.message || 'Unknown error'}`, 'error');
                failCount++;
            }
        } catch (e) {
            addLog(`Error triggering manual ingest for ${file}: ${e.message}`, 'error');
            failCount++;
        }
    }

    addLog(`Finished batch ingestion. ${successCount} successful, ${failCount} failed.`, 'info');

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
    card.className = "bg-surface-dark rounded-xl p-5 border border-border-dark flex flex-col gap-4";

    const isRunning = platform.status === 'running';
    const uptimeText = isRunning ? formatUptime(platform.uptime) : '-';

    // Map colors based on platform
    let bgColor = "bg-slate-500/20";
    let textColor = "text-slate-500";
    let statusBg = isRunning ? "bg-emerald-500/10" : "bg-red-500/10";
    let statusBorder = isRunning ? "border-emerald-500/20" : "border-red-500/20";
    let statusText = isRunning ? "text-emerald-500" : "text-red-500";
    let statusDot = isRunning ? "bg-emerald-500" : "bg-red-500";

    const initial = platform.name.charAt(0).toUpperCase();

    switch (platform.id) {
        case 'blinkit': bgColor = "bg-amber-500/20"; textColor = "text-amber-500"; break;
        case 'dmart': bgColor = "bg-green-600/20"; textColor = "text-green-500"; break;
        case 'flipkart': bgColor = "bg-blue-500/20"; textColor = "text-blue-500"; break;
        case 'instamart': bgColor = "bg-orange-500/20"; textColor = "text-orange-500"; break;
        case 'jiomart': bgColor = "bg-red-600/20"; textColor = "text-red-500"; break;
        case 'zepto': bgColor = "bg-purple-500/20"; textColor = "text-purple-500"; break;
    }

    card.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded flex items-center justify-center font-bold text-xl ${bgColor} ${textColor}">
                    ${initial}
                </div>
                <div>
                    <h3 class="font-semibold text-slate-100">${platform.name}</h3>
                    <p class="text-xs text-text-muted">Port :${platform.port}</p>
                </div>
            </div>
            <div class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border ${statusBg} ${statusBorder} ${statusText}">
                <div class="w-1.5 h-1.5 rounded-full ${statusDot}"></div>
                ${isRunning ? 'Running' : 'Stopped'}
            </div>
        </div>
        
        <div class="flex items-center justify-between mt-2 pt-2 border-t border-border-dark">
            <div class="text-xs text-text-muted">
                <span class="material-symbols-outlined text-[14px] align-middle mr-1">timer</span>
                ${uptimeText}
            </div>
            <div class="flex gap-2">
                ${isRunning ? `
                    <button class="text-xs px-3 py-1.5 rounded bg-surface-darker hover:bg-red-500/10 hover:text-red-500 transition-colors border border-border-dark" onclick="stopServer('${platform.id}')" title="Stop">Stop</button>
                    <button class="text-xs px-3 py-1.5 rounded bg-surface-darker hover:bg-primary/10 hover:text-primary transition-colors border border-border-dark" onclick="openServer('${platform.id}')" title="Open URL">Open URL</button>
                ` : `
                    <button class="text-xs px-3 py-1.5 rounded bg-surface-darker hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors border border-border-dark" onclick="startServer('${platform.id}')" title="Start">Start</button>
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

                entry.className = `flex gap-3 text-slate-300`;
                entry.innerHTML = `
                    <span class="text-slate-500 whitespace-nowrap">[${timeStr}]</span>
                    <span class="${style.color} w-20 shrink-0 font-bold">${style.tag}</span>
                    <span class="break-words">${l.message}</span>
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

    entry.className = `flex gap-3 text-slate-300 fade-in`;
    entry.innerHTML = `
        <span class="text-slate-500 whitespace-nowrap">[${time}]</span>
        <span class="${style.color} w-20 shrink-0 font-bold">${style.tag}</span>
        <span class="break-words">${message}</span>
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
