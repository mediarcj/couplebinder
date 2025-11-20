// File: server/public/js/main.js
// Description: Client-side JavaScript for application frontend
// Purpose: Handles form interactions, character counting, and API calls
// Notes: Includes text submission form validation and submissions viewing functionality

/**
 * Logout HOLD guard (prevents re-login during logout)
 * 
 * WHAT:
 * Check if logout is in progress to prevent auth re-hydration.
 * 
 * WHY:
 * When logout.js clears the session, homepage might try to re-set the cookie
 * before the redirect completes. This creates a logout → instant re-login race.
 * 
 * HOW:
 * Check localStorage for logout.ui.hold key (set by logout.js module).
 * If present, skip all auth hydration.
 */
const logoutHoldActive = () => {
  try {
    return localStorage.getItem('logout.ui.hold') === '1';
  } catch {
    return false;
  }
};

const clearLogoutHold = () => {
  try {
    localStorage.removeItem('logout.ui.hold');
  } catch {}
};

// AUTH_IN_PROGRESS moved to login.js (login page specific)

async function waitUntil(pred, { tries = 15, intervalMs = 100 } = {}) {
  for (let i = 0; i < tries; i++) {
    try { if (await pred()) return true; } catch {}
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

async function getSessionSafe() {
  try {
    const client = window.SB || window.supabase;
    if (!client?.auth?.getSession) return null;
    const { data } = await client.auth.getSession();
    return data?.session ?? null;
  } catch {
    return null;
  }
}

/**
 * Wait for Supabase client to be ready
 * 
 * WHAT:
 * Helper that waits for window.SB to be initialized.
 * 
 * WHY:
 * sbClient.js initializes asynchronously. Code that uses window.SB
 * must wait for the sb-ready event to avoid undefined errors.
 * 
 * HOW:
 * If window.SB exists, call callback immediately.
 * Otherwise, wait for sb-ready event (emitted by sbClient.js).
 */
function onSBReady(callback) {
  if (window.SB) {
    return callback();
  }
  document.addEventListener('sb-ready', () => callback(), { once: true });
}

/**
 * Frontend Logger with DEBUG flag support
 * 
 * WHAT:
 * A tiny logger that gates verbose logs behind a DEBUG flag.
 * 
 * WHY:
 * Production console should be quiet. Developers can enable verbose logs
 * by setting ?debug=1 in URL or localStorage.debug=1.
 * 
 * HOW:
 * - info/warn: only log when DEBUG is enabled
 * - error: always log (critical issues need visibility)
 * - Check for DEBUG via URL param (?debug=1) or localStorage
 */

const logger = {
    _isDebug: () => {
        // Check URL parameter first
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === '1') return true;
        
        // Check localStorage
        try {
            return localStorage.getItem('debug') === '1';
        } catch (e) {
            return false;
        }
    },
    
    // PII-safe redaction
    _redact: (obj) => {
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
                    redacted[key] = logger._redact(value);
                } else {
                    redacted[key] = value;
                }
            }
            return redacted;
        }
        return obj;
    },
    
    info: (message, ...args) => {
        if (logger._isDebug()) {
            try {
                console.log(message, ...args.map(arg => logger._redact(arg)));
            } catch (e) {
                console.log(message, '[Logger error - args not logged]');
            }
        }
    },
    
    warn: (message, ...args) => {
        if (logger._isDebug()) {
            try {
                console.warn(message, ...args.map(arg => logger._redact(arg)));
            } catch (e) {
                console.warn(message, '[Logger error - args not logged]');
            }
        }
    },
    
    error: (message, ...args) => {
        // Always log errors, but redact PII
        try {
            console.error(message, ...args.map(arg => logger._redact(arg)));
        } catch (e) {
            console.error(message, '[Logger error - args not logged]');
        }
    }
};

// Expose logger globally for use in other scripts (e.g., login.js)
window.logger = logger;

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
 * Get CSRF token from cookie or meta tag
 * @returns {string} CSRF token
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
    
    return '';
}

/**
 * WHAT:
 * Check if CSS stylesheet is loaded and applied correctly.
 * 
 * WHY:
 * Diagnose styling issues in production (CSP blocking, cache issues, etc.).
 * 
 * HOW:
 * Check if stylesheet link exists and if computed styles are available.
 * Log diagnostic info when DEBUG is enabled.
 */
function checkCssLoading() {
  if (!logger._isDebug()) return; // Only run in debug mode
  
  try {
    const stylesheet = document.querySelector('link[rel="stylesheet"][href*="style.css"]');
    if (!stylesheet) {
      logger.warn('CSS diagnostic: stylesheet link not found in DOM');
      return;
    }
    
    const href = stylesheet.getAttribute('href');
    logger.info('CSS diagnostic: stylesheet link found', { href });
    
    // Check if styles are actually applied by testing a known class
    const testEl = document.createElement('div');
    testEl.className = 'btn btn-primary';
    testEl.style.display = 'none';
    document.body.appendChild(testEl);
    
    const computedStyle = window.getComputedStyle(testEl);
    const hasStyles = computedStyle.display !== '' || computedStyle.color !== '';
    
    if (hasStyles) {
      logger.info('CSS diagnostic: styles are being applied correctly');
    } else {
      logger.warn('CSS diagnostic: styles may not be applied (check CSP or cache)');
    }
    
    document.body.removeChild(testEl);
  } catch (err) {
    logger.error('CSS diagnostic: error checking stylesheet', err);
  }
}

document.addEventListener('DOMContentLoaded', function() {
    logger.info('Frontend loaded');
    
    // Check CSS loading in debug mode
    checkCssLoading();
    
    // Extract feature config from data attributes
    const featureConfigEl = document.getElementById('feature-config');
    if (featureConfigEl) {
        window.appConfig = {
            textMinLength: parseInt(featureConfigEl.dataset.textMinLength),
            textMaxLength: parseInt(featureConfigEl.dataset.textMaxLength)
        };
    }
    
    // Wait for Supabase client to be ready before using it
    onSBReady(() => {
        const client = window.SB;
        if (!client) {
            logger.error('Supabase client not available after ready event');
            return;
        }
        
        logger.info('Using shared Supabase client');
        
        // Listen for auth state changes
        client.auth.onAuthStateChange(async (event, session) => {
            logger.info('Auth state changed:', event);
            
            if (event === 'SIGNED_OUT') {
                // Clear HOLD when we observe a genuine sign-out
                if (logoutHoldActive()) {
                    logger.info('SIGNED_OUT observed - clearing HOLD');
                    clearLogoutHold();
                }
                updateUIForLoggedOutUser();
                return;
            }
            
            if (event === 'SIGNED_IN' && session?.user) {
                // Skip hydration if HOLD is active
                if (logoutHoldActive()) {
                    logger.info('SIGNED_IN observed but HOLD active - skipping hydration');
                    return;
                }
                // User explicitly logged in (handled by handleLoginSubmit)
                updateUIForLoggedInUser(session.user.email);
            }
            // Ignore INITIAL_SESSION, TOKEN_REFRESHED - let checkSessionStatus handle it
        });
    });
    
    // Add smooth scrolling for anchor links
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') {
                e.preventDefault();
                return; // Skip links that just have # as href
            }
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Global button loader removed - causes misleading UI and encourages double-clicks
    // Each form now handles its own loading state locally
    
    // Add fade-in animation for feature cards (CSP-safe: uses CSS classes instead of inline styles)
    const featureCards = document.querySelectorAll('.feature-card');
    if (featureCards.length > 0) {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    // Remove transform after animation completes to allow hover effect
                    setTimeout(() => {
                        entry.target.classList.add('animation-complete');
                    }, 600); // Match transition duration
                }
            });
        }, observerOptions);
        
        featureCards.forEach(card => {
            card.classList.add('animate-in');
            observer.observe(card);
        });
    }
    
    // Text submission form functionality
    initializeTextForm();
    initializeSubmissions();
    
    // Logout functionality is handled by logout.js module
    logger.info('Main page initialized - logout handled by logout.js module');
    
    // Check session status and update UI (wait for SB to be ready)
    onSBReady(() => {
        checkSessionStatus();
    });
});

function initializeTextForm() {
    const textForm = document.getElementById('textForm');
    const textInput = document.getElementById('textInput');
    const charCount = document.getElementById('charCount');
    const resultDiv = document.getElementById('result');
    
    if (!textForm || !textInput || !charCount || !resultDiv) {
        return; // Form elements not found
    }
    
    // Update character count as user types
    textInput.addEventListener('input', function() {
        const count = this.value.length;
        charCount.textContent = count;
        
        // Visual feedback for limits (CSP-safe: uses CSS classes instead of inline styles)
        const minLength = window.appConfig ? window.appConfig.textMinLength : 20;
        const maxLength = window.appConfig ? window.appConfig.textMaxLength : 5000;
        
        // Remove existing validation classes
        charCount.classList.remove('error', 'valid');
        
        if (count < minLength || count > maxLength) {
            charCount.classList.add('error');
        } else {
            charCount.classList.add('valid');
        }
    });
    
    // Handle form submission
    textForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const text = textInput.value.trim();
        const submitBtn = this.querySelector('button[type="submit"]');
        
        // Show loading state
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;
        
        try {
            const csrfToken = getCSRFToken();
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({ text: text })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showResult('success', `Success! Text submitted (${data.text_length} characters). Request ID: ${data.requestId}`);
                textInput.value = '';
                charCount.textContent = '0';
            } else {
                showResult('error', `Error: ${data.error}`);
            }
        } catch (error) {
            logger.error('Submission error:', error.message);
            let errorMessage = 'Network error. Please try again.';
            
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = 'Unable to connect to server. Please check your internet connection.';
            } else if (error.name === 'SyntaxError') {
                errorMessage = 'Server response error. Please try again.';
            }
            
            showResult('error', errorMessage);
        } finally {
            // Reset button
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

function showResult(type, message) {
    const resultDiv = document.getElementById('result');
    if (!resultDiv) return;
    
    resultDiv.className = `result-message ${type}`;
    resultDiv.textContent = message;
    resultDiv.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        resultDiv.classList.add('hidden');
    }, 5000);
}

function initializeSubmissions() {
    const viewSubmissionsBtn = document.getElementById('viewSubmissionsBtn');
    const submissionsList = document.getElementById('submissionsList');
    
    if (!viewSubmissionsBtn || !submissionsList) {
        return; // Elements not found
    }
    
    viewSubmissionsBtn.addEventListener('click', async function() {
        const originalText = this.textContent;
        this.textContent = 'Loading...';
        this.disabled = true;
        
        try {
            const response = await fetch('/api/submissions');
            const data = await response.json();
            
            if (response.ok) {
                displaySubmissions(data.submissions);
                this.textContent = 'Hide Submissions';
            } else {
                showResult('error', 'Failed to load submissions');
                this.textContent = originalText;
            }
        } catch (error) {
            logger.error('Load submissions error:', error.message);
            let errorMessage = 'Network error loading submissions';
            
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = 'Unable to connect to server. Please check your internet connection.';
            } else if (error.name === 'SyntaxError') {
                errorMessage = 'Server response error. Please try again.';
            }
            
            showResult('error', errorMessage);
            this.textContent = originalText;
        } finally {
            this.disabled = false;
        }
    });
}

function displaySubmissions(submissions) {
    const submissionsList = document.getElementById('submissionsList');
    const viewBtn = document.getElementById('viewSubmissionsBtn');
    
    if (!submissionsList) return;
    
    if (submissionsList.classList.contains('hidden')) {
        // Show submissions
        if (submissions.length === 0) {
            submissionsList.innerHTML = '<p class="text-center text-muted">No submissions yet. Submit some text above!</p>';
        } else {
            // SECURITY: Escape all user content to prevent XSS attacks
            // User submissions may contain malicious HTML/JS - we escape before rendering
            submissionsList.innerHTML = submissions.map(sub => `
                <div class="submission-item">
                    <div class="submission-header">
                        <span>${escapeHtml(String(sub.text_length))} characters</span>
                        <span class="submission-id">${escapeHtml(sub.id)}</span>
                        <span>${escapeHtml(new Date(sub.timestamp).toLocaleString())}</span>
                    </div>
                    <div class="submission-preview">${escapeHtml(sub.preview)}</div>
                </div>
            `).join('');
        }
        submissionsList.classList.remove('hidden');
    } else {
        // Hide submissions
        submissionsList.classList.add('hidden');
        viewBtn.textContent = 'View Recent Submissions';
    }
}

function whenModalManagerReady(cb, tries = 100) {
    if (window.modalManager && typeof cb === 'function') {
        return cb(window.modalManager);
    }
    if (tries <= 0) {
        logger.warn('[Main] modalManager not available after retries');
        return;
    }
    setTimeout(() => whenModalManagerReady(cb, tries - 1), 50);
}

// Login form handling moved to login.js for dedicated login page

/**
 * Helper: POST /auth/set-cookie with backoff if logout sentinel is active (204)
 * 
 * WHAT:
 * Attempts to set auth cookie with retry logic for sentinel denials.
 * 
 * WHY:
 * When user logs out, sentinel cookie blocks re-auth for 10s.
 * Client should retry automatically instead of showing error.
 * 
 * HOW:
 * Retry up to 6 times with 1200ms delay between attempts.
 * Return { ok: false, delayed: true } if all retries exhausted.
 * Return { ok: true } on success, { ok: false, error: msg } on other errors.
 */
async function postAuthCookieWithBackoff(payload, opts) {
  const retries = (opts && opts.retries) || 6;
  const delayMs = (opts && opts.delayMs) || 1200;
  
  for (let i = 0; i <= retries; i++) {
    let res;
    try {
      res = await fetch('/auth/set-cookie', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...payload.headers
        },
        credentials: 'include',
        body: JSON.stringify(payload.body)
      });
    } catch (e) {
      return { ok: false, error: 'Network error' };
    }
    
    if (res.status === 204) {
      // Denied by logout sentinel; wait and retry unless out of attempts
      if (i === retries) return { ok: false, delayed: true };
      await new Promise(r => setTimeout(r, delayMs));
      continue;
    }
    
    if (!res.ok) {
      let msg = 'Session setup error';
      try {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const j = await res.json().catch(() => ({}));
          if (j && j.error) msg = j.error;
        }
      } catch (_) {}
      return { ok: false, error: msg };
    }
    
    // Parse JSON response on 200
    try {
      const json = await res.json();
      return { ok: json.ok === true, data: json };
    } catch (_) {
      return { ok: true };
    }
  }
}

/**
 * Check session status on page load
 * 
 * WHAT:
 * We check if the user has an existing valid session.
 * 
 * WHY:
 * When a user refreshes the page or visits after closing the tab,
 * Supabase may have a valid session in localStorage. We need to restore
 * the secure cookie - but ONLY if the server accepts the token.
 * 
 * HOW:
 * 1. Check Supabase for existing session
 * 2. If session exists, try to set secure cookie via /auth/set-cookie
 * 3. If server accepts (200 OK), update UI to logged-in state
 * 4. If server rejects (400/401), the token is invalid - update UI to logged-out state
 * 5. This prevents showing "Logout" briefly for invalid/expired sessions
 */
async function checkSessionStatus() {
    try {
        // Early server-truth check (before client re-hydration)
        // This prevents flicker and ensures logout state is immediately reflected
        try {
            const status = await fetch('/api/auth/status', { 
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            }).then(r => r.json()).catch(() => null);
            
            if (status && !status.authenticated) {
                logger.info('Server status: not authenticated - updating UI immediately');
                updateUIForLoggedOutUser();
                // Optionally return here if you don't want local re-hydration on home:
                // return;
            }
        } catch (e) {
            logger.info('Server status check failed (non-fatal)', e);
        }
        
        // OPT-IN CHECK: Only run hydration if page explicitly opts in
        const shouldHydrate = document.body?.dataset?.authHydrate === 'true' || 
                             document.querySelector('meta[name="auth-hydrate"]')?.content === 'true';
        
        if (!shouldHydrate) {
            logger.info('Session hydration skipped - page did not opt in');
            return;
        }
        
        // Check for logout sentinel before attempting re-hydration
        try {
            if (sessionStorage.getItem('justLoggedOut') === '1' || document.cookie.indexOf('auth_logout=1') !== -1) {
                logger.info('Logout sentinel detected - skipping session re-hydration');
                sessionStorage.removeItem('justLoggedOut');
                updateUIForLoggedOutUser();
                return; // Skip this cycle
            }
        } catch (_) {}

        // Check if Supabase has an existing session (use shared client)
        const client = window.SB || window.supabase;
        if (!client) {
            if (logoutHoldActive()) {
              logger.info('No Supabase client; clearing HOLD');
              clearLogoutHold();
            }
            updateUIForLoggedOutUser();
            return;
        }
        
        const session = await getSessionSafe();
        
        // If HOLD is active AND session is null, clear HOLD (logout complete)
        if (logoutHoldActive()) {
            if (!session) {
                logger.info('HOLD active but session null - clearing HOLD (logout complete)');
                clearLogoutHold();
                updateUIForLoggedOutUser();
            } else {
                logger.info('HOLD active with live session - skipping hydration');
                updateUIForLoggedOutUser();
            }
            return;
        }
        
        // No session found - show logged out
        if (!session?.access_token) {
            logger.info('No existing session found');
            updateUIForLoggedOutUser();
            return;
        }
        
        // We have a session in localStorage - but is it still valid?
        // Try to set the secure cookie. If server accepts it, we're logged in.
        try {
            const result = await postAuthCookieWithBackoff({
                headers: { 'Authorization': `Bearer ${session.access_token}` },
                body: {}
            });
            
            if (result.ok) {
                // Server accepted the token - session is valid
                logger.info('Session restored');
                // Get fresh user data to update UI
                const { data: { user } } = await client.auth.getUser();
                if (user) {
                    updateUIForLoggedInUser(user.email);
                } else {
                    updateUIForLoggedOutUser();
                }
                return;
            }
            
            // Server rejected the token - session is invalid
            logger.info('Session expired or invalid');
            // Clear the stale Supabase session
            await client.auth.signOut();
            updateUIForLoggedOutUser();
            
        } catch (cookieError) {
            logger.info('Session validation failed');
            updateUIForLoggedOutUser();
        }
    } catch (error) {
        logger.info('Session check failed');
        updateUIForLoggedOutUser();
    }
}

/**
 * Update UI to show logged-in state
 * 
 * WHAT:
 * We update the navigation to show Dashboard button and Logout button.
 * 
 * WHY:
 * When a user is authenticated, they should see:
 * - Dashboard button (to navigate to dashboard)
 * - Logout button (to sign out)
 * This matches the dashboard page style for consistency.
 * 
 * HOW:
 * 1. Find the auth section in the nav
 * 2. Replace login link with Dashboard button + Logout button
 * 3. Attach logout handler to the Logout button
 */
function updateUIForLoggedInUser(_userEmail) {
    const authSection = document.querySelector('.auth-section');
    if (authSection) {
        // Replace content with Dashboard button + Logout button (matches dashboard style)
        authSection.innerHTML = `
            <a href="/dashboard" class="dashboard-link btn btn-primary">Dashboard</a>
            <button id="logoutBtn" type="button" class="btn btn-secondary">Logout</button>
        `;
        
        // Re-attach logout handler for dynamically created button
        if (window.reattachLogoutHandler) {
            window.reattachLogoutHandler();
        }
        logger.info('UI updated for logged-in user - logout handler re-attached');
    }
}

/**
 * Update UI to show logged-out state
 * 
 * WHAT:
 * We update the navigation to show Login and Sign Up links.
 * 
 * WHY:
 * When no user is authenticated, they should see both Login and Sign Up options.
 * 
 * HOW:
 * 1. Find the auth section in the nav
 * 2. Replace content with Login and Sign Up links
 * 3. Link to dedicated login/signup pages
 */
function updateUIForLoggedOutUser() {
    const authSection = document.querySelector('.auth-section');
    if (authSection) {
        // Replace content with Login and Sign Up links
        authSection.innerHTML = `
            <a href="/login" class="login-link">Login</a>
            <a href="/signup" class="signup-link">Sign Up</a>
        `;
    }
}

// Logout functionality is now handled by the modular logout.js system

// Failsafe: clear HOLD if there is no live session
(function holdJanitor() {
  setTimeout(async () => {
    if (!logoutHoldActive()) return;
    try {
      // If SB is present, only clear when there's no session
      if (window.SB?.auth?.getSession || window.supabase?.auth?.getSession) {
        const s = await getSessionSafe();
        if (!s) clearLogoutHold();
      } else {
        // No auth client on this page; safe to clear HOLD to avoid sticky UI
        clearLogoutHold();
      }
    } catch {
      clearLogoutHold();
    }
  }, 1500);
})();

(function showAccountDeletionFlash() {
  if (typeof window === 'undefined') return;
  let params;
  let state = null;
  try {
    params = new URLSearchParams(window.location.search);
    state = params.get('account_deleted');
    if (state) {
      params.delete('account_deleted');
      const query = params.toString();
      if (history && history.replaceState) {
        history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`);
      }
    }
  } catch {
    return;
  }

  if (!state) return;

  const message = state === '1'
    ? 'Your account has been deleted successfully.'
    : 'We could not delete your account. Please try again.';

  whenModalManagerReady((mm) => {
    mm.showNotification('Account update', message);
  });
})();

(function showPasswordChangedFlash() {
  // Wait for DOM to be ready before checking URL params
  function init() {
    if (typeof window === 'undefined') return;
    
    // Check if we're on the homepage with password_changed_success param
    // If so, redirect to login page (which will handle showing the message)
    try {
      const params = new URLSearchParams(window.location.search);
      const state = params.get('password_changed_success');
      
      if (state === '1' && window.location.pathname === '/') {
        // Redirect to login page with the success flag
        window.location.href = '/login?password_changed_success=1';
        return;
      }
    } catch (error) {
      logger.error('[Main] Failed to check password changed success param:', error);
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already ready, but wait a bit for scripts to load
    setTimeout(init, 100);
  }
})();