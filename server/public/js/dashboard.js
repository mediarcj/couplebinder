// File: server/public/js/dashboard.js
// Description: Client-side JavaScript for dashboard functionality
// Purpose: Handles submissions and binder builder workspace (uploads to S3-backed route)
// Notes:
//  - Workspace is now a simple layout: left page strip + big canvas + photo strip
//  - IMPORTANT: Legacy canvas autosave/restore to Supabase binder_layouts is DISABLED.
//    The React editor owns binder_layouts with a different JSON shape. Writing legacy JSON
//    into that table can corrupt the new editor/export experience.

// -----------------------------------------------------------------------------
// Logger setup (safe fallback; no TDZ / self-reference problems)
// -----------------------------------------------------------------------------
let log = (typeof window !== 'undefined' && window.logger) ? window.logger : null;

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (!log) {
    // I am saving `fallbackLogger` here so the nearby steps can reuse the same value without rebuilding it each time.
    const fallbackLogger = {
        // I am keeping the `isDebugEnabled` field in this object so the receiving code can read that value by its expected name.
        isDebugEnabled: () => {
            // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
            try {
                // This return sends the completed value or response back to the code that called this function.
                return localStorage.getItem('debugProfile') === '1';
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch {
                // This return sends the completed value or response back to the code that called this function.
                return false;
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `redact` field in this object so the receiving code can read that value by its expected name.
        redact: (obj) => {
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (typeof obj === 'string') {
                // This return sends the completed value or response back to the code that called this function.
                return obj
                    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
                    .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[EMAIL]')
                    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
                    .replace(/(\b\d{7,}\b)/g, '[PHONE]')
                    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
                    .replace(/(sb-access-token=[^;]+)/g, '[TOKEN]');
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            // This return sends the completed value or response back to the code that called this function.
            return obj;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `info` field in this object so the receiving code can read that value by its expected name.
        info: (message, data = {}) => {
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (!fallbackLogger.isDebugEnabled()) return;
            // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
            try {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                console.log(`[DEBUG] ${message}`, fallbackLogger.redact(data));
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch (e) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                console.log(`[DEBUG] ${message}`, '[Logger error - data not logged]');
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: (message, data = {}) => {
            // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
            try {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                console.error(`[ERROR] ${message}`, fallbackLogger.redact(data));
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch (e) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                console.error(`[ERROR] ${message}`, '[Logger error - data not logged]');
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am keeping the `warn` field in this object so the receiving code can read that value by its expected name.
        warn: (message, data = {}) => {
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (!fallbackLogger.isDebugEnabled()) return;
            // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
            try {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                console.warn(`[WARN] ${message}`, fallbackLogger.redact(data));
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch (e) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                console.warn(`[WARN] ${message}`, '[Logger error - data not logged]');
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    log = fallbackLogger;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// XSS Protection: HTML Escape Function
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// Allowed image types for uploads (client-side)
// -----------------------------------------------------------------------------
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'image/jpeg',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'image/jpg',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'image/png',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'image/webp',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'image/heic',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'image/heif',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'image/avif'
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
]);

// I am saving `ALLOWED_IMAGE_EXTENSIONS` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|avif)$/i;

// -----------------------------------------------------------------------------
// Legacy layout autosave/restore: intentionally disabled
// -----------------------------------------------------------------------------
const LEGACY_LAYOUT_PERSISTENCE_DISABLED = true;

// -----------------------------------------------------------------------------
// Simple canvas state for selection, dragging, and resizing
// -----------------------------------------------------------------------------
const builderCanvasState = {
    // I am keeping the `canvasEl` field in this object so the receiving code can read that value by its expected name.
    canvasEl: null,

    // I am keeping the `selectedPhotoEl` field in this object so the receiving code can read that value by its expected name.
    selectedPhotoEl: null,
    // I am keeping the `zCounter` field in this object so the receiving code can read that value by its expected name.
    zCounter: 1,

    // dragging
    dragging: false,
    // I am keeping the `dragStartMouseX` field in this object so the receiving code can read that value by its expected name.
    dragStartMouseX: 0,
    // I am keeping the `dragStartMouseY` field in this object so the receiving code can read that value by its expected name.
    dragStartMouseY: 0,
    // I am keeping the `dragStartLeft` field in this object so the receiving code can read that value by its expected name.
    dragStartLeft: 0,
    // I am keeping the `dragStartTop` field in this object so the receiving code can read that value by its expected name.
    dragStartTop: 0,
    // I am keeping the `lastDragMouseX` field in this object so the receiving code can read that value by its expected name.
    lastDragMouseX: 0,
    // I am keeping the `lastDragMouseY` field in this object so the receiving code can read that value by its expected name.
    lastDragMouseY: 0,
    // I am keeping the `lastDragLeft` field in this object so the receiving code can read that value by its expected name.
    lastDragLeft: 0,
    // I am keeping the `lastDragTop` field in this object so the receiving code can read that value by its expected name.
    lastDragTop: 0,
    dragAxis: null, // 'x' or 'y' for current drag

    // resizing
    resizing: false,
    // I am keeping the `resizeHandle` field in this object so the receiving code can read that value by its expected name.
    resizeHandle: null,
    // I am keeping the `resizeStartMouseX` field in this object so the receiving code can read that value by its expected name.
    resizeStartMouseX: 0,
    // I am keeping the `resizeStartMouseY` field in this object so the receiving code can read that value by its expected name.
    resizeStartMouseY: 0,
    // I am keeping the `resizeStartRect` field in this object so the receiving code can read that value by its expected name.
    resizeStartRect: null,
    // I am keeping the `resizeAspectRatio` field in this object so the receiving code can read that value by its expected name.
    resizeAspectRatio: 1,

    // I am keeping the `initialized` field in this object so the receiving code can read that value by its expected name.
    initialized: false,

    // "dirty" is now UI-only (no Supabase writes from this legacy page)
    dirty: false
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am keeping `markCanvasDirty` as a named helper so the surrounding workflow can call this step when it needs it.
function markCanvasDirty() {
    // This legacy canvas no longer persists layout rows, but the status still warns about edits.
    builderCanvasState.dirty = true;

    // I am saving `statusEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const statusEl = document.getElementById('builder-status-text');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (statusEl) {
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        statusEl.textContent = LEGACY_LAYOUT_PERSISTENCE_DISABLED
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            ? 'Unsaved changes (legacy editor does not autosave).'
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            : 'Unsaved changes...';
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// CSRF helper
// -----------------------------------------------------------------------------
function _getCSRFToken() {
    // Upload/delete routes use the same token supplied by server middleware to this page.
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

    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.warn('CSRF token not found');
    // This return sends the completed value or response back to the code that called this function.
    return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// DOMContentLoaded
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function() {
    // Wire the legacy canvas and dashboard panels after their EJS elements exist.
    initializeCanvasInteractions();  // drag/resize/delete
    // I am calling this helper here so the current workflow performs this step before it moves on.
    initializeDashboard();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    initializeSubmissions();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    initializeBuilderWorkspace();

    // Disabled on purpose to protect binder_layouts format used by React editor/export
    initializeBinderLayoutAutosave();

    // I am calling this helper here so the current workflow performs this step before it moves on.
    initializeDeletePhotoButton();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    initializeReactEditorButton();

    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info('Dashboard page initialized - logout handled by logout.js module');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// -----------------------------------------------------------------------------
// Dashboard basics
// -----------------------------------------------------------------------------
function initializeDashboard() {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info('Dashboard functionality initialized');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// Helpers for collision / geometry
// -----------------------------------------------------------------------------
function rectsOverlap(l1, t1, w1, h1, l2, t2, w2, h2) {
    // Edge contact is allowed so photos can sit flush without counting as a collision.
    return !(
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        l1 + w1 <= l2 ||
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        l1 >= l2 + w2 ||
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        t1 + h1 <= t2 ||
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        t1 >= t2 + h2
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Prevent dragging a photo on top of other photos.
 *
 * Treat other photos as "solid blocks". If proposed rect overlaps another,
 * push the moving photo back so it just touches the obstacle, based on main movement axis.
 */
function constrainDragWithCollisions(photoEl, proposedLeft, proposedTop, width, height, dx, dy, canvasRect, dragAxis) {
  // Keep legacy-canvas photos inside the page and stop movement at neighboring frames.
  // Resolving each axis separately lets a user slide along an obstacle instead of sticking.
    const canvas = builderCanvasState.canvasEl;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!canvas) {
        // This return sends the completed value or response back to the code that called this function.
        return { left: proposedLeft, top: proposedTop };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `left` here so the nearby steps can reuse the same value without rebuilding it each time.
    let left = proposedLeft;
    // I am saving `top` here so the nearby steps can reuse the same value without rebuilding it each time.
    let top = proposedTop;

    // I am saving `others` here so the nearby steps can reuse the same value without rebuilding it each time.
    const others = canvas.querySelectorAll('.canvas-photo');
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    others.forEach((other) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (other === photoEl) return;

        // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
        const r = other.getBoundingClientRect();
        // I am saving `oLeft` here so the nearby steps can reuse the same value without rebuilding it each time.
        const oLeft = r.left - canvasRect.left;
        // I am saving `oTop` here so the nearby steps can reuse the same value without rebuilding it each time.
        const oTop = r.top - canvasRect.top;
        // I am saving `oWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
        const oWidth = r.width;
        // I am saving `oHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
        const oHeight = r.height;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!rectsOverlap(left, top, width, height, oLeft, oTop, oWidth, oHeight)) {
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am saving `absDx` here so the nearby steps can reuse the same value without rebuilding it each time.
        const absDx = Math.abs(dx);
        // I am saving `absDy` here so the nearby steps can reuse the same value without rebuilding it each time.
        const absDy = Math.abs(dy);
        // I am saving `axis` here so the nearby steps can reuse the same value without rebuilding it each time.
        const axis = dragAxis || (absDx >= absDy ? 'x' : 'y');

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (axis === 'x') {
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (dx > 0) {
                // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
                left = Math.min(left, oLeft - width);
            // I am checking this next possibility only because the earlier condition did not choose its path.
            } else if (dx < 0) {
                // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
                left = Math.max(left, oLeft + oWidth);
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // I am checking this next possibility only because the earlier condition did not choose its path.
        } else if (axis === 'y') {
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (dy > 0) {
                // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
                top = Math.min(top, oTop - height);
            // I am checking this next possibility only because the earlier condition did not choose its path.
            } else if (dy < 0) {
                // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
                top = Math.max(top, oTop + oHeight);
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    left = Math.max(0, Math.min(left, canvasRect.width - width));
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    top = Math.max(0, Math.min(top, canvasRect.height - height));

    // This return sends the completed value or response back to the code that called this function.
    return { left, top };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// Canvas interactions (drag / resize / delete + selection)
// -----------------------------------------------------------------------------
function initializeCanvasInteractions() {
  // Document-level move/up listeners keep a drag alive when the pointer leaves the photo,
  // while the selected element and starting geometry stay in the shared drag state.
    if (builderCanvasState.initialized) return;

    // I am saving `canvas` here so the nearby steps can reuse the same value without rebuilding it each time.
    const canvas = document.getElementById('builder-canvas');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!canvas) return;

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    builderCanvasState.canvasEl = canvas;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    builderCanvasState.initialized = true;

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    canvas.addEventListener('mousedown', function(event) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (event.button !== 0) return;
        // I am saving `clickedPhoto` here so the nearby steps can reuse the same value without rebuilding it each time.
        const clickedPhoto = event.target.closest('.canvas-photo');
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!clickedPhoto) {
            // I am updating or clearing this saved state here so the interface reflects the result of the action above.
            setSelectedCanvasPhoto(null);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('mousemove', handleCanvasMouseMove);
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('mouseup', handleCanvasMouseUp);
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('mouseleave', handleCanvasMouseUp);

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('keydown', handleCanvasKeyDown);

    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info('Canvas interactions initialized');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `handleCanvasMouseMove` as a named helper so the surrounding workflow can call this step when it needs it.
function handleCanvasMouseMove(event) {
    // 1. Read the selected photo and current canvas bounds from shared legacy state.
    // 2. During drag, constrain movement against the page and neighboring photos.
    // 3. During resize, preserve aspect ratio and keep the resulting box inside the page.
    const canvas = builderCanvasState.canvasEl;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!canvas) return;

    // I am saving `canvasRect` here so the nearby steps can reuse the same value without rebuilding it each time.
    const canvasRect = canvas.getBoundingClientRect();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!canvasRect.width || !canvasRect.height) return;

    // I am saving `insideCanvasBounds` here so the nearby steps can reuse the same value without rebuilding it each time.
    const insideCanvasBounds =
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        event.clientX >= canvasRect.left &&
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        event.clientX <= canvasRect.right &&
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        event.clientY >= canvasRect.top &&
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        event.clientY <= canvasRect.bottom;

    // I am saving `photoEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const photoEl = builderCanvasState.selectedPhotoEl;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!photoEl) return;

    // Dragging
    if (builderCanvasState.dragging) {
        // Ending at the boundary keeps document-level movement from leaving a stuck gesture.
        event.preventDefault();

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!insideCanvasBounds) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            handleCanvasMouseUp();
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am saving `dx` here so the nearby steps can reuse the same value without rebuilding it each time.
        const dx = event.clientX - builderCanvasState.lastDragMouseX;
        // I am saving `dy` here so the nearby steps can reuse the same value without rebuilding it each time.
        const dy = event.clientY - builderCanvasState.lastDragMouseY;

        // I am saving `absDx` here so the nearby steps can reuse the same value without rebuilding it each time.
        const absDx = Math.abs(dx);
        // I am saving `absDy` here so the nearby steps can reuse the same value without rebuilding it each time.
        const absDy = Math.abs(dy);

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!builderCanvasState.dragAxis && (absDx > 0 || absDy > 0)) {
            // Lock to the first dominant direction for stable obstacle resolution.
            builderCanvasState.dragAxis = absDx >= absDy ? 'x' : 'y';
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am saving `width` here so the nearby steps can reuse the same value without rebuilding it each time.
        const width = photoEl.offsetWidth;
        // I am saving `height` here so the nearby steps can reuse the same value without rebuilding it each time.
        const height = photoEl.offsetHeight;

        // I am saving `proposedLeft` here so the nearby steps can reuse the same value without rebuilding it each time.
        let proposedLeft = builderCanvasState.lastDragLeft + dx;
        // I am saving `proposedTop` here so the nearby steps can reuse the same value without rebuilding it each time.
        let proposedTop = builderCanvasState.lastDragTop + dy;

        // I am saving `constrained` here so the nearby steps can reuse the same value without rebuilding it each time.
        const constrained = constrainDragWithCollisions(
            // The helper returns page-relative pixel coordinates for this legacy DOM canvas.
            photoEl,
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            proposedLeft,
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            proposedTop,
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            width,
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            height,
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            dx,
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            dy,
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            canvasRect,
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            builderCanvasState.dragAxis
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );

        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        photoEl.style.left = `${constrained.left}px`;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        photoEl.style.top = `${constrained.top}px`;

        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.lastDragLeft = constrained.left;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.lastDragTop = constrained.top;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.lastDragMouseX = event.clientX;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.lastDragMouseY = event.clientY;
        // This return sends the completed value or response back to the code that called this function.
        return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Resizing (keep aspect ratio and canvas bounds, but allow overlap)
    if (builderCanvasState.resizing && builderCanvasState.resizeStartRect) {
        // Resize may overlap neighbors, but it still cannot extend outside this canvas.
        event.preventDefault();

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!insideCanvasBounds) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            handleCanvasMouseUp();
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am saving `handle` here so the nearby steps can reuse the same value without rebuilding it each time.
        const handle = builderCanvasState.resizeHandle;
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!handle) return;

        // I am saving `dx` here so the nearby steps can reuse the same value without rebuilding it each time.
        const dx = event.clientX - builderCanvasState.resizeStartMouseX;
        // I am saving `rect0` here so the nearby steps can reuse the same value without rebuilding it each time.
        const rect0 = builderCanvasState.resizeStartRect;
        // I am saving `aspect` here so the nearby steps can reuse the same value without rebuilding it each time.
        const aspect = builderCanvasState.resizeAspectRatio || 1;

        // I am saving `width` here so the nearby steps can reuse the same value without rebuilding it each time.
        let width = rect0.width;
        // I am saving `height` here so the nearby steps can reuse the same value without rebuilding it each time.
        let height = rect0.height;
        // I am saving `left` here so the nearby steps can reuse the same value without rebuilding it each time.
        let left = rect0.left;
        // I am saving `top` here so the nearby steps can reuse the same value without rebuilding it each time.
        let top = rect0.top;

        // I am saving `isTop` here so the nearby steps can reuse the same value without rebuilding it each time.
        const isTop = handle.classList.contains('canvas-photo-resize-top-left') ||
                      // I am calling this helper here so the current workflow performs this step before it moves on.
                      handle.classList.contains('canvas-photo-resize-top-right');
        // I am saving `isLeft` here so the nearby steps can reuse the same value without rebuilding it each time.
        const isLeft = handle.classList.contains('canvas-photo-resize-top-left') ||
                       // I am calling this helper here so the current workflow performs this step before it moves on.
                       handle.classList.contains('canvas-photo-resize-bottom-left');

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (isLeft) {
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            width = rect0.width - dx;
        // This alternative runs only when the condition above did not use its first path.
        } else {
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            width = rect0.width + dx;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        width = Math.max(40, width);
        // Width is the one free dimension; height follows the captured starting aspect ratio.
        height = width / aspect;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (isLeft) {
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            left = rect0.left + (rect0.width - width);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (isTop) {
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            top = rect0.top + (rect0.height - height);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (left < 0) left = 0;
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (top < 0) top = 0;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (left + width > canvasRect.width) {
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            width = canvasRect.width - left;
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            width = Math.max(40, width);
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            height = width / aspect;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (top + height > canvasRect.height) {
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            height = canvasRect.height - top;
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            height = Math.max(40, height);
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            width = height * aspect;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        photoEl.style.width = `${width}px`;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        photoEl.style.height = `${height}px`;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        photoEl.style.left = `${left}px`;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        photoEl.style.top = `${top}px`;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `handleCanvasMouseUp` as a named helper so the surrounding workflow can call this step when it needs it.
function handleCanvasMouseUp() {
    // Remember whether anything happened before clearing all gesture flags.
    const hadInteraction = builderCanvasState.dragging || builderCanvasState.resizing;

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    builderCanvasState.dragging = false;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    builderCanvasState.resizing = false;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    builderCanvasState.resizeHandle = null;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    builderCanvasState.resizeStartRect = null;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    builderCanvasState.dragAxis = null;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (hadInteraction && builderCanvasState.selectedPhotoEl) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        markCanvasDirty();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `handleCanvasKeyDown` as a named helper so the surrounding workflow can call this step when it needs it.
function handleCanvasKeyDown(event) {
    // Leave Delete/Backspace alone while the user is typing in any editable control.
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;

    // I am saving `active` here so the nearby steps can reuse the same value without rebuilding it each time.
    const active = document.activeElement;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        // This return sends the completed value or response back to the code that called this function.
        return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    event.preventDefault();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    requestDeleteSelectedPhoto();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `setSelectedCanvasPhoto` as a named helper so the surrounding workflow can call this step when it needs it.
function setSelectedCanvasPhoto(photoEl) {
    // Keep exactly one selected DOM photo and bring it above its siblings for visible handles.
    const canvas = builderCanvasState.canvasEl;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!canvas) return;

    // I am saving `all` here so the nearby steps can reuse the same value without rebuilding it each time.
    const all = canvas.querySelectorAll('.canvas-photo');
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    all.forEach((el) => el.classList.remove('canvas-photo-selected'));

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (photoEl) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        photoEl.classList.add('canvas-photo-selected');
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.selectedPhotoEl = photoEl;
        // I am calling this helper here so the current workflow performs this step before it moves on.
        bringCanvasPhotoToFront(photoEl);
    // This alternative runs only when the condition above did not use its first path.
    } else {
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.selectedPhotoEl = null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `bringCanvasPhotoToFront` as a named helper so the surrounding workflow can call this step when it needs it.
function bringCanvasPhotoToFront(photoEl) {
    // This z-index is UI-only because legacy layout persistence is disabled below.
    builderCanvasState.zCounter += 1;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    photoEl.style.zIndex = String(builderCanvasState.zCounter);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `wireCanvasPhotoInteractions` as a named helper so the surrounding workflow can call this step when it needs it.
function wireCanvasPhotoInteractions(photoEl) {
    // Attach drag and four resize-handle starts once when createCanvasPhotoElement builds a photo.
    photoEl.addEventListener('mousedown', function (event) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (event.button !== 0) return;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (event.target.classList.contains('canvas-photo-resize-handle')) {
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am calling this helper here so the current workflow performs this step before it moves on.
        event.preventDefault();

        // I am saving `canvas` here so the nearby steps can reuse the same value without rebuilding it each time.
        const canvas = builderCanvasState.canvasEl;
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!canvas) return;

        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setSelectedCanvasPhoto(photoEl);

        // I am saving `canvasRect` here so the nearby steps can reuse the same value without rebuilding it each time.
        const canvasRect = canvas.getBoundingClientRect();
        // Capture page-relative geometry so document mousemove can continue the gesture.
        const rect = photoEl.getBoundingClientRect();

        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.dragging = true;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.resizing = false;

        // I am saving `left` here so the nearby steps can reuse the same value without rebuilding it each time.
        const left = rect.left - canvasRect.left;
        // I am saving `top` here so the nearby steps can reuse the same value without rebuilding it each time.
        const top = rect.top - canvasRect.top;

        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.dragStartMouseX = event.clientX;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.dragStartMouseY = event.clientY;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.dragStartLeft = left;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.dragStartTop = top;

        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.lastDragMouseX = event.clientX;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.lastDragMouseY = event.clientY;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.lastDragLeft = left;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        builderCanvasState.lastDragTop = top;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `handles` here so the nearby steps can reuse the same value without rebuilding it each time.
    const handles = photoEl.querySelectorAll('.canvas-photo-resize-handle');
    // Every corner shares the same move handler; this start records which corner was chosen.
    handles.forEach((handleEl) => {
        // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
        handleEl.addEventListener('mousedown', function (event) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            event.preventDefault();
            // I am calling this helper here so the current workflow performs this step before it moves on.
            event.stopPropagation();

            // I am saving `canvas` here so the nearby steps can reuse the same value without rebuilding it each time.
            const canvas = builderCanvasState.canvasEl;
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (!canvas) return;

            // I am updating or clearing this saved state here so the interface reflects the result of the action above.
            setSelectedCanvasPhoto(photoEl);

            // I am saving `canvasRect` here so the nearby steps can reuse the same value without rebuilding it each time.
            const canvasRect = canvas.getBoundingClientRect();
            // I am saving `rect` here so the nearby steps can reuse the same value without rebuilding it each time.
            const rect = photoEl.getBoundingClientRect();

            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            builderCanvasState.resizing = true;
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            builderCanvasState.dragging = false;
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            builderCanvasState.resizeHandle = handleEl;

            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            builderCanvasState.resizeStartMouseX = event.clientX;
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            builderCanvasState.resizeStartMouseY = event.clientY;
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            builderCanvasState.resizeStartRect = {
                // I am keeping the `left` field in this object so the receiving code can read that value by its expected name.
                left: rect.left - canvasRect.left,
                // I am keeping the `top` field in this object so the receiving code can read that value by its expected name.
                top: rect.top - canvasRect.top,
                // I am keeping the `width` field in this object so the receiving code can read that value by its expected name.
                width: rect.width,
                // I am keeping the `height` field in this object so the receiving code can read that value by its expected name.
                height: rect.height
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            };
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            builderCanvasState.resizeAspectRatio =
                // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
                rect.width && rect.height ? rect.width / rect.height : 1;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// Binder builder workspace
// -----------------------------------------------------------------------------
function isAllowedImageFile(file) {
    // This quick browser check improves feedback; binderController repeats validation securely.
    if (!file) return false;

    // I am saving `type` here so the nearby steps can reuse the same value without rebuilding it each time.
    const type = file.type || '';
    // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
    const name = file.name || '';

    // I am saving `mimeOk` here so the nearby steps can reuse the same value without rebuilding it each time.
    const mimeOk = type && ALLOWED_IMAGE_MIME_TYPES.has(type);
    // I am saving `extOk` here so the nearby steps can reuse the same value without rebuilding it each time.
    const extOk = ALLOWED_IMAGE_EXTENSIONS.test(name);

    // This return sends the completed value or response back to the code that called this function.
    return mimeOk || extOk;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `getBinderIdFromBody` as a named helper so the surrounding workflow can call this step when it needs it.
function getBinderIdFromBody() {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
        // dashboard.ejs places the route-facing binder ID on body for these legacy requests.
        const body = document.body;
        // This return sends the completed value or response back to the code that called this function.
        return body && body.dataset ? (body.dataset.binderId || '').trim() : '';
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.error('Builder workspace: failed to read binderId from body', { error: e?.message || String(e) });
        // This return sends the completed value or response back to the code that called this function.
        return '';
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `initializeBuilderWorkspace` as a named helper so the surrounding workflow can call this step when it needs it.
function initializeBuilderWorkspace() {
    // 1. Read the binder identity and connect the visible button to the hidden file input.
    // 2. Filter selected files for early feedback, then call the protected upload route.
    // 3. Clear the input afterward so choosing the same photo can trigger another change.
    const binderId = getBinderIdFromBody();
    // I am saving `addPhotosBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const addPhotosBtn = document.getElementById('builder-add-photos-btn');
    // I am saving `fileInput` here so the nearby steps can reuse the same value without rebuilding it each time.
    const fileInput = document.getElementById('builder-file-input');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!addPhotosBtn || !fileInput) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.error('Builder workspace: required elements not found, skipping wiring');
        // This return sends the completed value or response back to the code that called this function.
        return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!binderId) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn('Builder workspace: binderId is missing; uploads will be blocked until backend provides it');
    // This alternative runs only when the condition above did not use its first path.
    } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.info('Builder workspace: wiring upload handler', { binderId });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    addPhotosBtn.addEventListener('click', function () {
        // Stop before opening the picker when this page cannot form an owned binder route.
        if (!binderId) {
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                window.modalManager.showNotification(
                    // I am listing this entry here because the surrounding collection processes each allowed value in order.
                    'Binder not ready',
                    // I am listing this entry here because the surrounding collection processes each allowed value in order.
                    'We could not find your binder workspace yet. Please refresh the page, or contact support if this keeps happening.'
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                );
            // This alternative runs only when the condition above did not use its first path.
            } else {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                alert('We could not find your binder workspace yet. Please refresh and try again.');
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am calling this helper here so the current workflow performs this step before it moves on.
        fileInput.click();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    fileInput.addEventListener('change', function (event) {
        // Copy the browser FileList before asynchronous upload work begins.
        const files = Array.from(event.target.files || []);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!files.length) return;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!binderId) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            log.error('Builder workspace: file input change fired with no binderId; aborting upload');
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                window.modalManager.showNotification(
                    // I am listing this entry here because the surrounding collection processes each allowed value in order.
                    'Binder not ready',
                    // I am listing this entry here because the surrounding collection processes each allowed value in order.
                    'Your binder is not initialized yet, so photos cannot be uploaded.'
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                );
            // This alternative runs only when the condition above did not use its first path.
            } else {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                alert('Your binder is not initialized yet, so photos cannot be uploaded.');
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            fileInput.value = '';
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am saving `safeFiles` here so the nearby steps can reuse the same value without rebuilding it each time.
        const safeFiles = files.filter(isAllowedImageFile);

        // Do not send a multipart request that the controller will reject completely.
        if (!safeFiles.length) {
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                window.modalManager.showNotification(
                    // I am listing this entry here because the surrounding collection processes each allowed value in order.
                    'Unsupported files',
                    // I am listing this entry here because the surrounding collection processes each allowed value in order.
                    'Those files are not recognized as photos. Please choose JPG, PNG, HEIC, or other common image formats.'
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                );
            // This alternative runs only when the condition above did not use its first path.
            } else {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                alert('Those files are not recognized as photos. Please choose JPG, PNG, HEIC, or other common image formats.');
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            fileInput.value = '';
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (safeFiles.length < files.length) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            log.warn('Builder workspace: some selected files were rejected client-side as non-images');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am calling this helper here so the current workflow performs this step before it moves on.
        uploadBinderPhotos(binderId, safeFiles)
            // The helper owns user-facing upload errors; this catch keeps a diagnostic trail too.
            .catch((err) => {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                log.error('Builder workspace: uploadBinderPhotos failed', { error: err?.message || String(err) });
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            })
            // I am defining this small callback here so the surrounding API can run it with the value it supplies.
            .finally(() => {
                // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
                fileInput.value = '';
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// Legacy layout autosave + restore: disabled to protect binder_layouts schema
// -----------------------------------------------------------------------------
function initializeBinderLayoutAutosave() {
  // Debounce layout writes so a burst of drag events becomes one request. The dirty flag
  // makes sure only user changes schedule persistence.
    if (!LEGACY_LAYOUT_PERSISTENCE_DISABLED) return;

    // This routine now only explains the disabled state; React App owns current layout saves.
    const binderId = getBinderIdFromBody();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!binderId) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn('Binder layout: no binderId on page; legacy autosave already disabled');
        // This return sends the completed value or response back to the code that called this function.
        return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `statusEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const statusEl = document.getElementById('builder-status-text');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (statusEl) {
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        statusEl.textContent = 'Ready. (Legacy editor: autosave disabled. Use New editor (beta) for saved layouts.)';
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info('Binder layout: legacy autosave/restore disabled to protect binder_layouts', { binderId });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// Photo URL cache for fast restores (used only for post-upload caching)
// -----------------------------------------------------------------------------
const PHOTO_SRC_CACHE = new Map();

// -----------------------------------------------------------------------------
// Uploads
// -----------------------------------------------------------------------------
async function uploadBinderPhotos(binderId, files) {
  // Send the original files as multipart data with CSRF protection, then let the caller
  // update both the photo strip and canvas from the server's canonical photo metadata.
    if (!binderId) {
        // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
        throw new Error('Missing binderId for upload');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `csrfToken` here so the nearby steps can reuse the same value without rebuilding it each time.
    const csrfToken = _getCSRFToken();
    // Repeated "photos" fields match multer's upload.array configuration in binderRoutes.js.
    const formData = new FormData();

    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    files.forEach((file) => {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        formData.append('photos', file);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `endpoint` here so the nearby steps can reuse the same value without rebuilding it each time.
    const endpoint = `/dashboard/binder/${encodeURIComponent(binderId)}/photos`;

    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info('Builder workspace: uploading photos to binder', {
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        binderId,
        // I am keeping the `count` field in this object so the receiving code can read that value by its expected name.
        count: files.length,
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        endpoint
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
    const response = await fetch(endpoint, {
        // Leave multipart Content-Type to the browser so it includes the generated boundary.
        method: 'POST',
        // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
        body: formData,
        // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {}
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!response.ok) {
        // I am saving `text` here so the nearby steps can reuse the same value without rebuilding it each time.
        const text = await response.text().catch(() => '');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.error('Builder workspace: upload failed', { status: response.status, body: text });

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            window.modalManager.showNotification(
                // I am listing this entry here because the surrounding collection processes each allowed value in order.
                'Upload failed',
                // I am listing this entry here because the surrounding collection processes each allowed value in order.
                'We could not upload your photos right now. Please try again in a moment.'
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            );
        // This alternative runs only when the condition above did not use its first path.
        } else {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            alert('We could not upload your photos right now. Please try again.');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
        throw new Error(`Upload failed with status ${response.status}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const data = await response.json().catch(() => null);

    // The controller response contains canonical storage keys and provider URLs for both views.
    log.info('Builder workspace: upload succeeded', {
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        binderId,
        // I am keeping the `uploadedCount` field in this object so the receiving code can read that value by its expected name.
        uploadedCount: data?.uploadedCount,
        // I am keeping the `photos` field in this object so the receiving code can read that value by its expected name.
        photos: data?.photos?.length
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        refreshPhotoStrip(data);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        addUploadedPhotosToCanvas(data);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.error('Builder workspace: post-upload handling failed', { error: e?.message || String(e) });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `refreshPhotoStrip` as a named helper so the surrounding workflow can call this step when it needs it.
function refreshPhotoStrip(data) {
    // Rebuild the small metadata list from the latest upload response, escaping every value.
    if (!data || !Array.isArray(data.photos)) return;

    // I am saving `strip` here so the nearby steps can reuse the same value without rebuilding it each time.
    const strip = document.getElementById('builder-photo-strip');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!strip) return;

    // I am saving `itemsHtml` here so the nearby steps can reuse the same value without rebuilding it each time.
    const itemsHtml = data.photos.map((photo) => {
        // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
        const name = (photo.originalname || 'Photo').slice(0, 60);
        // I am saving `sizeKb` here so the nearby steps can reuse the same value without rebuilding it each time.
        const sizeKb = photo.size ? Math.round(photo.size / 1024) : null;
        // I am saving `sizeLabel` here so the nearby steps can reuse the same value without rebuilding it each time.
        const sizeLabel = sizeKb ? `${sizeKb} KB` : '';
        // This return sends the completed value or response back to the code that called this function.
        return `
            <div class="photo-chip" data-storage-key="${escapeHtml(photo.storageKey || '')}">
                <div class="photo-chip-thumb"></div>
                <div class="photo-chip-meta">
                    <div class="photo-chip-name">${escapeHtml(name)}</div>
                    ${sizeLabel ? `<div class="photo-chip-size">${escapeHtml(sizeLabel)}</div>` : ''}
                </div>
            </div>
        `;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    }).join('');

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    strip.innerHTML = itemsHtml || '<p class="panel-hint">No photos uploaded yet.</p>';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `addUploadedPhotosToCanvas` as a named helper so the surrounding workflow can call this step when it needs it.
function addUploadedPhotosToCanvas(data) {
    // Turn each usable server photo into a legacy canvas DOM element after removing the placeholder.
    if (!data || !Array.isArray(data.photos) || !data.photos.length) return;

    // I am saving `canvas` here so the nearby steps can reuse the same value without rebuilding it each time.
    const canvas = document.getElementById('builder-canvas');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!canvas) return;

    // I am saving `placeholder` here so the nearby steps can reuse the same value without rebuilding it each time.
    const placeholder = canvas.querySelector('.builder-canvas-placeholder');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (placeholder) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        placeholder.remove();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    data.photos.forEach((photo) => {
        // I am saving `src` here so the nearby steps can reuse the same value without rebuilding it each time.
        const src =
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            photo.publicUrl ||
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            photo.signedUrl ||
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            photo.url ||
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            photo.previewUrl ||
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            '';

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (photo.storageKey && src) {
            // Keep the provider URL beside its stable key for this page session.
            PHOTO_SRC_CACHE.set(photo.storageKey, src);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!src) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            log.warn('Canvas: photo has no URL, skipping', { photo });
            // This return sends the completed value or response back to the code that called this function.
            return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am calling this helper here so the current workflow performs this step before it moves on.
        createCanvasPhotoElement(canvas, src, photo);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// Canvas element creation
// -----------------------------------------------------------------------------
function createCanvasPhotoElement(canvas, src, photoMeta, options = {}) {
    // 1. Build a photo wrapper, image, and resize handles with storage identity in data attributes.
    // 2. Wire shared interactions and insert it into the legacy canvas.
    // 3. Restore explicit layout geometry or size a new upload after its image loads.
    const fromLayout = options.fromLayout === true;
    // I am saving `explicitZ` here so the nearby steps can reuse the same value without rebuilding it each time.
    const explicitZ = typeof options.zIndex === 'number' ? options.zIndex : null;

    // I am saving `photoEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const photoEl = document.createElement('div');
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    photoEl.className = 'canvas-photo';

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (photoMeta && photoMeta.storageKey) {
        // Delete flow reads this key later to call binderController.deletePhoto.
        photoEl.dataset.storageKey = photoMeta.storageKey;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (src) {
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        photoEl.dataset.src = src;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `imgEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const imgEl = document.createElement('img');
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    imgEl.src = src;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    imgEl.alt = photoMeta?.originalname || 'Photo';
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    imgEl.draggable = false;

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    imgEl.style.width = '100%';
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    imgEl.style.height = '100%';
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    imgEl.style.objectFit = 'contain';
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    imgEl.style.display = 'block';
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    imgEl.style.maxWidth = 'none';
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    imgEl.style.maxHeight = 'none';

    // I am calling this helper here so the current workflow performs this step before it moves on.
    photoEl.appendChild(imgEl);

    // I am saving `corners` here so the nearby steps can reuse the same value without rebuilding it each time.
    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    // CSS and wireCanvasPhotoInteractions use the corner name encoded in each class.
    corners.forEach((pos) => {
        // I am saving `handle` here so the nearby steps can reuse the same value without rebuilding it each time.
        const handle = document.createElement('div');
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        handle.className = 'canvas-photo-resize-handle canvas-photo-resize-' + pos;
        // I am calling this helper here so the current workflow performs this step before it moves on.
        photoEl.appendChild(handle);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am calling this helper here so the current workflow performs this step before it moves on.
    canvas.appendChild(photoEl);

    // I am calling this helper here so the current workflow performs this step before it moves on.
    wireCanvasPhotoInteractions(photoEl);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (fromLayout) {
        // A restored layer keeps saved stacking order and should not be marked as a new edit.
        if (explicitZ !== null) {
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            photoEl.style.zIndex = String(explicitZ);
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            builderCanvasState.zCounter = Math.max(builderCanvasState.zCounter, explicitZ);
        // This alternative runs only when the condition above did not use its first path.
        } else {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            bringCanvasPhotoToFront(photoEl);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This return sends the completed value or response back to the code that called this function.
        return photoEl;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (imgEl.complete && imgEl.naturalWidth) {
        // Cached images can be measured now; uncached images wait for their first load event.
        sizeAndCenterCanvasPhoto(photoEl, imgEl);
    // This alternative runs only when the condition above did not use its first path.
    } else {
        // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
        imgEl.addEventListener(
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            'load',
            // I am defining the `function` step here so the surrounding object or class can call it with the values listed in its parameters.
            function () {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                sizeAndCenterCanvasPhoto(photoEl, imgEl);
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            },
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            { once: true }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    markCanvasDirty();
    // This return sends the completed value or response back to the code that called this function.
    return photoEl;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `sizeAndCenterCanvasPhoto` as a named helper so the surrounding workflow can call this step when it needs it.
function sizeAndCenterCanvasPhoto(photoEl, imgEl) {
    // Fit a new photo to a small portion of the legacy canvas without enlarging its source.
    const canvas = builderCanvasState.canvasEl || document.getElementById('builder-canvas');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!canvas) return;

    // I am saving `canvasRect` here so the nearby steps can reuse the same value without rebuilding it each time.
    const canvasRect = canvas.getBoundingClientRect();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!canvasRect.width || !canvasRect.height) return;

    // I am saving `naturalWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
    const naturalWidth = imgEl.naturalWidth || 800;
    // I am saving `naturalHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
    const naturalHeight = imgEl.naturalHeight || 600;

    // I am saving `maxWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
    const maxWidth = canvasRect.width * 0.15;
    // I am saving `maxHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
    const maxHeight = canvasRect.height * 0.15;

    // I am saving `scale` here so the nearby steps can reuse the same value without rebuilding it each time.
    const scale = Math.min(
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        maxWidth / naturalWidth,
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        maxHeight / naturalHeight,
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        1
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // I am saving `width` here so the nearby steps can reuse the same value without rebuilding it each time.
    const width = Math.max(40, naturalWidth * scale);
    // I am saving `height` here so the nearby steps can reuse the same value without rebuilding it each time.
    const height = Math.max(40, naturalHeight * scale);

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    photoEl.style.width = `${width}px`;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    photoEl.style.height = `${height}px`;

    // I am saving `left` here so the nearby steps can reuse the same value without rebuilding it each time.
    const left = (canvasRect.width - width) / 2;
    // Center first placement; later mouse interactions update these DOM coordinates.
    const top = (canvasRect.height - height) / 2;

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    photoEl.style.left = `${Math.max(0, left)}px`;
    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    photoEl.style.top = `${Math.max(0, top)}px`;

    // I am calling this helper here so the current workflow performs this step before it moves on.
    bringCanvasPhotoToFront(photoEl);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// Delete flow
// -----------------------------------------------------------------------------
function removePhotoChipForStorageKey(storageKey) {
    // Keep the upload strip in sync after the server and canvas photo have been removed.
    if (!storageKey) return;
    // I am saving `strip` here so the nearby steps can reuse the same value without rebuilding it each time.
    const strip = document.getElementById('builder-photo-strip');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!strip) return;

    // I am saving `chips` here so the nearby steps can reuse the same value without rebuilding it each time.
    const chips = strip.querySelectorAll('.photo-chip');
    // I am saving `removed` here so the nearby steps can reuse the same value without rebuilding it each time.
    let removed = false;
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    chips.forEach((chip) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (chip.dataset.storageKey === storageKey) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            chip.remove();
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            removed = true;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (removed) {
        // I am saving `remaining` here so the nearby steps can reuse the same value without rebuilding it each time.
        const remaining = strip.querySelector('.photo-chip');
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!remaining) {
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            strip.innerHTML = '<p class="panel-hint">No photos uploaded yet.</p>';
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `deleteBinderPhotoOnServer` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function deleteBinderPhotoOnServer(binderId, storageKey) {
    // Call the same owned delete route used by the React editor's api.deleteBinderPhoto.
    if (!binderId || !storageKey) {
        // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
        throw new Error('deleteBinderPhotoOnServer requires binderId and storageKey');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `csrfToken` here so the nearby steps can reuse the same value without rebuilding it each time.
    const csrfToken = _getCSRFToken();
    // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
    const url = `/dashboard/binder/${encodeURIComponent(binderId)}/photos?storageKey=${encodeURIComponent(storageKey)}`;

    // I am saving `headers` here so the nearby steps can reuse the same value without rebuilding it each time.
    const headers = { 'Accept': 'application/json' };
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (csrfToken) headers['x-csrf-token'] = csrfToken;

    // I am saving `resp` here so the nearby steps can reuse the same value without rebuilding it each time.
    const resp = await fetch(url, { method: 'DELETE', headers });

    // Do not remove DOM state unless both HTTP status and endpoint result confirm deletion.
    if (!resp.ok) {
        // I am saving `text` here so the nearby steps can reuse the same value without rebuilding it each time.
        const text = await resp.text().catch(() => '');
        // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
        throw new Error(`Delete failed with status ${resp.status}: ${text}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const data = await resp.json().catch(() => null);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!data || !data.ok) {
        // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
        throw new Error('Delete endpoint returned an error response');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `requestDeleteSelectedPhoto` as a named helper so the surrounding workflow can call this step when it needs it.
function requestDeleteSelectedPhoto() {
  // Deleting a canvas photo also removes its stored binder asset. Confirmation and a
  // single async path keep the DOM and server from drifting apart on partial failure.
    const photoEl = builderCanvasState.selectedPhotoEl;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!photoEl) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            window.modalManager.showNotification(
                // I am listing this entry here because the surrounding collection processes each allowed value in order.
                'No photo selected',
                // I am listing this entry here because the surrounding collection processes each allowed value in order.
                'Click on a photo on the page first, then try deleting again.'
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            );
        // This alternative runs only when the condition above did not use its first path.
        } else {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            alert('Please select a photo on the page first, then delete it.');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This return sends the completed value or response back to the code that called this function.
        return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `binderId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const binderId = getBinderIdFromBody();
    // I am saving `storageKey` here so the nearby steps can reuse the same value without rebuilding it each time.
    const storageKey = photoEl.dataset.storageKey || null;

    // I am saving `confirmMessage` here so the nearby steps can reuse the same value without rebuilding it each time.
    const confirmMessage = storageKey
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        ? 'Delete this photo from your binder? This will remove it from this page and from our storage.'
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        : 'Delete this photo from this page?';

    // I am saving `performDelete` here so the nearby steps can reuse the same value without rebuilding it each time.
    const performDelete = async () => {
        // Storage-backed photos must succeed on the server before this legacy DOM is changed.
        if (binderId && storageKey) {
            // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
            try {
                // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
                await deleteBinderPhotoOnServer(binderId, storageKey);
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch (err) {
                // I am calling this helper here so the current workflow performs this step before it moves on.
                log.error('Binder delete: server delete failed', { error: err?.message || String(err) });
                // This check helps me choose or stop the next path before any work that depends on this condition runs.
                if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
                    // I am calling this helper here so the current workflow performs this step before it moves on.
                    window.modalManager.showNotification(
                        // I am listing this entry here because the surrounding collection processes each allowed value in order.
                        'Delete failed',
                        // I am listing this entry here because the surrounding collection processes each allowed value in order.
                        'We could not delete this photo from storage right now. Please try again in a moment.'
                    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                    );
                // This alternative runs only when the condition above did not use its first path.
                } else {
                    // I am calling this helper here so the current workflow performs this step before it moves on.
                    alert('We could not delete this photo from storage right now. Please try again.');
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                }
                // This return sends the completed value or response back to the code that called this function.
                return;
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // I am checking this next possibility only because the earlier condition did not choose its path.
        } else if (!binderId && storageKey) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            log.warn('Binder delete: storageKey present but binderId missing; deleting from layout only', { storageKey });
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (photoEl.parentElement) {
            // The async boundary has passed, so it is now safe to remove the visible photo.
            photoEl.parentElement.removeChild(photoEl);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (builderCanvasState.selectedPhotoEl === photoEl) {
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            builderCanvasState.selectedPhotoEl = null;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (storageKey) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            removePhotoChipForStorageKey(storageKey);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am calling this helper here so the current workflow performs this step before it moves on.
        markCanvasDirty();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am saving `mm` here so the nearby steps can reuse the same value without rebuilding it each time.
    const mm = window.modalManager;
    // Prefer the shared modal UI, with native confirm as a safe page-level fallback.
    if (mm && typeof mm.showConfirm === 'function') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        mm.showConfirm({
            // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
            title: 'Delete photo',
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: confirmMessage,
            // I am keeping the `confirmLabel` field in this object so the receiving code can read that value by its expected name.
            confirmLabel: 'Delete photo',
            // I am keeping the `onConfirm` field in this object so the receiving code can read that value by its expected name.
            onConfirm: () => { performDelete(); },
            // I am keeping the `onCancel` field in this object so the receiving code can read that value by its expected name.
            onCancel: () => {}
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
        // This return sends the completed value or response back to the code that called this function.
        return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `confirmed` here so the nearby steps can reuse the same value without rebuilding it each time.
    const confirmed = window.confirm(confirmMessage);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!confirmed) return;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    performDelete();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `initializeDeletePhotoButton` as a named helper so the surrounding workflow can call this step when it needs it.
function initializeDeletePhotoButton() {
    // I am saving `btn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const btn = document.getElementById('builder-delete-photo-btn');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!btn) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.info('Delete photo button not found on page; skipping wiring');
        // This return sends the completed value or response back to the code that called this function.
        return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    btn.addEventListener('click', function () {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        requestDeleteSelectedPhoto();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info('Delete photo button wired');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// React editor button
// -----------------------------------------------------------------------------
function initializeReactEditorButton() {
    // This legacy dashboard button moves the user into App.jsx for persisted layout editing.
    const btn = document.getElementById('open-react-editor-btn');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!btn) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.info('React editor button not found on page; skipping wiring');
        // This return sends the completed value or response back to the code that called this function.
        return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `binderId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const binderId = getBinderIdFromBody();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!binderId) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn('React editor button: binderId is missing; disabling button');
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        btn.disabled = true;
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        btn.title = 'Binder is not ready yet. Please refresh or contact support.';
        // This return sends the completed value or response back to the code that called this function.
        return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    btn.addEventListener('click', function () {
        // I am saving `targetUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
        const targetUrl = `/dashboard/binder/${encodeURIComponent(binderId)}/editor`;
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.info('Navigating to React binder editor', { binderId, targetUrl });
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        window.location.href = targetUrl;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info('React editor button wired', { binderId });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// Submissions (existing functionality)
// -----------------------------------------------------------------------------
function initializeSubmissions() {
    // I am saving `viewSubmissionsBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const viewSubmissionsBtn = document.getElementById('viewSubmissionsBtn');
    // I am saving `submissionsList` here so the nearby steps can reuse the same value without rebuilding it each time.
    const submissionsList = document.getElementById('submissionsList');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!viewSubmissionsBtn || !submissionsList) {
        // This return sends the completed value or response back to the code that called this function.
        return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    viewSubmissionsBtn.addEventListener('click', function() {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        fetchSubmissions();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `fetchSubmissions` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function fetchSubmissions() {
    // I am saving `submissionsList` here so the nearby steps can reuse the same value without rebuilding it each time.
    const submissionsList = document.getElementById('submissionsList');

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
        // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
        const response = await fetch('/api/submissions');
        // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
        const data = await response.json();

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (data.submissions && data.submissions.length > 0) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            displaySubmissions(data.submissions);
            // I am calling this helper here so the current workflow performs this step before it moves on.
            submissionsList.classList.remove('hidden');
        // This alternative runs only when the condition above did not use its first path.
        } else {
            // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
            submissionsList.innerHTML = '<p>No submissions found.</p>';
            // I am calling this helper here so the current workflow performs this step before it moves on.
            submissionsList.classList.remove('hidden');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (error) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.error('Error fetching submissions:', error);
        // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
        submissionsList.innerHTML = '<p>Error loading submissions. Please try again.</p>';
        // I am calling this helper here so the current workflow performs this step before it moves on.
        submissionsList.classList.remove('hidden');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `displaySubmissions` as a named helper so the surrounding workflow can call this step when it needs it.
function displaySubmissions(submissions) {
    // I am saving `submissionsList` here so the nearby steps can reuse the same value without rebuilding it each time.
    const submissionsList = document.getElementById('submissionsList');

    // I am saving `html` here so the nearby steps can reuse the same value without rebuilding it each time.
    const html = `
        <div class="submissions-header">
            <h3>Recent Submissions</h3>
            <button id="hideSubmissionsBtn" class="btn btn-secondary">Hide</button>
        </div>
        <div class="submissions-content">
            ${submissions.map(submission => `
                <div class="submission-item">
                    <div class="submission-meta">
                        <span class="submission-id">ID: ${escapeHtml(submission.id)}</span>
                        <span class="submission-time">${escapeHtml(new Date(submission.timestamp).toLocaleString())}</span>
                    </div>
                    <div class="submission-preview">
                        ${escapeHtml(submission.preview)}
                    </div>
                    <div class="submission-stats">
                        <span class="submission-length">${escapeHtml(String(submission.text_length))} characters</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // I am keeping this line here because the surrounding dashboard.js workflow expects this value or operation before it continues.
    submissionsList.innerHTML = html;

    // I am saving `hideBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const hideBtn = document.getElementById('hideSubmissionsBtn');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (hideBtn) {
        // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
        hideBtn.addEventListener('click', function() {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            submissionsList.classList.add('hidden');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}