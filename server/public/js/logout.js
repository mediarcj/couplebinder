/**
 * File: server/public/js/logout.js
 * Description: Modular logout functionality for consistent logout behavior across all pages
 * Purpose: Provides a unified logout process with proper UI feedback and session cleanup
 * Notes: Can be imported and used by any page that needs logout functionality
 */

/**
 * WHAT:
 * We provide a complete, modular logout system that handles all aspects of user logout.
 *
 * WHY:
 * Consistent logout behavior across all pages prevents user confusion and ensures
 * proper session cleanup. A modular approach makes it easier to maintain and debug.
 *
 * HOW:
 * 1. Clear server-side authentication cookies
 * 2. Clear Supabase client-side session and localStorage
 * 3. Show user-friendly logout confirmation modal
 * 4. Redirect to homepage after user acknowledges logout
 */

// Quiet console logger with dev toggle and PII-safe redaction
const logger = {
    isDebugEnabled: () => localStorage.getItem('debugProfile') === '1',
    redact: (obj) => {
        if (typeof obj === 'string') {
            return obj.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[EMAIL]')
                     .replace(/(\b\d{7,}\b)/g, '[PHONE]')
                     .replace(/(sb-access-token=[^;]+)/g, '[TOKEN]');
        }
        if (typeof obj === 'object' && obj !== null) {
            const redacted = {};
            for (const [key, value] of Object.entries(obj)) {
                if (['email', 'phone', 'token', 'password', 'auth'].some(pii => key.toLowerCase().includes(pii))) {
                    redacted[key] = '[REDACTED]';
                } else if (typeof value === 'string') {
                    redacted[key] = logger.redact(value);
                } else {
                    redacted[key] = value;
                }
            }
            return redacted;
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
 * Show logout success modal
 * 
 * WHAT:
 * We display a user-friendly modal to confirm successful logout.
 *
 * WHY:
 * Users need clear feedback that logout was successful before being redirected.
 *
 * HOW:
 * We create a modal with success message and OK button that redirects to homepage.
 */
function showLogoutSuccessModal() {
    // Create modal HTML if it doesn't exist
    let modal = document.getElementById('logoutSuccessModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'logoutSuccessModal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Logout Successful!</h2>
                </div>
                <div class="modal-body">
                    <p>You have been successfully logged out.</p>
                    <div class="form-actions">
                        <button type="button" class="btn btn-primary" id="logoutSuccessOkBtn">OK</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Show modal
    modal.style.display = 'block';
    
    // Handle OK button click
    const okBtn = document.getElementById('logoutSuccessOkBtn');
    if (okBtn) {
        okBtn.onclick = () => {
            modal.style.display = 'none';
            logger.info('Logout success modal acknowledged, redirecting to homepage');
            window.location.assign('/');
        };
    }
    
    logger.info('Logout success modal displayed');
}

/**
 * Show error modal
 * 
 * WHAT:
 * We display an error modal when logout fails.
 *
 * WHY:
 * Users need to know if logout failed and what they can do about it.
 *
 * HOW:
 * We show an error modal with retry option.
 */
function showLogoutErrorModal(errorMessage) {
    // Create modal HTML if it doesn't exist
    let modal = document.getElementById('logoutErrorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'logoutErrorModal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Logout Failed</h2>
                </div>
                <div class="modal-body">
                    <p id="logoutErrorMessage">An error occurred during logout.</p>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" id="logoutErrorCloseBtn">Close</button>
                        <button type="button" class="btn btn-primary" id="logoutErrorRetryBtn">Retry</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Update error message
    const errorMsgEl = document.getElementById('logoutErrorMessage');
    if (errorMsgEl) {
        errorMsgEl.textContent = errorMessage;
    }
    
    // Show modal
    modal.style.display = 'block';
    
    // Handle close button
    const closeBtn = document.getElementById('logoutErrorCloseBtn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }
    
    // Handle retry button
    const retryBtn = document.getElementById('logoutErrorRetryBtn');
    if (retryBtn) {
        retryBtn.onclick = () => {
            modal.style.display = 'none';
            performLogout(); // Retry logout
        };
    }
    
    logger.error('Logout error modal displayed', { error: errorMessage });
}

/**
 * Perform the actual logout process
 * 
 * WHAT:
 * We execute the complete logout sequence with proper cleanup.
 *
 * WHY:
 * Logout must clear both client-side and server-side authentication
 * to prevent unauthorized access and ensure clean state.
 *
 * HOW:
 * 1. Clear server-side secure cookie
 * 2. Clear Supabase session and localStorage
 * 3. Clear client-side cookies
 * 4. Show success modal
 */
async function performLogout() {
    logger.info('Starting logout process');
    
    try {
        // Step 1: Clear server-side secure cookie
        try {
            const response = await fetch('/auth/clear-cookie', {
                method: 'POST',
                credentials: 'include'
            });
            
            if (response.ok) {
                logger.info('Server secure cookie cleared');
            } else {
                logger.warn('Server cookie clear failed, but continuing logout');
            }
        } catch (cookieError) {
            logger.warn('Server cookie clear failed, but continuing logout');
        }
        
        // Step 2: Clear Supabase session and localStorage
        try {
            // Check if Supabase is available
            if (window.supabase) {
                const { error } = await window.supabase.auth.signOut();
                if (error) {
                    logger.info('Supabase signOut returned error (non-critical):', error.message);
                } else {
                    logger.info('Supabase session cleared');
                }
            } else {
                logger.warn('Supabase not available, skipping Supabase logout');
            }
        } catch (supabaseError) {
            logger.info('Supabase signOut exception (non-critical):', supabaseError.message);
        }
        
        // Step 3: Clear client-side cookies
        const cookiesToClear = [
            'access-token=; Path=/; Max-Age=0; SameSite=Lax',
            'refresh-token=; Path=/; Max-Age=0; SameSite=Lax',
            'sb-access-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;',
            'sb-refresh-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
        ];
        
        cookiesToClear.forEach(cookie => {
            document.cookie = cookie;
        });
        
        logger.info('Client-side cookies cleared');
        
        // Step 4: Clear localStorage
        try {
            // Clear common Supabase localStorage keys
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.includes('supabase') || key && key.includes('sb-')) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
                logger.info('Cleared localStorage key', { key });
            });
            
            if (keysToRemove.length === 0) {
                logger.info('No Supabase localStorage keys found to clear');
            }
        } catch (storageError) {
            logger.info('localStorage cleanup skipped (non-critical)');
        }
        
        // Step 5: Show success modal
        logger.info('Logout process completed successfully');
        showLogoutSuccessModal();
        
    } catch (error) {
        logger.error('Logout process failed:', error);
        showLogoutErrorModal('An unexpected error occurred during logout. Please try again.');
    }
}

/**
 * Main logout handler function
 * 
 * WHAT:
 * We provide the main logout function that can be called by any page.
 *
 * WHY:
 * This provides a consistent interface for logout functionality across all pages.
 *
 * HOW:
 * We validate prerequisites and then call the logout process.
 */
async function handleLogout() {
    logger.info('handleLogout called');
    
    try {
        // Validate that we have the necessary components
        if (!window.supabase) {
            logger.warn('Supabase not available, proceeding with server-side logout only');
        }
        
        // Perform logout
        await performLogout();
        
    } catch (error) {
        logger.error('Logout handler failed:', error);
        showLogoutErrorModal('Logout failed. Please try again.');
    }
}

/**
 * Attach logout button event handler
 * 
 * WHAT:
 * We attach the logout event handler to a logout button.
 *
 * WHY:
 * This provides a consistent way to attach logout functionality to any logout button.
 *
 * HOW:
 * We find the logout button and attach the handleLogout function as click handler.
 */
function attachLogoutHandler() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
        logger.info('Logout button event handler attached');
        return true;
    } else {
        logger.error('Logout button not found');
        return false;
    }
}

/**
 * Initialize logout functionality
 * 
 * WHAT:
 * We initialize the logout system when the page loads.
 *
 * WHY:
 * This ensures logout functionality is ready when the page is loaded.
 *
 * HOW:
 * We attach the logout handler to the logout button if it exists.
 */
function initializeLogout() {
    logger.info('Initializing logout functionality');
    
    // Attach logout handler
    const success = attachLogoutHandler();
    
    if (success) {
        logger.info('Logout functionality initialized successfully');
    } else {
        logger.warn('Logout button not found - logout functionality not available');
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLogout);
} else {
    initializeLogout();
}

// Export functions for manual use
window.LogoutModule = {
    handleLogout,
    attachLogoutHandler,
    initializeLogout,
    performLogout,
    showLogoutSuccessModal,
    showLogoutErrorModal
};
