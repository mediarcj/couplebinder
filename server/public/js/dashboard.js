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