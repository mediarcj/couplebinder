// File: binder-editor/src/api.js
// Description: API client for binder layout operations
// Purpose: Centralized same-origin fetch calls with CSRF handling + session-expired redirects.

let CACHED_CSRF_TOKEN = '';

// I am keeping `setCsrfToken` as a named helper so the surrounding workflow can call this step when it needs it.
export function setCsrfToken(token) {
  // App can refresh this cached copy when the server gives the page a newer token.
  CACHED_CSRF_TOKEN = (token || '').trim();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `readCsrfTokenFromDom` as a named helper so the surrounding workflow can call this step when it needs it.
function readCsrfTokenFromDom() {
  // The dashboard route places the initial token on the React mount element.
  return (
    // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
    document
      // I am finding the existing page element here so the following browser code can read or update that confirmed DOM target.
      .querySelector('#binder-editor-root')
      // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
      ?.getAttribute('data-csrf-token') || ''
  // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
  ).trim();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `getCsrfToken` as a named helper so the surrounding workflow can call this step when it needs it.
function getCsrfToken() {
  // Prefer a token supplied after startup, then fall back to the server-rendered value.
  return CACHED_CSRF_TOKEN || readCsrfTokenFromDom();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `isSessionExpiryError` as a named helper so the surrounding workflow can call this step when it needs it.
function isSessionExpiryError(error, isCriticalOperation = false) {
  // Network failures are ambiguous, so only critical operations treat them like expiry.
  // An explicit server expiry remains authoritative for every request.
  if (!error) return false;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error.message === 'SESSION_EXPIRED') return true;
  // Ordinary reads can be retried without signing the user out, so ambiguity matters only
  // for the save/upload/export operations that mark themselves critical.
  if (!isCriticalOperation) return false;

  // I am saving `msg` here so the nearby steps can reuse the same value without rebuilding it each time.
  const msg = (error.message || String(error) || '').toLowerCase();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (error instanceof TypeError || error.name === 'TypeError') {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (
      // I am calling this helper here so the current workflow performs this step before it moves on.
      msg.includes('failed to fetch') ||
      // I am calling this helper here so the current workflow performs this step before it moves on.
      msg.includes('networkerror') ||
      // I am calling this helper here so the current workflow performs this step before it moves on.
      msg.includes('network request failed')
    // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
    ) {
      // This return sends the completed value or response back to the code that called this function.
      return true;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (msg.includes('failed to fetch') || msg.includes('networkerror')) return true;

  // This return sends the completed value or response back to the code that called this function.
  return false;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `isNetworkErrorLikelySessionExpiry` as a named helper so the surrounding workflow can call this step when it needs it.
export function isNetworkErrorLikelySessionExpiry(error) {
  // App uses this exported check when an editor operation fails outside the request wrapper.
  return isSessionExpiryError(error, true);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `redirectToLoginForSessionExpiry` as a named helper so the surrounding workflow can call this step when it needs it.
function redirectToLoginForSessionExpiry() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Keep the current binder URL so login can return the user to the same editor page.
    const returnTo = window.location.pathname + window.location.search;
    // I am saving `loginUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const loginUrl = `/login?reason=session_expired&returnTo=${encodeURIComponent(returnTo)}`;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    window.location.replace(loginUrl);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
    window.location.href = '/login?reason=session_expired';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `handleSessionExpiry` as a named helper so the surrounding workflow can call this step when it needs it.
function handleSessionExpiry() {
  // Redirect first, then stop the caller's async flow with one recognizable error value.
  redirectToLoginForSessionExpiry();
  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw new Error('SESSION_EXPIRED');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `buildHeaders` as a named helper so the surrounding workflow can call this step when it needs it.
function buildHeaders({
  // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
  accept,
  // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
  contentType,
  // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
  includeCsrf = true,
  // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
  extraHeaders = {}
// I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
} = {}) {
  // Start with caller-specific headers so the shared authentication headers can be added
  // without each endpoint rebuilding the same object.
  const headers = { ...extraHeaders };

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (accept) headers.Accept = accept;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (contentType) headers['Content-Type'] = contentType;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (includeCsrf) {
    // Mutating dashboard routes read this header through the server's CSRF middleware.
    const csrfToken = getCsrfToken();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return headers;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `wasRedirectedToLogin` as a named helper so the surrounding workflow can call this step when it needs it.
function wasRedirectedToLogin(response) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Fetch follows redirects automatically, so inspect its final URL before parsing a body.
    if (!response) return false;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!response.redirected) return false;
    // I am saving `u` here so the nearby steps can reuse the same value without rebuilding it each time.
    const u = new URL(response.url, window.location.origin);
    // This return sends the completed value or response back to the code that called this function.
    return u.pathname === '/login' || u.pathname.startsWith('/login');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Low-level request wrapper.
 *
 * Rules:
 *  - If fetch throws (network), treat it as session expiry for critical ops.
 *  - If response is redirected to /login (commonly from 302), treat as session expired.
 *  - 401 is always session expired.
 */
async function request(url, options = {}) {
  // Keep transport, cookie, CSRF, and session-expiry behavior in this one low-level path.
  const {
    // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
    method = 'GET',
    // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
    headers = {},
    // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
    body,
    // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
    includeCsrf = true
  // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
  } = options;

  // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
  let response;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Same-origin credentials attach the HttpOnly auth cookie set by /auth/set-cookie.
    response = await fetch(url, {
      // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
      method,
      // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
      credentials: 'same-origin',
      // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
      headers: buildHeaders({
        // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
        includeCsrf,
        // I am keeping the `extraHeaders` field in this object so the receiving code can read that value by its expected name.
        extraHeaders: headers
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }),
      // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
      body
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // A critical network failure may mean the protected session disappeared mid-operation.
    if (isSessionExpiryError(err, true)) handleSessionExpiry();
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // IMPORTANT: handle 302->/login (fetch follows and returns HTML login page)
  if (wasRedirectedToLogin(response)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    handleSessionExpiry();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (response.status === 401) {
    // The API uses 401 as the direct signal that this browser must authenticate again.
    handleSessionExpiry();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return response;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `apiRequestJson` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function apiRequestJson(url, options = {}) {
  // JSON endpoints share status parsing here so callers receive a useful server message
  // without repeating fetch and error-shape handling in every editor action.
  const response = await request(url, {
    // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
    ...options,
    // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
    headers: {
      // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
      ...options.headers,
      // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
      ...(options.body && typeof options.body === 'string'
        // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
        ? { 'Content-Type': 'application/json' }
        // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
        : {})
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!response.ok) {
    // Try the server's structured error shape before falling back to the HTTP status.
    let message = `HTTP ${response.status}`;
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
      const data = await response.json();
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (data && typeof data.message === 'string') message = data.message;
      // I am checking this next possibility only because the earlier condition did not choose its path.
      else if (data && typeof data.error === 'string') message = data.error;
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // ignore
    }
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error(message);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return response.json();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `getLayout` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
export async function getLayout(binderId) {
  // binderRoutes sends this request to binderController.getBinderLayout.
  return apiRequestJson(`/dashboard/binder/${encodeURIComponent(binderId)}/layout`, {
    // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
    method: 'GET'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `applyLayout` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
export async function applyLayout(binderId, layout) {
  // App's autosave posts the whole layout to binderController.applyBinderLayout.
  return apiRequestJson(`/dashboard/binder/${encodeURIComponent(binderId)}/layout/apply`, {
    // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
    method: 'POST',
    // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
    body: JSON.stringify(layout)
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `exportBinderPdf` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
export async function exportBinderPdf(binderId) {
  // Stop locally before building a route that could target the wrong binder.
  if (!binderId) throw new Error('Missing binderId for export');

  // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
  const url = `/dashboard/binder/${encodeURIComponent(binderId)}/export`;

  // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
  const res = await request(url, {
    // The binder controller returns bytes here rather than the JSON used by normal helpers.
    method: 'POST',
    // I am keeping the `includeCsrf` field in this object so the receiving code can read that value by its expected name.
    includeCsrf: true,
    // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
    headers: buildHeaders({
      // I am keeping the `accept` field in this object so the receiving code can read that value by its expected name.
      accept: 'application/pdf',
      // I am keeping the `includeCsrf` field in this object so the receiving code can read that value by its expected name.
      includeCsrf: true
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!res.ok) {
    // Preserve any plain-text server detail because PDF failures do not share one JSON shape.
    const text = await res.text().catch(() => '');
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error(`Export failed (${res.status}): ${text || 'Server error'}`);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return res.blob();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `deleteBinderPhoto` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
export async function deleteBinderPhoto(binderId, storageKey) {
  // Both values are needed because the server verifies the key inside the owned binder.
  if (!binderId || !storageKey) {
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error('Missing binderId or storageKey for photo delete');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
  const url =
    // Put the storage key in the query string expected by binderController.deletePhoto.
    `/dashboard/binder/${encodeURIComponent(binderId)}` +
    // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
    `/photos?storageKey=${encodeURIComponent(storageKey)}`;

  // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
  const res = await request(url, {
    // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
    method: 'DELETE',
    // I am keeping the `includeCsrf` field in this object so the receiving code can read that value by its expected name.
    includeCsrf: true,
    // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
    headers: buildHeaders({
      // I am keeping the `accept` field in this object so the receiving code can read that value by its expected name.
      accept: 'application/json',
      // I am keeping the `includeCsrf` field in this object so the receiving code can read that value by its expected name.
      includeCsrf: true
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!res.ok) {
    // I am saving `text` here so the nearby steps can reuse the same value without rebuilding it each time.
    const text = await res.text().catch(() => '');
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error(`Delete failed (${res.status}): ${text || 'Server error'}`);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
  const data = await res.json().catch(() => ({ ok: false }));
  // A successful HTTP status still needs the endpoint's explicit operation result.
  if (!data || !data.ok) {
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error('Delete endpoint returned an error response');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return data;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `updatePhotoCaption` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
export async function updatePhotoCaption(binderId, storageKey, caption) {
  // The storage key connects this small caption patch to the photo row used during export.
  if (!binderId || !storageKey) {
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error('Missing binderId or storageKey for caption update');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return apiRequestJson(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    `/dashboard/binder/${encodeURIComponent(binderId)}/photos/caption`,
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    {
      // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
      method: 'PATCH',
      // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
      body: JSON.stringify({ storageKey, caption })
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Upload photos (multipart/form-data).
 * Returns server JSON { ok:true, photos:[...] }.
 */
export async function uploadBinderPhotos(binderId, files) {
  // Empty selections are harmless, so return the same shape as a successful server upload.
  if (!binderId) throw new Error('Missing binderId for upload');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!Array.isArray(files) || files.length === 0) return { ok: true, photos: [] };

  // I am saving `formData` here so the nearby steps can reuse the same value without rebuilding it each time.
  const formData = new FormData();
  // binderRoutes configures multer to read repeated fields named "photos".
  files.forEach((f) => formData.append('photos', f));

  // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
  const res = await request(`/dashboard/binder/${encodeURIComponent(binderId)}/photos`, {
    // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
    method: 'POST',
    // I am keeping the `includeCsrf` field in this object so the receiving code can read that value by its expected name.
    includeCsrf: true,
    // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
    headers: buildHeaders({
      // Leave Content-Type unset so the browser can add the multipart boundary correctly.
      accept: 'application/json',
      // I am keeping the `includeCsrf` field in this object so the receiving code can read that value by its expected name.
      includeCsrf: true
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }),
    // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
    body: formData
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!res.ok) {
    // Upload errors may come from multer, validation, or storage, so accept either JSON key.
    let message = `Upload failed (${res.status})`;
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
      const data = await res.json();
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (data?.message) message = data.message;
      // I am checking this next possibility only because the earlier condition did not choose its path.
      else if (data?.error) message = data.error;
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // I am saving `text` here so the nearby steps can reuse the same value without rebuilding it each time.
      const text = await res.text().catch(() => '');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (text) message = `${message}: ${text}`;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error(message);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return res.json();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// Photo view-url with per-tab cache (TTL)
// -----------------------------------------------------------------------------

const PHOTO_URL_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
// Keep this cache per browser tab; the server remains responsible for authorizing every miss.
const photoViewUrlCache = new Map();

// I am keeping `isUsableUrl` as a named helper so the surrounding workflow can call this step when it needs it.
function isUsableUrl(s) {
  // This return sends the completed value or response back to the code that called this function.
  return typeof s === 'string' && s && (s.startsWith('/') || /^https?:\/\//i.test(s));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `getPhotoViewUrl` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
export async function getPhotoViewUrl(binderId, storageKey, options = {}) {
  // View URLs may be signed and relatively expensive to mint. Cache them briefly, while
  // allowing a forced refresh when an older URL no longer works.
  const { forceRefresh = false } = options;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!binderId || !storageKey) return null;

  // I am saving `cacheKey` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cacheKey = `${binderId}:${storageKey}`;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!forceRefresh) {
    // Return a live signed/raw URL immediately and discard an entry once its local TTL passes.
    const cached = photoViewUrlCache.get(cacheKey);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (cached && cached.url && Date.now() < cached.expiresAt) return cached.url;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (cached) photoViewUrlCache.delete(cacheKey);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
  const url =
    // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
    `/dashboard/binder/${encodeURIComponent(binderId)}` +
    // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
    `/photos/view-url?storageKey=${encodeURIComponent(storageKey)}`;

  // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
  let res;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // binderController.getPhotoViewUrl checks ownership before asking the storage provider.
    res = await request(url, {
      // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
      method: 'GET',
      // I am keeping the `includeCsrf` field in this object so the receiving code can read that value by its expected name.
      includeCsrf: true,
      // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
      headers: buildHeaders({
        // I am keeping the `accept` field in this object so the receiving code can read that value by its expected name.
        accept: 'application/json',
        // I am keeping the `includeCsrf` field in this object so the receiving code can read that value by its expected name.
        includeCsrf: true
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!res.ok) return null;

  // I am saving `raw` here so the nearby steps can reuse the same value without rebuilding it each time.
  const raw = (await res.text().catch(() => '')).trim();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!raw) return null;

  // Older server responses used several shapes, so normalize them into one URL for Layer.
  let finalUrl = null;

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `parsed` here so the nearby steps can reuse the same value without rebuilding it each time.
    const parsed = JSON.parse(raw);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof parsed === 'string') {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (isUsableUrl(parsed)) finalUrl = parsed;
    // I am checking this next possibility only because the earlier condition did not choose its path.
    } else if (parsed && typeof parsed === 'object') {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (isUsableUrl(parsed.photoPath)) finalUrl = parsed.photoPath;
      // I am checking this next possibility only because the earlier condition did not choose its path.
      else if (isUsableUrl(parsed.url)) finalUrl = parsed.url;
      // I am checking this next possibility only because the earlier condition did not choose its path.
      else if (isUsableUrl(parsed.signedUrl)) finalUrl = parsed.signedUrl;
      // I am checking this next possibility only because the earlier condition did not choose its path.
      else if (isUsableUrl(parsed.data)) finalUrl = parsed.data;
      // I am checking this next possibility only because the earlier condition did not choose its path.
      else if (parsed.data && typeof parsed.data === 'object' && isUsableUrl(parsed.data.signedUrl)) {
        // I am keeping this line here because the surrounding api.js workflow expects this value or operation before it continues.
        finalUrl = parsed.data.signedUrl;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (isUsableUrl(raw)) finalUrl = raw;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!finalUrl && isUsableUrl(raw)) finalUrl = raw;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!finalUrl) return null;

  // Give preloadPhotos and Layer the same resolved URL until it is likely to need renewal.
  photoViewUrlCache.set(cacheKey, {
    // I am keeping the `url` field in this object so the receiving code can read that value by its expected name.
    url: finalUrl,
    // I am keeping the `expiresAt` field in this object so the receiving code can read that value by its expected name.
    expiresAt: Date.now() + PHOTO_URL_CACHE_TTL_MS
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This return sends the completed value or response back to the code that called this function.
  return finalUrl;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}