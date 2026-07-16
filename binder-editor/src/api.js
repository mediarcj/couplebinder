// Description: API client for binder layout operations
// Purpose: Centralized same-origin fetch calls with CSRF handling + session-expired redirects.

let CACHED_CSRF_TOKEN = '';

export function setCsrfToken(token) {
  // App can refresh this cached copy when the server gives the page a newer token.
  CACHED_CSRF_TOKEN = (token || '').trim();
}

function readCsrfTokenFromDom() {
  // The dashboard route places the initial token on the React mount element.
  return (
    document
      .querySelector('#binder-editor-root')
      ?.getAttribute('data-csrf-token') || ''
  ).trim();
}

function getCsrfToken() {
  // Prefer a token supplied after startup, then fall back to the server-rendered value.
  return CACHED_CSRF_TOKEN || readCsrfTokenFromDom();
}

function isSessionExpiryError(error, isCriticalOperation = false) {
  // Network failures are ambiguous, so only critical operations treat them like expiry.
  // An explicit server expiry remains authoritative for every request.
  if (!error) return false;

  if (error.message === 'SESSION_EXPIRED') return true;
  // Ordinary reads can be retried without signing the user out, so ambiguity matters only
  // for the save/upload/export operations that mark themselves critical.
  if (!isCriticalOperation) return false;

  const msg = (error.message || String(error) || '').toLowerCase();

  if (error instanceof TypeError || error.name === 'TypeError') {
    if (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed')
    ) {
      return true;
    }
  }

  if (msg.includes('failed to fetch') || msg.includes('networkerror')) return true;

  return false;
}

export function isNetworkErrorLikelySessionExpiry(error) {
  // App uses this exported check when an editor operation fails outside the request wrapper.
  return isSessionExpiryError(error, true);
}

function redirectToLoginForSessionExpiry() {
  try {
    // Keep the current binder URL so login can return the user to the same editor page.
    const returnTo = window.location.pathname + window.location.search;
    const loginUrl = `/login?reason=session_expired&returnTo=${encodeURIComponent(returnTo)}`;
    window.location.replace(loginUrl);
  } catch {
    window.location.href = '/login?reason=session_expired';
  }
}

function handleSessionExpiry() {
  // Redirect first, then stop the caller's async flow with one recognizable error value.
  redirectToLoginForSessionExpiry();
  throw new Error('SESSION_EXPIRED');
}

function buildHeaders({
  accept,
  contentType,
  includeCsrf = true,
  extraHeaders = {}
} = {}) {
  // Start with caller-specific headers so the shared authentication headers can be added
  // without each endpoint rebuilding the same object.
  const headers = { ...extraHeaders };

  if (accept) headers.Accept = accept;
  if (contentType) headers['Content-Type'] = contentType;

  if (includeCsrf) {
    // Mutating dashboard routes read this header through the server's CSRF middleware.
    const csrfToken = getCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  return headers;
}

function wasRedirectedToLogin(response) {
  try {
    // Fetch follows redirects automatically, so inspect its final URL before parsing a body.
    if (!response) return false;
    if (!response.redirected) return false;
    const u = new URL(response.url, window.location.origin);
    return u.pathname === '/login' || u.pathname.startsWith('/login');
  } catch {
    return false;
  }
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
    method = 'GET',
    headers = {},
    body,
    includeCsrf = true
  } = options;

  let response;
  try {
    // Same-origin credentials attach the HttpOnly auth cookie set by /auth/set-cookie.
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: buildHeaders({
        includeCsrf,
        extraHeaders: headers
      }),
      body
    });
  } catch (err) {
    // A critical network failure may mean the protected session disappeared mid-operation.
    if (isSessionExpiryError(err, true)) handleSessionExpiry();
    throw err;
  }

  // IMPORTANT: handle 302->/login (fetch follows and returns HTML login page)
  if (wasRedirectedToLogin(response)) {
    handleSessionExpiry();
  }

  if (response.status === 401) {
    // The API uses 401 as the direct signal that this browser must authenticate again.
    handleSessionExpiry();
  }

  return response;
}

async function apiRequestJson(url, options = {}) {
  // JSON endpoints share status parsing here so callers receive a useful server message
  // without repeating fetch and error-shape handling in every editor action.
  const response = await request(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(options.body && typeof options.body === 'string'
        ? { 'Content-Type': 'application/json' }
        : {})
    }
  });

  if (!response.ok) {
    // Try the server's structured error shape before falling back to the HTTP status.
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (data && typeof data.message === 'string') message = data.message;
      else if (data && typeof data.error === 'string') message = data.error;
    } catch {
      // A non-JSON error body keeps the HTTP status message prepared above.
    }
    throw new Error(message);
  }

  return response.json();
}

export async function getLayout(binderId) {
  // binderRoutes sends this request to binderController.getBinderLayout.
  return apiRequestJson(`/dashboard/binder/${encodeURIComponent(binderId)}/layout`, {
    method: 'GET'
  });
}

export async function applyLayout(binderId, layout) {
  // App's autosave posts the whole layout to binderController.applyBinderLayout.
  return apiRequestJson(`/dashboard/binder/${encodeURIComponent(binderId)}/layout/apply`, {
    method: 'POST',
    body: JSON.stringify(layout)
  });
}

export async function exportBinderPdf(binderId) {
  // Stop locally before building a route that could target the wrong binder.
  if (!binderId) throw new Error('Missing binderId for export');

  const url = `/dashboard/binder/${encodeURIComponent(binderId)}/export`;

  const res = await request(url, {
    // The binder controller returns bytes here rather than the JSON used by normal helpers.
    method: 'POST',
    includeCsrf: true,
    headers: buildHeaders({
      accept: 'application/pdf',
      includeCsrf: true
    })
  });

  if (!res.ok) {
    // Preserve any plain-text server detail because PDF failures do not share one JSON shape.
    const text = await res.text().catch(() => '');
    throw new Error(`Export failed (${res.status}): ${text || 'Server error'}`);
  }

  return res.blob();
}

export async function deleteBinderPhoto(binderId, storageKey) {
  // Both values are needed because the server verifies the key inside the owned binder.
  if (!binderId || !storageKey) {
    throw new Error('Missing binderId or storageKey for photo delete');
  }

  const url =
    // Put the storage key in the query string expected by binderController.deletePhoto.
    `/dashboard/binder/${encodeURIComponent(binderId)}` +
    `/photos?storageKey=${encodeURIComponent(storageKey)}`;

  const res = await request(url, {
    method: 'DELETE',
    includeCsrf: true,
    headers: buildHeaders({
      accept: 'application/json',
      includeCsrf: true
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Delete failed (${res.status}): ${text || 'Server error'}`);
  }

  const data = await res.json().catch(() => ({ ok: false }));
  // A successful HTTP status still needs the endpoint's explicit operation result.
  if (!data || !data.ok) {
    throw new Error('Delete endpoint returned an error response');
  }

  return data;
}

export async function updatePhotoCaption(binderId, storageKey, caption) {
  // The storage key connects this small caption patch to the photo row used during export.
  if (!binderId || !storageKey) {
    throw new Error('Missing binderId or storageKey for caption update');
  }

  return apiRequestJson(
    `/dashboard/binder/${encodeURIComponent(binderId)}/photos/caption`,
    {
      method: 'PATCH',
      body: JSON.stringify({ storageKey, caption })
    }
  );
}

/**
 * Upload photos (multipart/form-data).
 * Returns server JSON { ok:true, photos:[...] }.
 */
export async function uploadBinderPhotos(binderId, files) {
  // Empty selections are harmless, so return the same shape as a successful server upload.
  if (!binderId) throw new Error('Missing binderId for upload');
  if (!Array.isArray(files) || files.length === 0) return { ok: true, photos: [] };

  const formData = new FormData();
  // binderRoutes configures multer to read repeated fields named "photos".
  files.forEach((f) => formData.append('photos', f));

  const res = await request(`/dashboard/binder/${encodeURIComponent(binderId)}/photos`, {
    method: 'POST',
    includeCsrf: true,
    headers: buildHeaders({
      // Leave Content-Type unset so the browser can add the multipart boundary correctly.
      accept: 'application/json',
      includeCsrf: true
    }),
    body: formData
  });

  if (!res.ok) {
    // Upload errors may come from multer, validation, or storage, so accept either JSON key.
    let message = `Upload failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
      else if (data?.error) message = data.error;
    } catch {
      const text = await res.text().catch(() => '');
      if (text) message = `${message}: ${text}`;
    }
    throw new Error(message);
  }

  return res.json();
}

// Photo view-url with per-tab cache (TTL)

const PHOTO_URL_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
// Keep this cache per browser tab; the server remains responsible for authorizing every miss.
const photoViewUrlCache = new Map();

function isUsableUrl(s) {
  return typeof s === 'string' && s && (s.startsWith('/') || /^https?:\/\//i.test(s));
}

export async function getPhotoViewUrl(binderId, storageKey, options = {}) {
  // View URLs may be signed and relatively expensive to mint. Cache them briefly, while
  // allowing a forced refresh when an older URL no longer works.
  const { forceRefresh = false } = options;

  if (!binderId || !storageKey) return null;

  const cacheKey = `${binderId}:${storageKey}`;

  if (!forceRefresh) {
    // Return a live signed/raw URL immediately and discard an entry once its local TTL passes.
    const cached = photoViewUrlCache.get(cacheKey);
    if (cached && cached.url && Date.now() < cached.expiresAt) return cached.url;
    if (cached) photoViewUrlCache.delete(cacheKey);
  }

  const url =
    `/dashboard/binder/${encodeURIComponent(binderId)}` +
    `/photos/view-url?storageKey=${encodeURIComponent(storageKey)}`;

  let res;
  try {
    // binderController.getPhotoViewUrl checks ownership before asking the storage provider.
    res = await request(url, {
      method: 'GET',
      includeCsrf: true,
      headers: buildHeaders({
        accept: 'application/json',
        includeCsrf: true
      })
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const raw = (await res.text().catch(() => '')).trim();
  if (!raw) return null;

  // Older server responses used several shapes, so normalize them into one URL for Layer.
  let finalUrl = null;

  try {
    const parsed = JSON.parse(raw);

    if (typeof parsed === 'string') {
      if (isUsableUrl(parsed)) finalUrl = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (isUsableUrl(parsed.photoPath)) finalUrl = parsed.photoPath;
      else if (isUsableUrl(parsed.url)) finalUrl = parsed.url;
      else if (isUsableUrl(parsed.signedUrl)) finalUrl = parsed.signedUrl;
      else if (isUsableUrl(parsed.data)) finalUrl = parsed.data;
      else if (parsed.data && typeof parsed.data === 'object' && isUsableUrl(parsed.data.signedUrl)) {
        finalUrl = parsed.data.signedUrl;
      }
    }
  } catch {
    if (isUsableUrl(raw)) finalUrl = raw;
  }

  if (!finalUrl && isUsableUrl(raw)) finalUrl = raw;
  if (!finalUrl) return null;

  // Give preloadPhotos and Layer the same resolved URL until it is likely to need renewal.
  photoViewUrlCache.set(cacheKey, {
    url: finalUrl,
    expiresAt: Date.now() + PHOTO_URL_CACHE_TTL_MS
  });

  return finalUrl;
}
