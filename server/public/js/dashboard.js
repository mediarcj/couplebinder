// File: server/public/js/dashboard.js
// Description: Client-side JavaScript for dashboard functionality
// Purpose: Handles submissions and binder builder workspace (uploads to S3-backed route)
// Notes: Workspace is now a simple layout: left page strip + big canvas + photo strip

// -----------------------------------------------------------------------------
// Logger setup (safe fallback; no TDZ / self-reference problems)
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// XSS Protection: HTML Escape Function
// -----------------------------------------------------------------------------
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// -----------------------------------------------------------------------------
// Allowed image types for uploads (client-side)
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// Simple canvas state for selection, dragging, and resizing
// -----------------------------------------------------------------------------
const LAYOUT_AUTOSAVE_DEBOUNCE_MS = 1000;   // 1s after user stops changing layout
const LAYOUT_AUTOSAVE_INTERVAL_MS = 10000;  // 10s periodic safety autosave

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

    // resizing
    resizing: false,
    resizeHandle: null,
    resizeStartMouseX: 0,
    resizeStartMouseY: 0,
    resizeStartRect: null,
    resizeAspectRatio: 1,

    initialized: false,

    // layout saving state
    dirty: false,
    autoSaveTimerId: null,      // periodic autosave interval id
    saveDebounceId: null,       // debounce timer when user changes layout
    lastSaveError: null,
    lastSavedAt: null,
    saving: false,

    // binder + Supabase
    binderId: null,
    sbReady: false,
    sbUserId: null
};

function markCanvasDirty() {
    builderCanvasState.dirty = true;

    const statusEl = document.getElementById('builder-status-text');
    if (statusEl) {
        statusEl.textContent = 'Unsaved changes...';
    }

    if (builderCanvasState.saveDebounceId) {
        clearTimeout(builderCanvasState.saveDebounceId);
    }

    builderCanvasState.saveDebounceId = window.setTimeout(() => {
        const binderId = getBinderIdFromBody();
        if (!binderId) {
            log.warn('Binder layout: no binderId during debounced save');
            return;
        }

        saveCanvasLayoutIfDirty(binderId).catch((err) => {
            log.error('Binder layout: debounced save failed', {
                error: err?.message || String(err)
            });
        });
    }, LAYOUT_AUTOSAVE_DEBOUNCE_MS);
}

// -----------------------------------------------------------------------------
// CSRF helper
// -----------------------------------------------------------------------------
function _getCSRFToken() {
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

// -----------------------------------------------------------------------------
// DOMContentLoaded
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function() {
    initializeCanvasInteractions();  // drag/resize/delete
    initializeDashboard();
    initializeSubmissions();
    initializeBuilderWorkspace();
    initializeBinderLayoutAutosave();

    log.info('Dashboard page initialized - logout handled by logout.js module');
});

// -----------------------------------------------------------------------------
// Dashboard basics
// -----------------------------------------------------------------------------
function initializeDashboard() {
    log.info('Dashboard functionality initialized');
}

// -----------------------------------------------------------------------------
// Canvas interactions (drag / resize / delete)
// -----------------------------------------------------------------------------
function initializeCanvasInteractions() {
    if (builderCanvasState.initialized) return;

    const canvas = document.getElementById('builder-canvas');
    if (!canvas) return;

    builderCanvasState.canvasEl = canvas;
    builderCanvasState.initialized = true;

    // Global mouse move / up for dragging and resizing
    document.addEventListener('mousemove', handleCanvasMouseMove);
    document.addEventListener('mouseup', handleCanvasMouseUp);
    document.addEventListener('mouseleave', handleCanvasMouseUp);

    // Delete selected photo with Delete/Backspace
    document.addEventListener('keydown', handleCanvasKeyDown);

    log.info('Canvas interactions initialized');
}

function handleCanvasMouseMove(event) {
    const canvas = builderCanvasState.canvasEl;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) return;

    const photoEl = builderCanvasState.selectedPhotoEl;
    if (!photoEl) return;

    // Dragging
    if (builderCanvasState.dragging) {
        event.preventDefault();

        const dx = event.clientX - builderCanvasState.dragStartMouseX;
        const dy = event.clientY - builderCanvasState.dragStartMouseY;

        let newLeft = builderCanvasState.dragStartLeft + dx;
        let newTop = builderCanvasState.dragStartTop + dy;

        const width = photoEl.offsetWidth;
        const height = photoEl.offsetHeight;

        // Constrain inside canvas
        newLeft = Math.max(0, Math.min(newLeft, canvasRect.width - width));
        newTop = Math.max(0, Math.min(newTop, canvasRect.height - height));

        photoEl.style.left = `${newLeft}px`;
        photoEl.style.top = `${newTop}px`;
        return;
    }

    // Resizing
    if (builderCanvasState.resizing && builderCanvasState.resizeStartRect) {
        event.preventDefault();

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

        // Horizontal movement controls size (keep simple)
        if (isLeft) {
            width = rect0.width - dx;
        } else {
            width = rect0.width + dx;
        }

        // Keep aspect ratio
        width = Math.max(40, width);
        height = width / aspect;

        // Adjust origin depending on corner
        if (isLeft) {
            left = rect0.left + (rect0.width - width);
        }
        if (isTop) {
            top = rect0.top + (rect0.height - height);
        }

        // Constrain within canvas bounds
        if (left < 0) {
            left = 0;
        }
        if (top < 0) {
            top = 0;
        }

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
    builderCanvasState.dragging = false;
    builderCanvasState.resizing = false;
    builderCanvasState.resizeHandle = null;
    builderCanvasState.resizeStartRect = null;

    // If we had a selected photo and a drag/resize just ended, mark layout dirty
    if (builderCanvasState.selectedPhotoEl) {
        markCanvasDirty();
    }
}

/**
 * Delete selected photo with keyboard
 */
function handleCanvasKeyDown(event) {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;

    const photoEl = builderCanvasState.selectedPhotoEl;
    if (!photoEl) return;

    // Only delete if focus is not inside an input/textarea
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        return;
    }

    event.preventDefault();

    if (photoEl.parentElement) {
        photoEl.parentElement.removeChild(photoEl);
    }
    builderCanvasState.selectedPhotoEl = null;

    // Layout changed -> mark dirty
    markCanvasDirty();
}

function setSelectedCanvasPhoto(photoEl) {
    const canvas = builderCanvasState.canvasEl;
    if (!canvas) return;

    const all = canvas.querySelectorAll('.canvas-photo');
    all.forEach((el) => {
        el.classList.remove('canvas-photo-selected');
    });

    if (photoEl) {
        photoEl.classList.add('canvas-photo-selected');
        builderCanvasState.selectedPhotoEl = photoEl;
        bringCanvasPhotoToFront(photoEl);
    } else {
        builderCanvasState.selectedPhotoEl = null;
    }
}

function bringCanvasPhotoToFront(photoEl) {
    builderCanvasState.zCounter += 1;
    photoEl.style.zIndex = String(builderCanvasState.zCounter);
}

/**
 * Attach per-photo event handlers:
 * - select on click
 * - drag on mouse down
 * - resize on handle mouse down
 * - delete on right-click
 */
function wireCanvasPhotoInteractions(photoEl) {
    // Select + drag (left click on the box, not on handles)
    photoEl.addEventListener('mousedown', function (event) {
        if (event.button !== 0) return; // only left click

        // If they clicked a resize handle, resizing handler will take over
        if (event.target.classList.contains('canvas-photo-resize-handle')) {
            return;
        }

        event.preventDefault();

        const canvas = builderCanvasState.canvasEl;
        if (!canvas) return;

        setSelectedCanvasPhoto(photoEl);

        const canvasRect = canvas.getBoundingClientRect();
        const rect = photoEl.getBoundingClientRect();

        builderCanvasState.dragging = true;
        builderCanvasState.resizing = false;

        builderCanvasState.dragStartMouseX = event.clientX;
        builderCanvasState.dragStartMouseY = event.clientY;
        builderCanvasState.dragStartLeft = rect.left - canvasRect.left;
        builderCanvasState.dragStartTop = rect.top - canvasRect.top;
    });

    // Resize handles (corners)
    const handles = photoEl.querySelectorAll('.canvas-photo-resize-handle');
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

// -----------------------------------------------------------------------------
// Binder builder workspace
// -----------------------------------------------------------------------------

/**
 * Client-side image validation to mirror server rules.
 */
function isAllowedImageFile(file) {
    if (!file) return false;

    const type = file.type || '';
    const name = file.name || '';

    const mimeOk = type && ALLOWED_IMAGE_MIME_TYPES.has(type);
    const extOk = ALLOWED_IMAGE_EXTENSIONS.test(name);

    // Allow if either the mime type or the extension says "this is an image we support"
    return mimeOk || extOk;
}

/**
 * Read binderId from <body data-binder-id="">
 */
function getBinderIdFromBody() {
    try {
        const body = document.body;
        return body && body.dataset ? (body.dataset.binderId || '').trim() : '';
    } catch (e) {
        log.error('Builder workspace: failed to read binderId from body', { error: e?.message || String(e) });
        return '';
    }
}

/**
 * Initialize binder builder workspace
 *
 * WHAT:
 *  Wires up the "Add photos" button and hidden file input
 *  so uploads can be sent to the binder photo route.
 *
 * HOW:
 *  - Always wires the button -> file picker
 *  - If binderId is missing, we block uploads with a clear message + log
 */
function initializeBuilderWorkspace() {
    const binderId = getBinderIdFromBody();
    const addPhotosBtn = document.getElementById('builder-add-photos-btn');
    const fileInput = document.getElementById('builder-file-input');

    if (!addPhotosBtn || !fileInput) {
        log.error('Builder workspace: required elements not found, skipping wiring');
        return;
    }

    if (!binderId) {
        // We still wire the button so you can see a clear error instead of “doing nothing”.
        log.warn('Builder workspace: binderId is missing; uploads will be blocked until backend provides it');
    } else {
        log.info('Builder workspace: wiring upload handler', { binderId });
    }

    // Clicking the visible button opens the hidden file input
    addPhotosBtn.addEventListener('click', function () {
        if (!binderId) {
            // No binder id => do not attempt upload; show clear message.
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

    // When files are selected, upload them
    fileInput.addEventListener('change', function (event) {
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

        // Client-side filter: only keep allowed image types
        const safeFiles = files.filter(isAllowedImageFile);

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
            .catch((err) => {
                log.error('Builder workspace: uploadBinderPhotos failed', { error: err?.message || String(err) });
            })
            .finally(() => {
                // Reset the input so selecting the same file later still fires change
                fileInput.value = '';
            });
    });
}

// -----------------------------------------------------------------------------
// Binder layout autosave + restore (Supabase)
// -----------------------------------------------------------------------------

function initializeBinderLayoutAutosave() {
    const binderId = getBinderIdFromBody();
    if (!binderId) {
        log.warn('Binder layout: no binderId on page; autosave disabled');
        return;
    }

    function bootstrap() {
        if (!window.SB) {
            log.error('Binder layout: Supabase client (window.SB) not ready');
            return;
        }

        // 1) Restore last saved layout for this binder/page
        restoreCanvasLayoutFromSupabase(binderId)
            .catch((err) => {
                log.error('Binder layout: restore failed', { error: err?.message || String(err) });
            });

        // 2) Start periodic autosave every 10 seconds
        if (!builderCanvasState.autoSaveTimerId) {
            builderCanvasState.autoSaveTimerId = setInterval(() => {
                saveCanvasLayoutIfDirty(binderId).catch((err) => {
                    log.error('Binder layout: periodic save failed', { error: err?.message || String(err) });
                });
            }, LAYOUT_AUTOSAVE_INTERVAL_MS);
        }

        log.info('Binder layout: autosave + restore initialized', { binderId });
    }

    // If SB is already ready, bootstrap immediately; otherwise wait for sb-ready
    if (window.SB) {
        bootstrap();
    } else {
        document.addEventListener('sb-ready', bootstrap, { once: true });
    }
}

/**
 * Collect current canvas layout as relative percentages so it scales with A4.
 */
function collectCanvasLayout() {
    const canvas = document.getElementById('builder-canvas');
    if (!canvas) return null;

    const canvasRect = canvas.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) return null;

    const elements = Array.from(canvas.querySelectorAll('.canvas-photo')).map((el, idx) => {
        const r = el.getBoundingClientRect();

        const left = r.left - canvasRect.left;
        const top = r.top - canvasRect.top;

        const leftPct = left / canvasRect.width;
        const topPct = top / canvasRect.height;
        const widthPct = r.width / canvasRect.width;
        const heightPct = r.height / canvasRect.height;

        const zIndex = parseInt(el.style.zIndex || '1', 10) || 1;

        const src =
            el.dataset.src ||
            (el.querySelector('img') ? el.querySelector('img').src : '');

        return {
            id: el.dataset.id || `photo-${idx}`,
            src,
            storageKey: el.dataset.storageKey || null,
            leftPct,
            topPct,
            widthPct,
            heightPct,
            zIndex
        };
    });

    return {
        pageWidthPx: canvasRect.width,
        pageHeightPx: canvasRect.height,
        elements
    };
}

/**
 * Save layout only if it's marked dirty.
 */
async function saveCanvasLayoutIfDirty(binderId) {
    if (!builderCanvasState.dirty) return;
    if (!window.SB) {
        log.warn('Binder layout: save skipped, SB not ready');
        return;
    }

    const layout = collectCanvasLayout();
    if (!layout) {
        log.info('Binder layout: nothing to save (empty canvas)');
        builderCanvasState.dirty = false;
        return;
    }

    const statusEl = document.getElementById('builder-status-text');
    if (statusEl) {
        statusEl.textContent = 'Saving changes…';
    }

    try {
        // We need the Supabase auth user id to satisfy RLS (auth.uid())
        const { data: userData, error: userErr } = await window.SB.auth.getUser();
        if (userErr || !userData?.user?.id) {
            log.error('Binder layout: unable to read Supabase user', { error: userErr?.message });
            if (statusEl) {
                statusEl.textContent = 'Save error – auth not ready.';
            }
            return;
        }

        const userId = userData.user.id;

        const { error } = await window.SB
            .from('binder_layouts')
            .upsert(
                [
                    {
                        user_id: userId,
                        binder_id: binderId,
                        page_number: 1,
                        layout_json: layout
                    }
                ],
                {
                    onConflict: 'user_id,binder_id,page_number'
                }
            );

        if (error) {
            log.error('Binder layout: Supabase upsert failed', { error: error.message });
            builderCanvasState.lastSaveError = error.message;
            if (statusEl) {
                statusEl.textContent = 'Save error – will retry…';
            }
            return;
        }

        builderCanvasState.dirty = false;
        builderCanvasState.lastSaveError = null;
        if (statusEl) {
            statusEl.textContent = 'All changes saved.';
        }
    } catch (e) {
        log.error('Binder layout: unexpected save error', { error: e?.message || String(e) });
        if (statusEl) {
            statusEl.textContent = 'Save error – will retry…';
        }
    }
}

/**
 * Restore the latest layout for this binder/page from Supabase.
 */
async function restoreCanvasLayoutFromSupabase(binderId) {
    if (!window.SB) {
        log.warn('Binder layout: restore skipped, SB not ready');
        return;
    }

    const statusEl = document.getElementById('builder-status-text');
    if (statusEl) {
        statusEl.textContent = 'Loading last saved layout…';
    }

    try {
        // RLS will automatically filter to this user’s rows; we only filter by binder/page
        const { data, error } = await window.SB
            .from('binder_layouts')
            .select('layout_json')
            .eq('binder_id', binderId)
            .eq('page_number', 1)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            log.error('Binder layout: restore query failed', { error: error.message });
            if (statusEl) {
                statusEl.textContent = 'Could not restore last layout.';
            }
            return;
        }

        if (!data || !data.layout_json) {
            log.info('Binder layout: nothing to restore for this binder yet');
            if (statusEl) {
                statusEl.textContent = 'Ready. No saved layout yet.';
            }
            return;
        }

        let layout = data.layout_json;
        if (typeof layout === 'string') {
            try {
                layout = JSON.parse(layout);
            } catch (e) {
                log.error('Binder layout: failed to parse layout_json string', {
                    error: e?.message || String(e)
                });
                if (statusEl) {
                    statusEl.textContent = 'Could not restore last layout.';
                }
                return;
            }
        }

        await rebuildCanvasFromLayout(binderId, layout);

        // After restoring, we consider the layout "clean" until user changes something.
        builderCanvasState.dirty = false;
        builderCanvasState.lastSaveError = null;

        if (statusEl) {
            statusEl.textContent = 'Canvas restored from last saved layout.';
        }
    } catch (e) {
        log.error('Binder layout: unexpected restore error', { error: e?.message || String(e) });
        if (statusEl) {
            statusEl.textContent = 'Could not restore last layout.';
        }
    }
}

/**
 * Ask the backend for a fresh signed URL for this storageKey.
 */
async function resolvePhotoSrcFromStorageKey(binderId, storageKey) {
    if (!binderId || !storageKey) return null;

    try {
        const url = `/dashboard/binder/${encodeURIComponent(
            binderId
        )}/photos/view-url?storageKey=${encodeURIComponent(storageKey)}`;

        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!resp.ok) {
            log.warn('Binder layout: view-url endpoint returned non-200', {
                status: resp.status
            });
            return null;
        }

        const data = await resp.json().catch(() => null);
        if (!data || !data.ok || !data.url) {
            log.warn('Binder layout: view-url endpoint returned no url', { data });
            return null;
        }

        return data.url;
    } catch (e) {
        log.error('Binder layout: failed to resolve photo src from storageKey', {
            error: e?.message || String(e)
        });
        return null;
    }
}

/**
 * Actually rebuild the DOM canvas from a stored layout object.
 * IMPORTANT: we now ignore any stale el.src and use storageKey -> fresh signed URL.
 */
async function rebuildCanvasFromLayout(binderId, layout) {
    const canvas = document.getElementById('builder-canvas');
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) return;

    // Clear placeholder and any existing photos
    const placeholder = canvas.querySelector('.builder-canvas-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    canvas.querySelectorAll('.canvas-photo').forEach((el) => el.remove());

    const elements = Array.isArray(layout.elements) ? layout.elements : [];

    for (let idx = 0; idx < elements.length; idx++) {
        const el = elements[idx];
        if (!el) continue;

        const storageKey = el.storageKey || null;
        if (!storageKey) {
            log.warn('Binder layout: element missing storageKey, skipping', { idx, el });
            continue;
        }

        // Always get a fresh URL from the backend
        const src = await resolvePhotoSrcFromStorageKey(binderId, storageKey);
        if (!src) {
            log.warn('Binder layout: could not resolve src for storageKey', {
                storageKey
            });
            continue;
        }

        const photoEl = createCanvasPhotoElement(
            canvas,
            src,
            { storageKey, originalname: `Photo ${idx + 1}` },
            {
                fromLayout: true,
                zIndex: typeof el.zIndex === 'number' ? el.zIndex : undefined
            }
        );

        const leftPct = typeof el.leftPct === 'number' ? el.leftPct : 0;
        const topPct = typeof el.topPct === 'number' ? el.topPct : 0;
        const widthPct = typeof el.widthPct === 'number' ? el.widthPct : 0.3;
        const heightPct = typeof el.heightPct === 'number' ? el.heightPct : 0.2;

        const left = leftPct * canvasRect.width;
        const top = topPct * canvasRect.height;
        const width = widthPct * canvasRect.width;
        const height = heightPct * canvasRect.height;

        photoEl.style.left = `${left}px`;
        photoEl.style.top = `${top}px`;
        photoEl.style.width = `${width}px`;
        photoEl.style.height = `${height}px`;
    }

    log.info('Binder layout: canvas rebuilt from saved layout', {
        elementCount: elements.length
    });
}

/**
 * Upload photos to the binder photos endpoint.
 *
 * This hits your route:
 *   POST /dashboard/binder/:binderId/photos
 */
async function uploadBinderPhotos(binderId, files) {
    if (!binderId) {
        throw new Error('Missing binderId for upload');
    }

    const csrfToken = _getCSRFToken();
    const formData = new FormData();

    files.forEach((file) => {
        // "photos" matches the Multer field name you use on the server
        formData.append('photos', file);
    });

    const endpoint = `/dashboard/binder/${encodeURIComponent(binderId)}/photos`;

    log.info('Builder workspace: uploading photos to binder', {
        binderId,
        count: files.length,
        endpoint
    });

    const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type manually; the browser sets proper multipart boundary.
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

    log.info('Builder workspace: upload succeeded', {
        binderId,
        uploadedCount: data?.uploadedCount,
        photos: data?.photos?.length
    });

    try {
        // 1) update the strip
        refreshPhotoStrip(data);
        // 2) drop new photos onto the canvas
        addUploadedPhotosToCanvas(data);
    } catch (e) {
        log.error('Builder workspace: post-upload handling failed', { error: e?.message || String(e) });
    }
}

/**
 * Simple renderer: show uploaded photos as chips in the strip.
 */
function refreshPhotoStrip(data) {
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

/**
 * Take the uploaded photos from the server response and add them to the canvas.
 * Expects data.photos to include a URL we can load.
 */
function addUploadedPhotosToCanvas(data) {
    if (!data || !Array.isArray(data.photos) || !data.photos.length) return;

    const canvas = document.getElementById('builder-canvas');
    if (!canvas) return;

    // Remove placeholder if present
    const placeholder = canvas.querySelector('.builder-canvas-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    data.photos.forEach((photo) => {
        // Prefer signed URL (for private buckets), then public URL variants
        const src =
            photo.signedUrl ||
            photo.publicUrl ||
            photo.url ||
            photo.previewUrl ||
            '';

        if (!src) {
            log.warn('Canvas: photo has no URL, skipping', { photo });
            return;
        }

        createCanvasPhotoElement(canvas, src, photo);
    });
}

/**
 * Create a draggable/resizable photo element on the canvas.
 * New photos start roughly 15% of canvas size, centered.
 *
 * options:
 *  - fromLayout: true if we are restoring from Supabase (do NOT recenter, do NOT mark dirty)
 *  - zIndex: optional explicit zIndex to apply
 */
function createCanvasPhotoElement(canvas, src, photoMeta, options = {}) {
    const fromLayout = options.fromLayout === true;
    const explicitZ = typeof options.zIndex === 'number' ? options.zIndex : null;

    const photoEl = document.createElement('div');
    photoEl.className = 'canvas-photo';

    if (photoMeta && photoMeta.storageKey) {
        photoEl.dataset.storageKey = photoMeta.storageKey;
    }

    // Store src so we can rebuild layout later
    if (src) {
        photoEl.dataset.src = src;
    }

    const imgEl = document.createElement('img');
    imgEl.src = src;
    imgEl.alt = photoMeta?.originalname || 'Photo';
    imgEl.draggable = false;
    photoEl.appendChild(imgEl);

    // Add resize handles
    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    corners.forEach((pos) => {
        const handle = document.createElement('div');
        handle.className = 'canvas-photo-resize-handle canvas-photo-resize-' + pos;
        photoEl.appendChild(handle);
    });

    canvas.appendChild(photoEl);

    // Make sure interactions are wired for this element
    wireCanvasPhotoInteractions(photoEl);

    if (fromLayout) {
        // Layout restore: caller will set width/height/top/left.
        // Only set zIndex and bump our counter.
        if (explicitZ !== null) {
            photoEl.style.zIndex = String(explicitZ);
            builderCanvasState.zCounter = Math.max(builderCanvasState.zCounter, explicitZ);
        } else {
            bringCanvasPhotoToFront(photoEl);
        }
        return photoEl;
    }

    // New upload: size & center once the image is ready
    if (imgEl.complete && imgEl.naturalWidth) {
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

    // New photo on canvas => mark dirty
    markCanvasDirty();

    return photoEl;
}

/**
 * Size photo to about 15% of canvas (by width/height) and center it.
 */
/**
 * Size photo to about 15% of canvas (by width/height) and center it.
 */
function sizeAndCenterCanvasPhoto(photoEl, imgEl) {
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
    const top = (canvasRect.height - height) / 2;

    photoEl.style.left = `${Math.max(0, left)}px`;
    photoEl.style.top = `${Math.max(0, top)}px`;

    bringCanvasPhotoToFront(photoEl);
}

// -----------------------------------------------------------------------------
// Submissions (existing functionality)
// -----------------------------------------------------------------------------
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