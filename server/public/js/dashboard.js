// File: server/public/js/dashboard.js
// Description: Client-side JavaScript for dashboard functionality
// Purpose: Handles logout, submissions viewing, and dashboard interactions
// Notes: Maintains consistency with main.js functionality

// Quiet console logger with dev toggle and PII-safe redaction
const logger = {
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
        if (logger.isDebugEnabled()) {
            try {
                console.log(`[DEBUG] ${message}`, logger.redact(data));
            } catch (e) {
                console.log(`[DEBUG] ${message}`, '[Logger error - data not logged]');
            }
        }
    },
    error: (message, data = {}) => {
        try {
            console.error(`[ERROR] ${message}`, logger.redact(data));
        } catch (e) {
            console.error(`[ERROR] ${message}`, '[Logger error - data not logged]');
        }
    },
    warn: (message, data = {}) => {
        if (logger.isDebugEnabled()) {
            try {
                console.warn(`[WARN] ${message}`, logger.redact(data));
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
function getCSRFToken() {
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
    
    // Logout functionality is handled by logout.js module
    logger.info('Dashboard page initialized - logout handled by logout.js module');
});

// Notification Modal Functions
/**
 * Defer to the canonical, namespaced modal (defined in logout.js)
 * 
 * WHAT:
 * Wrapper function that delegates to LogoutModule.showNotificationModal.
 * 
 * WHY:
 * Prevents global function name collisions and ensures consistent modal behavior.
 * The old implementation had window.onclick which could interfere with logout modal.
 * 
 * HOW:
 * Check if LogoutModule is available and use its modal, otherwise fallback to alert.
 */
function showNotificationModal(title, message, onClose = null) {
    if (window.LogoutModule?.showNotificationModal) {
        return window.LogoutModule.showNotificationModal(title, message, onClose);
    }
    // Minimal fallback if logout.js didn't load for some reason
    alert(title + '\n\n' + message);
    if (onClose) onClose();
}

/**
 * Initialize dashboard-specific functionality
 */
function initializeDashboard() {
    // Dashboard-specific initialization (no logout handling needed)
    logger.info('Dashboard functionality initialized');
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
            submissionsList.style.display = 'block';
        } else {
            submissionsList.innerHTML = '<p>No submissions found.</p>';
            submissionsList.style.display = 'block';
        }
    } catch (error) {
        console.error('Error fetching submissions:', error);
        submissionsList.innerHTML = '<p>Error loading submissions. Please try again.</p>';
        submissionsList.style.display = 'block';
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
            submissionsList.style.display = 'none';
        });
    }
}