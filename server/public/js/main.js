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
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This return sends the completed value or response back to the code that called this function.
    return localStorage.getItem('logout.ui.hold') === '1';
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am saving `clearLogoutHold` here so the nearby steps can reuse the same value without rebuilding it each time.
const clearLogoutHold = () => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    localStorage.removeItem('logout.ui.hold');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {}
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// AUTH_IN_PROGRESS moved to login.js (login page specific)

async function waitUntil(pred, { tries = 15, intervalMs = 100 } = {}) {
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (let i = 0; i < tries; i++) {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try { if (await pred()) return true; } catch {}
    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await new Promise(r => setTimeout(r, intervalMs));
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return false;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `getSessionSafe` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function getSessionSafe() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `client` here so the nearby steps can reuse the same value without rebuilding it each time.
    const client = window.SB || window.supabase;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!client?.auth?.getSession) return null;
    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data } = await client.auth.getSession();
    // This return sends the completed value or response back to the code that called this function.
    return data?.session ?? null;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (window.SB) {
    // This return sends the completed value or response back to the code that called this function.
    return callback();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  document.addEventListener('sb-ready', () => callback(), { once: true });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
    // I am keeping the `_isDebug` field in this object so the receiving code can read that value by its expected name.
    _isDebug: () => {
        // Check URL parameter first
        const urlParams = new URLSearchParams(window.location.search);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (urlParams.get('debug') === '1') return true;
        
        // Check localStorage
        try {
            // This return sends the completed value or response back to the code that called this function.
            return localStorage.getItem('debug') === '1';
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (e) {
            // This return sends the completed value or response back to the code that called this function.
            return false;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    
    // PII-safe redaction
    _redact: (obj) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (typeof obj === 'string') {
            // This return sends the completed value or response back to the code that called this function.
            return obj.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[EMAIL]')
                     // I am continuing the existing call chain here so this option stays attached to the same operation started above.
                     .replace(/(\b\d{7,}\b)/g, '[PHONE]')
                     // I am continuing the existing call chain here so this option stays attached to the same operation started above.
                     .replace(/(sb-access-token=[^;]+)/g, '[TOKEN]');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (typeof obj === 'object' && obj !== null) {
            // I am saving `redacted` here so the nearby steps can reuse the same value without rebuilding it each time.
            const redacted = {};
            // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
            for (const [key, value] of Object.entries(obj)) {
                // This check helps me choose or stop the next path before any work that depends on this condition runs.
                if (['email', 'phone', 'token', 'password', 'auth'].some(pii => key.toLowerCase().includes(pii))) {
                    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                    redacted[key] = '[REDACTED]';
                // I am checking this next possibility only because the earlier condition did not choose its path.
                } else if (typeof value === 'string') {
                    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                    redacted[key] = logger._redact(value);
                // This alternative runs only when the condition above did not use its first path.
                } else {
                    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                    redacted[key] = value;
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                }
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            // This return sends the completed value or response back to the code that called this function.
            return redacted;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This return sends the completed value or response back to the code that called this function.
        return obj;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    
    // I am keeping the `info` field in this object so the receiving code can read that value by its expected name.
    info: (message, ...args) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (logger._isDebug()) {
            // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
            try {
                // I am mapping the collection here so each input item becomes the output shape expected by the next step.
                console.log(message, ...args.map(arg => logger._redact(arg)));
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch (e) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                console.log(message, '[Logger error - args not logged]');
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    
    // I am keeping the `warn` field in this object so the receiving code can read that value by its expected name.
    warn: (message, ...args) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (logger._isDebug()) {
            // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
            try {
                // I am mapping the collection here so each input item becomes the output shape expected by the next step.
                console.warn(message, ...args.map(arg => logger._redact(arg)));
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch (e) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                console.warn(message, '[Logger error - args not logged]');
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    
    // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
    error: (message, ...args) => {
        // Always log errors, but redact PII
        try {
            // I am mapping the collection here so each input item becomes the output shape expected by the next step.
            console.error(message, ...args.map(arg => logger._redact(arg)));
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (e) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            console.error(message, '[Logger error - args not logged]');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!unsafe) return '';
    // This return sends the completed value or response back to the code that called this function.
    return String(unsafe)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/&/g, '&amp;')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/</g, '&lt;')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/>/g, '&gt;')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/"/g, '&quot;')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/'/g, '&#039;');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Get CSRF token from cookie or meta tag
 * @returns {string} CSRF token
 */
function getCSRFToken() {
    // Try to get from meta tag first
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (metaToken) {
        // This return sends the completed value or response back to the code that called this function.
        return metaToken.getAttribute('content');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Fallback to cookie
    const cookies = document.cookie.split(';');
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (let cookie of cookies) {
        // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
        const [name, value] = cookie.trim().split('=');
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (name === 'csrf-token') {
            // This return sends the completed value or response back to the code that called this function.
            return value;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This return sends the completed value or response back to the code that called this function.
    return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `stylesheet` here so the nearby steps can reuse the same value without rebuilding it each time.
    const stylesheet = document.querySelector('link[rel="stylesheet"][href*="style.css"]');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!stylesheet) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn('CSS diagnostic: stylesheet link not found in DOM');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am saving `href` here so the nearby steps can reuse the same value without rebuilding it each time.
    const href = stylesheet.getAttribute('href');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info('CSS diagnostic: stylesheet link found', { href });
    
    // Check if styles are actually applied by testing a known class
    const testEl = document.createElement('div');
    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
    testEl.className = 'btn btn-primary';
    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
    testEl.style.display = 'none';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    document.body.appendChild(testEl);
    
    // I am saving `computedStyle` here so the nearby steps can reuse the same value without rebuilding it each time.
    const computedStyle = window.getComputedStyle(testEl);
    // I am saving `hasStyles` here so the nearby steps can reuse the same value without rebuilding it each time.
    const hasStyles = computedStyle.display !== '' || computedStyle.color !== '';
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (hasStyles) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info('CSS diagnostic: styles are being applied correctly');
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn('CSS diagnostic: styles may not be applied (check CSP or cache)');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    document.body.removeChild(testEl);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error('CSS diagnostic: error checking stylesheet', err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
document.addEventListener('DOMContentLoaded', function() {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info('Frontend loaded');
    
    // Check CSS loading in debug mode
    checkCssLoading();
    
    // Extract feature config from data attributes
    const featureConfigEl = document.getElementById('feature-config');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (featureConfigEl) {
        // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
        window.appConfig = {
            // I am keeping the `textMinLength` field in this object so the receiving code can read that value by its expected name.
            textMinLength: parseInt(featureConfigEl.dataset.textMinLength),
            // I am keeping the `textMaxLength` field in this object so the receiving code can read that value by its expected name.
            textMaxLength: parseInt(featureConfigEl.dataset.textMaxLength)
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Wait for Supabase client to be ready before using it
    onSBReady(() => {
        // I am saving `client` here so the nearby steps can reuse the same value without rebuilding it each time.
        const client = window.SB;
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!client) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.error('Supabase client not available after ready event');
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.info('Using shared Supabase client');
        
        // Listen for auth state changes
        client.auth.onAuthStateChange(async (event, session) => {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.info('Auth state changed:', event);
            
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (event === 'SIGNED_OUT') {
                // Clear HOLD when we observe a genuine sign-out
                if (logoutHoldActive()) {
                    // I am calling this helper here so the current workflow performs this step before it moves on.
                    logger.info('SIGNED_OUT observed - clearing HOLD');
                    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
                    clearLogoutHold();
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                }
                // I am calling this helper here so the current workflow performs this step before it moves on.
                updateUIForLoggedOutUser();
                // This return sends the completed value or response back to the code that called this function.
                return;
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (event === 'SIGNED_IN' && session?.user) {
                // Skip hydration if HOLD is active
                if (logoutHoldActive()) {
                    // I am calling this helper here so the current workflow performs this step before it moves on.
                    logger.info('SIGNED_IN observed but HOLD active - skipping hydration');
                    // This return sends the completed value or response back to the code that called this function.
                    return;
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                }
                // User explicitly logged in (handled by handleLoginSubmit)
                updateUIForLoggedInUser(session.user.email);
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            // Ignore INITIAL_SESSION, TOKEN_REFRESHED - let checkSessionStatus handle it
        });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
    // Add smooth scrolling for anchor links
    const links = document.querySelectorAll('a[href^="#"]');
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    links.forEach(link => {
        // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
        link.addEventListener('click', function(e) {
            // I am saving `href` here so the nearby steps can reuse the same value without rebuilding it each time.
            const href = this.getAttribute('href');
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (href === '#') {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                e.preventDefault();
                return; // Skip links that just have # as href
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            // I am calling this helper here so the current workflow performs this step before it moves on.
            e.preventDefault();
            // I am saving `target` here so the nearby steps can reuse the same value without rebuilding it each time.
            const target = document.querySelector(href);
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (target) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                target.scrollIntoView({
                    // I am keeping the `behavior` field in this object so the receiving code can read that value by its expected name.
                    behavior: 'smooth'
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                });
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
    // Global button loader removed - causes misleading UI and encourages double-clicks
    // Each form now handles its own loading state locally
    
    // Add fade-in animation for feature cards (CSP-safe: uses CSS classes instead of inline styles)
    const featureCards = document.querySelectorAll('.feature-card');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (featureCards.length > 0) {
        // I am saving `observerOptions` here so the nearby steps can reuse the same value without rebuilding it each time.
        const observerOptions = {
            // I am keeping the `threshold` field in this object so the receiving code can read that value by its expected name.
            threshold: 0.1,
            // I am keeping the `rootMargin` field in this object so the receiving code can read that value by its expected name.
            rootMargin: '0px 0px -50px 0px'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        };
        
        // I am saving `observer` here so the nearby steps can reuse the same value without rebuilding it each time.
        const observer = new IntersectionObserver(function(entries) {
            // I am defining this small callback here so the surrounding API can run it with the value it supplies.
            entries.forEach(entry => {
                // This check helps me choose or stop the next path before any work that depends on this condition runs.
                if (entry.isIntersecting) {
                    // I am calling this helper here so the current workflow performs this step before it moves on.
                    entry.target.classList.add('visible');
                    // Remove transform after animation completes to allow hover effect
                    setTimeout(() => {
                        // I am calling this helper here so the current workflow performs this step before it moves on.
                        entry.target.classList.add('animation-complete');
                    }, 600); // Match transition duration
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                }
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            });
        // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
        }, observerOptions);
        
        // I am defining this small callback here so the surrounding API can run it with the value it supplies.
        featureCards.forEach(card => {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            card.classList.add('animate-in');
            // I am calling this helper here so the current workflow performs this step before it moves on.
            observer.observe(card);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Text submission form functionality
    initializeTextForm();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    initializeSubmissions();
    
    // Logout functionality is handled by logout.js module
    logger.info('Main page initialized - logout handled by logout.js module');
    
    // Check session status and update UI (wait for SB to be ready)
    onSBReady(() => {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        checkSessionStatus();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am keeping `initializeTextForm` as a named helper so the surrounding workflow can call this step when it needs it.
function initializeTextForm() {
    // I am saving `textForm` here so the nearby steps can reuse the same value without rebuilding it each time.
    const textForm = document.getElementById('textForm');
    // I am saving `textInput` here so the nearby steps can reuse the same value without rebuilding it each time.
    const textInput = document.getElementById('textInput');
    // I am saving `charCount` here so the nearby steps can reuse the same value without rebuilding it each time.
    const charCount = document.getElementById('charCount');
    // I am saving `resultDiv` here so the nearby steps can reuse the same value without rebuilding it each time.
    const resultDiv = document.getElementById('result');
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!textForm || !textInput || !charCount || !resultDiv) {
        return; // Form elements not found
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Update character count as user types
    textInput.addEventListener('input', function() {
        // I am saving `count` here so the nearby steps can reuse the same value without rebuilding it each time.
        const count = this.value.length;
        // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
        charCount.textContent = count;
        
        // Visual feedback for limits (CSP-safe: uses CSS classes instead of inline styles)
        const minLength = window.appConfig ? window.appConfig.textMinLength : 20;
        // I am saving `maxLength` here so the nearby steps can reuse the same value without rebuilding it each time.
        const maxLength = window.appConfig ? window.appConfig.textMaxLength : 5000;
        
        // Remove existing validation classes
        charCount.classList.remove('error', 'valid');
        
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (count < minLength || count > maxLength) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            charCount.classList.add('error');
        // This alternative runs only when the condition above did not use its first path.
        } else {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            charCount.classList.add('valid');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
    // Handle form submission
    textForm.addEventListener('submit', async function(e) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        e.preventDefault();
        
        // I am saving `text` here so the nearby steps can reuse the same value without rebuilding it each time.
        const text = textInput.value.trim();
        // I am saving `submitBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
        const submitBtn = this.querySelector('button[type="submit"]');
        
        // Show loading state
        const originalText = submitBtn.textContent;
        // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
        submitBtn.textContent = 'Submitting...';
        // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
        submitBtn.disabled = true;
        
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
            // I am saving `csrfToken` here so the nearby steps can reuse the same value without rebuilding it each time.
            const csrfToken = getCSRFToken();
            // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
            const response = await fetch('/api/submit', {
                // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
                method: 'POST',
                // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
                headers: {
                    // I am listing this entry here because the surrounding collection processes each allowed value in order.
                    'Content-Type': 'application/json',
                    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                    'X-CSRF-Token': csrfToken
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                },
                // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
                body: JSON.stringify({ text: text })
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            });
            
            // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
            const data = await response.json();
            
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (response.ok) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                showResult('success', `Success! Text submitted (${data.text_length} characters). Request ID: ${data.requestId}`);
                // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                textInput.value = '';
                // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                charCount.textContent = '0';
            // This alternative runs only when the condition above did not use its first path.
            } else {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                showResult('error', `Error: ${data.error}`);
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (error) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.error('Submission error:', error.message);
            // I am saving `errorMessage` here so the nearby steps can reuse the same value without rebuilding it each time.
            let errorMessage = 'Network error. Please try again.';
            
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                errorMessage = 'Unable to connect to server. Please check your internet connection.';
            // I am checking this next possibility only because the earlier condition did not choose its path.
            } else if (error.name === 'SyntaxError') {
                // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                errorMessage = 'Server response error. Please try again.';
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            
            // I am calling this helper here so the current workflow performs this step before it moves on.
            showResult('error', errorMessage);
        // This final block runs after success or failure so the shared cleanup still happens in either outcome.
        } finally {
            // Reset button
            submitBtn.textContent = originalText;
            // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
            submitBtn.disabled = false;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `showResult` as a named helper so the surrounding workflow can call this step when it needs it.
function showResult(type, message) {
    // I am saving `resultDiv` here so the nearby steps can reuse the same value without rebuilding it each time.
    const resultDiv = document.getElementById('result');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!resultDiv) return;
    
    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
    resultDiv.className = `result-message ${type}`;
    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
    resultDiv.textContent = message;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    resultDiv.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        resultDiv.classList.add('hidden');
    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
    }, 5000);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `initializeSubmissions` as a named helper so the surrounding workflow can call this step when it needs it.
function initializeSubmissions() {
    // I am saving `viewSubmissionsBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const viewSubmissionsBtn = document.getElementById('viewSubmissionsBtn');
    // I am saving `submissionsList` here so the nearby steps can reuse the same value without rebuilding it each time.
    const submissionsList = document.getElementById('submissionsList');
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!viewSubmissionsBtn || !submissionsList) {
        return; // Elements not found
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    viewSubmissionsBtn.addEventListener('click', async function() {
        // I am saving `originalText` here so the nearby steps can reuse the same value without rebuilding it each time.
        const originalText = this.textContent;
        // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
        this.textContent = 'Loading...';
        // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
        this.disabled = true;
        
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
            // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
            const response = await fetch('/api/submissions');
            // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
            const data = await response.json();
            
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (response.ok) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                displaySubmissions(data.submissions);
                // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                this.textContent = 'Hide Submissions';
            // This alternative runs only when the condition above did not use its first path.
            } else {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                showResult('error', 'Failed to load submissions');
                // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                this.textContent = originalText;
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (error) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.error('Load submissions error:', error.message);
            // I am saving `errorMessage` here so the nearby steps can reuse the same value without rebuilding it each time.
            let errorMessage = 'Network error loading submissions';
            
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                errorMessage = 'Unable to connect to server. Please check your internet connection.';
            // I am checking this next possibility only because the earlier condition did not choose its path.
            } else if (error.name === 'SyntaxError') {
                // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
                errorMessage = 'Server response error. Please try again.';
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            
            // I am calling this helper here so the current workflow performs this step before it moves on.
            showResult('error', errorMessage);
            // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
            this.textContent = originalText;
        // This final block runs after success or failure so the shared cleanup still happens in either outcome.
        } finally {
            // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
            this.disabled = false;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `displaySubmissions` as a named helper so the surrounding workflow can call this step when it needs it.
function displaySubmissions(submissions) {
    // I am saving `submissionsList` here so the nearby steps can reuse the same value without rebuilding it each time.
    const submissionsList = document.getElementById('submissionsList');
    // I am saving `viewBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const viewBtn = document.getElementById('viewSubmissionsBtn');
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!submissionsList) return;
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (submissionsList.classList.contains('hidden')) {
        // Show submissions
        if (submissions.length === 0) {
            // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
            submissionsList.innerHTML = '<p class="text-center text-muted">No submissions yet. Submit some text above!</p>';
        // This alternative runs only when the condition above did not use its first path.
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
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // I am calling this helper here so the current workflow performs this step before it moves on.
        submissionsList.classList.remove('hidden');
    // This alternative runs only when the condition above did not use its first path.
    } else {
        // Hide submissions
        submissionsList.classList.add('hidden');
        // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
        viewBtn.textContent = 'View Recent Submissions';
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `whenModalManagerReady` as a named helper so the surrounding workflow can call this step when it needs it.
function whenModalManagerReady(cb, tries = 100) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (window.modalManager && typeof cb === 'function') {
        // This return sends the completed value or response back to the code that called this function.
        return cb(window.modalManager);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (tries <= 0) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.warn('[Main] modalManager not available after retries');
        // This return sends the completed value or response back to the code that called this function.
        return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setTimeout(() => whenModalManagerReady(cb, tries - 1), 50);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am saving `retries` here so the nearby steps can reuse the same value without rebuilding it each time.
  const retries = (opts && opts.retries) || 6;
  // I am saving `delayMs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const delayMs = (opts && opts.delayMs) || 1200;
  
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (let i = 0; i <= retries; i++) {
    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    let res;
    // I am saving `requestBody` here so the nearby steps can reuse the same value without rebuilding it each time.
    const requestBody = {
      // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
      ...(payload && payload.body ? { ...payload.body } : {})
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (payload?.turnstileToken) {
      // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
      requestBody.turnstileToken = payload.turnstileToken;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (payload?.turnstileIntent) {
      // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
      requestBody.turnstileIntent = payload.turnstileIntent;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      res = await fetch('/auth/set-cookie', {
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: 'POST',
        // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
        headers: {
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Content-Type': 'application/json',
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Accept': 'application/json',
          // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
          ...payload.headers
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
        credentials: 'include',
        // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
        body: JSON.stringify(requestBody)
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // This return sends the completed value or response back to the code that called this function.
      return { ok: false, error: 'Network error' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (res.status === 204) {
      // Denied by logout sentinel; wait and retry unless out of attempts
      if (i === retries) return { ok: false, delayed: true };
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await new Promise(r => setTimeout(r, delayMs));
      // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
      continue;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!res.ok) {
      // I am saving `msg` here so the nearby steps can reuse the same value without rebuilding it each time.
      let msg = 'Session setup error';
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am saving `ct` here so the nearby steps can reuse the same value without rebuilding it each time.
        const ct = res.headers.get('content-type') || '';
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (ct.includes('application/json')) {
          // I am saving `j` here so the nearby steps can reuse the same value without rebuilding it each time.
          const j = await res.json().catch(() => ({}));
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (j && j.error) msg = j.error;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (_) {}
      // This return sends the completed value or response back to the code that called this function.
      return { ok: false, error: msg };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Parse JSON response on 200
    try {
      // I am saving `json` here so the nearby steps can reuse the same value without rebuilding it each time.
      const json = await res.json();
      // This return sends the completed value or response back to the code that called this function.
      return { ok: json.ok === true, data: json };
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {
      // This return sends the completed value or response back to the code that called this function.
      return { ok: true };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
        // Early server-truth check (before client re-hydration)
        // This prevents flicker and ensures logout state is immediately reflected
        try {
            // I am saving `status` here so the nearby steps can reuse the same value without rebuilding it each time.
            const status = await fetch('/api/auth/status', { 
                // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
                credentials: 'include',
                // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
                headers: { 'Accept': 'application/json' }
            // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
            }).then(r => r.json()).catch(() => null);
            
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (status && !status.authenticated) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                logger.info('Server status: not authenticated - updating UI immediately');
                // I am calling this helper here so the current workflow performs this step before it moves on.
                updateUIForLoggedOutUser();
                // Optionally return here if you don't want local re-hydration on home:
                // return;
            }
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (e) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.info('Server status check failed (non-fatal)', e);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        
        // OPT-IN CHECK: Only run hydration if page explicitly opts in
        const shouldHydrate = document.body?.dataset?.authHydrate === 'true' || 
                             // I am finding the existing page element here so the following browser code can read or update that confirmed DOM target.
                             document.querySelector('meta[name="auth-hydrate"]')?.content === 'true';
        
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!shouldHydrate) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.info('Session hydration skipped - page did not opt in');
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        
        // Check for logout sentinel before attempting re-hydration
        try {
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (sessionStorage.getItem('justLoggedOut') === '1' || document.cookie.indexOf('auth_logout=1') !== -1) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                logger.info('Logout sentinel detected - skipping session re-hydration');
                // I am calling this helper here so the current workflow performs this step before it moves on.
                sessionStorage.removeItem('justLoggedOut');
                // I am calling this helper here so the current workflow performs this step before it moves on.
                updateUIForLoggedOutUser();
                return; // Skip this cycle
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (_) {}

        // Check if Supabase has an existing session (use shared client)
        const client = window.SB || window.supabase;
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!client) {
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (logoutHoldActive()) {
              // I am calling this helper here so the current workflow performs this step before it moves on.
              logger.info('No Supabase client; clearing HOLD');
              // I am updating or clearing this saved state here so the interface reflects the result of the action above.
              clearLogoutHold();
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            // I am calling this helper here so the current workflow performs this step before it moves on.
            updateUIForLoggedOutUser();
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        
        // I am saving `session` here so the nearby steps can reuse the same value without rebuilding it each time.
        const session = await getSessionSafe();
        
        // If HOLD is active AND session is null, clear HOLD (logout complete)
        if (logoutHoldActive()) {
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (!session) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                logger.info('HOLD active but session null - clearing HOLD (logout complete)');
                // I am updating or clearing this saved state here so the interface reflects the result of the action above.
                clearLogoutHold();
                // I am calling this helper here so the current workflow performs this step before it moves on.
                updateUIForLoggedOutUser();
            // This alternative runs only when the condition above did not use its first path.
            } else {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                logger.info('HOLD active with live session - skipping hydration');
                // I am calling this helper here so the current workflow performs this step before it moves on.
                updateUIForLoggedOutUser();
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        
        // No session found - show logged out
        if (!session?.access_token) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.info('No existing session found');
            // I am calling this helper here so the current workflow performs this step before it moves on.
            updateUIForLoggedOutUser();
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        
        // We have a session in localStorage - but is it still valid?
        // Try to set the secure cookie. If server accepts it, we're logged in.
        try {
            // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
            const result = await postAuthCookieWithBackoff({
                // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
                headers: { 'Authorization': `Bearer ${session.access_token}` },
                // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
                body: {}
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            });
            
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (result.ok) {
                // Server accepted the token - session is valid
                logger.info('Session restored');
                // Get fresh user data to update UI
                const { data: { user } } = await client.auth.getUser();
                // This check helps me choose or stop the next path before any work that depends on this condition runs.
                if (user) {
                    // I am calling this helper here so the current workflow performs this step before it moves on.
                    updateUIForLoggedInUser(user.email);
                // This alternative runs only when the condition above did not use its first path.
                } else {
                    // I am calling this helper here so the current workflow performs this step before it moves on.
                    updateUIForLoggedOutUser();
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                }
                // This return sends the completed value or response back to the code that called this function.
                return;
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            
            // Server rejected the token - session is invalid
            logger.info('Session expired or invalid');
            // Clear the stale Supabase session
            await client.auth.signOut();
            // I am calling this helper here so the current workflow performs this step before it moves on.
            updateUIForLoggedOutUser();
            
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (cookieError) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.info('Session validation failed');
            // I am calling this helper here so the current workflow performs this step before it moves on.
            updateUIForLoggedOutUser();
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.info('Session check failed');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        updateUIForLoggedOutUser();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
    // I am saving `authSection` here so the nearby steps can reuse the same value without rebuilding it each time.
    const authSection = document.querySelector('.auth-section');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (authSection) {
        // Replace content with Dashboard button + Logout button (matches dashboard style)
        authSection.innerHTML = `
            <a href="/dashboard" class="dashboard-link btn btn-primary">Dashboard</a>
            <button id="logoutBtn" type="button" class="btn btn-secondary">Logout</button>
        `;
        
        // Re-attach logout handler for dynamically created button
        if (window.reattachLogoutHandler) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            window.reattachLogoutHandler();
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.info('UI updated for logged-in user - logout handler re-attached');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
 * 3. Link to dedicated login/register pages
 */
function updateUIForLoggedOutUser() {
    // I am saving `authSection` here so the nearby steps can reuse the same value without rebuilding it each time.
    const authSection = document.querySelector('.auth-section');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (authSection) {
        // Replace content with Login and Sign Up links
        authSection.innerHTML = `
            <a href="/login" class="login-link">Login</a>
            <a href="/register" class="register-link">Register</a>
        `;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Logout functionality is now handled by the modular logout.js system

// Failsafe: clear HOLD if there is no live session
(function holdJanitor() {
  // I am updating or clearing this saved state here so the interface reflects the result of the action above.
  setTimeout(async () => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!logoutHoldActive()) return;
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // If SB is present, only clear when there's no session
      if (window.SB?.auth?.getSession || window.supabase?.auth?.getSession) {
        // I am saving `s` here so the nearby steps can reuse the same value without rebuilding it each time.
        const s = await getSessionSafe();
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!s) clearLogoutHold();
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // No auth client on this page; safe to clear HOLD to avoid sticky UI
        clearLogoutHold();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      clearLogoutHold();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
  }, 1500);
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();

// I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
(function showAccountDeletionFlash() {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof window === 'undefined') return;
  // I am saving `params` here so the nearby steps can reuse the same value without rebuilding it each time.
  let params;
  // I am saving `state` here so the nearby steps can reuse the same value without rebuilding it each time.
  let state = null;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
    params = new URLSearchParams(window.location.search);
    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
    state = params.get('account_deleted');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (state) {
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      params.delete('account_deleted');
      // I am saving `query` here so the nearby steps can reuse the same value without rebuilding it each time.
      const query = params.toString();
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (history && history.replaceState) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!state) return;

  // I am saving `message` here so the nearby steps can reuse the same value without rebuilding it each time.
  const message = state === '1'
    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
    ? 'Your account has been deleted successfully.'
    // I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
    : 'We could not delete your account. Please try again.';

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  whenModalManagerReady((mm) => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    mm.showNotification('Account update', message);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();

// I am keeping this line here because the surrounding main.js workflow expects this value or operation before it continues.
(function showPasswordChangedFlash() {
  // Wait for DOM to be ready before checking URL params
  function init() {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof window === 'undefined') return;
    
    // Check if we're on the homepage with password_changed_success param
    // If so, redirect to login page (which will handle showing the message)
    try {
      // I am saving `params` here so the nearby steps can reuse the same value without rebuilding it each time.
      const params = new URLSearchParams(window.location.search);
      // I am saving `state` here so the nearby steps can reuse the same value without rebuilding it each time.
      const state = params.get('password_changed_success');
      
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (state === '1' && window.location.pathname === '/') {
        // Redirect to login page with the success flag
        window.location.href = '/login?password_changed_success=1';
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error('[Main] Failed to check password changed success param:', error);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('DOMContentLoaded', init);
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // DOM already ready, but wait a bit for scripts to load
    setTimeout(init, 100);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();

/**
 * Cross-tab logout synchronization
 * 
 * WHAT:
 * Listens for logout events from other tabs and instantly syncs the UI.
 *
 * WHY:
 * When a user logs out in one tab, all other tabs should immediately show
 * the logged-out state for consistent UX.
 *
 * HOW:
 * Uses BroadcastChannel to communicate between tabs and redirects to homepage
 * when logout is detected from another tab.
 */
(function setupCrossTabLogoutSync() {
  // Only run on pages that have data-auth-hydrate="true" (authenticated pages)
  const body = document.body;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!body || body.getAttribute('data-auth-hydrate') !== 'true') {
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `bc` here so the nearby steps can reuse the same value without rebuilding it each time.
    const bc = new BroadcastChannel('auth');
    
    // Listen for logout events from other tabs
    bc.onmessage = (e) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (e?.data?.type === 'LOGOUT') {
        // Drop any local UI state and hard-redirect to homepage
        window.location.replace('/');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // Clean up when page unloads
    window.addEventListener('beforeunload', () => {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try { bc.close(); } catch {}
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // BroadcastChannel not supported - continue without cross-tab sync
    logger.warn('[Main] Cross-tab logout sync not available', { error: error.message });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();