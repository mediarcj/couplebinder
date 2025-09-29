// File: server/public/js/dashboard.js
// Description: Client-side JavaScript for dashboard functionality
// Purpose: Handles logout, submissions viewing, and dashboard interactions
// Notes: Maintains consistency with main.js functionality

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
    console.log('Dashboard frontend loaded');
    
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
 */
async function handleLogout() {
    try {
        const csrfToken = getCSRFToken();
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotificationModal(
                'Logout Successful!', 
                'You have been logged out successfully!',
                () => {
                    window.location.href = '/';
                }
            );
        } else {
            showNotificationModal('Logout Failed', `Logout failed: ${data.message}`);
        }
    } catch (error) {
        console.error('Logout error:', error);
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
    
    const html = `
        <div class="submissions-header">
            <h3>Recent Submissions</h3>
            <button id="hideSubmissionsBtn" class="btn btn-secondary">Hide</button>
        </div>
        <div class="submissions-content">
            ${submissions.map(submission => `
                <div class="submission-item">
                    <div class="submission-meta">
                        <span class="submission-id">ID: ${submission.id}</span>
                        <span class="submission-time">${new Date(submission.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="submission-preview">
                        ${submission.preview}
                    </div>
                    <div class="submission-stats">
                        <span class="submission-length">${submission.text_length} characters</span>
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