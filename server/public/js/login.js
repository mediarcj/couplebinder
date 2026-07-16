/**
 * Description: Login page-specific JavaScript
 * Purpose: Handles login form submission and validation for dedicated login page
 * Notes: Uses Supabase Auth client-side, no modal dependencies
 */

/**
 * Login form handler for the dedicated login page.
 * 
 * Separates login page logic from modal logic for cleaner codebase.
 * 
 * Validates form, calls Supabase Auth, sets secure cookie, redirects on success.
 */

// Use logger from main.js (exposed as window.logger)
// Note: login.js loads BEFORE main.js, so we use a fallback until main.js loads
// After main.js loads, window.logger will be available
// Use 'log' instead of 'logger' to avoid any potential conflicts
const log =
  typeof window !== 'undefined' && window.logger
    ? window.logger
    : {
        info: () => {},
        error: () => {},
        warn: () => {}
      };

// Serialize auth actions to avoid double submits
let AUTH_IN_PROGRESS = false;

const TURNSTILE_FIELD_SELECTOR =
  'textarea[name="cf-turnstile-response"], input[name="cf-turnstile-response"]';

function isTurnstileRequired() {
  try {
    // login.ejs writes this flag from the server's Turnstile configuration.
    const form = document.getElementById('loginForm');
    return form?.dataset?.turnstileEnabled === 'true';
  } catch (_) {
    return false;
  }
}

function readTurnstileResponse() {
  try {
    // Cloudflare writes its short-lived answer into this generated form field.
    const field = document.querySelector(TURNSTILE_FIELD_SELECTOR);
    return field?.value?.trim() || '';
  } catch (_) {
    return '';
  }
}

function resetTurnstileWidget() {
  try {
    const widget = typeof window !== 'undefined' ? window.turnstile : null;
    if (widget && typeof widget.reset === 'function') {
      widget.reset();
    }
  } catch (_) {
    // ignore reset errors
  }
}

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
  // The browser authenticates with Supabase first, then asks this application to set its
  // HttpOnly session cookie. The in-flight guard keeps double-clicks from racing that handoff.
  // 1. Validate the form and optional Turnstile response before any auth request.
  // 2. Create a fresh Supabase session, then hand its access token to /auth/set-cookie.
  // 3. Sync rotated CSRF state and redirect only after the server cookie is confirmed.
  log.info('Login form submit called');
  e.preventDefault();

  if (AUTH_IN_PROGRESS) {
    log.info('Auth already in progress – ignoring duplicate submit');
    return;
  }
  AUTH_IN_PROGRESS = true;

  const form = e.target;
  // Capture the original label so every validation/error exit can restore the button.
  const turnstileRequired = isTurnstileRequired();
  let turnstileToken = '';
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn?.textContent;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';
  }

  try {
    const email = document.getElementById('loginEmail').value;
    // Read both values once so validation and Supabase receive the same submission snapshot.
    const password = document.getElementById('loginPassword').value;

    // Clear previous errors
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');

    if (emailError) emailError.textContent = '';
    if (passwordError) passwordError.textContent = '';
    clearLoginMessage();

    let hasErrors = false;

    // Validate email (reuse validation from main.js if available, otherwise inline)
    const emailErrorMsg = window.validateEmail
      ? window.validateEmail(email)
      : validateEmailLocal(email);
    if (emailErrorMsg && emailError) {
      emailError.textContent = emailErrorMsg;
      hasErrors = true;
    }

    // Validate password
    const passwordErrorMsg = window.validatePassword
      ? window.validatePassword(password)
      : validatePasswordLocal(password);
    if (passwordErrorMsg && passwordError) {
      passwordError.textContent = passwordErrorMsg;
      hasErrors = true;
    }

    if (!hasErrors) {
      if (turnstileRequired) {
        // The server preflight/cookie route verifies this token; presence here is only early feedback.
        turnstileToken = readTurnstileResponse();
        if (!turnstileToken) {
          showLoginError('Please complete the verification challenge.');
          AUTH_IN_PROGRESS = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
          }
          resetTurnstileWidget();
          return;
        }
      }
      // Use Supabase Auth for login (shared client)
      try {
        const client = window.SB || window.supabase;
        // supabase-client.js exposes one shared browser client under these compatibility names.
        if (!client) {
          showLoginError(
            'Authentication system not initialized. Please refresh the page.'
          );
          AUTH_IN_PROGRESS = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
          }
          if (turnstileRequired) resetTurnstileWidget();
          return;
        }

        log.info('Attempting login with Supabase');

        // Check if there's any existing session before attempting login
        const {
          data: { session: existingSession }
        } = await client.auth.getSession();
        log.info('Existing session found before login:', !!existingSession);

        // Clear any existing session to ensure clean login
        if (existingSession) {
          // Remove stale browser auth before creating the deliberate interactive session below.
          log.info('Clearing existing session before login');
          await client.auth.signOut();
          // Clear logout hold if present
          if (window.clearLogoutHold) {
            try {
              window.clearLogoutHold();
            } catch {}
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
          // Supabase verifies credentials; this application never receives the password server-side here.
          email: email,
          password: password
        });

        log.info('Login response received');

        if (error) {
          log.error('Login failed:', error.message);
          showLoginError(`Login failed: ${error.message}`);
          AUTH_IN_PROGRESS = false;
          if (turnstileRequired) resetTurnstileWidget();
        } else {
          log.info('Login successful');

          // Verify we have a proper access token
          const access = data.session?.access_token;
          // /auth/set-cookie expects a signed JWT-shaped access token in Authorization.
          if (!access || access.split('.').length !== 3) {
            log.error('No access token received from authentication');
            showLoginError('Login failed: no access token');
            AUTH_IN_PROGRESS = false;
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = originalText;
            }
            if (turnstileRequired) resetTurnstileWidget();
            return;
          }

          try {
            // Interactive login should NOT be blocked by HOLD.
            if (window.logoutHoldActive && window.logoutHoldActive()) {
              log.info(
                'HOLD active during interactive login – overriding/clearing HOLD'
              );
              if (window.clearLogoutHold) {
                try {
                  window.clearLogoutHold();
                } catch {}
              }
            }

            // Call server endpoint to set secure cookie with backoff
            const cookieResult = await (window.postAuthCookieWithBackoff ||
              // main.js normally supplies the helper; this local version keeps login standalone.
              postAuthCookieWithBackoffLocal)({
              headers: { Authorization: `Bearer ${access}` },
              body: {},
              turnstileToken: turnstileRequired ? turnstileToken : undefined,
              turnstileIntent: turnstileRequired
                ? 'interactive-login'
                : undefined
            });

            if (!cookieResult.ok) {
              if (cookieResult.delayed) {
                showLoginError(
                  'Please wait a moment and try logging in again.'
                );
                AUTH_IN_PROGRESS = false;
                if (submitBtn) {
                  submitBtn.disabled = false;
                  submitBtn.textContent = originalText;
                }
                if (turnstileRequired) resetTurnstileWidget();
                return;
              }
              log.error(
                'Failed to set authentication cookie',
                cookieResult.error
              );
              showLoginError(
                'Login failed: ' +
                  (cookieResult.error || 'could not set session')
              );
              AUTH_IN_PROGRESS = false;
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
              }
              if (turnstileRequired) resetTurnstileWidget();
              return;
            }

            // Clear any old JS-readable cookies (security cleanup)
            // The canonical application session now lives only in the server-set HttpOnly cookie.
            document.cookie = 'access-token=; Path=/; Max-Age=0';
            document.cookie = 'refresh-token=; Path=/; Max-Age=0';

            log.info('Authentication cookie set by server');

            // Sync CSRF cookie to meta tag after successful login
            try {
              // authCookie rotates CSRF at login, so update same-page helpers before redirect.
              const cookies = document.cookie.split('; ').reduce(
                (acc, pair) => {
                  const [key, val] = pair.split('=');
                  if (key && val) acc[key] = val;
                  return acc;
                },
                {}
              );
              const csrfValue =
                cookies['csrf_token'] ||
                cookies['csrf-token'] ||
                cookies['_csrf'];
              if (csrfValue) {
                let meta = document.querySelector(
                  'meta[name="csrf-token"]'
                );
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

            // Get redirect URL: prefer validated data attribute, then query param, then default
            let redirectUrl = '/dashboard';
            try {
              // Prefer the server-sanitized destination embedded in the page model.
              const body = document.body;
              const dataNext = body?.getAttribute('data-login-next');
              if (dataNext) {
                // Use validated next URL from server (already sanitized)
                redirectUrl = dataNext;
              } else {
                // Fallback to query param (should be safe, but prefer data attribute)
                const urlParams = new URLSearchParams(
                  window.location.search
                );
                const nextUrl = urlParams.get('next');
                if (nextUrl) {
                  // Basic validation: only allow same-site paths
                  const decoded = decodeURIComponent(nextUrl);
                  if (
                    decoded.startsWith('/') &&
                    !decoded.includes('://') &&
                    !decoded.includes('//')
                  ) {
                    redirectUrl = decoded;
                  }
                }
              }
            } catch (err) {
              log.warn('Error reading redirect URL, using default:', err);
            }

            // Redirect after brief delay to show success message
            setTimeout(() => {
              // replace keeps Back from returning to a completed credential form.
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
            if (turnstileRequired) resetTurnstileWidget();
          }
        }
      } catch (error) {
        log.error('Login error:', error);
        let errorMessage = 'Network error. Please try again.';

        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          errorMessage =
            'Unable to connect to authentication server. Please check your internet connection.';
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
        if (turnstileRequired) resetTurnstileWidget();
      }
    } else {
      AUTH_IN_PROGRESS = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
      if (turnstileRequired) resetTurnstileWidget();
    }
  } finally {
    // Only restore the control when this flow is no longer intentionally awaiting redirect.
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
  if (email.indexOf('@') !== email.lastIndexOf('@'))
    return 'Email address can only contain one @ symbol';
  if (email.indexOf('@') === 0 || email.indexOf('@') === email.length - 1)
    return 'Email address cannot start or end with @ symbol';
  if (email.indexOf('.') === 0 || email.indexOf('.') === email.length - 1)
    return 'Email address cannot start or end with a dot';
  if (email.indexOf('@') > email.lastIndexOf('.'))
    return 'Dot must come after @ symbol in email address';
  const validEmailRegex = /^[a-zA-Z0-9@._-]+$/;
  if (!validEmailRegex.test(email))
    return 'Email address can only contain letters, numbers, @, ., -, and _';
  return '';
}

function validatePasswordLocal(password) {
  if (!password) return 'Password is required';
  const validPasswordRegex = /^[a-zA-Z0-9]+$/;
  if (!validPasswordRegex.test(password))
    return 'Password can only contain uppercase letters, lowercase letters, and numbers';
  return '';
}

/**
 * Local postAuthCookieWithBackoff (fallback if not available from main.js)
 */
async function postAuthCookieWithBackoffLocal(payload, opts) {
  // A 204 means the server is deliberately asking the client to wait and retry session
  // setup. Bounded retries smooth that timing gap without looping forever.
  const retries = (opts && opts.retries) || 6;
  const delayMs = (opts && opts.delayMs) || 1200;

  for (let i = 0; i <= retries; i++) {
    // Rebuild the JSON body per attempt so optional challenge fields remain intact.
    let res;
    const requestBody = {
      ...(payload && payload.body ? { ...payload.body } : {})
    };
    if (payload?.turnstileToken) {
      requestBody.turnstileToken = payload.turnstileToken;
    }
    if (payload?.turnstileIntent) {
      requestBody.turnstileIntent = payload.turnstileIntent;
    }
    try {
      res = await fetch('/auth/set-cookie', {
        // authCookie verifies the bearer token and creates the application's HttpOnly cookie.
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...payload.headers
        },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
    } catch (e) {
      return { ok: false, error: 'Network error' };
    }

    if (res.status === 204) {
      // Logout watermark timing can ask a fresh interactive login to pause briefly.
      if (i === retries) return { ok: false, delayed: true };
      await new Promise((r) => setTimeout(r, delayMs));
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

  // Handle success banners (password changed / registration) via:
  // 1) server-side flags on <body> data-attributes
  // 2) URL query params (backwards compatibility)
  // 3) sessionStorage flag (password change flow)
  try {
    const body = document.body;
    const ds = body && body.dataset ? body.dataset : {};

    const serverPasswordChanged = ds.loginPasswordChanged === '1';
    const serverRegisterSuccess = ds.loginRegisterSuccess === '1';

    const urlParams = new URLSearchParams(window.location.search || '');
    const urlPasswordChanged =
      urlParams.get('password_changed_success') === '1';
    const urlRegisterSuccess = urlParams.get('register_success') === '1';
    const sessionFlag =
      sessionStorage.getItem('passwordChangeSuccess') === '1';

    let showed = false;

    // Password changed takes priority if any of the flags say so
    if (serverPasswordChanged || urlPasswordChanged || sessionFlag) {
      showLoginSuccess(
        'Your password has been changed successfully. Please use your new password to log in.'
      );
      showed = true;

      // Clean up URL and session for next page loads
      if (urlPasswordChanged) {
        urlParams.delete('password_changed_success');
      }
      if (urlRegisterSuccess) {
        urlParams.delete('register_success');
      }
      if (history && history.replaceState) {
        const query = urlParams.toString();
        history.replaceState(
          {},
          '',
          query ? `/login?${query}` : '/login'
        );
      }
      if (sessionFlag) {
        sessionStorage.removeItem('passwordChangeSuccess');
      }
    } else if (serverRegisterSuccess || urlRegisterSuccess) {
      // Registration success
      showLoginSuccess(
        'Your account has been created. Please log in to continue.'
      );
      showed = true;

      if (urlRegisterSuccess) {
        urlParams.delete('register_success');
        if (history && history.replaceState) {
          const query = urlParams.toString();
          history.replaceState(
            {},
            '',
            query ? `/login?${query}` : '/login'
          );
        }
      }
    } else {
      // No flags: leave container empty/hidden (no flicker)
    }

    if (showed) {
      log.info('Login success banner displayed based on flags');
    }
  } catch (err) {
    log.error('Error handling login success banners:', err);
  }

  function initPasswordToggles() {
    try {
      const toggles = document.querySelectorAll('.password-toggle');
      if (!toggles || toggles.length === 0) return;

      toggles.forEach((btn) => {
        const targetId = btn.getAttribute('data-target');
        const input = targetId ? document.getElementById(targetId) : null;
        if (!input) return;

        btn.addEventListener('click', () => {
          const currentlyHidden = input.type === 'password';
          input.type = currentlyHidden ? 'text' : 'password';

          // Update ARIA and visual state
          btn.setAttribute(
            'aria-pressed',
            currentlyHidden ? 'true' : 'false'
          );
          btn.setAttribute(
            'aria-label',
            currentlyHidden ? 'Hide password' : 'Show password'
          );

          if (currentlyHidden) {
            btn.classList.add('is-visible');
          } else {
            btn.classList.remove('is-visible');
          }
        });
      });
    } catch (err) {
      log.error('initPasswordToggles error:', err);
    }
  }

  function setupTwoStepLogin() {
    const form = document.getElementById('loginForm');
    const emailInput = document.getElementById('loginEmail');
    const continueBtn = document.getElementById('loginContinueBtn');
    const continueRow = document.getElementById('loginContinueRow');
    const step1Footer = document.getElementById('loginFooterStep1');
    const step2 = document.getElementById('loginStep2');
    const passwordInput = document.getElementById('loginPassword');
    const emailError = document.getElementById('emailError');

    if (!form || !emailInput || !continueBtn || !step2) {
      return;
    }

    function showStep2() {
      // Reveal step 2
      step2.classList.remove('hidden');

      // Mark form as being in step 2 (for CSS tweaks if needed)
      form.classList.add('login-form--step2');

      // Hide the Continue row entirely
      if (continueRow) {
        continueRow.classList.add('hidden');
      }

      // Hide the step-1 "Don't have an account? Register" footer
      if (step1Footer) {
        step1Footer.classList.add('hidden');
      }

      // Focus password field for smoother UX
      if (passwordInput) {
        passwordInput.focus();
      }
    }

    continueBtn.addEventListener('click', () => {
      const email = emailInput.value || '';

      if (emailError) {
        emailError.textContent = '';
      }

      const emailErrorMsg = window.validateEmail
        ? window.validateEmail(email)
        : validateEmailLocal(email);

      if (emailErrorMsg && emailError) {
        emailError.textContent = emailErrorMsg;
        return;
      }

      showStep2();
    });

    // Pressing Enter on the email field should act like clicking Continue
    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && step2.classList.contains('hidden')) {
        e.preventDefault();
        continueBtn.click();
      }
    });
  }

  // Check for session expiration reason and show inactivity message
  function checkSessionExpiration() {
    try {
      const body = document.body;
      if (!body) return;

      const attrReason = body.getAttribute('data-login-reason') || '';

      const urlParams = new URLSearchParams(window.location.search || '');
      const queryReason = urlParams.get('reason') || '';

      const reason = (attrReason || queryReason || '').toLowerCase();

      if (
        reason === 'expired' ||
        reason === 'session_expired' ||
        reason === 'session-expired'
      ) {
        showLoginError(
          "You've been logged out due to inactivity. Please log in again."
        );
        log.info('Session expiration message displayed');

        // Optional: clean the reason param from URL so refresh is clean
        try {
          if (queryReason && history && history.replaceState) {
            urlParams.delete('reason');
            const query = urlParams.toString();
            history.replaceState(
              {},
              '',
              query ? `/login?${query}` : '/login'
            );
          }
        } catch (_) {
          // Non-fatal
        }
      }
    } catch (err) {
      log.error('Error checking session expiration:', err);
    }
  }

  // Check on page load
  checkSessionExpiration();

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
    log.info('Login form event listener attached');
  }

  // Step 2 (password + Turnstile) is revealed only after a valid email + Continue
  setupTwoStepLogin();

  // Set up show/hide password toggles
  initPasswordToggles();
})();