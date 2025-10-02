// API Configuration
const API_BASE = 'http://localhost:3000/api';

// State Management
let allPlanets = [];
let filteredPlanets = [];
let currentPage = 1;
const itemsPerPage = 20;
let currentFiles = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

/**
 * Initialize Application
 */
async function initializeApp() {
    setupEventListeners();
    setupDragAndDrop();
    await loadInitialData();
}

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => handleNavigation(item.dataset.view));
    });

    // File Upload
    const fileInput = document.getElementById('lightCurveFile');
    const uploadArea = document.getElementById('uploadArea');
    const selectFilesBtn = document.getElementById('selectFilesBtn');
    const selectFolderBtn = document.getElementById('selectFolderBtn');

    // Separate handlers for files and folders
    selectFilesBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.removeAttribute('webkitdirectory');
        fileInput.removeAttribute('directory');
        fileInput.click();
    });

    selectFolderBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.setAttribute('webkitdirectory', '');
        fileInput.setAttribute('directory', '');
        fileInput.click();
    });

    fileInput.addEventListener('change', handleFileSelect);

    // Remove Files
    document.getElementById('removeAllFiles')?.addEventListener('click', handleFileRemove);

    // Analysis
    document.getElementById('analyzeBtn').addEventListener('click', analyzeLightCurve);
    document.getElementById('newAnalysisBtn')?.addEventListener('click', resetAnalysis);

    // Filters
    document.getElementById('filterClassification')?.addEventListener('change', applyFilters);
    document.getElementById('searchPlanet')?.addEventListener('input', applyFilters);

    // Pagination
    document.getElementById('prevPage')?.addEventListener('click', () => changePage(-1));
    document.getElementById('nextPage')?.addEventListener('click', () => changePage(1));
}

/**
 * Setup Drag and Drop
 */
function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.style.borderColor = 'var(--accent-primary)';
            uploadArea.style.background = 'rgba(99, 102, 241, 0.05)';
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.style.borderColor = '';
            uploadArea.style.background = '';
        });
    });

    uploadArea.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect({ target: { files } });
        }
    });
}

/**
 * Handle Navigation
 */
function handleNavigation(viewName) {
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Update active view
    document.querySelectorAll('.view').forEach(view => {
        view.classList.toggle('active', view.id === `${viewName}View`);
    });

    // Update header
    const titles = {
        analyze: { title: 'Light Curve Analysis', subtitle: 'Upload and analyze transit data using machine learning' },
        discoveries: { title: 'Planet Discoveries', subtitle: 'Browse and filter discovered exoplanets' },
        statistics: { title: 'Statistics & Metrics', subtitle: 'Model performance and discovery statistics' },
        about: { title: 'About CosmicAI', subtitle: 'Learn how the system works' }
    };

    const header = titles[viewName] || titles.analyze;
    document.getElementById('pageTitle').textContent = header.title;
    document.getElementById('pageSubtitle').textContent = header.subtitle;
}

/**
 * Handle File Selection
 */
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Validate each file
    const validExtensions = /\.(csv|txt|dat|tsv|fits|fit|lc|tbl|ascii|xls|xlsx|xml|json)$/i;
    const validFiles = [];

    for (const file of files) {
        // Check file type
        if (!file.name.match(validExtensions)) {
            alert(`Skipping ${file.name}: Invalid file format.\nSupported: CSV, TXT, DAT, TSV, FITS, LC, TBL, ASCII, XLS, XLSX, XML, JSON`);
            continue;
        }

        // Check file size (50MB max for FITS/XML)
        if (file.size > 50 * 1024 * 1024) {
            alert(`Skipping ${file.name}: File size must be less than 50MB`);
            continue;
        }

        validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    currentFiles = validFiles;

    // Show files list
    document.getElementById('uploadArea').classList.add('hidden');
    const filesSelected = document.getElementById('filesSelected');
    filesSelected.classList.remove('hidden');

    // Update count
    const count = currentFiles.length;
    document.getElementById('filesCount').textContent = `${count} file${count > 1 ? 's' : ''} selected`;

    // Render file list
    const filesList = document.getElementById('filesList');
    filesList.innerHTML = currentFiles.map((file, index) => `
        <div class="file-item">
            <div class="file-info">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                    <polyline points="13 2 13 9 20 9"/>
                </svg>
                <div class="file-details">
                    <span class="file-name">${escapeHtml(file.name)}</span>
                    <span class="file-size">${formatFileSize(file.size)}</span>
                </div>
            </div>
            <button class="btn-icon" onclick="removeFile(${index})" title="Remove file">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
    `).join('');

    // Enable analyze button
    document.getElementById('analyzeBtn').disabled = false;
}

/**
 * Remove Single File
 */
function removeFile(index) {
    currentFiles.splice(index, 1);

    if (currentFiles.length === 0) {
        handleFileRemove();
    } else {
        // Refresh the file list display
        const count = currentFiles.length;
        document.getElementById('filesCount').textContent = `${count} file${count > 1 ? 's' : ''} selected`;

        const filesList = document.getElementById('filesList');
        filesList.innerHTML = currentFiles.map((file, idx) => `
            <div class="file-item">
                <div class="file-info">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                        <polyline points="13 2 13 9 20 9"/>
                    </svg>
                    <div class="file-details">
                        <span class="file-name">${escapeHtml(file.name)}</span>
                        <span class="file-size">${formatFileSize(file.size)}</span>
                    </div>
                </div>
                <button class="btn-icon" onclick="removeFile(${idx})" title="Remove file">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `).join('');
    }
}

/**
 * Handle File Remove
 */
function handleFileRemove() {
    currentFiles = [];
    document.getElementById('lightCurveFile').value = '';
    document.getElementById('uploadArea').classList.remove('hidden');
    document.getElementById('filesSelected').classList.add('hidden');
    document.getElementById('analyzeBtn').disabled = true;
}

/**
 * Analyze Light Curve(s)
 */
async function analyzeLightCurve() {
    if (currentFiles.length === 0) return;

    // Show progress
    document.getElementById('analysisProgress').classList.remove('hidden');
    document.getElementById('resultsSection').classList.add('hidden');

    const progressMessage = document.getElementById('progressMessage');
    let successCount = 0;
    let failCount = 0;
    let totalPlanetsDetected = 0;
    let lastSuccessfulResult = null;

    try {
        for (let i = 0; i < currentFiles.length; i++) {
            const file = currentFiles[i];
            progressMessage.textContent = `Analyzing ${i + 1} of ${currentFiles.length}: ${file.name}...`;

            try {
                // Prepare form data
                const formData = new FormData();
                formData.append('file', file);

                // Try to extract TIC ID from filename (e.g., TESS_141810080_lightcurve.csv or TIC_12345.csv)
                const ticMatch = file.name.match(/(?:TESS_|TIC_|TIC)(\d+)/i);
                if (ticMatch) {
                    formData.append('ticId', ticMatch[1]);
                }

                // Send request
                const response = await fetch(`${API_BASE}/analyze`, {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Analysis failed');
                }

                console.log('Analysis result:', data.result);

                successCount++;

                // Count total planets detected across all files
                if (data.result.planets && data.result.planets.length > 0) {
                    totalPlanetsDetected += data.result.planets.length;
                    lastSuccessfulResult = data.result;
                }

            } catch (error) {
                console.error(`Error analyzing ${file.name}:`, error);
                failCount++;
            }
        }

        // Show summary message
        if (totalPlanetsDetected > 0) {
            progressMessage.textContent = currentFiles.length > 1
                ? `Complete! Found ${totalPlanetsDetected} planet(s) in ${successCount} file(s)${failCount > 0 ? `, ${failCount} failed` : ''}.`
                : `Analysis complete! Found ${totalPlanetsDetected} planet(s).`;
        } else {
            progressMessage.textContent = currentFiles.length > 1
                ? `Complete! No planets detected in ${successCount} file(s)${failCount > 0 ? `, ${failCount} failed` : ''}.`
                : `Analysis complete! No planets detected.`;
        }

        // Hide progress after short delay, then display results
        setTimeout(() => {
            document.getElementById('analysisProgress').classList.add('hidden');

            // Display results if we found any planets
            if (lastSuccessfulResult) {
                displayMultiPlanetResults(lastSuccessfulResult);
            }
        }, 1500);

        // Reload planets
        await loadPlanets();

    } catch (error) {
        progressMessage.textContent = `Error: ${error.message}`;
        setTimeout(() => {
            document.getElementById('analysisProgress').classList.add('hidden');
        }, 3000);
    }
}

/**
 * Display Multi-Planet Analysis Results
 */
function displayMultiPlanetResults(result) {
    document.getElementById('analysisProgress').classList.add('hidden');
    document.getElementById('resultsSection').classList.remove('hidden');

    // If no planets detected
    if (!result.planets || result.planets.length === 0) {
        const banner = document.getElementById('classificationBanner');
        const icon = document.getElementById('resultIcon');
        const label = document.getElementById('classificationLabel');
        const description = document.getElementById('classificationDescription');
        const confidence = document.getElementById('confidenceBadge');

        icon.className = 'result-icon false-positive';
        icon.textContent = '✕';
        label.textContent = 'No Planets Detected';
        description.textContent = result.message || 'No significant periodic signals found';
        confidence.textContent = '0%';

        document.getElementById('aiInsightsText').textContent = 'No planetary transits were detected in this light curve. This could be due to low signal quality, insufficient data, or the absence of transiting planets.';
        return;
    }

    // Show first planet in main results
    const firstPlanet = result.planets[0];

    // Classification Banner
    const banner = document.getElementById('classificationBanner');
    const icon = document.getElementById('resultIcon');
    const label = document.getElementById('classificationLabel');
    const description = document.getElementById('classificationDescription');
    const confidence = document.getElementById('confidenceBadge');

    // Set icon
    if (firstPlanet.classification === 'Confirmed Planet') {
        icon.className = 'result-icon confirmed';
        icon.textContent = '✓';
    } else if (firstPlanet.classification === 'Candidate Planet') {
        icon.className = 'result-icon candidate';
        icon.textContent = '◐';
    } else {
        icon.className = 'result-icon false-positive';
        icon.textContent = '✕';
    }

    label.textContent = result.totalDetected > 1
        ? `${firstPlanet.classification} (+ ${result.totalDetected - 1} more)`
        : firstPlanet.classification;
    description.textContent = result.message || firstPlanet.reasoning || 'ML model classification';
    confidence.textContent = `${(firstPlanet.probability * 100).toFixed(1)}%`;

    // AI Explanation
    const aiInsightsText = document.getElementById('aiInsightsText');
    let insightText = '';

    // Add host star info if available
    if (result.hostStar && result.hostStar !== 'Unknown') {
        insightText = `⭐ Host Star: ${result.hostStar}`;
        if (result.hostStarInfo) {
            const starInfo = result.hostStarInfo;
            if (starInfo.temperature) insightText += ` (${Math.round(starInfo.temperature)}K)`;
            if (starInfo.magnitude) insightText += `, Mag: ${starInfo.magnitude.toFixed(2)}`;
        }
        insightText += '\n\n';
    }

    if (result.totalDetected > 1) {
        insightText += `🌟 Multi-planet system detected! Found ${result.totalDetected} planet candidates in this light curve. The primary planet has: ${firstPlanet.aiExplanation || firstPlanet.reasoning}`;
    } else {
        insightText += firstPlanet.aiExplanation || firstPlanet.reasoning || 'AI explanation not available.';
    }

    aiInsightsText.textContent = insightText;

    // Features (show first planet)
    const features = firstPlanet.features;
    document.getElementById('featurePeriod').textContent = features.orbital_period?.toFixed(3) || '-';
    document.getElementById('featureRadius').textContent = features.planetary_radius?.toFixed(2) || '-';
    document.getElementById('featureDepth').textContent = features.transit_depth?.toFixed(2) || '-';
    document.getElementById('featureSNR').textContent = features.snr?.toFixed(2) || '-';
    document.getElementById('featureDuration').textContent = features.transit_duration?.toFixed(2) || '-';
    document.getElementById('featureDataPoints').textContent = features.data_points || '-';

    // Phase-Folded Plot (overlay all detected planets)
    if (result.planets.length > 0) {
        const traces = result.planets.map((planet, idx) => ({
            x: planet.plotData.map(p => p.x),
            y: planet.plotData.map(p => p.y),
            mode: 'markers',
            type: 'scatter',
            name: `Planet ${planet.planetNumber} (P=${planet.features.orbital_period?.toFixed(2)}d)`,
            marker: {
                size: 4,
                opacity: 0.6
            }
        }));

        const layout = {
            title: result.totalDetected > 1 ? `${result.totalDetected} Planets Detected` : 'Phase-Folded Light Curve',
            paper_bgcolor: '#131730',
            plot_bgcolor: '#0a0e27',
            font: { color: '#e2e8f0', family: 'Inter' },
            xaxis: {
                title: 'Phase',
                gridcolor: '#1e293b',
                zerolinecolor: '#1e293b'
            },
            yaxis: {
                title: 'Normalized Flux',
                gridcolor: '#1e293b',
                zerolinecolor: '#1e293b'
            },
            showlegend: result.totalDetected > 1,
            legend: {
                bgcolor: '#1e293b',
                bordercolor: '#334155'
            },
            margin: { t: 40, r: 20, b: 50, l: 60 }
        };

        Plotly.newPlot('phasePlot', traces, layout, { responsive: true });
    }
}

/**
 * Display Analysis Results (legacy - kept for compatibility)
 */
function displayResults(result) {
    // Handle both old single-planet format and new multi-planet format
    if (result.planets) {
        displayMultiPlanetResults(result);
    } else {
        // Old format - wrap in new structure
        displayMultiPlanetResults({
            planets: [result],
            totalDetected: 1,
            storedCount: result.stored ? 1 : 0
        });
    }
}

/**
 * Reset Analysis
 */
function resetAnalysis() {
    document.getElementById('resultsSection').classList.add('hidden');
    handleFileRemove();
}

/**
 * Load Initial Data
 */
async function loadInitialData() {
    await loadPlanets();
    await loadStatistics();
}

/**
 * Load Planets
 */
async function loadPlanets() {
    try {
        const response = await fetch(`${API_BASE}/planets`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load planets');
        }

        allPlanets = data.planets || [];
        filteredPlanets = allPlanets;

        // Update header stat
        document.getElementById('totalDiscoveries').textContent = allPlanets.length;

        renderPlanetsTable();
        updatePagination();

    } catch (error) {
        console.error('Error loading planets:', error);
        document.getElementById('planetsTableBody').innerHTML = `
            <tr>
                <td colspan="8" class="loading-cell" style="color: var(--error)">
                    Error loading planets: ${error.message}
                </td>
            </tr>
        `;
    }
}

/**
 * Apply Filters
 */
function applyFilters() {
    const classification = document.getElementById('filterClassification')?.value;
    const searchTerm = document.getElementById('searchPlanet')?.value.toLowerCase();

    filteredPlanets = allPlanets.filter(planet => {
        const matchesClass = !classification || planet.classification === classification;
        const matchesSearch = !searchTerm ||
            planet.planet_name?.toLowerCase().includes(searchTerm) ||
            planet.host_star?.toLowerCase().includes(searchTerm);

        return matchesClass && matchesSearch;
    });

    currentPage = 1;
    renderPlanetsTable();
    updatePagination();
}

/**
 * Render Planets Table
 */
function renderPlanetsTable() {
    const tbody = document.getElementById('planetsTableBody');

    if (filteredPlanets.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="loading-cell">
                    No planets found
                </td>
            </tr>
        `;
        return;
    }

    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = filteredPlanets.slice(startIdx, endIdx);

    tbody.innerHTML = pageItems.map((planet, index) => `
        <tr>
            <td><strong>${escapeHtml(planet.planet_name || 'Unknown')}</strong></td>
            <td>${escapeHtml(planet.host_star || 'N/A')}</td>
            <td>${planet.period ? planet.period.toFixed(3) : 'N/A'}</td>
            <td>${planet.radius ? planet.radius.toFixed(2) : 'N/A'}</td>
            <td>${planet.depth ? planet.depth.toFixed(2) : 'N/A'}</td>
            <td><span class="badge ${getClassBadge(planet.classification)}">${planet.classification}</span></td>
            <td>${planet.probability ? (planet.probability * 100).toFixed(1) + '%' : 'N/A'}</td>
            <td>${formatDate(planet.discovery_date)}</td>
        </tr>
    `).join('');
}

/**
 * Update Pagination
 */
function updatePagination() {
    const totalPages = Math.ceil(filteredPlanets.length / itemsPerPage);
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages || 1}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

/**
 * Change Page
 */
function changePage(direction) {
    const totalPages = Math.ceil(filteredPlanets.length / itemsPerPage);
    const newPage = currentPage + direction;

    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderPlanetsTable();
        updatePagination();
    }
}

/**
 * Load Statistics
 */
async function loadStatistics() {
    try {
        const response = await fetch(`${API_BASE}/ml-stats`);
        const data = await response.json();

        if (response.ok && data.stats) {
            document.getElementById('modelAccuracy').textContent =
                (data.stats.test_accuracy * 100).toFixed(1) + '%';
            document.getElementById('statAccuracy').textContent =
                (data.stats.test_accuracy * 100).toFixed(1) + '%';
            document.getElementById('metricSamples').textContent =
                data.stats.n_samples?.toLocaleString() || 'N/A';
            document.getElementById('metricCV').textContent =
                data.stats.cv_mean ? `${(data.stats.cv_mean * 100).toFixed(1)}% ± ${(data.stats.cv_std * 100).toFixed(1)}%` : 'N/A';
        }

        // Update stats from planets
        if (allPlanets.length > 0) {
            const confirmed = allPlanets.filter(p => p.classification === 'Confirmed Planet').length;
            const candidates = allPlanets.filter(p => p.classification === 'Candidate Planet').length;

            document.getElementById('statConfirmed').textContent = confirmed;
            document.getElementById('statCandidates').textContent = candidates;
            document.getElementById('statTotal').textContent = allPlanets.length;
        }

    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

/**
 * Utility Functions
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getClassBadge(classification) {
    if (!classification) return '';
    if (classification === 'Confirmed Planet') return 'badge-confirmed';
    if (classification === 'Candidate Planet') return 'badge-candidate';
    return 'badge-false';
}

/**
 * View Planet Details - Shows modal with full analysis
 */
function viewPlanetDetails(planetIndex) {
    const planet = filteredPlanets[planetIndex];
    if (!planet) return;

    // Set modal title
    document.getElementById('modalPlanetName').textContent = planet.planet_name || 'Planet Details';

    // Populate feature cards
    document.getElementById('modalFeaturePeriod').textContent = planet.period ? planet.period.toFixed(3) : 'N/A';
    document.getElementById('modalFeatureRadius').textContent = planet.radius ? planet.radius.toFixed(2) : 'N/A';
    document.getElementById('modalFeatureDepth').textContent = planet.depth ? planet.depth.toFixed(2) : 'N/A';
    document.getElementById('modalFeatureSNR').textContent = planet.snr ? planet.snr.toFixed(2) : 'N/A';
    document.getElementById('modalFeatureDuration').textContent = planet.duration ? planet.duration.toFixed(2) : 'N/A';
    document.getElementById('modalFeatureDataPoints').textContent = planet.data_points || 'N/A';

    // Set classification banner
    const banner = document.getElementById('modalClassificationBanner');
    const label = document.getElementById('modalClassificationLabel');
    const description = document.getElementById('modalClassificationDescription');
    const confidence = document.getElementById('modalConfidenceBadge');

    if (planet.classification === 'Confirmed Planet') {
        banner.className = 'result-banner success';
        label.textContent = 'Exoplanet Detected!';
        description.textContent = `${planet.planet_name} orbiting ${planet.host_star}`;
    } else if (planet.classification === 'Candidate Planet') {
        banner.className = 'result-banner warning';
        label.textContent = 'Candidate Planet';
        description.textContent = `Potential exoplanet ${planet.planet_name} requires further analysis`;
    } else {
        banner.className = 'result-banner error';
        label.textContent = 'No Planet Detected';
        description.textContent = 'Signal classified as likely false positive';
    }

    confidence.textContent = planet.probability ? `${(planet.probability * 100).toFixed(1)}% confidence` : 'N/A';

    // Set AI insights
    const aiInsights = document.getElementById('modalAiInsightsText');
    aiInsights.textContent = `Analysis of ${planet.planet_name}: This ${planet.classification.toLowerCase()} shows an orbital period of ${planet.period ? planet.period.toFixed(2) : 'N/A'} days with a transit depth of ${planet.depth ? planet.depth.toFixed(0) : 'N/A'} ppm. The estimated planetary radius is ${planet.radius ? planet.radius.toFixed(2) : 'N/A'} Earth radii with a signal-to-noise ratio of ${planet.snr ? planet.snr.toFixed(2) : 'N/A'}σ. Discovered on ${formatDate(planet.discovery_date)}.`;

    // Generate phase-folded plot
    generatePhasePlot(planet, 'modalPhasePlot');

    // Show modal
    document.getElementById('planetDetailsModal').classList.add('active');
}

/**
 * Close Planet Details Modal
 */
function closePlanetDetails() {
    document.getElementById('planetDetailsModal').classList.remove('active');
}

/**
 * Generate Phase-Folded Light Curve Plot
 */
function generatePhasePlot(planet, plotElementId) {
    if (!planet.period) {
        document.getElementById(plotElementId).innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No period data available for phase plot</p>';
        return;
    }

    // Generate synthetic phase-folded data for visualization
    const numPoints = 200;
    const phase = [];
    const flux = [];

    for (let i = 0; i < numPoints; i++) {
        const p = (i / numPoints) - 0.5; // Phase from -0.5 to 0.5
        phase.push(p);

        // Simulate transit shape
        const transitDepth = (planet.depth || 1000) / 1e6; // Convert ppm to fraction
        const transitWidth = 0.05; // Transit width in phase

        if (Math.abs(p) < transitWidth) {
            // Transit dip (box-shaped)
            flux.push(1 - transitDepth + Math.random() * 0.0002 - 0.0001);
        } else {
            // Out of transit
            flux.push(1 + Math.random() * 0.0002 - 0.0001);
        }
    }

    const trace = {
        x: phase,
        y: flux,
        mode: 'markers',
        type: 'scatter',
        marker: {
            size: 4,
            color: '#60a5fa',
            opacity: 0.6
        },
        name: 'Flux'
    };

    const layout = {
        title: '',
        xaxis: {
            title: 'Orbital Phase',
            gridcolor: '#2d3748',
            zerolinecolor: '#4a5568'
        },
        yaxis: {
            title: 'Normalized Flux',
            gridcolor: '#2d3748',
            zerolinecolor: '#4a5568'
        },
        plot_bgcolor: '#1a202c',
        paper_bgcolor: 'transparent',
        font: { color: '#e2e8f0' },
        margin: { t: 30, r: 30, b: 50, l: 60 },
        hovermode: 'closest'
    };

    const config = {
        responsive: true,
        displayModeBar: false
    };

    Plotly.newPlot(plotElementId, [trace], layout, config);
}
