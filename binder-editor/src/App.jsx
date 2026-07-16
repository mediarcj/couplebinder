// Description: Main React component for binder editor
// Purpose: Canvas editor with pages, layers, drag/resize + autosave

import React, { useState, useEffect, useCallback, useRef } from 'react';
// App uses this small API layer for saved layouts, protected photos, and PDF export.
import {
  getLayout,
  applyLayout,
  exportBinderPdf,
  deleteBinderPhoto,
  uploadBinderPhotos,
  getPhotoViewUrl
} from './api';
import { useModal } from './ModalProvider';
import Canvas from './Canvas';
import PageList from './PageList';
import ActionSidebar from './ActionSidebar';
import './App.css';
import { SECTION_LABELS, SECTION_OPTIONS } from './sections';
import { preloadBinderPhotos } from './preloadPhotos';
import MobileMenu from './MobileMenu';
import { captureImageDimensions } from './utils/imageDimensions';

const AUTOSAVE_DEBOUNCE_MS = 1500;

// A4 at 96 DPI (same as elsewhere)
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1122;

// Photo layers store TOTAL height (image area + caption).
// Must match CSS (.layer-caption-shell).
const CAPTION_H = 88;

function isSessionExpiredError(err) {
  // The API helper uses this exact message after it has already redirected to login.
  return !!err && err.message === 'SESSION_EXPIRED';
}

function uuidv4Fallback() {
  // Build a browser-generated UUID for page/layer identity when randomUUID is unavailable.
  const bytes = new Uint8Array(16);
  // These masks set the version and variant bits expected by the UUID v4 format.
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function makeId() {
  try {
    // Prefer the platform helper, while keeping the fallback for older supported browsers.
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return uuidv4Fallback();
}

function ensurePageIds(pages) {
  // PageList uses stable IDs for drag-and-drop, including layouts saved before IDs existed.
  const arr = Array.isArray(pages) ? pages : [];
  return arr.map((p) => ({ ...p, id: p?.id || makeId() }));
}

function computeCascadingPhotoFrame({ index, aspectRatio = 1 }) {
  // 1. Start with a safe image ratio and a frame sized relative to the logical A4 page.
  // 2. Cap tall images, add caption room, then move repeated uploads by a small offset.
  // 3. Clamp the final frame so Canvas receives geometry that starts inside the page.
  const safeAr = typeof aspectRatio === 'number' && aspectRatio > 0 ? aspectRatio : 1;

  // Use the photo ratio for its image area; the saved height also includes the caption.
  let w = Math.round(PAGE_WIDTH * 0.55);
  let imageH = Math.round(w / safeAr);
  const maxImageH = Math.round(PAGE_HEIGHT * 0.55);

  if (imageH > maxImageH) {
    // Recalculate width from the capped height so portrait photos keep their proportions.
    imageH = maxImageH;
    w = Math.round(imageH * safeAr);
  }

  const totalH = imageH + CAPTION_H;

  const baseX = Math.round((PAGE_WIDTH - w) / 2);
  const baseY = Math.round((PAGE_HEIGHT - totalH) / 2);
  const step = 24;
  // A small repeating offset keeps new uploads visible instead of stacking them exactly.
  // Modulo keeps a large upload batch from walking off the page.
  const offset = (index % 8) * step;

  const x = Math.min(Math.max(baseX + offset, 0), PAGE_WIDTH - w);
  const y = Math.min(Math.max(baseY + offset, 0), PAGE_HEIGHT - totalH);

  // App stores this geometry on the new layer and Canvas reads it on the next render.
  return { x, y, width: w, height: totalH };
}

function App({ binderId }) {
  // This component owns the editor workflow: the saved layout, current selection,
  // upload progress, and save/export actions shared by the smaller UI components.
  // Keep the server layout and the visible page together because most editor actions need both.
  const [layout, setLayout] = useState(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preloadProgress, setPreloadProgress] = useState({ done: 0, total: 0 });
  // ModalProvider supplies the one shared dialog owner used for preview and delete prompts.
  const { openModal } = useModal();

  // These flags feed the sidebar/menu labels and stop overlapping save or export actions.
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [isDirty, setIsDirty] = useState(false);
  // Initial-load state keeps the autosave effect from writing the layout it just received.
  const [hasLoadedInitialLayout, setHasLoadedInitialLayout] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [selectedLayerId, setSelectedLayerId] = useState(null);

  // Preview and download use separate flags because they finish in different UI destinations.
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [zoom, setZoom] = useState(1);
  // These refs reach the measured canvas shell and the hidden upload input without extra renders.
  const canvasStageRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mobilePageListOpen, setMobilePageListOpen] = useState(false);

  // Keep latest layout in a ref (for saves that run later).
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Refs give async saves the latest layout without rebuilding every callback. The
  // revision counter tells us whether a completed save fell behind newer edits.
  const dirtyRevRef = useRef(0);
  const markDirty = useCallback(() => {
    // Every real layout edit advances the revision that flushSaveNow compares after saving.
    dirtyRevRef.current += 1;
    setIsDirty(true);
  }, []);

  // Prevent overlapping saves; queue at most one follow-up.
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);

  // Older layouts predate sections. Only infer defaults when the whole layout is old;
  // once any page has a section, blank values are treated as intentional.
  const applySectionDefaults = useCallback((pages) => {
    // Return an empty list for malformed server data so the editor can still open safely.
    if (!Array.isArray(pages)) return [];
    const anyHasSection = pages.some((p) => p && p.sectionKey);
    return pages.map((page, idx) => {
      if (!page) return page;
      // The first legacy page becomes Overview; later legacy pages become Photos.
      const sectionKey = page.sectionKey
        ? page.sectionKey
        : anyHasSection
        ? null
        : idx === 0
        ? 'overview'
        : 'photos';
      return { ...page, sectionKey };
    });
  }, []);

  const flushSaveNow = useCallback(
    async ({ reason } = {}) => {
      // 1. Refuse an incomplete save and collapse overlapping requests into one queued retry.
      // 2. Send one stable snapshot through api.applyLayout and update the save indicators.
      // 3. Clear dirty state only when no newer revision appeared during the request.
      if (!binderId) return;
      if (!layoutRef.current) return;

      if (saveInFlightRef.current) {
        // One boolean is enough because the queued save reads the newest layoutRef snapshot.
        saveQueuedRef.current = true;
        return;
      }

      saveInFlightRef.current = true;
      saveQueuedRef.current = false;

      // Save a stable snapshot and remember its revision. Edits made while the request is
      // in flight remain dirty and cause the queued follow-up save below.
      const startRev = dirtyRevRef.current;
      const snapshot = layoutRef.current;

      try {
        // Clear an older error as soon as a fresh save attempt begins.
        setSaving(true);
        setError(null);

        const result = await applyLayout(binderId, snapshot);

        if (result?.ok) {
          // Keep the server timestamp with the local layout for status display and later loads.
          setLayout((prev) => (prev ? { ...prev, updatedAt: result.updatedAt } : prev));
          setLastSavedAt(result.updatedAt || new Date().toISOString());
        }

        // Only clear dirty if nothing changed since we started this save.
        if (dirtyRevRef.current === startRev) {
          setIsDirty(false);
        }
      } catch (err) {
        // api.request already owns the redirect, so this component only handles other failures.
        if (isSessionExpiredError(err)) return;
        setError(err.message || `Save failed${reason ? ` (${reason})` : ''}`);
        console.error('[BinderEditor] Save failed:', err);
      } finally {
        // Release the in-flight guard before starting any save that accumulated behind it.
        setSaving(false);
        saveInFlightRef.current = false;

        if (saveQueuedRef.current) {
          saveQueuedRef.current = false;
          // Run queued save on next tick.
          setTimeout(() => {
            // The empty catch prevents a detached timer promise from becoming unhandled.
            flushSaveNow({ reason: 'queued' }).catch(() => {});
          }, 0);
        }
      }
    },
    [binderId]
  );

  useEffect(() => {
    // Selection belongs to the canvas. Clicking its empty space, or leaving the editor
    // entirely, clears the active layer without coupling every child to this state.
    const handleGlobalMouseDown = (e) => {
      const root = document.getElementById('binder-editor-root');
      if (!root) return;

      if (!root.contains(e.target)) {
        setSelectedLayerId(null);
        return;
      }

      const canvas = root.querySelector('.binder-editor-canvas');
      if (!canvas) return;

      if (!canvas.contains(e.target)) return;

      const layerEl = e.target.closest('.binder-editor-layer');
      if (!layerEl) setSelectedLayerId(null);
    };

    document.addEventListener('mousedown', handleGlobalMouseDown);
    // Remove the document listener when App unmounts so another editor mount gets one copy.
    return () => document.removeEventListener('mousedown', handleGlobalMouseDown);
  }, []);

  function pickInitialPage(pages) {
    // Open on useful content when possible, while retaining the first-page fallback for
    // a new or entirely empty binder.
    if (!Array.isArray(pages) || pages.length === 0) return 0;

    const withPhotos = pages.findIndex(
      (page) =>
        Array.isArray(page.layers) &&
        page.layers.some(
          (layer) =>
            layer &&
            layer.type === 'photo' &&
            (layer.storageKey || layer.src || layer.photoId)
        )
    );
    // A page containing a real photo reference is more useful than a text-only page on reopen.
    if (withPhotos >= 0) return withPhotos;

    const nonEmpty = pages.findIndex(
      (page) => Array.isArray(page.layers) && page.layers.length > 0
    );
    if (nonEmpty >= 0) return nonEmpty;

    return 0;
  }

  useEffect(() => {
    // This controller and mounted flag belong to one binderId load cycle.
    let mounted = true;
    const ac = new AbortController();

    // Hydrate the editor first, then warm photo URLs/bytes before removing the loading
    // screen. Abort and mounted checks keep a binder switch from updating stale state.
    async function load() {
      try {
        setLoading(true);

        const data = await getLayout(binderId);
        if (!mounted) return;

        if (data.ok && data.layout) {
          // Keep only the editor fields App expects, then normalize older section/page shapes.
          const safeLayout = {
            binderId,
            pages: applySectionDefaults(
              Array.isArray(data.layout.pages) ? data.layout.pages : []
            ),
            updatedAt: data.layout.updatedAt || new Date().toISOString()
          };

          safeLayout.pages = ensurePageIds(safeLayout.pages).map((page, index) => ({
            // Saved order wins when present; missing layer lists become editable empty arrays.
            ...page,
            pageIndex: typeof page.pageIndex === 'number' ? page.pageIndex : index,
            layers: Array.isArray(page.layers) ? page.layers : []
          }));

          setLayout(safeLayout);
          // The status bar and initial page now come from this normalized local copy.
          setLastSavedAt(safeLayout.updatedAt);
          if (safeLayout.pages.length > 0) setSelectedPage(pickInitialPage(safeLayout.pages));

          // Reset dirty state after initial load.
          dirtyRevRef.current = 0;
          setIsDirty(false);

          const result = await preloadBinderPhotos({
            // preloadPhotos resolves private view URLs and warms bytes before the canvas appears.
            binderId,
            layout: safeLayout,
            signal: ac.signal,
            onProgress: (p) => {
              // Ignore late progress from a binder that unmounted while requests were finishing.
              if (!mounted) return;
              setPreloadProgress({
                done: Number(p.done || 0),
                total: Number(p.total || 0)
              });
            }
          });

          if (result?.aborted) console.warn('[BinderEditor] preload aborted');
        } else {
          // A binder with no stored layout still needs the normal local shape for adding pages.
          setLayout({ binderId, pages: [], updatedAt: new Date().toISOString() });
          setLastSavedAt(null);
        }

        setHasLoadedInitialLayout(true);
      } catch (err) {
        // Keep a redirecting session error quiet; other load errors remain visible in App.
        if (!mounted) return;
        if (isSessionExpiredError(err)) return;
        setError(err.message);
        console.error('[BinderEditor] Failed to load layout:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      // Stop both React state updates and pending preload requests when the binder changes.
      mounted = false;
      try {
        ac.abort();
      } catch {}
    };
  }, [binderId, applySectionDefaults]);

  useEffect(() => {
    // Fit reacts to both window changes and editor-shell changes (for example a sidebar
    // opening). The short debounce avoids repeated layout work during resize.
    const calculateFitZoom = () => {
      if (!canvasStageRef.current) return;

      // Measure the available shell rather than the window because sidebars also change width.
      const stageRect = canvasStageRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth <= 900;
      const padding = isMobile ? 16 : 24;
      const paddingTotal = padding * 2;

      const availableWidth = Math.max(200, stageRect.width - paddingTotal);
      const availableHeight = Math.max(200, stageRect.height - paddingTotal);

      const zoomX = availableWidth / PAGE_WIDTH;
      const zoomY = availableHeight / PAGE_HEIGHT;
      // Never enlarge during automatic fit; users can still zoom above 100% themselves.
      const fitZoom = Math.min(zoomX, zoomY, 1);

      setZoom((prevZoom) => {
        if (Math.abs(prevZoom - fitZoom) < 0.01) return prevZoom;
        return fitZoom;
      });
    };

    const timeoutId = setTimeout(calculateFitZoom, 100);

    // Debounce both sources into the same calculation to avoid flicker during layout changes.
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(calculateFitZoom, 150);
    };

    window.addEventListener('resize', handleResize);

    const observer = new ResizeObserver(() => {
      // ResizeObserver catches workspace changes that do not fire a window resize event.
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(calculateFitZoom, 150);
    });
    if (canvasStageRef.current) observer.observe(canvasStageRef.current);

    return () => {
      // Clear timers as well as observers so no measurement runs after the DOM is gone.
      clearTimeout(timeoutId);
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  const handleZoomChange = useCallback((newZoom) => {
    // Keep manual zoom inside a usable range before Canvas applies it to the page scale.
    setZoom(Math.max(0.25, Math.min(2, newZoom)));
  }, []);

  const handleZoomFit = useCallback(() => {
    // This immediate version supports the explicit Fit button in Canvas.
    if (!canvasStageRef.current) return;
    const stageRect = canvasStageRef.current.getBoundingClientRect();
    const availableWidth = stageRect.width - 48;
    const availableHeight = stageRect.height - 48;
    const zoomX = availableWidth / PAGE_WIDTH;
    const zoomY = availableHeight / PAGE_HEIGHT;
    const fitZoom = Math.min(zoomX, zoomY, 1);
    setZoom(fitZoom);
  }, []);

  useEffect(() => {
    // Wait until a real user edit exists, then restart this timer after each layout change.
    if (!hasLoadedInitialLayout) return;
    if (!layout) return;
    if (!isDirty) return;

    const timer = setTimeout(() => {
      // flushSaveNow still protects against an export or manual save already in progress.
      flushSaveNow({ reason: 'autosave' }).catch(() => {});
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [layout, isDirty, hasLoadedInitialLayout, flushSaveNow]);

  const updateLayer = useCallback(
    (layerId, updates) => {
      // Keep edits immutable so React sees the changed page, then send persistence
      // through the same dirty-state path used by page and section changes.
      setLayout((prev) => {
        if (!prev || !prev.pages || !prev.pages[selectedPage]) return prev;

        const newPages = [...prev.pages];
        const page = { ...newPages[selectedPage] };
        page.layers = (page.layers || []).map((layer) =>
          layer.id === layerId ? { ...layer, ...updates } : layer
        );
        newPages[selectedPage] = page;

        return { ...prev, pages: newPages };
      });
      markDirty();
    },
    [selectedPage, markDirty]
  );

  // Kept for Canvas prop compatibility; should be a no-op unless you actually implement it.
  const handleAddPhoto = useCallback(() => {}, []);

  const handleAddPhotosClick = useCallback(() => {
    // The visible sidebar/mobile button forwards to the one hidden native file input below.
    fileInputRef.current?.click();
  }, []);

  const handleUploadPhotos = useCallback(
    async (files) => {
      // Stop before network work when the browser did not supply files or a binder route key.
      if (!files || !files.length) return;
      if (!binderId) return;

      try {
        // Upload first, resolve protected view URLs, then add the frames in one layout
        // update. This keeps partially resolved uploads out of the editable page.
        const data = await uploadBinderPhotos(binderId, files);
        if (!data || !Array.isArray(data.photos)) return;

        const photoDataWithAspectRatios = await Promise.all(
          // Resolve every upload in parallel so a large selection does not wait serially.
          data.photos.map(async (photo) => {
            const storageKey = photo.storageKey || null;

            // Prefer server-provided url, otherwise ask view-url endpoint.
            let url =
              photo.url ||
              photo.signedUrl ||
              photo.publicUrl ||
              photo.previewUrl ||
              photo.src ||
              null;

            if (!url && storageKey) {
              // The API helper asks the protected view-url controller and caches its answer.
              url = await getPhotoViewUrl(binderId, storageKey).catch(() => null);
            }

            if (!url) {
              return { ...photo, url: null, aspectRatio: 1, naturalWidth: 0, naturalHeight: 0 };
            }

            // Natural dimensions let the first frame preserve the photo's real aspect
            // ratio. A failed metadata read should not discard an otherwise valid upload.
            try {
              const { naturalWidth, naturalHeight, aspectRatio } = await captureImageDimensions(url);
              return { ...photo, url, aspectRatio, naturalWidth, naturalHeight };
            } catch {
              return { ...photo, url, aspectRatio: 1, naturalWidth: 0, naturalHeight: 0 };
            }
          })
        );

        setLayout((prev) => {
          // Use the latest state because uploads may finish after another local page edit.
          const base = prev || { binderId, pages: [], updatedAt: new Date().toISOString() };
          const pages = [...(base.pages || [])];

          if (!pages[selectedPage]) {
            // Uploading into an empty binder creates the selected page before adding layers.
            pages[selectedPage] = { id: makeId(), pageIndex: selectedPage, layers: [] };
          }

          const page = { ...pages[selectedPage] };
          page.layers = Array.isArray(page.layers) ? [...page.layers] : [];
          const nextLayers = [...page.layers];

          photoDataWithAspectRatios.forEach((photo) => {
            // Each server photo becomes one saved photo layer with its storage identity intact.
            const url = photo.url || null;

            const imageAspectRatio =
              typeof photo.aspectRatio === 'number' && photo.aspectRatio > 0
                ? photo.aspectRatio
                : 1;

            const totalFrame = computeCascadingPhotoFrame({
              // Existing layer count also keeps this upload batch from landing in one stack.
              index: nextLayers.length,
              aspectRatio: imageAspectRatio
            });

            nextLayers.push({
              id: makeId(),
              type: 'photo',
              x: totalFrame.x,
              y: totalFrame.y,
              width: totalFrame.width,
              height: totalFrame.height,
              rotation: 0,
              zIndex: nextLayers.length,
              photoId: photo.photoId || null,
              storageKey: photo.storageKey || null,
              src: url,
              photoAspectRatio: imageAspectRatio,
              photoNaturalWidth: photo.naturalWidth || 0,
              photoNaturalHeight: photo.naturalHeight || 0
            });
          });

          pages[selectedPage] = { ...page, layers: nextLayers };

          // Section defaults are applied here too because this may be the binder's first page.
          return { ...base, pages: applySectionDefaults(pages) };
        });

        markDirty();
      } catch (err) {
        // Keep the current layout untouched if any required upload stage fails.
        if (isSessionExpiredError(err)) return;
        console.error('[BinderEditor] Upload exception', err);
        setError(err.message || 'Upload failed due to a network error. Please try again.');
      }
    },
    [binderId, selectedPage, applySectionDefaults, markDirty]
  );

  const handleFileChange = useCallback(
    async (e) => {
      // Copy FileList before awaiting, then clear the input so choosing the same file works again.
      const files = Array.from(e.target.files || []);
      await handleUploadPhotos(files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleUploadPhotos]
  );

  const handleSelectLayer = useCallback((layerId) => {
    // Canvas and Layer report selection here; null is the shared no-selection value.
    setSelectedLayerId(layerId || null);
  }, []);

  const handleSectionChange = useCallback(
    (pageIndex, sectionKey) => {
      // PageList/Canvas send the page index and sections.js key selected by the user.
      setLayout((prev) => {
        if (!prev || !prev.pages || !prev.pages[pageIndex]) return prev;
        const pages = [...prev.pages];
        pages[pageIndex] = { ...pages[pageIndex], sectionKey };
        return { ...prev, pages };
      });
      markDirty();
    },
    [markDirty]
  );

  // Placeholder: only mark dirty if you actually change layout.
  const handleTidyLayout = useCallback(() => {}, []);

  const removeLayer = useCallback(
    async (layerId) => {
      // Read the latest page snapshot because a confirmation dialog may stay open during edits.
      const current = layoutRef.current;
      const page = current?.pages?.[selectedPage];
      const layer = page?.layers?.find((l) => l.id === layerId);
      if (!layer) throw new Error('Layer not found');

      if (layer?.storageKey && binderId) {
        // Delete the owned storage/database photo first so the UI does not hide a failed cleanup.
        await deleteBinderPhoto(binderId, layer.storageKey);
      }

      setLayout((prev) => {
        // Remove only the confirmed layer from the current React layout.
        if (!prev || !prev.pages || !prev.pages[selectedPage]) return prev;
        const newPages = [...prev.pages];
        const p = { ...newPages[selectedPage] };
        p.layers = (p.layers || []).filter((l) => l.id !== layerId);
        newPages[selectedPage] = p;
        return { ...prev, pages: newPages };
      });

      markDirty();
    },
    [selectedPage, binderId, markDirty]
  );

  const handleReorderPages = useCallback(
    (fromIndex, toIndex) => {
      if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') return;
      if (fromIndex === toIndex) return;

      // Keep the same logical page selected as surrounding pages move past it.
      setSelectedPage((prevSelected) => {
        if (prevSelected === fromIndex) return toIndex;

        if (fromIndex < toIndex && prevSelected > fromIndex && prevSelected <= toIndex) {
          return prevSelected - 1;
        }

        if (toIndex < fromIndex && prevSelected >= toIndex && prevSelected < fromIndex) {
          return prevSelected + 1;
        }

        return prevSelected;
      });

      setLayout((prev) => {
        if (!prev || !Array.isArray(prev.pages)) return prev;

        // Move a shallow copy, then rewrite pageIndex to match the new persisted order.
        const pages = [...prev.pages];
        if (!pages[fromIndex] || toIndex < 0 || toIndex >= pages.length) return prev;

        const [moved] = pages.splice(fromIndex, 1);
        pages.splice(toIndex, 0, moved);

        const normalizedPages = pages.map((p, idx) => ({
          ...p,
          pageIndex: idx
        }));

        return { ...prev, pages: normalizedPages };
      });

      markDirty();
    },
    [markDirty]
  );

  const handleDeletePage = useCallback(
    async (pageIndexToDelete) => {
      // Remove the page from the layout, then clean up storage only for photos that are
      // no longer referenced. Cleanup failures are collected so the layout can still save.
      const current = layoutRef.current;
      if (!current || !Array.isArray(current.pages)) return;
      if (typeof pageIndexToDelete !== 'number') return;
      if (pageIndexToDelete < 0 || pageIndexToDelete >= current.pages.length) return;

      const pagesBefore = current.pages;
      // Take photo keys from the deleted page before removing it from the local array.
      const pageToDelete = pagesBefore[pageIndexToDelete];
      const layers = Array.isArray(pageToDelete?.layers) ? pageToDelete.layers : [];

      const keysOnDeletedPage = new Set(
        layers
          .filter((l) => l && l.type === 'photo' && l.storageKey)
          .map((l) => String(l.storageKey))
      );

      const keysUsedElsewhere = new Set();
      // Scan all remaining pages because the same storage photo can appear more than once.
      pagesBefore.forEach((p, idx) => {
        if (!p || idx === pageIndexToDelete) return;
        const otherLayers = Array.isArray(p.layers) ? p.layers : [];
        otherLayers.forEach((l) => {
          if (l && l.type === 'photo' && l.storageKey) {
            keysUsedElsewhere.add(String(l.storageKey));
          }
        });
      });

      // A photo may be placed on more than one page. Delete storage only when the page
      // being removed held the last remaining reference.
      const keysToDelete = [...keysOnDeletedPage].filter((k) => !keysUsedElsewhere.has(k));

      const failures = [];
      if (binderId && keysToDelete.length > 0) {
        // Delete sequentially so each failure can be reported without cancelling later cleanup.
        for (const storageKey of keysToDelete) {
          try {
            await deleteBinderPhoto(binderId, storageKey);
          } catch (err) {
            if (isSessionExpiredError(err)) return;
            failures.push(storageKey);
          }
        }
      }

      const newPages = pagesBefore
        // Reindex immediately because the server validator expects order and pageIndex to agree.
        .filter((_, idx) => idx !== pageIndexToDelete)
        .map((p, idx) => ({
          ...p,
          pageIndex: idx,
          layers: Array.isArray(p?.layers) ? p.layers : []
        }));

      setLayout((prev) => {
        if (!prev) return prev;
        return { ...prev, pages: applySectionDefaults(newPages) };
      });

      const nextLen = newPages.length;
      // Keep selection in range and prefer the page that slides into the deleted position.
      setSelectedPage((prevSelected) => {
        if (prevSelected === pageIndexToDelete) {
          return nextLen > 0 ? Math.min(pageIndexToDelete, nextLen - 1) : 0;
        }
        if (prevSelected > pageIndexToDelete) return prevSelected - 1;
        return prevSelected;
      });

      setSelectedLayerId(null);
      // Page removal changes the persisted layout even if some best-effort storage cleanup failed.
      markDirty();

      if (failures.length > 0) {
        setError(
          `Page deleted, but ${failures.length} photo(s) could not be deleted from storage. Please retry deleting those photos later.`
        );
      }
    },
    [binderId, applySectionDefaults, markDirty]
  );

  const handlePreviewPdf = useCallback(async () => {
    // Ignore repeated clicks and wait until App has both a binder route key and layout snapshot.
    if (previewing || !binderId || !layoutRef.current) return;

    let url = null;

    try {
      // Export runs from the persisted server layout, so flush local edits first.
      if (isDirty) {
        await flushSaveNow({ reason: 'preview' });
      }

      setPreviewing(true);

      // api.exportBinderPdf calls the controller that rebuilds the PDF from saved rows.
      const blob = await exportBinderPdf(binderId);
      // The modal owns the object URL lifetime and revokes it when the preview closes.
      url = window.URL.createObjectURL(blob);

      openModal({
        // ModalProvider renders PdfPreviewModal and calls this cleanup when it is replaced/closed.
        kind: 'pdf',
        title: 'PDF Preview',
        subtitle: '(A4-size)',
        pdfUrl: url,
        onClose: () => {
          if (url) {
            try {
              window.URL.revokeObjectURL(url);
            } catch {}
          }
        }
      });
    } catch (err) {
      if (isSessionExpiredError(err)) return;

      // Revoke a URL created before a later modal setup failure so browser memory is released.
      if (url) {
        try {
          window.URL.revokeObjectURL(url);
        } catch {}
      }

      setError(`Preview failed: ${err.message}`);
      console.error('[BinderEditor] Preview failed:', err);
    } finally {
      setPreviewing(false);
    }
  }, [previewing, binderId, isDirty, flushSaveNow, openModal]);

  const handleExportPdf = useCallback(async () => {
    // Keep the download path single-flight just like preview.
    if (exporting || !binderId || !layoutRef.current) return;

    try {
      // As with preview, the server can only render the most recently saved layout.
      if (isDirty) {
        await flushSaveNow({ reason: 'export' });
      }

      setExporting(true);
      const blob = await exportBinderPdf(binderId);

      // A temporary anchor turns the in-memory PDF response into a normal browser download.
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `binder-${binderId || 'export'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // The browser has accepted the click, so the temporary object URL is no longer needed.
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (isSessionExpiredError(err)) return;
      setError(`Export failed: ${err.message}`);
      console.error('[BinderEditor] Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [binderId, isDirty, exporting, flushSaveNow]);

  if (loading) {
    // Convert preload counts into the bounded percentage shown on the startup card.
    const done = preloadProgress?.done || 0;
    const total = preloadProgress?.total || 0;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="w-full max-w-md mx-auto px-6">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900">
                  Loading your binder…
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Preloading photos so page switching is instant.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600 tabular-nums">
                <span>{pct}%</span>
                <span>{total > 0 ? `${done} / ${total}` : 'Starting…'}</span>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              You may see a short delay only when adding new photos or after cache expiry.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentPage =
    // Canvas always receives a page-shaped object, including before the first page is added.
    layout?.pages?.[selectedPage] || { pageIndex: selectedPage, layers: [] };

  return (
    <div
      className="binder-editor-app flex flex-col min-h-full bg-slate-50"
      onContextMenu={(e) => e.preventDefault()}
    >
      {error && (
        // Async handlers write errors here so the editor can remain open and retryable.
        <div className="binder-editor-error max-w-2xl mx-auto mb-3 rounded-lg border border-rose-100 bg-rose-50 text-rose-800 shadow-sm">
          <p>Error: {error}</p>
          <button className="btn btn-small mt-2" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="binder-editor-workspace flex-1">
        <div className="binder-binder-card flex h-full bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          {mobilePageListOpen && (
            // Tapping this backdrop closes the mobile PageList without changing selection.
            <div
              className="mobile-page-list-overlay"
              onClick={() => setMobilePageListOpen(false)}
              aria-hidden="true"
            />
          )}

          <PageList
            /* PageList owns presentation/drag gestures; these callbacks keep layout ownership here. */
            pages={layout?.pages || []}
            selectedPageIndex={selectedPage}
            sectionLabels={SECTION_LABELS}
            onSelectPage={(idx) => setSelectedPage(idx)}
            onReorderPages={handleReorderPages}
            onAddPage={() => {
              // Both desktop page controls use this same immutable append-and-dirty sequence.
              setLayout((prev) => {
                if (!prev) {
                  return {
                    binderId,
                    pages: applySectionDefaults([{ id: makeId(), pageIndex: 0, layers: [] }]),
                    updatedAt: new Date().toISOString()
                  };
                }

                const pages = prev.pages || [];
                const nextIndex = pages.length;

                const newPages = [
                  ...pages,
                  { id: makeId(), pageIndex: nextIndex, layers: [] }
                ];

                return { ...prev, pages: applySectionDefaults(newPages) };
              });
              markDirty();
            }}
            onDeletePage={handleDeletePage}
            mobileOverlayOpen={mobilePageListOpen}
            onCloseMobileOverlay={() => setMobilePageListOpen(false)}
          />

          <div className="workspace-canvas-wrapper">
            <Canvas
              /* Canvas receives one page plus callbacks; App remains the source of saved truth. */
              page={{ ...currentPage, binderId: layout?.binderId || binderId }}
              layers={currentPage.layers || []}
              onUpdateLayer={updateLayer}
              onAddLayer={handleAddPhoto}
              onRemoveLayer={removeLayer}
              sectionKey={currentPage.sectionKey}
              sectionLabels={SECTION_LABELS}
              sectionOptions={SECTION_OPTIONS}
              onSectionChange={handleSectionChange}
              selectedLayerId={selectedLayerId}
              onSelectLayer={handleSelectLayer}
              zoom={zoom}
              onZoomChange={handleZoomChange}
              onZoomFit={handleZoomFit}
              canvasStageRef={canvasStageRef}
              onToggleMobilePageList={() => setMobilePageListOpen(!mobilePageListOpen)}
              onAddPage={() => {
                // The mobile canvas control mirrors PageList's add behavior for the same layout.
                setLayout((prev) => {
                  if (!prev) {
                    return {
                      binderId,
                      pages: applySectionDefaults([{ id: makeId(), pageIndex: 0, layers: [] }]),
                      updatedAt: new Date().toISOString()
                    };
                  }

                  const pages = prev.pages || [];
                  const nextIndex = pages.length;

                  const newPages = [
                    ...pages,
                    { id: makeId(), pageIndex: nextIndex, layers: [] }
                  ];

                  return { ...prev, pages: applySectionDefaults(newPages) };
                });
                markDirty();
              }}
              onDeletePage={handleDeletePage}
            />
          </div>
        </div>

        <ActionSidebar
          /* The desktop sidebar reports intent here and does not inspect layout internals itself. */
          onAddPhoto={handleAddPhotosClick}
          onDeleteSelected={() => {
            // Explain missing selection before attempting to find or delete a layer.
            if (!selectedLayerId) {
              openModal({
                title: 'No photo selected',
                body:
                  'To delete a photo, first click a photo on the page to select it, then click "Delete photo" again.',
                confirmLabel: 'Got it',
                cancelLabel: null,
                onConfirm: () => {}
              });
              return;
            }

            const p = layoutRef.current?.pages?.[selectedPage];
            // Re-read the layer after the dialog click because selection state can outlive a render.
            const layer = p?.layers?.find((l) => l.id === selectedLayerId);

            if (!layer) {
              setError('Photo not found. Please refresh the page.');
              return;
            }

            const hasStorageKey = layer?.storageKey && binderId;

            // Tell the user when deletion also reaches the server-side storage provider.
            const confirmMessage = hasStorageKey
              ? 'Delete this photo from your binder? This will remove it from this page and from our storage.'
              : 'Delete this photo from this page?';

            openModal({
              title: 'Delete photo',
              body: confirmMessage,
              confirmLabel: 'Delete photo',
              cancelLabel: 'Cancel',
              onConfirm: async () => {
                // removeLayer coordinates the API deletion and the local layout update.
                try {
                  await removeLayer(selectedLayerId);
                  setSelectedLayerId(null);
                } catch (err) {
                  if (isSessionExpiredError(err)) return;
                  setError(`Failed to delete photo: ${err.message}`);
                }
              }
            });
          }}
          onPreviewPdf={handlePreviewPdf}
          previewing={previewing}
          onExportPdf={handleExportPdf}
          onTidyLayout={handleTidyLayout}
          saving={saving}
          exporting={exporting}
          canExport={Boolean(binderId && layout && !loading)}
        />
      </div>

      <input
        /* Keep native file selection available without duplicating an input in each menu. */
        type="file"
        ref={fileInputRef}
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif"
        multiple
        hidden
        onChange={handleFileChange}
      />

      <MobileMenu
        /* Mobile controls reuse the same handlers and confirmation rules as ActionSidebar. */
        onAddPhoto={handleAddPhotosClick}
        onDeletePhoto={() => {
          if (!selectedLayerId) return;
          const layer = currentPage.layers?.find((l) => l.id === selectedLayerId);
          if (!layer) return;

          // Match the desktop warning when the photo also has a server storage record.
          const hasStorageKey = layer?.storageKey && binderId;

          const confirmMessage = hasStorageKey
            ? 'Delete this photo from your binder? This will remove it from this page and from our storage.'
            : 'Delete this photo from this page?';

          openModal({
            kind: 'confirm',
            title: 'Delete photo',
            body: confirmMessage,
            confirmLabel: 'Delete photo',
            cancelLabel: 'Cancel',
            onConfirm: async () => {
              // Keep mobile deletion on the shared removeLayer path so persistence stays identical.
              try {
                await removeLayer(selectedLayerId);
                setSelectedLayerId(null);
              } catch (err) {
                if (isSessionExpiredError(err)) return;
                setError(`Failed to delete photo: ${err.message}`);
              }
            }
          });
        }}
        onTidy={handleTidyLayout}
        onExportPdf={handleExportPdf}
        onPreviewPdf={handlePreviewPdf}
        canDelete={!!selectedLayerId}
      />
    </div>
  );
}

export default App;
