// File: server/public/js/dashboard.js
// Description: Client-side JavaScript for dashboard functionality
// Purpose: Handles logout, submissions viewing, and dashboard interactions
// Notes: Maintains consistency with main.js functionality

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
});

// Notification Modal Functions
function showNotificationModal(title, message, onClose = null) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('notificationModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'notificationModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content notification-modal">
                <div class="modal-header">
                    <h2 id="notificationTitle">Notification</h2>
                    <span class="close" id="notificationClose">&times;</span>
                </div>
                <div class="modal-body">
                    <p id="notificationMessage">Message content</p>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" id="notificationOkBtn">OK</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    const closeBtn = document.getElementById('notificationClose');
    const okBtn = document.getElementById('notificationOkBtn');
    
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (modal) modal.style.display = 'block';
    
    // Close modal handlers
    const closeModal = () => {
        modal.style.display = 'none';
        if (onClose) onClose();
    };
    
    if (closeBtn) closeBtn.onclick = closeModal;
    if (okBtn) okBtn.onclick = closeModal;
    
    // Close on outside click
    window.onclick = function(event) {
        if (event.target === modal) {
            closeModal();
        }
    };
}

/**
 * Initialize dashboard-specific functionality
 */
function initializeDashboard() {
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

/**
 * Handle user logout
 * 
 * WHAT:
 * We log the user out and clear all authentication state.
 * 
 * WHY:
 * On logout, we must invalidate the session completely by:
 * - Clearing the HttpOnly cookie (server-side session)
 * - Signing out from Supabase (client-side session + localStorage)
 * - Clearing any JS-readable cookies (legacy cleanup)
 * - Redirecting to homepage with page reload (clears any cached state)
 * 
 * HOW:
 * 1. Call /auth/clear-cookie to remove HttpOnly cookie (backend session)
 * 2. Call Supabase signOut to clear client session + localStorage
 * 3. Clear any old JS-readable cookies (security cleanup)
 * 4. Show success modal
 * 5. Redirect to homepage with hard reload (clears all cached state)
 */
async function handleLogout() {
    try {
        // Check if Supabase client is available
        if (!window.supabase) {
            showNotificationModal('Error', 'Authentication system not initialized. Please refresh the page.');
            return;
        }
        
        // Step 1: Clear server-side HttpOnly cookie FIRST (most critical)
        try {
            await fetch('/auth/clear-cookie', {
                method: 'POST',
                credentials: 'include'  // Required for cookies
            });
            console.log('Server HttpOnly cookie cleared');
        } catch (e) {
            // Continue even if clear-cookie fails (cookie will expire anyway)
            console.warn('Server cookie clear failed, but continuing logout');
        }
        
        // Step 2: Sign out from Supabase (clears client-side session + localStorage)
        // CRITICAL: We must wait for signOut to complete before redirecting,
        // otherwise the page reload will find the stale session in localStorage
        // and restore it via checkSessionStatus()
        try {
            const { error } = await window.supabase.auth.signOut();
            if (error) {
                console.log('Supabase signOut returned error (non-critical):', error.message);
            } else {
                console.log('Supabase session cleared');
            }
        } catch (supabaseError) {
            // Supabase client error - non-critical, server cookie already cleared
            console.log('Supabase signOut exception (non-critical):', supabaseError.message);
        }
        
        // Step 3: Clear any old JS-readable cookies (security cleanup)
        document.cookie = 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax';
        document.cookie = 'sb_access_token=; Path=/; Max-Age=0; SameSite=Lax';
        document.cookie = 'sb-refresh-token=; Path=/; Max-Age=0; SameSite=Lax';
        console.log('JS-readable cookies cleared');
        
        // Step 4: Force clear Supabase localStorage (manual cleanup)
        // This ensures no stale session data remains before redirect
        try {
            localStorage.removeItem('supabase.auth.token');
            // Supabase uses a dynamic key like: sb-{project-ref}-auth-token
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('sb-') && key.includes('auth-token')) {
                    localStorage.removeItem(key);
                    console.log('Cleared Supabase localStorage key:', key);
                }
            });
        } catch (storageError) {
            console.log('localStorage cleanup skipped (non-critical)');
        }
        
        // Step 5: Show success modal and redirect with hard reload
        showNotificationModal(
            'Logout Successful!', 
            'You have been logged out successfully!',
            () => {
                // Force navigation to homepage with hard reload to clear all cached state
                window.location.href = '/';
            }
        );
    } catch (error) {
        console.error('Logout error:', error.message);
        showNotificationModal('Network Error', 'Network error during logout. Please try again.');
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