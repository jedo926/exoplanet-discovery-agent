// API base URL
const API_BASE = 'http://localhost:3000/api';

// State
let allPlanets = [];
let currentPlanets = [];
let autoRefreshInterval = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadPlanets();

    // Auto-refresh planets list every 10 seconds to show new discoveries
    autoRefreshInterval = setInterval(() => {
        loadPlanets(true); // Silent refresh
    }, 10000);
});

/**
 * Initialize event listeners
 */
function initializeEventListeners() {
    // Filters
    document.getElementById('filterClassification').addEventListener('change', filterPlanets);
    document.getElementById('filterDataset').addEventListener('change', filterPlanets);
}


/**
 * Load planets from database
 */
async function loadPlanets(silent = false) {
    try {
        const response = await fetch(`${API_BASE}/planets`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load planets');
        }

        const previousCount = allPlanets.length;
        allPlanets = data.planets || [];
        currentPlanets = allPlanets;

        updatePlanetsCount(allPlanets.length);
        renderPlanetsTable(allPlanets);

        // Show notification if new planets were discovered (during auto-refresh)
        if (silent && allPlanets.length > previousCount) {
            const newCount = allPlanets.length - previousCount;
            showNotification(`🌟 ${newCount} new planet${newCount > 1 ? 's' : ''} discovered!`);
        }
    } catch (error) {
        if (!silent) {
            console.error('Error loading planets:', error);
            document.getElementById('planetsTableBody').innerHTML = `
                <tr>
                    <td colspan="9" class="error-row">Error loading planets: ${error.message}</td>
                </tr>
            `;
        }
    }
}

/**
 * Filter planets
 */
function filterPlanets() {
    const classification = document.getElementById('filterClassification').value;
    const dataset = document.getElementById('filterDataset').value;

    currentPlanets = allPlanets.filter(planet => {
        const matchClassification = !classification || planet.classification === classification;
        const matchDataset = !dataset || planet.dataset === dataset;
        return matchClassification && matchDataset;
    });

    updatePlanetsCount(currentPlanets.length);
    renderPlanetsTable(currentPlanets);
}

/**
 * Render planets table
 */
function renderPlanetsTable(planets) {
    const tbody = document.getElementById('planetsTableBody');

    if (planets.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-row">No planets found</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = planets.map(planet => `
        <tr>
            <td class="planet-name">${escapeHtml(planet.planet_name || 'Unknown')}</td>
            <td>${escapeHtml(planet.host_star || 'Unknown')}</td>
            <td>${planet.period ? planet.period.toFixed(3) : 'N/A'}</td>
            <td>${planet.radius ? planet.radius.toFixed(2) : 'N/A'}</td>
            <td>${planet.depth ? planet.depth.toFixed(2) : 'N/A'}</td>
            <td>
                <span class="badge ${getClassificationClass(planet.classification)}">
                    ${escapeHtml(planet.classification || 'Unknown')}
                </span>
            </td>
            <td>${planet.probability ? (planet.probability * 100).toFixed(1) + '%' : 'N/A'}</td>
            <td>
                <span class="badge badge-dataset">
                    ${escapeHtml((planet.dataset || 'unknown').toUpperCase())}
                </span>
            </td>
            <td>${formatDate(planet.discovery_date)}</td>
        </tr>
    `).join('');
}

/**
 * Update planets count
 */
function updatePlanetsCount(count) {
    document.getElementById('planetsCount').textContent =
        `${count} planet${count !== 1 ? 's' : ''} discovered`;
}


/**
 * Get classification CSS class
 */
function getClassificationClass(classification) {
    if (!classification) return 'badge-unknown';

    const lower = classification.toLowerCase();
    if (lower.includes('confirmed')) return 'badge-confirmed';
    if (lower.includes('candidate')) return 'badge-candidate';
    if (lower.includes('false')) return 'badge-false';
    return 'badge-unknown';
}

/**
 * Format date
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show notification toast
 */
function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.textContent = message;

    // Add to document
    document.body.appendChild(notification);

    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);

    // Remove after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}
