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
const log =
  // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
  typeof window !== 'undefined' && window.logger
    // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
    ? window.logger
    // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
    : {
        // I am keeping the `info` field in this object so the receiving code can read that value by its expected name.
        info: () => {},
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: () => {},
        // I am keeping the `warn` field in this object so the receiving code can read that value by its expected name.
        warn: () => {}
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };

// Serialize auth actions to avoid double submits
let AUTH_IN_PROGRESS = false;

// I am saving `TURNSTILE_FIELD_SELECTOR` here so the nearby steps can reuse the same value without rebuilding it each time.
const TURNSTILE_FIELD_SELECTOR =
  // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
  'textarea[name="cf-turnstile-response"], input[name="cf-turnstile-response"]';

// I am keeping `isTurnstileRequired` as a named helper so the surrounding workflow can call this step when it needs it.
function isTurnstileRequired() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // login.ejs writes this flag from the server's Turnstile configuration.
    const form = document.getElementById('loginForm');
    // This return sends the completed value or response back to the code that called this function.
    return form?.dataset?.turnstileEnabled === 'true';
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (_) {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `readTurnstileResponse` as a named helper so the surrounding workflow can call this step when it needs it.
function readTurnstileResponse() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Cloudflare writes its short-lived answer into this generated form field.
    const field = document.querySelector(TURNSTILE_FIELD_SELECTOR);
    // This return sends the completed value or response back to the code that called this function.
    return field?.value?.trim() || '';
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (_) {
    // This return sends the completed value or response back to the code that called this function.
    return '';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `resetTurnstileWidget` as a named helper so the surrounding workflow can call this step when it needs it.
function resetTurnstileWidget() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `widget` here so the nearby steps can reuse the same value without rebuilding it each time.
    const widget = typeof window !== 'undefined' ? window.turnstile : null;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (widget && typeof widget.reset === 'function') {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      widget.reset();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (_) {
    // ignore reset errors
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Show error message on login page
 */
function showLoginError(message) {
  // I am saving `container` here so the nearby steps can reuse the same value without rebuilding it each time.
  const container = document.getElementById('loginMessageContainer');
  // I am saving `messageEl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const messageEl = document.getElementById('loginGeneralMessage');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (container && messageEl) {
    // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
    messageEl.textContent = message;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    messageEl.classList.remove('hidden');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    messageEl.classList.remove('login-message--success');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    container.classList.remove('hidden');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    messageEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Show success message on login page
 */
function showLoginSuccess(message) {
  // I am saving `container` here so the nearby steps can reuse the same value without rebuilding it each time.
  const container = document.getElementById('loginMessageContainer');
  // I am saving `messageEl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const messageEl = document.getElementById('loginGeneralMessage');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (container && messageEl) {
    // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
    messageEl.textContent = message;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    messageEl.classList.remove('hidden');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    messageEl.classList.add('login-message--success');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    container.classList.remove('hidden');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Clear login message
 */
function clearLoginMessage() {
  // I am saving `container` here so the nearby steps can reuse the same value without rebuilding it each time.
  const container = document.getElementById('loginMessageContainer');
  // I am saving `messageEl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const messageEl = document.getElementById('loginGeneralMessage');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (container && messageEl) {
    // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
    messageEl.textContent = '';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    messageEl.classList.add('hidden');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    messageEl.classList.remove('login-message--success');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    container.classList.add('hidden');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am calling this helper here so the current workflow performs this step before it moves on.
  e.preventDefault();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (AUTH_IN_PROGRESS) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info('Auth already in progress – ignoring duplicate submit');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
  AUTH_IN_PROGRESS = true;

  // I am saving `form` here so the nearby steps can reuse the same value without rebuilding it each time.
  const form = e.target;
  // Capture the original label so every validation/error exit can restore the button.
  const turnstileRequired = isTurnstileRequired();
  // I am saving `turnstileToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  let turnstileToken = '';
  // I am saving `submitBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const submitBtn = form.querySelector('button[type="submit"]');
  // I am saving `originalText` here so the nearby steps can reuse the same value without rebuilding it each time.
  const originalText = submitBtn?.textContent;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (submitBtn) {
    // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
    submitBtn.disabled = true;
    // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
    submitBtn.textContent = 'Signing in…';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `email` here so the nearby steps can reuse the same value without rebuilding it each time.
    const email = document.getElementById('loginEmail').value;
    // Read both values once so validation and Supabase receive the same submission snapshot.
    const password = document.getElementById('loginPassword').value;

    // Clear previous errors
    const emailError = document.getElementById('emailError');
    // I am saving `passwordError` here so the nearby steps can reuse the same value without rebuilding it each time.
    const passwordError = document.getElementById('passwordError');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (emailError) emailError.textContent = '';
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (passwordError) passwordError.textContent = '';
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    clearLoginMessage();

    // I am saving `hasErrors` here so the nearby steps can reuse the same value without rebuilding it each time.
    let hasErrors = false;

    // Validate email (reuse validation from main.js if available, otherwise inline)
    const emailErrorMsg = window.validateEmail
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      ? window.validateEmail(email)
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      : validateEmailLocal(email);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (emailErrorMsg && emailError) {
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      emailError.textContent = emailErrorMsg;
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      hasErrors = true;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Validate password
    const passwordErrorMsg = window.validatePassword
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      ? window.validatePassword(password)
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      : validatePasswordLocal(password);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (passwordErrorMsg && passwordError) {
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      passwordError.textContent = passwordErrorMsg;
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      hasErrors = true;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!hasErrors) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (turnstileRequired) {
        // The server preflight/cookie route verifies this token; presence here is only early feedback.
        turnstileToken = readTurnstileResponse();
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!turnstileToken) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          showLoginError('Please complete the verification challenge.');
          // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
          AUTH_IN_PROGRESS = false;
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (submitBtn) {
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            submitBtn.disabled = false;
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            submitBtn.textContent = originalText;
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
          // I am calling this helper here so the current workflow performs this step before it moves on.
          resetTurnstileWidget();
          // This return sends the completed value or response back to the code that called this function.
          return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // Use Supabase Auth for login (shared client)
      try {
        // I am saving `client` here so the nearby steps can reuse the same value without rebuilding it each time.
        const client = window.SB || window.supabase;
        // supabase-client.js exposes one shared browser client under these compatibility names.
        if (!client) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          showLoginError(
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            'Authentication system not initialized. Please refresh the page.'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          );
          // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
          AUTH_IN_PROGRESS = false;
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (submitBtn) {
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            submitBtn.disabled = false;
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            submitBtn.textContent = originalText;
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (turnstileRequired) resetTurnstileWidget();
          // This return sends the completed value or response back to the code that called this function.
          return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.info('Attempting login with Supabase');

        // Check if there's any existing session before attempting login
        const {
          // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
          data: { session: existingSession }
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        } = await client.auth.getSession();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.info('Existing session found before login:', !!existingSession);

        // Clear any existing session to ensure clean login
        if (existingSession) {
          // Remove stale browser auth before creating the deliberate interactive session below.
          log.info('Clearing existing session before login');
          // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
          await client.auth.signOut();
          // Clear logout hold if present
          if (window.clearLogoutHold) {
            // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
            try {
              // I am calling this helper here so the current workflow performs this step before it moves on.
              window.clearLogoutHold();
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch {}
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
          // Wait briefly until session is truly gone to avoid races
          if (window.waitUntil && window.getSessionSafe) {
            // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
            await window.waitUntil(async () => {
              // I am saving `s` here so the nearby steps can reuse the same value without rebuilding it each time.
              const s = await window.getSessionSafe();
              // This return sends the completed value or response back to the code that called this function.
              return !s;
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            }, { tries: 15, intervalMs: 100 });
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
        const { data, error } = await client.auth.signInWithPassword({
          // Supabase verifies credentials; this application never receives the password server-side here.
          email: email,
          // I am keeping the `password` field in this object so the receiving code can read that value by its expected name.
          password: password
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });

        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.info('Login response received');

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (error) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          log.error('Login failed:', error.message);
          // I am calling this helper here so the current workflow performs this step before it moves on.
          showLoginError(`Login failed: ${error.message}`);
          // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
          AUTH_IN_PROGRESS = false;
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (turnstileRequired) resetTurnstileWidget();
        // This alternative runs only when the condition above did not use its first path.
        } else {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          log.info('Login successful');

          // Verify we have a proper access token
          const access = data.session?.access_token;
          // /auth/set-cookie expects a signed JWT-shaped access token in Authorization.
          if (!access || access.split('.').length !== 3) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            log.error('No access token received from authentication');
            // I am calling this helper here so the current workflow performs this step before it moves on.
            showLoginError('Login failed: no access token');
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            AUTH_IN_PROGRESS = false;
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (submitBtn) {
              // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
              submitBtn.disabled = false;
              // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
              submitBtn.textContent = originalText;
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (turnstileRequired) resetTurnstileWidget();
            // This return sends the completed value or response back to the code that called this function.
            return;
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }

          // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
          try {
            // Interactive login should NOT be blocked by HOLD.
            if (window.logoutHoldActive && window.logoutHoldActive()) {
              // I am calling this helper here so the current workflow performs this step before it moves on.
              log.info(
                // I am listing this entry here because the surrounding collection processes each allowed value in order.
                'HOLD active during interactive login – overriding/clearing HOLD'
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              );
              // This check helps me choose or stop the next path before any work that depends on this condition runs.
              if (window.clearLogoutHold) {
                // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
                try {
                  // I am calling this helper here so the current workflow performs this step before it moves on.
                  window.clearLogoutHold();
                // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
                } catch {}
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              }
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }

            // Call server endpoint to set secure cookie with backoff
            const cookieResult = await (window.postAuthCookieWithBackoff ||
              // main.js normally supplies the helper; this local version keeps login standalone.
              postAuthCookieWithBackoffLocal)({
              // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
              headers: { Authorization: `Bearer ${access}` },
              // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
              body: {},
              // I am keeping the `turnstileToken` field in this object so the receiving code can read that value by its expected name.
              turnstileToken: turnstileRequired ? turnstileToken : undefined,
              // I am keeping the `turnstileIntent` field in this object so the receiving code can read that value by its expected name.
              turnstileIntent: turnstileRequired
                // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                ? 'interactive-login'
                // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                : undefined
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            });

            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (!cookieResult.ok) {
              // This check helps me choose or stop the next path before any work that depends on this condition runs.
              if (cookieResult.delayed) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                showLoginError(
                  // I am listing this entry here because the surrounding collection processes each allowed value in order.
                  'Please wait a moment and try logging in again.'
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                );
                // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                AUTH_IN_PROGRESS = false;
                // This check helps me choose or stop the next path before any work that depends on this condition runs.
                if (submitBtn) {
                  // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                  submitBtn.disabled = false;
                  // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                  submitBtn.textContent = originalText;
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                }
                // This check helps me choose or stop the next path before any work that depends on this condition runs.
                if (turnstileRequired) resetTurnstileWidget();
                // This return sends the completed value or response back to the code that called this function.
                return;
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              }
              // I am calling this helper here so the current workflow performs this step before it moves on.
              log.error(
                // I am listing this entry here because the surrounding collection processes each allowed value in order.
                'Failed to set authentication cookie',
                // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                cookieResult.error
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              );
              // I am calling this helper here so the current workflow performs this step before it moves on.
              showLoginError(
                // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                'Login failed: ' +
                  // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                  (cookieResult.error || 'could not set session')
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              );
              // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
              AUTH_IN_PROGRESS = false;
              // This check helps me choose or stop the next path before any work that depends on this condition runs.
              if (submitBtn) {
                // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                submitBtn.disabled = false;
                // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                submitBtn.textContent = originalText;
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              }
              // This check helps me choose or stop the next path before any work that depends on this condition runs.
              if (turnstileRequired) resetTurnstileWidget();
              // This return sends the completed value or response back to the code that called this function.
              return;
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }

            // Clear any old JS-readable cookies (security cleanup)
            // The canonical application session now lives only in the server-set HttpOnly cookie.
            document.cookie = 'access-token=; Path=/; Max-Age=0';
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            document.cookie = 'refresh-token=; Path=/; Max-Age=0';

            // I am calling this helper here so the current workflow performs this step before it moves on.
            log.info('Authentication cookie set by server');

            // Sync CSRF cookie to meta tag after successful login
            try {
              // authCookie rotates CSRF at login, so update same-page helpers before redirect.
              const cookies = document.cookie.split('; ').reduce(
                // I am defining this small callback here so the surrounding API can run it with the value it supplies.
                (acc, pair) => {
                  // I am saving `key` here so the nearby steps can reuse the same value without rebuilding it each time.
                  const [key, val] = pair.split('=');
                  // This check helps me choose or stop the next path before any work that depends on this condition runs.
                  if (key && val) acc[key] = val;
                  // This return sends the completed value or response back to the code that called this function.
                  return acc;
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                },
                // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
                {}
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              );
              // I am saving `csrfValue` here so the nearby steps can reuse the same value without rebuilding it each time.
              const csrfValue =
                // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                cookies['csrf_token'] ||
                // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                cookies['csrf-token'] ||
                // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                cookies['_csrf'];
              // This check helps me choose or stop the next path before any work that depends on this condition runs.
              if (csrfValue) {
                // I am saving `meta` here so the nearby steps can reuse the same value without rebuilding it each time.
                let meta = document.querySelector(
                  // I am listing this entry here because the surrounding collection processes each allowed value in order.
                  'meta[name="csrf-token"]'
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                );
                // This check helps me choose or stop the next path before any work that depends on this condition runs.
                if (!meta) {
                  // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                  meta = document.createElement('meta');
                  // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                  meta.name = 'csrf-token';
                  // I am calling this helper here so the current workflow performs this step before it moves on.
                  document.head.appendChild(meta);
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                }
                // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                meta.content = csrfValue;
                // This check helps me choose or stop the next path before any work that depends on this condition runs.
                if (typeof window !== 'undefined') {
                  // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                  window.__csrfToken = csrfValue;
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                }
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              }
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch (_) {
              // Non-fatal; CSRF will work on next page load
            }

            // Show success message briefly, then redirect
            showLoginSuccess('Login successful! Redirecting...');

            // Get redirect URL: prefer validated data attribute, then query param, then default
            let redirectUrl = '/dashboard';
            // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
            try {
              // Prefer the server-sanitized destination embedded in the page model.
              const body = document.body;
              // I am saving `dataNext` here so the nearby steps can reuse the same value without rebuilding it each time.
              const dataNext = body?.getAttribute('data-login-next');
              // This check helps me choose or stop the next path before any work that depends on this condition runs.
              if (dataNext) {
                // Use validated next URL from server (already sanitized)
                redirectUrl = dataNext;
              // This alternative runs only when the condition above did not use its first path.
              } else {
                // Fallback to query param (should be safe, but prefer data attribute)
                const urlParams = new URLSearchParams(
                  // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                  window.location.search
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                );
                // I am saving `nextUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
                const nextUrl = urlParams.get('next');
                // This check helps me choose or stop the next path before any work that depends on this condition runs.
                if (nextUrl) {
                  // Basic validation: only allow same-site paths
                  const decoded = decodeURIComponent(nextUrl);
                  // This check helps me choose or stop the next path before any work that depends on this condition runs.
                  if (
                    // I am calling this helper here so the current workflow performs this step before it moves on.
                    decoded.startsWith('/') &&
                    // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                    !decoded.includes('://') &&
                    // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                    !decoded.includes('//')
                  // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                  ) {
                    // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
                    redirectUrl = decoded;
                  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                  }
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                }
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              }
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch (err) {
              // I am calling this helper here so the current workflow performs this step before it moves on.
              log.warn('Error reading redirect URL, using default:', err);
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }

            // Redirect after brief delay to show success message
            setTimeout(() => {
              // replace keeps Back from returning to a completed credential form.
              window.location.replace(redirectUrl);
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            }, 500);
          // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
          } catch (cookieError) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            log.error('Cookie setup failed:', cookieError.message);
            // I am calling this helper here so the current workflow performs this step before it moves on.
            showLoginError('Login failed: session setup error');
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            AUTH_IN_PROGRESS = false;
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (submitBtn) {
              // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
              submitBtn.disabled = false;
              // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
              submitBtn.textContent = originalText;
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (turnstileRequired) resetTurnstileWidget();
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (error) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.error('Login error:', error);
        // I am saving `errorMessage` here so the nearby steps can reuse the same value without rebuilding it each time.
        let errorMessage = 'Network error. Please try again.';

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
          errorMessage =
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            'Unable to connect to authentication server. Please check your internet connection.';
        // I am checking this next possibility only because the earlier condition did not choose its path.
        } else if (error.name === 'SyntaxError') {
          // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
          errorMessage = 'Server response error. Please try again.';
        // I am checking this next possibility only because the earlier condition did not choose its path.
        } else if (error.message) {
          // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
          errorMessage = error.message;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am calling this helper here so the current workflow performs this step before it moves on.
        showLoginError(errorMessage);
        // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
        AUTH_IN_PROGRESS = false;
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (submitBtn) {
          // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
          submitBtn.disabled = false;
          // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
          submitBtn.textContent = originalText;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (turnstileRequired) resetTurnstileWidget();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      AUTH_IN_PROGRESS = false;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (submitBtn) {
        // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
        submitBtn.disabled = false;
        // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
        submitBtn.textContent = originalText;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (turnstileRequired) resetTurnstileWidget();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This final block runs after success or failure so the shared cleanup still happens in either outcome.
  } finally {
    // Only restore the control when this flow is no longer intentionally awaiting redirect.
    if (!AUTH_IN_PROGRESS && submitBtn) {
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      submitBtn.disabled = false;
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      submitBtn.textContent = originalText;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Local validation functions (fallback if not available from main.js)
 */
function validateEmailLocal(email) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!email) return 'Email address is required';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.length > 40) return 'Email address must be 40 characters or less';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.includes(' ')) return 'Email address cannot contain spaces';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!email.includes('@')) return 'Email address must contain @ symbol';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!email.includes('.')) return 'Email address must contain a dot (.)';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.indexOf('@') !== email.lastIndexOf('@'))
    // This return sends the completed value or response back to the code that called this function.
    return 'Email address can only contain one @ symbol';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.indexOf('@') === 0 || email.indexOf('@') === email.length - 1)
    // This return sends the completed value or response back to the code that called this function.
    return 'Email address cannot start or end with @ symbol';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.indexOf('.') === 0 || email.indexOf('.') === email.length - 1)
    // This return sends the completed value or response back to the code that called this function.
    return 'Email address cannot start or end with a dot';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.indexOf('@') > email.lastIndexOf('.'))
    // This return sends the completed value or response back to the code that called this function.
    return 'Dot must come after @ symbol in email address';
  // I am saving `validEmailRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const validEmailRegex = /^[a-zA-Z0-9@._-]+$/;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!validEmailRegex.test(email))
    // This return sends the completed value or response back to the code that called this function.
    return 'Email address can only contain letters, numbers, @, ., -, and _';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validatePasswordLocal` as a named helper so the surrounding workflow can call this step when it needs it.
function validatePasswordLocal(password) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!password) return 'Password is required';
  // I am saving `validPasswordRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const validPasswordRegex = /^[a-zA-Z0-9]+$/;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!validPasswordRegex.test(password))
    // This return sends the completed value or response back to the code that called this function.
    return 'Password can only contain uppercase letters, lowercase letters, and numbers';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Local postAuthCookieWithBackoff (fallback if not available from main.js)
 */
async function postAuthCookieWithBackoffLocal(payload, opts) {
  // A 204 means the server is deliberately asking the client to wait and retry session
  // setup. Bounded retries smooth that timing gap without looping forever.
  const retries = (opts && opts.retries) || 6;
  // I am saving `delayMs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const delayMs = (opts && opts.delayMs) || 1200;

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (let i = 0; i <= retries; i++) {
    // Rebuild the JSON body per attempt so optional challenge fields remain intact.
    let res;
    // I am saving `requestBody` here so the nearby steps can reuse the same value without rebuilding it each time.
    const requestBody = {
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      ...(payload && payload.body ? { ...payload.body } : {})
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (payload?.turnstileToken) {
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      requestBody.turnstileToken = payload.turnstileToken;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (payload?.turnstileIntent) {
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      requestBody.turnstileIntent = payload.turnstileIntent;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      res = await fetch('/auth/set-cookie', {
        // authCookie verifies the bearer token and creates the application's HttpOnly cookie.
        method: 'POST',
        // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
        headers: {
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Content-Type': 'application/json',
          // I am keeping the `Accept` field in this object so the receiving code can read that value by its expected name.
          Accept: 'application/json',
          // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
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
      // Logout watermark timing can ask a fresh interactive login to pause briefly.
      if (i === retries) return { ok: false, delayed: true };
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await new Promise((r) => setTimeout(r, delayMs));
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

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
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
 * Initialize login page
 */
(function initLoginPage() {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (document.readyState === 'loading') {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('DOMContentLoaded', initLoginPage);
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Handle success banners (password changed / registration) via:
  // 1) server-side flags on <body> data-attributes
  // 2) URL query params (backwards compatibility)
  // 3) sessionStorage flag (password change flow)
  try {
    // I am saving `body` here so the nearby steps can reuse the same value without rebuilding it each time.
    const body = document.body;
    // I am saving `ds` here so the nearby steps can reuse the same value without rebuilding it each time.
    const ds = body && body.dataset ? body.dataset : {};

    // I am saving `serverPasswordChanged` here so the nearby steps can reuse the same value without rebuilding it each time.
    const serverPasswordChanged = ds.loginPasswordChanged === '1';
    // I am saving `serverRegisterSuccess` here so the nearby steps can reuse the same value without rebuilding it each time.
    const serverRegisterSuccess = ds.loginRegisterSuccess === '1';

    // I am saving `urlParams` here so the nearby steps can reuse the same value without rebuilding it each time.
    const urlParams = new URLSearchParams(window.location.search || '');
    // I am saving `urlPasswordChanged` here so the nearby steps can reuse the same value without rebuilding it each time.
    const urlPasswordChanged =
      // I am calling this helper here so the current workflow performs this step before it moves on.
      urlParams.get('password_changed_success') === '1';
    // I am saving `urlRegisterSuccess` here so the nearby steps can reuse the same value without rebuilding it each time.
    const urlRegisterSuccess = urlParams.get('register_success') === '1';
    // I am saving `sessionFlag` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sessionFlag =
      // I am calling this helper here so the current workflow performs this step before it moves on.
      sessionStorage.getItem('passwordChangeSuccess') === '1';

    // I am saving `showed` here so the nearby steps can reuse the same value without rebuilding it each time.
    let showed = false;

    // Password changed takes priority if any of the flags say so
    if (serverPasswordChanged || urlPasswordChanged || sessionFlag) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showLoginSuccess(
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Your password has been changed successfully. Please use your new password to log in.'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      showed = true;

      // Clean up URL and session for next page loads
      if (urlPasswordChanged) {
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        urlParams.delete('password_changed_success');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (urlRegisterSuccess) {
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        urlParams.delete('register_success');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (history && history.replaceState) {
        // I am saving `query` here so the nearby steps can reuse the same value without rebuilding it each time.
        const query = urlParams.toString();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        history.replaceState(
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          {},
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          '',
          // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
          query ? `/login?${query}` : '/login'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (sessionFlag) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        sessionStorage.removeItem('passwordChangeSuccess');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am checking this next possibility only because the earlier condition did not choose its path.
    } else if (serverRegisterSuccess || urlRegisterSuccess) {
      // Registration success
      showLoginSuccess(
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Your account has been created. Please log in to continue.'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      showed = true;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (urlRegisterSuccess) {
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        urlParams.delete('register_success');
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (history && history.replaceState) {
          // I am saving `query` here so the nearby steps can reuse the same value without rebuilding it each time.
          const query = urlParams.toString();
          // I am calling this helper here so the current workflow performs this step before it moves on.
          history.replaceState(
            // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
            {},
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            '',
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            query ? `/login?${query}` : '/login'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          );
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // No flags: leave container empty/hidden (no flicker)
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (showed) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.info('Login success banner displayed based on flags');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.error('Error handling login success banners:', err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `initPasswordToggles` as a named helper so the surrounding workflow can call this step when it needs it.
  function initPasswordToggles() {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `toggles` here so the nearby steps can reuse the same value without rebuilding it each time.
      const toggles = document.querySelectorAll('.password-toggle');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!toggles || toggles.length === 0) return;

      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      toggles.forEach((btn) => {
        // I am saving `targetId` here so the nearby steps can reuse the same value without rebuilding it each time.
        const targetId = btn.getAttribute('data-target');
        // I am saving `input` here so the nearby steps can reuse the same value without rebuilding it each time.
        const input = targetId ? document.getElementById(targetId) : null;
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!input) return;

        // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
        btn.addEventListener('click', () => {
          // I am saving `currentlyHidden` here so the nearby steps can reuse the same value without rebuilding it each time.
          const currentlyHidden = input.type === 'password';
          // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
          input.type = currentlyHidden ? 'text' : 'password';

          // Update ARIA and visual state
          btn.setAttribute(
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            'aria-pressed',
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            currentlyHidden ? 'true' : 'false'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          );
          // I am calling this helper here so the current workflow performs this step before it moves on.
          btn.setAttribute(
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            'aria-label',
            // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
            currentlyHidden ? 'Hide password' : 'Show password'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          );

          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (currentlyHidden) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            btn.classList.add('is-visible');
          // This alternative runs only when the condition above did not use its first path.
          } else {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            btn.classList.remove('is-visible');
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.error('initPasswordToggles error:', err);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping `setupTwoStepLogin` as a named helper so the surrounding workflow can call this step when it needs it.
  function setupTwoStepLogin() {
    // I am saving `form` here so the nearby steps can reuse the same value without rebuilding it each time.
    const form = document.getElementById('loginForm');
    // I am saving `emailInput` here so the nearby steps can reuse the same value without rebuilding it each time.
    const emailInput = document.getElementById('loginEmail');
    // I am saving `continueBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const continueBtn = document.getElementById('loginContinueBtn');
    // I am saving `continueRow` here so the nearby steps can reuse the same value without rebuilding it each time.
    const continueRow = document.getElementById('loginContinueRow');
    // I am saving `step1Footer` here so the nearby steps can reuse the same value without rebuilding it each time.
    const step1Footer = document.getElementById('loginFooterStep1');
    // I am saving `step2` here so the nearby steps can reuse the same value without rebuilding it each time.
    const step2 = document.getElementById('loginStep2');
    // I am saving `passwordInput` here so the nearby steps can reuse the same value without rebuilding it each time.
    const passwordInput = document.getElementById('loginPassword');
    // I am saving `emailError` here so the nearby steps can reuse the same value without rebuilding it each time.
    const emailError = document.getElementById('emailError');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!form || !emailInput || !continueBtn || !step2) {
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am keeping `showStep2` as a named helper so the surrounding workflow can call this step when it needs it.
    function showStep2() {
      // Reveal step 2
      step2.classList.remove('hidden');

      // Mark form as being in step 2 (for CSS tweaks if needed)
      form.classList.add('login-form--step2');

      // Hide the Continue row entirely
      if (continueRow) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        continueRow.classList.add('hidden');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // Hide the step-1 "Don't have an account? Register" footer
      if (step1Footer) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        step1Footer.classList.add('hidden');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // Focus password field for smoother UX
      if (passwordInput) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        passwordInput.focus();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    continueBtn.addEventListener('click', () => {
      // I am saving `email` here so the nearby steps can reuse the same value without rebuilding it each time.
      const email = emailInput.value || '';

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (emailError) {
        // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
        emailError.textContent = '';
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am saving `emailErrorMsg` here so the nearby steps can reuse the same value without rebuilding it each time.
      const emailErrorMsg = window.validateEmail
        // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
        ? window.validateEmail(email)
        // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
        : validateEmailLocal(email);

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (emailErrorMsg && emailError) {
        // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
        emailError.textContent = emailErrorMsg;
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am calling this helper here so the current workflow performs this step before it moves on.
      showStep2();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // Pressing Enter on the email field should act like clicking Continue
    emailInput.addEventListener('keydown', (e) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (e.key === 'Enter' && step2.classList.contains('hidden')) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        e.preventDefault();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        continueBtn.click();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Check for session expiration reason and show inactivity message
  function checkSessionExpiration() {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `body` here so the nearby steps can reuse the same value without rebuilding it each time.
      const body = document.body;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!body) return;

      // I am saving `attrReason` here so the nearby steps can reuse the same value without rebuilding it each time.
      const attrReason = body.getAttribute('data-login-reason') || '';

      // I am saving `urlParams` here so the nearby steps can reuse the same value without rebuilding it each time.
      const urlParams = new URLSearchParams(window.location.search || '');
      // I am saving `queryReason` here so the nearby steps can reuse the same value without rebuilding it each time.
      const queryReason = urlParams.get('reason') || '';

      // I am saving `reason` here so the nearby steps can reuse the same value without rebuilding it each time.
      const reason = (attrReason || queryReason || '').toLowerCase();

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (
        // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
        reason === 'expired' ||
        // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
        reason === 'session_expired' ||
        // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
        reason === 'session-expired'
      // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
      ) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        showLoginError(
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          "You've been logged out due to inactivity. Please log in again."
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.info('Session expiration message displayed');

        // Optional: clean the reason param from URL so refresh is clean
        try {
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (queryReason && history && history.replaceState) {
            // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
            urlParams.delete('reason');
            // I am saving `query` here so the nearby steps can reuse the same value without rebuilding it each time.
            const query = urlParams.toString();
            // I am calling this helper here so the current workflow performs this step before it moves on.
            history.replaceState(
              // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
              {},
              // I am listing this entry here because the surrounding collection processes each allowed value in order.
              '',
              // I am keeping this line here because the surrounding login.js workflow expects this value or operation before it continues.
              query ? `/login?${query}` : '/login'
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            );
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (_) {
          // Non-fatal
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.error('Error checking session expiration:', err);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Check on page load
  checkSessionExpiration();

  // I am saving `loginForm` here so the nearby steps can reuse the same value without rebuilding it each time.
  const loginForm = document.getElementById('loginForm');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (loginForm) {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    loginForm.addEventListener('submit', handleLoginSubmit);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info('Login form event listener attached');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Step 2 (password + Turnstile) is revealed only after a valid email + Continue
  setupTwoStepLogin();

  // Set up show/hide password toggles
  initPasswordToggles();
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();