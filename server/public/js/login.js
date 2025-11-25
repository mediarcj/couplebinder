/**
 * File: server/public/js/login.js
 * Description: Login page-specific JavaScript
 * Purpose: Handles login form submission and validation for dedicated login page
 * Notes: Uses Supabase Auth client-side, no modal dependencies
 */

/**
 * WHAT:
 * Login form handler for the dedicated login page.
 * 
 * WHY:
 * Separates login page logic from modal logic for cleaner codebase.
 * 
 * HOW:
 * Validates form, calls Supabase Auth, sets secure cookie, redirects on success.
 */

// Use logger from main.js (exposed as window.logger)
// Note: login.js loads BEFORE main.js, so we use a fallback until main.js loads
// After main.js loads, window.logger will be available
// Use 'log' instead of 'logger' to avoid any potential conflicts
const log = (typeof window !== 'undefined' && window.logger) ? window.logger : {
  info: () => {},
  error: () => {},
  warn: () => {}
};

// Serialize auth actions to avoid double submits
let AUTH_IN_PROGRESS = false;

/**
 * Show error message on login page
 */
function showLoginError(message) {
  const container = document.getElementById('loginMessageContainer');
  const messageEl = document.getElementById('loginGeneralMessage');
  if (container && messageEl) {
    messageEl.textContent = message;
    messageEl.classList.remove('hidden');
    messageEl.classList.remove('login-message--success');
    container.classList.remove('hidden');
    messageEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Show success message on login page
 */
function showLoginSuccess(message) {
  const container = document.getElementById('loginMessageContainer');
  const messageEl = document.getElementById('loginGeneralMessage');
  if (container && messageEl) {
    messageEl.textContent = message;
    messageEl.classList.remove('hidden');
    messageEl.classList.add('login-message--success');
    container.classList.remove('hidden');
  }
}

/**
 * Clear login message
 */
function clearLoginMessage() {
  const container = document.getElementById('loginMessageContainer');
  const messageEl = document.getElementById('loginGeneralMessage');
  if (container && messageEl) {
    messageEl.textContent = '';
    messageEl.classList.add('hidden');
    messageEl.classList.remove('login-message--success');
    container.classList.add('hidden');
  }
}

/**
 * Handle login form submission
 */
async function handleLoginSubmit(e) {
  log.info('Login form submit called');
  e.preventDefault();

  if (AUTH_IN_PROGRESS) {
    log.info('Auth already in progress – ignoring duplicate submit');
    return;
  }
  AUTH_IN_PROGRESS = true;

  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn?.textContent;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';
  }

  try {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    // Clear previous errors
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    
    if (emailError) emailError.textContent = '';
    if (passwordError) passwordError.textContent = '';
    clearLoginMessage();
    
    let hasErrors = false;
    
    // Validate email (reuse validation from main.js if available, otherwise inline)
    const emailErrorMsg = window.validateEmail ? window.validateEmail(email) : validateEmailLocal(email);
    if (emailErrorMsg && emailError) {
      emailError.textContent = emailErrorMsg;
      hasErrors = true;
    }
    
    // Validate password
    const passwordErrorMsg = window.validatePassword ? window.validatePassword(password) : validatePasswordLocal(password);
    if (passwordErrorMsg && passwordError) {
      passwordError.textContent = passwordErrorMsg;
      hasErrors = true;
    }
    
    if (!hasErrors) {
      // Use Supabase Auth for login (shared client)
      try {
        const client = window.SB || window.supabase;
        if (!client) {
          showLoginError('Authentication system not initialized. Please refresh the page.');
          AUTH_IN_PROGRESS = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
          }
          return;
        }
        
        log.info('Attempting login with Supabase');
        
        // Check if there's any existing session before attempting login
        const { data: { session: existingSession } } = await client.auth.getSession();
        log.info('Existing session found before login:', !!existingSession);
        
        // Clear any existing session to ensure clean login
        if (existingSession) {
          log.info('Clearing existing session before login');
          await client.auth.signOut();
          // Clear logout hold if present
          if (window.clearLogoutHold) {
            try { window.clearLogoutHold(); } catch {}
          }
          // Wait briefly until session is truly gone to avoid races
          if (window.waitUntil && window.getSessionSafe) {
            await window.waitUntil(async () => {
              const s = await window.getSessionSafe();
              return !s;
            }, { tries: 15, intervalMs: 100 });
          }
        }
        
        const { data, error } = await client.auth.signInWithPassword({
          email: email,
          password: password
        });
        
        log.info('Login response received');
        
        if (error) {
          log.error('Login failed:', error.message);
          showLoginError(`Login failed: ${error.message}`);
          AUTH_IN_PROGRESS = false;
        } else {
          log.info('Login successful');
          
          // Verify we have a proper access token
          const access = data.session?.access_token;
          if (!access || access.split('.').length !== 3) {
            log.error('No access token received from authentication');
            showLoginError('Login failed: no access token');
            AUTH_IN_PROGRESS = false;
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = originalText;
            }
            return;
          }
          
          try {
            // Interactive login should NOT be blocked by HOLD.
            if (window.logoutHoldActive && window.logoutHoldActive()) {
              log.info('HOLD active during interactive login – overriding/clearing HOLD');
              if (window.clearLogoutHold) {
                try { window.clearLogoutHold(); } catch {}
              }
            }
            
            // Call server endpoint to set secure cookie with backoff
            const cookieResult = await (window.postAuthCookieWithBackoff || postAuthCookieWithBackoffLocal)({
              headers: { 'Authorization': `Bearer ${access}` },
              body: {}
            });
            
            if (!cookieResult.ok) {
              if (cookieResult.delayed) {
                showLoginError('Please wait a moment and try logging in again.');
                AUTH_IN_PROGRESS = false;
                if (submitBtn) {
                  submitBtn.disabled = false;
                  submitBtn.textContent = originalText;
                }
                return;
              }
              log.error('Failed to set authentication cookie', cookieResult.error);
              showLoginError('Login failed: ' + (cookieResult.error || 'could not set session'));
              AUTH_IN_PROGRESS = false;
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
              }
              return;
            }
            
            // Clear any old JS-readable cookies (security cleanup)
            document.cookie = 'access-token=; Path=/; Max-Age=0';
            document.cookie = 'refresh-token=; Path=/; Max-Age=0';
            
            log.info('Authentication cookie set by server');
            
            // Sync CSRF cookie to meta tag after successful login
            try {
              const cookies = document.cookie.split('; ').reduce((acc, pair) => {
                const [key, val] = pair.split('=');
                if (key && val) acc[key] = val;
                return acc;
              }, {});
              const csrfValue = cookies['csrf_token'] || cookies['csrf-token'] || cookies['_csrf'];
              if (csrfValue) {
                let meta = document.querySelector('meta[name="csrf-token"]');
                if (!meta) {
                  meta = document.createElement('meta');
                  meta.name = 'csrf-token';
                  document.head.appendChild(meta);
                }
                meta.content = csrfValue;
                if (typeof window !== 'undefined') {
                  window.__csrfToken = csrfValue;
                }
              }
            } catch (_) {
              // Non-fatal; CSRF will work on next page load
            }
            
            // Show success message briefly, then redirect
            showLoginSuccess('Login successful! Redirecting...');
            
            // Get redirect URL from query param or default to dashboard
            const urlParams = new URLSearchParams(window.location.search);
            const nextUrl = urlParams.get('next');
            const redirectUrl = nextUrl ? decodeURIComponent(nextUrl) : '/dashboard';
            
            // Redirect after brief delay to show success message
            setTimeout(() => {
              window.location.replace(redirectUrl);
            }, 500);
            
          } catch (cookieError) {
            log.error('Cookie setup failed:', cookieError.message);
            showLoginError('Login failed: session setup error');
            AUTH_IN_PROGRESS = false;
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = originalText;
            }
          }
        }
      } catch (error) {
        log.error('Login error:', error);
        let errorMessage = 'Network error. Please try again.';
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          errorMessage = 'Unable to connect to authentication server. Please check your internet connection.';
        } else if (error.name === 'SyntaxError') {
          errorMessage = 'Server response error. Please try again.';
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        showLoginError(errorMessage);
        AUTH_IN_PROGRESS = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    } else {
      AUTH_IN_PROGRESS = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  } finally {
    if (!AUTH_IN_PROGRESS && submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

/**
 * Local validation functions (fallback if not available from main.js)
 */
function validateEmailLocal(email) {
  if (!email) return 'Email address is required';
  if (email.length > 40) return 'Email address must be 40 characters or less';
  if (email.includes(' ')) return 'Email address cannot contain spaces';
  if (!email.includes('@')) return 'Email address must contain @ symbol';
  if (!email.includes('.')) return 'Email address must contain a dot (.)';
  if (email.indexOf('@') !== email.lastIndexOf('@')) return 'Email address can only contain one @ symbol';
  if (email.indexOf('@') === 0 || email.indexOf('@') === email.length - 1) return 'Email address cannot start or end with @ symbol';
  if (email.indexOf('.') === 0 || email.indexOf('.') === email.length - 1) return 'Email address cannot start or end with a dot';
  if (email.indexOf('@') > email.lastIndexOf('.')) return 'Dot must come after @ symbol in email address';
  const validEmailRegex = /^[a-zA-Z0-9@._-]+$/;
  if (!validEmailRegex.test(email)) return 'Email address can only contain letters, numbers, @, ., -, and _';
  return '';
}

function validatePasswordLocal(password) {
  if (!password) return 'Password is required';
  const validPasswordRegex = /^[a-zA-Z0-9]+$/;
  if (!validPasswordRegex.test(password)) return 'Password can only contain uppercase letters, lowercase letters, and numbers';
  return '';
}

/**
 * Local postAuthCookieWithBackoff (fallback if not available from main.js)
 */
async function postAuthCookieWithBackoffLocal(payload, opts) {
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
    
    try {
      const json = await res.json();
      return { ok: json.ok === true, data: json };
    } catch (_) {
      return { ok: true };
    }
  }
}

/**
 * Initialize login page
 */
(function initLoginPage() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoginPage);
    return;
  }
  
  // If SSR pre-rendered a success message, don't clear it.
  // Otherwise, handle URL flags to show banners client-side.
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const passwordChanged = urlParams.get('password_changed_success') === '1';
    const registerSuccess = urlParams.get('register_success') === '1';
    const sessionFlag = sessionStorage.getItem('passwordChangeSuccess') === '1';

    const messageEl = document.getElementById('loginGeneralMessage');
    const containerEl = document.getElementById('loginMessageContainer');
    const ssrAlreadyVisible =
      !!messageEl &&
      messageEl.classList.contains('login-message--success') &&
      containerEl && !containerEl.classList.contains('hidden');

    if (!ssrAlreadyVisible) {
      if (passwordChanged || sessionFlag) {
        // Clean up URL param
        if (passwordChanged) {
          urlParams.delete('password_changed_success');
          const query = urlParams.toString();
          if (history && history.replaceState) {
            history.replaceState({}, '', query ? `/login?${query}` : '/login');
          }
        }
        // Clean up sessionStorage
        if (sessionFlag) {
          sessionStorage.removeItem('passwordChangeSuccess');
        }
        showLoginSuccess('Your password has been changed successfully. Please use your new password to log in.');
      } else if (registerSuccess) {
        // Clean up URL param
        urlParams.delete('register_success');
        const query = urlParams.toString();
        if (history && history.replaceState) {
          history.replaceState({}, '', query ? `/login?${query}` : '/login');
        }
        showLoginSuccess('Your account has been created. Please log in to continue.');
      } else {
        // No SSR banner and no flags: keep the container hidden/empty
        // (Do nothing – avoid flicker)
      }
    }
  } catch (_) {
    // Ignore errors
  }
  
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
    log.info('Login form event listener attached');
  }
})();

