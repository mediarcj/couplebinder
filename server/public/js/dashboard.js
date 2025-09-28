// File: server/public/js/dashboard.js
// Description: Client-side JavaScript for dashboard functionality
// Purpose: Handles logout, submissions viewing, and dashboard interactions
// Notes: Maintains consistency with main.js functionality

document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard frontend loaded');
    
    // Initialize dashboard functionality
    initializeDashboard();
    initializeSubmissions();
});

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
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Logged out successfully!');
            window.location.href = '/';
        } else {
            alert(`Logout failed: ${data.message}`);
        }
    } catch (error) {
        console.error('Logout error:', error);
        alert('Network error during logout. Please try again.');
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