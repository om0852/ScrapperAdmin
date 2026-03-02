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
    renderPincodes();
    setupEventListeners();
    startAutoRefresh();
}

function renderPincodes() {
    const container = document.getElementById('pincodeCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    PINCODES.forEach(pin => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `<input type="checkbox" id="pin_${pin}" value="${pin}"><label for="pin_${pin}">${pin}</label>`;
        container.appendChild(div);
    });
}

function setupEventListeners() {
    document.getElementById('refreshBtn').addEventListener('click', refreshPlatforms);
    document.getElementById('stopAllBtn').addEventListener('click', stopAllServers);
    document.getElementById('massScrapeForm').addEventListener('submit', handleMassScrape);
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
            div.className = 'checkbox-item';
            div.innerHTML = `<input type="checkbox" id="pf_${pf}" value="${pf}"><label for="pf_${pf}">${pf}</label>`;
            pfContainer.appendChild(div);
        });

        // Render categories
        const catContainer = document.getElementById('categoryCheckboxes');
        catContainer.innerHTML = '';
        data.categories.forEach(cat => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';
            div.innerHTML = `<input type="checkbox" id="cat_${cat.replace(/[^a-zA-Z0-9]/g, '_')}" value="${cat}"><label for="cat_${cat.replace(/[^a-zA-Z0-9]/g, '_')}">${cat}</label>`;
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
    addLog(`Initiating mass scrape for ${selectedPlatforms.length} platforms, ${selectedCategories.length} categories...`, 'info');

    try {
        const res = await fetch('/api/mass-scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                platforms: selectedPlatforms,
                categories: selectedCategories,
                pincodes: selectedPincodes
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
    card.className = `platform-card ${platform.status}`;

    const icon = platformIcons[platform.id] || '⚙️';
    const isRunning = platform.status === 'running';
    const uptimeText = isRunning ? formatUptime(platform.uptime) : '-';

    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-icon">${icon}</div>
            <div class="platform-info">
                <h3>${platform.name}</h3>
                <div class="platform-port">Port: ${platform.port}</div>
            </div>
        </div>

        <div class="platform-status">
            <div class="status-indicator ${platform.status}"></div>
            <div class="status-text">
                <strong>${isRunning ? 'Running' : 'Stopped'}</strong>
            </div>
            <div class="status-time">${uptimeText}</div>
        </div>

        <div class="platform-details">
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">${platform.status.toUpperCase()}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Port:</span>
                <span class="detail-value">${platform.port}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">URL:</span>
                <span class="detail-value">${isRunning ? `http://localhost:${platform.port}` : 'N/A'}</span>
            </div>
        </div>

        <div class="platform-actions">
            ${isRunning ? `
                <button class="btn-stop" onclick="stopServer('${platform.id}')" title="Stop ${platform.name}">⏹️ Stop</button>
                <button class="btn-link" onclick="openServer('${platform.id}')" title="Open ${platform.name} in browser">🌐 Open URL</button>
            ` : `
                <button class="btn-start" onclick="startServer('${platform.id}')" title="Start ${platform.name}">▶️ Start Server</button>
            `}
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

            // Render them directly to avoid altering time
            const logContainer = document.getElementById('activityLog');

            newLogs.forEach(l => {
                const entry = document.createElement('div');
                const date = new Date(l.time);
                const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                entry.className = `log-entry ${l.type}`;
                entry.innerHTML = `
                    <span class="log-time">${timeStr}</span>
                    <span class="log-message">${l.message}</span>
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

    entry.className = `log-entry ${type}`;
    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-message">${message}</span>
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
