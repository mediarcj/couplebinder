// File: server/public/js/dashboard.js
// Description: Client-side JavaScript for dashboard functionality
// Purpose: Handles logout, submissions viewing, and dashboard interactions
// Notes: Maintains consistency with main.js functionality

// Use logger from main.js (exposed as window.logger)
// Note: dashboard.js loads BEFORE main.js, so we use a fallback
// Use 'log' instead of 'logger' to avoid conflicts
const log = (typeof window !== 'undefined' && window.logger) ? window.logger : {
    isDebugEnabled: () => localStorage.getItem('debugProfile') === '1',
    redact: (obj) => {
        if (typeof obj === 'string') {
            return obj.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[EMAIL]')
                     .replace(/(\b\d{7,}\b)/g, '[PHONE]')
                     .replace(/(sb-access-token=[^;]+)/g, '[TOKEN]');
        }
        return obj;
    },
    info: (message, data = {}) => {
        if (log.isDebugEnabled()) {
            try {
                console.log(`[DEBUG] ${message}`, log.redact(data));
            } catch (e) {
                console.log(`[DEBUG] ${message}`, '[Logger error - data not logged]');
            }
        }
    },
    error: (message, data = {}) => {
        try {
            console.error(`[ERROR] ${message}`, log.redact(data));
        } catch (e) {
            console.error(`[ERROR] ${message}`, '[Logger error - data not logged]');
        }
    },
    warn: (message, data = {}) => {
        if (log.isDebugEnabled()) {
            try {
                console.warn(`[WARN] ${message}`, log.redact(data));
            } catch (e) {
                console.warn(`[WARN] ${message}`, '[Logger error - data not logged]');
            }
        }
    }
};

/**
 * XSS Protection: HTML Escape Function
 * 
 * WHAT:
 * Escapes all HTML special characters to prevent XSS attacks when rendering user content.
 * 
 * WHY:
 * User-submitted text may contain malicious HTML/JavaScript. We must escape it
 * before inserting into innerHTML to prevent stored XSS vulnerabilities.
 * 
 * HOW:
 * Converts dangerous characters to HTML entities: < becomes &lt;, > becomes &gt;, etc.
 * This ensures the browser treats user input as plain text, not executable code.
 * 
 * @param {string} unsafe - User input that may contain malicious HTML
 * @returns {string} HTML-safe escaped string
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Get CSRF token from meta tag or cookie
 */
function _getCSRFToken() {
    // Try to get from meta tag first
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken) {
        return metaToken.getAttribute('content');
    }
    
    // Fallback to cookie
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'csrf-token') {
            return value;
        }
    }
    
    console.warn('CSRF token not found');
    return '';
}

document.addEventListener('DOMContentLoaded', function() {
    
    // Initialize dashboard functionality
    initializeDashboard();
    initializeSubmissions();
    initializeBuilderWorkspace();
    initializeBinderWorkspaceUI();
    
    // Logout functionality is handled by logout.js module
    log.info('Dashboard page initialized - logout handled by logout.js module');
});

/**
 * WHAT:
 * Notification modal wrapper removed - use modalManager directly.
 * 
 * WHY:
 * Centralized modal management - no local wrappers needed.
 * 
 * HOW:
 * All notification calls now use: modalManager.showNotification(title, message, onClose)
 */

/**
 * Initialize dashboard-specific functionality
 */
function initializeDashboard() {
    // Dashboard-specific initialization (no logout handling needed)
    log.info('Dashboard functionality initialized');
}

/**
 * Initialize binder builder workspace
 *
 * WHAT:
 *  Wires up the "Add photos" button and hidden file input
 *  so uploads can be sent to the existing binder photo route.
 *
 * HOW:
 *  - Reads binderId from <body data-binder-id="...">
 *  - When "Add photos" is clicked, opens the hidden file input
 *  - When files are chosen, POSTs them to:
 *      /dashboard/binder/:binderId/photos
 */
function initializeBuilderWorkspace() {
    const binderId = getBinderIdFromBody();
    const addPhotosBtn = document.getElementById('builder-add-photos-btn');
    const fileInput = document.getElementById('builder-file-input');

    if (!binderId) {
        // No binder yet, nothing to wire. This keeps the page from crashing.
        log.info('Builder workspace: no binderId found on body, skipping wiring');
        return;
    }

    if (!addPhotosBtn || !fileInput) {
        log.info('Builder workspace: required elements not found, skipping wiring');
        return;
    }

    // Clicking the visible button opens the hidden file input
    addPhotosBtn.addEventListener('click', function () {
        fileInput.click();
    });

    // When files are selected, upload them
    fileInput.addEventListener('change', function (event) {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        uploadBinderPhotos(binderId, files)
            .catch((err) => {
                log.error('Builder workspace: uploadBinderPhotos failed', { error: err?.message || String(err) });
            })
            .finally(() => {
                // Reset the input so selecting the same file later still fires change
                fileInput.value = '';
            });
    });
}

/**
 * Read binderId from <body data-binder-id="">
 */
function getBinderIdFromBody() {
    try {
        const body = document.body;
        return body && body.dataset ? (body.dataset.binderId || '').trim() : '';
    } catch (e) {
        log.error('Builder workspace: failed to read binderId from body', { error: e?.message || String(e) });
        return '';
    }
}

/**
 * Upload photos to the binder photos endpoint.
 *
 * This hits your existing route:
 *   POST /dashboard/binder/:binderId/photos
 * which is already wired to S3 via storageProvider.js.
 */
async function uploadBinderPhotos(binderId, files) {
    if (!binderId) {
        throw new Error('Missing binderId for upload');
    }

    const csrfToken = _getCSRFToken();
    const formData = new FormData();

    files.forEach((file) => {
        // "photos" matches the Multer field name you already use on the server
        formData.append('photos', file);
    });

    const endpoint = `/dashboard/binder/${encodeURIComponent(binderId)}/photos`;

    log.info('Builder workspace: uploading photos to binder', {
        binderId,
        count: files.length,
        endpoint
    });

    const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type manually; the browser sets proper multipart boundary.
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {}
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        log.error('Builder workspace: upload failed', { status: response.status, body: text });
        // Try to show a friendly message if modalManager exists
        if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
            window.modalManager.showNotification(
                'Upload failed',
                'We could not upload your photos right now. Please try again in a moment.'
            );
        } else {
            alert('We could not upload your photos right now. Please try again.');
        }
        throw new Error(`Upload failed with status ${response.status}`);
    }

    const data = await response.json().catch(() => null);

    log.info('Builder workspace: upload succeeded', {
        binderId,
        uploadedCount: data?.uploadedCount,
        photos: data?.photos?.length
    });

    // Render basic thumbnails into the palettes (simple for now)
    try {
        refreshPhotoPalettes(data);
    } catch (e) {
        log.error('Builder workspace: failed to refresh photo palettes', { error: e?.message || String(e) });
    }
}

/**
 * Simple renderer: show uploaded photos as list items.
 * Later, this can be replaced with real draggable thumbnails.
 */
function refreshPhotoPalettes(data) {
    if (!data || !Array.isArray(data.photos)) return;

    const paletteMain = document.getElementById('builder-photo-palette');
    const paletteLibrary = document.getElementById('builder-photo-library');

    if (!paletteMain && !paletteLibrary) return;

    const itemsHtml = data.photos.map((photo) => {
        const name = (photo.originalname || 'Photo').slice(0, 60);
        const sizeKb = photo.size ? Math.round(photo.size / 1024) : null;
        const sizeLabel = sizeKb ? `${sizeKb} KB` : '';
        return `
            <div class="photo-chip" data-storage-key="${escapeHtml(photo.storageKey || '')}">
                <div class="photo-chip-thumb"></div>
                <div class="photo-chip-meta">
                    <div class="photo-chip-name">${escapeHtml(name)}</div>
                    ${sizeLabel ? `<div class="photo-chip-size">${escapeHtml(sizeLabel)}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    if (paletteMain) {
        paletteMain.innerHTML = itemsHtml || '<p class="panel-hint">No photos uploaded yet.</p>';
    }
    if (paletteLibrary) {
        paletteLibrary.innerHTML = itemsHtml || '<p class="panel-hint">No photos uploaded yet.</p>';
    }
}

/**
 * Initialize submissions functionality (reused from main.js)
 */
function initializeSubmissions() {
    const viewSubmissionsBtn = document.getElementById('viewSubmissionsBtn');
    const submissionsList = document.getElementById('submissionsList');
    
    if (!viewSubmissionsBtn || !submissionsList) {
        return;
    }
    
    viewSubmissionsBtn.addEventListener('click', function() {
        fetchSubmissions();
    });
}

/**
 * Fetch and display recent submissions
 */
async function fetchSubmissions() {
    const submissionsList = document.getElementById('submissionsList');
    
    try {
        const response = await fetch('/api/submissions');
        const data = await response.json();
        
        if (data.submissions && data.submissions.length > 0) {
            displaySubmissions(data.submissions);
            submissionsList.classList.remove('hidden');
        } else {
            submissionsList.innerHTML = '<p>No submissions found.</p>';
            submissionsList.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error fetching submissions:', error);
        submissionsList.innerHTML = '<p>Error loading submissions. Please try again.</p>';
        submissionsList.classList.remove('hidden');
    }
}

/**
 * Display submissions in the list
 */
function displaySubmissions(submissions) {
    const submissionsList = document.getElementById('submissionsList');
    
    // SECURITY: Escape all user content to prevent XSS attacks
    // User submissions may contain malicious HTML/JS - we escape before rendering
    const html = `
        <div class="submissions-header">
            <h3>Recent Submissions</h3>
            <button id="hideSubmissionsBtn" class="btn btn-secondary">Hide</button>
        </div>
        <div class="submissions-content">
            ${submissions.map(submission => `
                <div class="submission-item">
                    <div class="submission-meta">
                        <span class="submission-id">ID: ${escapeHtml(submission.id)}</span>
                        <span class="submission-time">${escapeHtml(new Date(submission.timestamp).toLocaleString())}</span>
                    </div>
                    <div class="submission-preview">
                        ${escapeHtml(submission.preview)}
                    </div>
                    <div class="submission-stats">
                        <span class="submission-length">${escapeHtml(String(submission.text_length))} characters</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    submissionsList.innerHTML = html;
    
    // Add hide button functionality
    const hideBtn = document.getElementById('hideSubmissionsBtn');
    if (hideBtn) {
        hideBtn.addEventListener('click', function() {
            submissionsList.classList.add('hidden');
        });
    }
}

/**
 * Initialize slide-in binder workspace panel (Add photos, My photos, Binder details)
 */
function initializeBinderWorkspaceUI() {
    const toolbarButtons = document.querySelectorAll('[data-panel-target]');
    const panel = document.getElementById('workspace-panel');
    const closeBtn = document.getElementById('workspace-panel-close-btn');

    if (!panel || toolbarButtons.length === 0) {
        // Old dashboard or markup not present – quietly do nothing
        return;
    }

    const panelInnerSections = panel.querySelectorAll('.workspace-panel-inner');

    function openPanel(targetId) {
        panel.classList.add('workspace-panel-visible');
        panel.setAttribute('aria-hidden', 'false');

        panelInnerSections.forEach(section => {
            section.classList.toggle(
                'workspace-panel-inner-active',
                section.id === targetId
            );
        });
    }

    function closePanel() {
        panel.classList.remove('workspace-panel-visible');
        panel.setAttribute('aria-hidden', 'true');
    }

    toolbarButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-panel-target');
            if (!targetId) return;

            // If the same panel is already visible, toggle it closed
            const active = panel.classList.contains('workspace-panel-visible') &&
                panel.querySelector(`#${targetId}`)?.classList.contains('workspace-panel-inner-active');

            if (active) {
                closePanel();
            } else {
                openPanel(targetId);
            }
        });
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', closePanel);
    }
}