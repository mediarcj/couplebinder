// File: binder-editor/src/api.js
// Description: API client for binder layout operations
// Purpose: Centralized fetch calls with CSRF handling

// Session expiry handler - will be set by App.jsx
let sessionExpiryHandler = null;

/**
 * WHAT:
 * Register a session expiry handler callback.
 *
 * WHY:
 * Allows App.jsx to provide a modal-based handler instead of immediate redirect.
 *
 * HOW:
 * Stores the handler function for use when session expiry is detected.
 */
export function setSessionExpiryHandler(handler) {
  sessionExpiryHandler = handler;
}

/**
 * WHAT:
 * Check if an error indicates session expiry.
 *
 * WHY:
 * Network errors (Failed to fetch) can occur before we get a response status.
 *
 * HOW:
 * Checks error message and type to detect likely session expiry scenarios.
 * Only treats network errors as session expiry for critical operations (autosave, layout).
 */
function isSessionExpiryError(error, isCriticalOperation = false) {
  if (!error) return false;
  
  // Check for explicit SESSION_EXPIRED error
  if (error.message === 'SESSION_EXPIRED') return true;
  
  // For critical operations (autosave, layout), treat network errors as likely session expiry
  if (isCriticalOperation) {
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
      // These can occur when session expires and server rejects the request
      return true;
    }
  }
  
  return false;
}

/**
 * WHAT:
 * Handle session expiry with modal instead of immediate redirect.
 *
 * WHY:
 * Better UX - user sees a friendly message and can acknowledge before redirect.
 *
 * HOW:
 * If handler is registered, use it. Otherwise fall back to immediate redirect.
 */
function handleSessionExpiry() {
  const returnTo = window.location.pathname + window.location.search;
  const loginUrl = `/login?reason=session_expired&returnTo=${encodeURIComponent(returnTo)}`;
  
  if (sessionExpiryHandler) {
    // Use modal handler from App.jsx
    sessionExpiryHandler(() => {
      window.location.href = loginUrl;
    });
  } else {
    // Fallback to immediate redirect if handler not set
    window.location.href = loginUrl;
  }
  
  throw new Error('SESSION_EXPIRED');
}

/**
 * WHAT:
 * Make API request with CSRF token and error handling.
 *
 * WHY:
 * Keeps all API calls consistent and secure.
 *
 * HOW:
 * Adds CSRF header, handles JSON, returns parsed response or throws.
 * Detects session expiry (401/403) and uses modal handler if available.
 */
async function apiRequest(url, options = {}) {
  const csrfToken = document.querySelector('#binder-editor-root')?.getAttribute('data-csrf-token') || '';
  
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin'
    });

    // Handle session expiry (401 Unauthorized or 403 Forbidden)
    if (response.status === 401 || response.status === 403) {
      handleSessionExpiry();
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ ok: false, message: `HTTP ${response.status}` }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    // Handle network errors that might indicate session expiry (for critical operations)
    if (isSessionExpiryError(error, true)) {
      handleSessionExpiry();
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * WHAT:
 * Fetch current layout for a binder.
 *
 * WHY:
 * Loads existing layout on editor mount.
 *
 * HOW:
 * GET request to layout endpoint.
 */
export async function getLayout(binderId) {
  return apiRequest(`/dashboard/binder/${binderId}/layout`);
}

/**
 * WHAT:
 * Save layout changes to server.
 *
 * WHY:
 * Persists user edits to database.
 *
 * HOW:
 * POST request with layout JSON in body.
 */
export async function applyLayout(binderId, layout) {
  return apiRequest(`/dashboard/binder/${binderId}/layout/apply`, {
    method: 'POST',
    body: JSON.stringify(layout)
  });
}

/**
 * WHAT:
 * Request server-side auto layout.
 *
 * WHY:
 * Automatically arranges photos using server algorithm.
 *
 * HOW:
 * POST request, server returns new layout.
 */
export async function autoLayout(binderId, options = {}) {
  return apiRequest(`/dashboard/binder/${binderId}/layout/auto`, {
    method: 'POST',
    body: JSON.stringify(options)
  });
}

/**
 * WHAT:
 * Export binder as PDF and trigger browser download.
 *
 * WHY:
 * Users need to download their binder as a PDF file.
 *
 * HOW:
 * POST request to export endpoint, returns blob, triggers download.
 * Handles session expiry same as other API calls.
 */
export async function exportBinderPdf(binderId) {
  if (!binderId) {
    throw new Error('Missing binderId for export');
  }

  const csrfToken = document.querySelector('#binder-editor-root')?.getAttribute('data-csrf-token') || '';

  const url = `/dashboard/binder/${encodeURIComponent(binderId)}/export`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/pdf',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
      },
      credentials: 'same-origin'
    });

    // Handle session expiry (401 Unauthorized or 403 Forbidden)
    if (res.status === 401 || res.status === 403) {
      handleSessionExpiry();
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Export failed (${res.status}): ${text || 'Server error'}`
      );
    }

    const blob = await res.blob();
    return blob;
  } catch (error) {
    // Handle network errors that might indicate session expiry (for critical operations)
    if (isSessionExpiryError(error, true)) {
      handleSessionExpiry();
    }
    throw error;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Export failed (${res.status}): ${text || 'Server error'}`
    );
  }

  const blob = await res.blob();
  return blob;
}

/**
 * WHAT:
 * Get signed S3 URL for a photo storage key.
 *
 * WHY:
 * Photos are stored in S3 with signed URLs for security.
 *
 * HOW:
 * GET request with storageKey query parameter.
 */
// Fetch a signed S3 view URL for a given storageKey
// Handles all legacy variants:
//   1) Plain text body: "https://..."
//   2) JSON: { ok: true, url: "https://..." }
//   3) JSON: { ok: true, signedUrl: "https://..." }
export async function getPhotoViewUrl(binderId, storageKey) {
  const url = `/dashboard/binder/${binderId}/photos/view-url?storageKey=${encodeURIComponent(
    storageKey
  )}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin'
    });

    // Handle session expiry (401 Unauthorized or 403 Forbidden)
    if (res.status === 401 || res.status === 403) {
      handleSessionExpiry();
      return null; // Stop further processing
    }

    if (!res.ok) {
      console.error('[BinderEditor] Error fetching photo URL:', {
        binderId,
        storageKey,
        status: res.status
      });
      return null;
    }

    const contentType = res.headers.get('content-type') || '';

    // JSON response: try url first, then signedUrl
    if (contentType.includes('application/json')) {
      const data = await res.json();

      // Extremely defensive: in case someone returned a raw string JSON
      if (typeof data === 'string') {
        return data || null;
      }

      if (data?.url) return data.url;
      if (data?.signedUrl) return data.signedUrl;

      return null;
    }

    // Non-JSON response: treat the raw text body as the URL
    const text = (await res.text()).trim();
    return text || null;
  } catch (err) {
    // For photo URL fetching, network errors might be session expiry but could also be network issues
    // Only treat confirmed 401/403 as session expiry; other errors just return null
    // (The status check above already handles 401/403)
    
    console.error('[BinderEditor] Exception while fetching photo URL:', {
      binderId,
      storageKey,
      error: err?.message || String(err)
    });
    return null;
  }
}