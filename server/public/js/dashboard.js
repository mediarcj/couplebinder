// Description: Client-side JavaScript for dashboard functionality
// Purpose: Handles submissions and binder builder workspace (uploads to S3-backed route)
//  - Workspace is now a simple layout: left page strip + big canvas + photo strip
//  - IMPORTANT: Legacy canvas autosave/restore to Supabase binder_layouts is DISABLED.
//    The React editor owns binder_layouts with a different JSON shape. Writing legacy JSON
//    into that table can corrupt the new editor/export experience.

// Logger setup (safe fallback; no TDZ / self-reference problems)
let log = (typeof window !== 'undefined' && window.logger) ? window.logger : null;

if (!log) {
    const fallbackLogger = {
        isDebugEnabled: () => {
            try {
                return localStorage.getItem('debugProfile') === '1';
            } catch {
                return false;
            }
        },
        redact: (obj) => {
            if (typeof obj === 'string') {
                return obj
                    .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[EMAIL]')
                    .replace(/(\b\d{7,}\b)/g, '[PHONE]')
                    .replace(/(sb-access-token=[^;]+)/g, '[TOKEN]');
            }
            if (typeof obj === 'object' && obj !== null) {
                const safe = {};
                const allowed = new Set(['status', 'count', 'fileCount', 'found', 'field', 'operation']);
                for (const [key, value] of Object.entries(obj)) {
                    safe[key] = allowed.has(key) && ['string', 'number', 'boolean'].includes(typeof value)
                        ? fallbackLogger.redact(String(value))
                        : '[REDACTED]';
                }
                return safe;
            }
            return obj;
        },
        info: (message, data = {}) => {
            if (!fallbackLogger.isDebugEnabled()) return;
            try {
                console.log(`[DEBUG] ${message}`, fallbackLogger.redact(data));
            } catch (e) {
                console.log(`[DEBUG] ${message}`, '[Logger error - data not logged]');
            }
        },
        error: (message, data = {}) => {
            try {
                console.error(`[ERROR] ${message}`, fallbackLogger.redact(data));
            } catch (e) {
                console.error(`[ERROR] ${message}`, '[Logger error - data not logged]');
            }
        },
        warn: (message, data = {}) => {
            if (!fallbackLogger.isDebugEnabled()) return;
            try {
                console.warn(`[WARN] ${message}`, fallbackLogger.redact(data));
            } catch (e) {
                console.warn(`[WARN] ${message}`, '[Logger error - data not logged]');
            }
        }
    };

    log = fallbackLogger;
}

// XSS Protection: HTML Escape Function
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Allowed image types for uploads (client-side)
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/avif'
]);

const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|avif)$/i;

// Legacy layout autosave/restore: intentionally disabled
const LEGACY_LAYOUT_PERSISTENCE_DISABLED = true;

// Simple canvas state for selection, dragging, and resizing
const builderCanvasState = {
    canvasEl: null,

    selectedPhotoEl: null,
    zCounter: 1,

    // dragging
    dragging: false,
    dragStartMouseX: 0,
    dragStartMouseY: 0,
    dragStartLeft: 0,
    dragStartTop: 0,
    lastDragMouseX: 0,
    lastDragMouseY: 0,
    lastDragLeft: 0,
    lastDragTop: 0,
    dragAxis: null, // 'x' or 'y' for current drag

    // resizing
    resizing: false,
    resizeHandle: null,
    resizeStartMouseX: 0,
    resizeStartMouseY: 0,
    resizeStartRect: null,
    resizeAspectRatio: 1,

    initialized: false,

    // "dirty" is now UI-only (no Supabase writes from this legacy page)
    dirty: false
};

function markCanvasDirty() {
    // This legacy canvas no longer persists layout rows, but the status still warns about edits.
    builderCanvasState.dirty = true;

    const statusEl = document.getElementById('builder-status-text');
    if (statusEl) {
        statusEl.textContent = LEGACY_LAYOUT_PERSISTENCE_DISABLED
            ? 'Unsaved changes (legacy editor does not autosave).'
            : 'Unsaved changes...';
    }
}

// CSRF helper
function _getCSRFToken() {
    // Upload/delete routes use the same token supplied by server middleware to this page.
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

    console.warn('CSRF token not found');
    return '';
}

// DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    // Wire the legacy canvas and dashboard panels after their EJS elements exist.
    initializeCanvasInteractions();  // drag/resize/delete
    initializeDashboard();
    initializeSubmissions();
    initializeBuilderWorkspace();

    // Disabled on purpose to protect binder_layouts format used by React editor/export
    initializeBinderLayoutAutosave();

    initializeDeletePhotoButton();
    initializeReactEditorButton();

    log.info('Dashboard page initialized');
});

// Dashboard basics
function initializeDashboard() {
    log.info('Dashboard functionality initialized');
}

// Helpers for collision / geometry
function rectsOverlap(l1, t1, w1, h1, l2, t2, w2, h2) {
    // Edge contact is allowed so photos can sit flush without counting as a collision.
    return !(
        l1 + w1 <= l2 ||
        l1 >= l2 + w2 ||
        t1 + h1 <= t2 ||
        t1 >= t2 + h2
    );
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
    if (!canvas) {
        return { left: proposedLeft, top: proposedTop };
    }

    let left = proposedLeft;
    let top = proposedTop;

    const others = canvas.querySelectorAll('.canvas-photo');
    others.forEach((other) => {
        if (other === photoEl) return;

        const r = other.getBoundingClientRect();
        const oLeft = r.left - canvasRect.left;
        const oTop = r.top - canvasRect.top;
        const oWidth = r.width;
        const oHeight = r.height;

        if (!rectsOverlap(left, top, width, height, oLeft, oTop, oWidth, oHeight)) {
            return;
        }

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const axis = dragAxis || (absDx >= absDy ? 'x' : 'y');

        if (axis === 'x') {
            if (dx > 0) {
                left = Math.min(left, oLeft - width);
            } else if (dx < 0) {
                left = Math.max(left, oLeft + oWidth);
            }
        } else if (axis === 'y') {
            if (dy > 0) {
                top = Math.min(top, oTop - height);
            } else if (dy < 0) {
                top = Math.max(top, oTop + oHeight);
            }
        }
    });

    left = Math.max(0, Math.min(left, canvasRect.width - width));
    top = Math.max(0, Math.min(top, canvasRect.height - height));

    return { left, top };
}

// Canvas interactions (drag / resize / delete + selection)
function initializeCanvasInteractions() {
  // Document-level move/up listeners keep a drag alive when the pointer leaves the photo,
  // while the selected element and starting geometry stay in the shared drag state.
    if (builderCanvasState.initialized) return;

    const canvas = document.getElementById('builder-canvas');
    if (!canvas) return;

    builderCanvasState.canvasEl = canvas;
    builderCanvasState.initialized = true;

    canvas.addEventListener('mousedown', function(event) {
        if (event.button !== 0) return;
        const clickedPhoto = event.target.closest('.canvas-photo');
        if (!clickedPhoto) {
            setSelectedCanvasPhoto(null);
        }
    });

    document.addEventListener('mousemove', handleCanvasMouseMove);
    document.addEventListener('mouseup', handleCanvasMouseUp);
    document.addEventListener('mouseleave', handleCanvasMouseUp);

    document.addEventListener('keydown', handleCanvasKeyDown);

    log.info('Canvas interactions initialized');
}

function handleCanvasMouseMove(event) {
    // 1. Read the selected photo and current canvas bounds from shared legacy state.
    // 2. During drag, constrain movement against the page and neighboring photos.
    // 3. During resize, preserve aspect ratio and keep the resulting box inside the page.
    const canvas = builderCanvasState.canvasEl;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) return;

    const insideCanvasBounds =
        event.clientX >= canvasRect.left &&
        event.clientX <= canvasRect.right &&
        event.clientY >= canvasRect.top &&
        event.clientY <= canvasRect.bottom;

    const photoEl = builderCanvasState.selectedPhotoEl;
    if (!photoEl) return;

    // Dragging
    if (builderCanvasState.dragging) {
        // Ending at the boundary keeps document-level movement from leaving a stuck gesture.
        event.preventDefault();

        if (!insideCanvasBounds) {
            handleCanvasMouseUp();
            return;
        }

        const dx = event.clientX - builderCanvasState.lastDragMouseX;
        const dy = event.clientY - builderCanvasState.lastDragMouseY;

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (!builderCanvasState.dragAxis && (absDx > 0 || absDy > 0)) {
            // Lock to the first dominant direction for stable obstacle resolution.
            builderCanvasState.dragAxis = absDx >= absDy ? 'x' : 'y';
        }

        const width = photoEl.offsetWidth;
        const height = photoEl.offsetHeight;

        let proposedLeft = builderCanvasState.lastDragLeft + dx;
        let proposedTop = builderCanvasState.lastDragTop + dy;

        const constrained = constrainDragWithCollisions(
            // The helper returns page-relative pixel coordinates for this legacy DOM canvas.
            photoEl,
            proposedLeft,
            proposedTop,
            width,
            height,
            dx,
            dy,
            canvasRect,
            builderCanvasState.dragAxis
        );

        photoEl.style.left = `${constrained.left}px`;
        photoEl.style.top = `${constrained.top}px`;

        builderCanvasState.lastDragLeft = constrained.left;
        builderCanvasState.lastDragTop = constrained.top;
        builderCanvasState.lastDragMouseX = event.clientX;
        builderCanvasState.lastDragMouseY = event.clientY;
        return;
    }

    // Resizing (keep aspect ratio and canvas bounds, but allow overlap)
    if (builderCanvasState.resizing && builderCanvasState.resizeStartRect) {
        // Resize may overlap neighbors, but it still cannot extend outside this canvas.
        event.preventDefault();

        if (!insideCanvasBounds) {
            handleCanvasMouseUp();
            return;
        }

        const handle = builderCanvasState.resizeHandle;
        if (!handle) return;

        const dx = event.clientX - builderCanvasState.resizeStartMouseX;
        const rect0 = builderCanvasState.resizeStartRect;
        const aspect = builderCanvasState.resizeAspectRatio || 1;

        let width = rect0.width;
        let height = rect0.height;
        let left = rect0.left;
        let top = rect0.top;

        const isTop = handle.classList.contains('canvas-photo-resize-top-left') ||
                      handle.classList.contains('canvas-photo-resize-top-right');
        const isLeft = handle.classList.contains('canvas-photo-resize-top-left') ||
                       handle.classList.contains('canvas-photo-resize-bottom-left');

        if (isLeft) {
            width = rect0.width - dx;
        } else {
            width = rect0.width + dx;
        }

        width = Math.max(40, width);
        // Width is the one free dimension; height follows the captured starting aspect ratio.
        height = width / aspect;

        if (isLeft) {
            left = rect0.left + (rect0.width - width);
        }
        if (isTop) {
            top = rect0.top + (rect0.height - height);
        }

        if (left < 0) left = 0;
        if (top < 0) top = 0;

        if (left + width > canvasRect.width) {
            width = canvasRect.width - left;
            width = Math.max(40, width);
            height = width / aspect;
        }

        if (top + height > canvasRect.height) {
            height = canvasRect.height - top;
            height = Math.max(40, height);
            width = height * aspect;
        }

        photoEl.style.width = `${width}px`;
        photoEl.style.height = `${height}px`;
        photoEl.style.left = `${left}px`;
        photoEl.style.top = `${top}px`;
    }
}

function handleCanvasMouseUp() {
    // Remember whether anything happened before clearing all gesture flags.
    const hadInteraction = builderCanvasState.dragging || builderCanvasState.resizing;

    builderCanvasState.dragging = false;
    builderCanvasState.resizing = false;
    builderCanvasState.resizeHandle = null;
    builderCanvasState.resizeStartRect = null;
    builderCanvasState.dragAxis = null;

    if (hadInteraction && builderCanvasState.selectedPhotoEl) {
        markCanvasDirty();
    }
}

function handleCanvasKeyDown(event) {
    // Leave Delete/Backspace alone while the user is typing in any editable control.
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;

    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return;
    }

    event.preventDefault();
    requestDeleteSelectedPhoto();
}

function setSelectedCanvasPhoto(photoEl) {
    // Keep exactly one selected DOM photo and bring it above its siblings for visible handles.
    const canvas = builderCanvasState.canvasEl;
    if (!canvas) return;

    const all = canvas.querySelectorAll('.canvas-photo');
    all.forEach((el) => el.classList.remove('canvas-photo-selected'));

    if (photoEl) {
        photoEl.classList.add('canvas-photo-selected');
        builderCanvasState.selectedPhotoEl = photoEl;
        bringCanvasPhotoToFront(photoEl);
    } else {
        builderCanvasState.selectedPhotoEl = null;
    }
}

function bringCanvasPhotoToFront(photoEl) {
    // This z-index is UI-only because legacy layout persistence is disabled below.
    builderCanvasState.zCounter += 1;
    photoEl.style.zIndex = String(builderCanvasState.zCounter);
}

function wireCanvasPhotoInteractions(photoEl) {
    // Attach drag and four resize-handle starts once when createCanvasPhotoElement builds a photo.
    photoEl.addEventListener('mousedown', function (event) {
        if (event.button !== 0) return;

        if (event.target.classList.contains('canvas-photo-resize-handle')) {
            return;
        }

        event.preventDefault();

        const canvas = builderCanvasState.canvasEl;
        if (!canvas) return;

        setSelectedCanvasPhoto(photoEl);

        const canvasRect = canvas.getBoundingClientRect();
        // Capture page-relative geometry so document mousemove can continue the gesture.
        const rect = photoEl.getBoundingClientRect();

        builderCanvasState.dragging = true;
        builderCanvasState.resizing = false;

        const left = rect.left - canvasRect.left;
        const top = rect.top - canvasRect.top;

        builderCanvasState.dragStartMouseX = event.clientX;
        builderCanvasState.dragStartMouseY = event.clientY;
        builderCanvasState.dragStartLeft = left;
        builderCanvasState.dragStartTop = top;

        builderCanvasState.lastDragMouseX = event.clientX;
        builderCanvasState.lastDragMouseY = event.clientY;
        builderCanvasState.lastDragLeft = left;
        builderCanvasState.lastDragTop = top;
    });

    const handles = photoEl.querySelectorAll('.canvas-photo-resize-handle');
    // Every corner shares the same move handler; this start records which corner was chosen.
    handles.forEach((handleEl) => {
        handleEl.addEventListener('mousedown', function (event) {
            event.preventDefault();
            event.stopPropagation();

            const canvas = builderCanvasState.canvasEl;
            if (!canvas) return;

            setSelectedCanvasPhoto(photoEl);

            const canvasRect = canvas.getBoundingClientRect();
            const rect = photoEl.getBoundingClientRect();

            builderCanvasState.resizing = true;
            builderCanvasState.dragging = false;
            builderCanvasState.resizeHandle = handleEl;

            builderCanvasState.resizeStartMouseX = event.clientX;
            builderCanvasState.resizeStartMouseY = event.clientY;
            builderCanvasState.resizeStartRect = {
                left: rect.left - canvasRect.left,
                top: rect.top - canvasRect.top,
                width: rect.width,
                height: rect.height
            };
            builderCanvasState.resizeAspectRatio =
                rect.width && rect.height ? rect.width / rect.height : 1;
        });
    });
}

// Binder builder workspace
function isAllowedImageFile(file) {
    // This quick browser check improves feedback; binderController repeats validation securely.
    if (!file) return false;

    const type = file.type || '';
    const name = file.name || '';

    const mimeOk = type && ALLOWED_IMAGE_MIME_TYPES.has(type);
    const extOk = ALLOWED_IMAGE_EXTENSIONS.test(name);

    return mimeOk || extOk;
}

function getBinderIdFromBody() {
    try {
        // dashboard.ejs places the route-facing binder ID on body for these legacy requests.
        const body = document.body;
        return body && body.dataset ? (body.dataset.binderId || '').trim() : '';
    } catch (e) {
        log.error('Builder workspace: failed to read binderId from body', { error: e?.message || String(e) });
        return '';
    }
}

function initializeBuilderWorkspace() {
    // 1. Read the binder identity and connect the visible button to the hidden file input.
    // 2. Filter selected files for early feedback, then call the protected upload route.
    // 3. Clear the input afterward so choosing the same photo can trigger another change.
    const binderId = getBinderIdFromBody();
    const addPhotosBtn = document.getElementById('builder-add-photos-btn');
    const fileInput = document.getElementById('builder-file-input');

    if (!addPhotosBtn || !fileInput) {
        log.error('Builder workspace: required elements not found, skipping wiring');
        return;
    }

    if (!binderId) {
        log.warn('Builder workspace: binderId is missing; uploads will be blocked until backend provides it');
    } else {
        log.info('Builder workspace: wiring upload handler', { binderId });
    }

    addPhotosBtn.addEventListener('click', function () {
        // Stop before opening the picker when this page cannot form an owned binder route.
        if (!binderId) {
            if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
                window.modalManager.showNotification(
                    'Binder not ready',
                    'We could not find your binder workspace yet. Please refresh the page, or contact support if this keeps happening.'
                );
            } else {
                alert('We could not find your binder workspace yet. Please refresh and try again.');
            }
            return;
        }

        fileInput.click();
    });

    fileInput.addEventListener('change', function (event) {
        // Copy the browser FileList before asynchronous upload work begins.
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        if (!binderId) {
            log.error('Builder workspace: file input change fired with no binderId; aborting upload');
            if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
                window.modalManager.showNotification(
                    'Binder not ready',
                    'Your binder is not initialized yet, so photos cannot be uploaded.'
                );
            } else {
                alert('Your binder is not initialized yet, so photos cannot be uploaded.');
            }
            fileInput.value = '';
            return;
        }

        const safeFiles = files.filter(isAllowedImageFile);

        // Do not send a multipart request that the controller will reject completely.
        if (!safeFiles.length) {
            if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
                window.modalManager.showNotification(
                    'Unsupported files',
                    'Those files are not recognized as photos. Please choose JPG, PNG, HEIC, or other common image formats.'
                );
            } else {
                alert('Those files are not recognized as photos. Please choose JPG, PNG, HEIC, or other common image formats.');
            }
            fileInput.value = '';
            return;
        }

        if (safeFiles.length < files.length) {
            log.warn('Builder workspace: some selected files were rejected client-side as non-images');
        }

        uploadBinderPhotos(binderId, safeFiles)
            // The helper owns user-facing upload errors; this catch keeps a diagnostic trail too.
            .catch((err) => {
                log.error('Builder workspace: uploadBinderPhotos failed', { error: err?.message || String(err) });
            })
            .finally(() => {
                fileInput.value = '';
            });
    });
}

// Legacy layout autosave + restore: disabled to protect binder_layouts schema
function initializeBinderLayoutAutosave() {
  // Debounce layout writes so a burst of drag events becomes one request. The dirty flag
  // makes sure only user changes schedule persistence.
    if (!LEGACY_LAYOUT_PERSISTENCE_DISABLED) return;

    // This routine now only explains the disabled state; React App owns current layout saves.
    const binderId = getBinderIdFromBody();
    if (!binderId) {
        log.warn('Binder layout: no binderId on page; legacy autosave already disabled');
        return;
    }

    const statusEl = document.getElementById('builder-status-text');
    if (statusEl) {
        statusEl.textContent = 'Ready. (Legacy editor: autosave disabled. Use New editor (beta) for saved layouts.)';
    }

    log.info('Binder layout: legacy autosave/restore disabled to protect binder_layouts', { binderId });
}

// Photo URL cache for fast restores (used only for post-upload caching)
const PHOTO_SRC_CACHE = new Map();

// Uploads
async function uploadBinderPhotos(binderId, files) {
  // Send the original files as multipart data with CSRF protection, then let the caller
  // update both the photo strip and canvas from the server's canonical photo metadata.
    if (!binderId) {
        throw new Error('Missing binderId for upload');
    }

    const csrfToken = _getCSRFToken();
    // Repeated "photos" fields match multer's upload.array configuration in binderRoutes.js.
    const formData = new FormData();

    files.forEach((file) => {
        formData.append('photos', file);
    });

    const endpoint = `/dashboard/binder/${encodeURIComponent(binderId)}/photos`;

    log.info('Builder workspace: uploading photos to binder', {
        binderId,
        count: files.length,
        endpoint
    });

    const response = await fetch(endpoint, {
        // Leave multipart Content-Type to the browser so it includes the generated boundary.
        method: 'POST',
        body: formData,
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {}
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        log.error('Builder workspace: upload failed', { status: response.status, body: text });

        if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
            window.modalManager.showNotification(
                'Upload failed',
                'We could not upload your photos right now. Please try again in a moment.'
            );
        } else {
            alert('We could not upload your photos right now. Please try again.');
        }
        throw new Error(`Upload failed with status ${response.status}`);
    }

    const data = await response.json().catch(() => null);

    // The controller response contains canonical storage keys and provider URLs for both views.
    log.info('Builder workspace: upload succeeded', {
        binderId,
        uploadedCount: data?.uploadedCount,
        photos: data?.photos?.length
    });

    try {
        refreshPhotoStrip(data);
        addUploadedPhotosToCanvas(data);
    } catch (e) {
        log.error('Builder workspace: post-upload handling failed', { error: e?.message || String(e) });
    }
}

function refreshPhotoStrip(data) {
    // Rebuild the small metadata list from the latest upload response, escaping every value.
    if (!data || !Array.isArray(data.photos)) return;

    const strip = document.getElementById('builder-photo-strip');
    if (!strip) return;

    const itemsHtml = data.photos.map((photo) => {
        const name = (photo.originalname || 'Photo').slice(0, 60);
        const sizeKb = photo.size ? Math.round(photo.size / 1024) : null;
        const sizeLabel = sizeKb ? `${sizeKb} KB` : '';
        return `
            <div class="photo-chip" data-storage-key="${escapeHtml(photo.storageKey || '')}">
                <div class="photo-chip-thumb"></div>
                <div class="photo-chip-meta">
                    <div class="photo-chip-name">${escapeHtml(name)}</div>
                    ${sizeLabel ? `<div class="photo-chip-size">${escapeHtml(sizeLabel)}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    strip.innerHTML = itemsHtml || '<p class="panel-hint">No photos uploaded yet.</p>';
}

function addUploadedPhotosToCanvas(data) {
    // Turn each usable server photo into a legacy canvas DOM element after removing the placeholder.
    if (!data || !Array.isArray(data.photos) || !data.photos.length) return;

    const canvas = document.getElementById('builder-canvas');
    if (!canvas) return;

    const placeholder = canvas.querySelector('.builder-canvas-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    data.photos.forEach((photo) => {
        const src =
            photo.publicUrl ||
            photo.signedUrl ||
            photo.url ||
            photo.previewUrl ||
            '';

        if (photo.storageKey && src) {
            // Keep the provider URL beside its stable key for this page session.
            PHOTO_SRC_CACHE.set(photo.storageKey, src);
        }

        if (!src) {
            log.warn('Canvas: photo has no URL, skipping', { photo });
            return;
        }

        createCanvasPhotoElement(canvas, src, photo);
    });
}

// Canvas element creation
function createCanvasPhotoElement(canvas, src, photoMeta, options = {}) {
    // 1. Build a photo wrapper, image, and resize handles with storage identity in data attributes.
    // 2. Wire shared interactions and insert it into the legacy canvas.
    // 3. Restore explicit layout geometry or size a new upload after its image loads.
    const fromLayout = options.fromLayout === true;
    const explicitZ = typeof options.zIndex === 'number' ? options.zIndex : null;

    const photoEl = document.createElement('div');
    photoEl.className = 'canvas-photo';

    if (photoMeta && photoMeta.storageKey) {
        // Delete flow reads this key later to call binderController.deletePhoto.
        photoEl.dataset.storageKey = photoMeta.storageKey;
    }

    if (src) {
        photoEl.dataset.src = src;
    }

    const imgEl = document.createElement('img');
    imgEl.src = src;
    imgEl.alt = photoMeta?.originalname || 'Photo';
    imgEl.draggable = false;

    imgEl.style.width = '100%';
    imgEl.style.height = '100%';
    imgEl.style.objectFit = 'contain';
    imgEl.style.display = 'block';
    imgEl.style.maxWidth = 'none';
    imgEl.style.maxHeight = 'none';

    photoEl.appendChild(imgEl);

    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    // CSS and wireCanvasPhotoInteractions use the corner name encoded in each class.
    corners.forEach((pos) => {
        const handle = document.createElement('div');
        handle.className = 'canvas-photo-resize-handle canvas-photo-resize-' + pos;
        photoEl.appendChild(handle);
    });

    canvas.appendChild(photoEl);

    wireCanvasPhotoInteractions(photoEl);

    if (fromLayout) {
        // A restored layer keeps saved stacking order and should not be marked as a new edit.
        if (explicitZ !== null) {
            photoEl.style.zIndex = String(explicitZ);
            builderCanvasState.zCounter = Math.max(builderCanvasState.zCounter, explicitZ);
        } else {
            bringCanvasPhotoToFront(photoEl);
        }
        return photoEl;
    }

    if (imgEl.complete && imgEl.naturalWidth) {
        // Cached images can be measured now; uncached images wait for their first load event.
        sizeAndCenterCanvasPhoto(photoEl, imgEl);
    } else {
        imgEl.addEventListener(
            'load',
            function () {
                sizeAndCenterCanvasPhoto(photoEl, imgEl);
            },
            { once: true }
        );
    }

    markCanvasDirty();
    return photoEl;
}

function sizeAndCenterCanvasPhoto(photoEl, imgEl) {
    // Fit a new photo to a small portion of the legacy canvas without enlarging its source.
    const canvas = builderCanvasState.canvasEl || document.getElementById('builder-canvas');
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) return;

    const naturalWidth = imgEl.naturalWidth || 800;
    const naturalHeight = imgEl.naturalHeight || 600;

    const maxWidth = canvasRect.width * 0.15;
    const maxHeight = canvasRect.height * 0.15;

    const scale = Math.min(
        maxWidth / naturalWidth,
        maxHeight / naturalHeight,
        1
    );

    const width = Math.max(40, naturalWidth * scale);
    const height = Math.max(40, naturalHeight * scale);

    photoEl.style.width = `${width}px`;
    photoEl.style.height = `${height}px`;

    const left = (canvasRect.width - width) / 2;
    // Center first placement; later mouse interactions update these DOM coordinates.
    const top = (canvasRect.height - height) / 2;

    photoEl.style.left = `${Math.max(0, left)}px`;
    photoEl.style.top = `${Math.max(0, top)}px`;

    bringCanvasPhotoToFront(photoEl);
}

// Delete flow
function removePhotoChipForStorageKey(storageKey) {
    // Keep the upload strip in sync after the server and canvas photo have been removed.
    if (!storageKey) return;
    const strip = document.getElementById('builder-photo-strip');
    if (!strip) return;

    const chips = strip.querySelectorAll('.photo-chip');
    let removed = false;
    chips.forEach((chip) => {
        if (chip.dataset.storageKey === storageKey) {
            chip.remove();
            removed = true;
        }
    });

    if (removed) {
        const remaining = strip.querySelector('.photo-chip');
        if (!remaining) {
            strip.innerHTML = '<p class="panel-hint">No photos uploaded yet.</p>';
        }
    }
}

async function deleteBinderPhotoOnServer(binderId, storageKey) {
    // Call the same owned delete route used by the React editor's api.deleteBinderPhoto.
    if (!binderId || !storageKey) {
        throw new Error('deleteBinderPhotoOnServer requires binderId and storageKey');
    }

    const csrfToken = _getCSRFToken();
    const url = `/dashboard/binder/${encodeURIComponent(binderId)}/photos?storageKey=${encodeURIComponent(storageKey)}`;

    const headers = { 'Accept': 'application/json' };
    if (csrfToken) headers['x-csrf-token'] = csrfToken;

    const resp = await fetch(url, { method: 'DELETE', headers });

    // Do not remove DOM state unless both HTTP status and endpoint result confirm deletion.
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Delete failed with status ${resp.status}: ${text}`);
    }

    const data = await resp.json().catch(() => null);
    if (!data || !data.ok) {
        throw new Error('Delete endpoint returned an error response');
    }
}

function requestDeleteSelectedPhoto() {
  // Deleting a canvas photo also removes its stored binder asset. Confirmation and a
  // single async path keep the DOM and server from drifting apart on partial failure.
    const photoEl = builderCanvasState.selectedPhotoEl;
    if (!photoEl) {
        if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
            window.modalManager.showNotification(
                'No photo selected',
                'Click on a photo on the page first, then try deleting again.'
            );
        } else {
            alert('Please select a photo on the page first, then delete it.');
        }
        return;
    }

    const binderId = getBinderIdFromBody();
    const storageKey = photoEl.dataset.storageKey || null;

    const confirmMessage = storageKey
        ? 'Delete this photo from your binder? This will remove it from this page and from our storage.'
        : 'Delete this photo from this page?';

    const performDelete = async () => {
        // Storage-backed photos must succeed on the server before this legacy DOM is changed.
        if (binderId && storageKey) {
            try {
                await deleteBinderPhotoOnServer(binderId, storageKey);
            } catch (err) {
                log.error('Binder delete: server delete failed', { error: err?.message || String(err) });
                if (window.modalManager && typeof window.modalManager.showNotification === 'function') {
                    window.modalManager.showNotification(
                        'Delete failed',
                        'We could not delete this photo from storage right now. Please try again in a moment.'
                    );
                } else {
                    alert('We could not delete this photo from storage right now. Please try again.');
                }
                return;
            }
        } else if (!binderId && storageKey) {
            log.warn('Binder delete: storageKey present but binderId missing; deleting from layout only', { storageKey });
        }

        if (photoEl.parentElement) {
            // The async boundary has passed, so it is now safe to remove the visible photo.
            photoEl.parentElement.removeChild(photoEl);
        }
        if (builderCanvasState.selectedPhotoEl === photoEl) {
            builderCanvasState.selectedPhotoEl = null;
        }

        if (storageKey) {
            removePhotoChipForStorageKey(storageKey);
        }

        markCanvasDirty();
    };

    const mm = window.modalManager;
    // Prefer the shared modal UI, with native confirm as a safe page-level fallback.
    if (mm && typeof mm.showConfirm === 'function') {
        mm.showConfirm({
            title: 'Delete photo',
            message: confirmMessage,
            confirmLabel: 'Delete photo',
            onConfirm: () => { performDelete(); },
            onCancel: () => {}
        });
        return;
    }

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;
    performDelete();
}

function initializeDeletePhotoButton() {
    const btn = document.getElementById('builder-delete-photo-btn');
    if (!btn) {
        log.info('Delete photo button not found on page; skipping wiring');
        return;
    }

    btn.addEventListener('click', function () {
        requestDeleteSelectedPhoto();
    });

    log.info('Delete photo button wired');
}

// React editor button
function initializeReactEditorButton() {
    // This legacy dashboard button moves the user into App.jsx for persisted layout editing.
    const btn = document.getElementById('open-react-editor-btn');
    if (!btn) {
        log.info('React editor button not found on page; skipping wiring');
        return;
    }

    const binderId = getBinderIdFromBody();
    if (!binderId) {
        log.warn('React editor button: binderId is missing; disabling button');
        btn.disabled = true;
        btn.title = 'Binder is not ready yet. Please refresh or contact support.';
        return;
    }

    btn.addEventListener('click', function () {
        const targetUrl = `/dashboard/binder/${encodeURIComponent(binderId)}/editor`;
        log.info('Navigating to React binder editor', { binderId, targetUrl });
        window.location.href = targetUrl;
    });

    log.info('React editor button wired', { binderId });
}

// Submissions (existing functionality)
function initializeSubmissions() {
    const viewSubmissionsBtn = document.getElementById('viewSubmissionsBtn');
    const submissionsList = document.getElementById('submissionsList');

    if (!viewSubmissionsBtn || !submissionsList) {
        return;
    }

    viewSubmissionsBtn.addEventListener('click', function() {
        fetchSubmissions();
    });
}

async function fetchSubmissions() {
    const submissionsList = document.getElementById('submissionsList');

    try {
        const response = await fetch('/api/submissions');
        const data = await response.json();

        if (data.submissions && data.submissions.length > 0) {
            displaySubmissions(data.submissions);
            submissionsList.classList.remove('hidden');
        } else {
            submissionsList.innerHTML = '<p>No submissions found.</p>';
            submissionsList.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error fetching submissions:', error);
        submissionsList.innerHTML = '<p>Error loading submissions. Please try again.</p>';
        submissionsList.classList.remove('hidden');
    }
}

function displaySubmissions(submissions) {
    const submissionsList = document.getElementById('submissionsList');

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

    submissionsList.innerHTML = html;

    const hideBtn = document.getElementById('hideSubmissionsBtn');
    if (hideBtn) {
        hideBtn.addEventListener('click', function() {
            submissionsList.classList.add('hidden');
        });
    }
}
