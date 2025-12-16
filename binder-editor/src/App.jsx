// File: binder-editor/src/App.jsx
// Description: Main React component for binder editor
// Purpose: Canvas editor with pages, layers, drag/resize + autosave

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLayout,
  applyLayout,
  autoLayout,
  exportBinderPdf,
  deleteBinderPhoto
} from './api';
import { useModal } from './ModalProvider';
import Canvas from './Canvas';
import PageList from './PageList';
import ActionSidebar from './ActionSidebar';
import './App.css';
import { SECTION_LABELS, SECTION_OPTIONS } from './sections';
import { preloadBinderPhotos } from './preloadPhotos';

const AUTOSAVE_DEBOUNCE_MS = 1500; // 1.5s after last change

// A4 at 96 DPI (same as elsewhere)
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1122;
const PAGE_GUTTER = 12;

// Simple rectangle overlap helper in page coordinates
function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return !(
    x1 + w1 <= x2 ||
    x1 >= x2 + w2 ||
    y1 + h1 <= y2 ||
    y1 >= y2 + h2
  );
}

function hasCollision(x, y, width, height, rects) {
  if (!rects || rects.length === 0) return false;
  for (const r of rects) {
    if (!r) continue;
    const rw = typeof r.width === 'number' ? r.width : 0;
    const rh = typeof r.height === 'number' ? r.height : 0;
    if (rw <= 0 || rh <= 0) continue;
    if (rectsOverlap(x, y, width, height, r.x, r.y, rw, rh)) {
      return true;
    }
  }
  return false;
}

/**
 * Find the largest available rectangle on the page that:
 * - Stays inside the page (with a gutter)
 * - Does not overlap any existing rects
 * - Uses a roughly square aspect ratio (for now: 1:1, same as previous 200x200)
 *
 * Strategy:
 * - Start from a "max" size (page minus gutters)
 * - Step scale down until we find a fit
 * - For each size, scan candidate positions on a grid and pick the first free slot
 * - If nothing fits, fall back to a centered medium rectangle
 */
function findLargestAvailableRect(existingRects, aspectRatio = 1) {
  const gutter = PAGE_GUTTER;
  const maxWidth = PAGE_WIDTH - gutter * 2;
  const maxHeight = PAGE_HEIGHT - gutter * 2;

  const minSize = 150; // do not make new photos tiny
  const maxScale = 1.0;
  const minScale = Math.max(minSize / maxWidth, 0.3);

  for (let scale = maxScale; scale >= minScale; scale -= 0.1) {
    // Base width from horizontal room
    let width = maxWidth * scale;
    let height = width / aspectRatio;

    // If that makes it too tall, clamp by vertical room instead
    if (height > maxHeight * scale) {
      height = maxHeight * scale;
      width = height * aspectRatio;
    }

    if (width < minSize || height < minSize) {
      continue;
    }

    const stepX = Math.max(16, width / 4);
    const stepY = Math.max(16, height / 4);

    for (
      let y = gutter;
      y <= PAGE_HEIGHT - height - gutter;
      y += stepY
    ) {
      for (
        let x = gutter;
        x <= PAGE_WIDTH - width - gutter;
        x += stepX
      ) {
        if (!hasCollision(x, y, width, height, existingRects)) {
          return {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height)
          };
        }
      }
    }
  }

  // Fallback: centered medium rectangle
  const fallbackWidth = Math.max(minSize, maxWidth * 0.5);
  const fallbackHeight = Math.max(
    minSize,
    Math.min(maxHeight * 0.5, fallbackWidth / aspectRatio)
  );
  const fx = Math.round((PAGE_WIDTH - fallbackWidth) / 2);
  const fy = Math.round((PAGE_HEIGHT - fallbackHeight) / 2);

  return {
    x: fx,
    y: fy,
    width: Math.round(fallbackWidth),
    height: Math.round(fallbackHeight)
  };
}

/**
 * Compute an initial frame for a new photo on the current page, based purely
 * on the existing layout rectangles in memory (no DOM).
 *
 * - Keeps the new photo inside the page
 * - Avoids overlaps with existing layers on that page
 * - Makes the new photo as large as possible for the available free area
 */
function computeInitialPhotoFrame(pages, selectedPageIndex, aspectRatio = 1) {
  const pagesArray = Array.isArray(pages) ? pages : [];
  const page =
    pagesArray[selectedPageIndex] || {
      pageIndex: selectedPageIndex,
      layers: []
    };

  const layers = Array.isArray(page.layers) ? page.layers : [];

  const existingRects = layers.map((l) => ({
    x: typeof l.x === 'number' ? l.x : 0,
    y: typeof l.y === 'number' ? l.y : 0,
    width: typeof l.width === 'number' ? l.width : 0,
    height: typeof l.height === 'number' ? l.height : 0
  }));

  const rect = findLargestAvailableRect(existingRects, aspectRatio);

  return {
    ...rect,
    zIndex: layers.length // put new photo on top of existing layers
  };
}

// Shared helper: compute login URL and redirect on session expiry
function redirectToLoginForSessionExpiry() {
  try {
    const returnTo = window.location.pathname + window.location.search;
    const loginUrl = `/login?reason=session_expired&returnTo=${encodeURIComponent(
      returnTo
    )}`;
    window.location.replace(loginUrl);
  } catch {
    window.location.href = '/login?reason=session_expired';
  }
}

// Shared helper: check sentinel error thrown by api.js handleSessionExpiry()
function isSessionExpiredError(err) {
  return !!err && err.message === 'SESSION_EXPIRED';
}

function uuidv4Fallback() {
  // RFC4122-ish v4, good enough for IDs
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function makePageId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return uuidv4Fallback();
}

function ensurePageIds(pages) {
  const arr = Array.isArray(pages) ? pages : [];
  return arr.map((p) => ({
    ...p,
    id: p?.id || makePageId()
  }));
}

function App({ binderId /*, csrfToken */ }) {
  const [layout, setLayout] = useState(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preloadProgress, setPreloadProgress] = useState({ done: 0, total: 0 });
  const { openModal } = useModal();

  // saving = "we are writing layout to Supabase" (autosave OR auto layout)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Autosave state
  const [isDirty, setIsDirty] = useState(false);
  const [hasLoadedInitialLayout, setHasLoadedInitialLayout] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const canvasStageRef = useRef(null);
  const fileInputRef = useRef(null);

  const applySectionDefaults = useCallback((pages) => {
    if (!Array.isArray(pages)) return [];
    const anyHasSection = pages.some((p) => p && p.sectionKey);
    return pages.map((page, idx) => {
      if (!page) return page;
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

  // Deselect any selected layer when clicking on empty canvas area,
  // or anywhere completely outside the editor. Do NOT clear selection
  // when clicking on sidebars/toolbars.
  useEffect(() => {
    const handleGlobalMouseDown = (e) => {
      const root = document.getElementById('binder-editor-root');
      if (!root) return;

      // 1) Click completely outside the React binder editor island → clear selection
      if (!root.contains(e.target)) {
        setSelectedLayerId(null);
        return;
      }

      // 2) Inside the app: only clear when clicking the canvas area, not layers
      const canvas = root.querySelector('.binder-editor-canvas');
      if (!canvas) return;

      // If click is not inside the canvas at all, ignore it (keep selection)
      if (!canvas.contains(e.target)) {
        return;
      }

      // Click is in the canvas, but if it's not on a layer, clear selection
      const layerEl = e.target.closest('.binder-editor-layer');
      if (!layerEl) {
        setSelectedLayerId(null);
      }
    };

    document.addEventListener('mousedown', handleGlobalMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleGlobalMouseDown);
    };
  }, []);

  // Decide which page to land on first:
  // - Prefer the first page that actually has a real photo layer
  //   (storageKey / src / photoId).
  // - If there is none, fall back to the first non-empty page.
  // - Otherwise, use page 0.
  function pickInitialPage(pages) {
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
    if (withPhotos >= 0) return withPhotos;

    const nonEmpty = pages.findIndex(
      (page) => Array.isArray(page.layers) && page.layers.length > 0
    );
    if (nonEmpty >= 0) return nonEmpty;

    return 0;
  }

  // Load layout on mount
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getLayout(binderId);

        if (data.ok && data.layout) {
          const safeLayout = {
            binderId,
            pages: applySectionDefaults(
              Array.isArray(data.layout.pages) ? data.layout.pages : []
            ),
            updatedAt: data.layout.updatedAt || new Date().toISOString()
          };

          // Ensure each page has a stable id, and pageIndex is present/sequential
          safeLayout.pages = ensurePageIds(safeLayout.pages).map((page, index) => ({
            ...page,
            pageIndex:
              typeof page.pageIndex === 'number' ? page.pageIndex : index,
            layers: Array.isArray(page.layers) ? page.layers : []
          }));

          setLayout(safeLayout);
          setLastSavedAt(safeLayout.updatedAt);
          if (safeLayout.pages.length > 0) {
            setSelectedPage(pickInitialPage(safeLayout.pages));
          }
          // Preload ALL photo bytes across ALL pages before unlocking UI
          // so tab switching feels instant (disk cache warmed).
          const ac = new AbortController();
          const result = await preloadBinderPhotos({
            binderId,
            layout: safeLayout,
            signal: ac.signal,
            onProgress: (p) => {
              // p.total might be null early; normalize
              setPreloadProgress({
                done: Number(p.done || 0),
                total: Number(p.total || 0)
              });
            }
          });

          // If something aborted, just continue (don’t deadlock loading)
          if (result?.aborted) {
            console.warn('[BinderEditor] preload aborted');
          }
        } else {
          const emptyLayout = {
            binderId,
            pages: [],
            updatedAt: new Date().toISOString()
          };
          setLayout(emptyLayout);
          setLastSavedAt(null);
        }

        setHasLoadedInitialLayout(true);
      } catch (err) {
        if (isSessionExpiredError(err)) {
          // api.js already redirected; just bail
          return;
        }
        setError(err.message);
        console.error('[BinderEditor] Failed to load layout:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [binderId, applySectionDefaults]);

  // Calculate "fit to page" zoom on mount and window resize
  useEffect(() => {
    const calculateFitZoom = () => {
      if (!canvasStageRef.current) return;

      const stageRect = canvasStageRef.current.getBoundingClientRect();
      const availableWidth = stageRect.width - 48; // padding
      const availableHeight = stageRect.height - 48; // padding

      // Actual A4 dimensions at 96 DPI
      const a4Width = 794;
      const a4Height = 1122;

      // Calculate zoom to fit both dimensions
      const zoomX = availableWidth / a4Width;
      const zoomY = availableHeight / a4Height;
      const fitZoom = Math.min(zoomX, zoomY, 1); // Don't zoom in beyond 100%

      setZoom(fitZoom);
    };

    // Calculate initial fit
    const timeoutId = setTimeout(calculateFitZoom, 100);

    const handleResize = () => {
      clearTimeout(timeoutId);
      setTimeout(calculateFitZoom, 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Zoom handlers
  const handleZoomChange = useCallback((newZoom) => {
    setZoom(Math.max(0.25, Math.min(2, newZoom))); // Clamp between 25% and 200%
  }, []);

  const handleZoomFit = useCallback(() => {
    if (!canvasStageRef.current) return;
    const stageRect = canvasStageRef.current.getBoundingClientRect();
    const availableWidth = stageRect.width - 48;
    const availableHeight = stageRect.height - 48;
    const a4Width = 794;
    const a4Height = 1122;
    const zoomX = availableWidth / a4Width;
    const zoomY = availableHeight / a4Height;
    const fitZoom = Math.min(zoomX, zoomY, 1);
    setZoom(fitZoom);
  }, []);

  // Autosave effect – runs when layout changes and isDirty = true
  useEffect(() => {
    if (!hasLoadedInitialLayout) return;
    if (!layout) return;
    if (!isDirty) return;

    const timer = setTimeout(() => {
      (async () => {
        try {
          setSaving(true);
          setError(null);
          const result = await applyLayout(binderId, layout);
          if (result.ok) {
            // Update updatedAt only (pages are already in memory)
            setLayout((prev) => ({
              ...(prev || {}),
              updatedAt: result.updatedAt
            }));
            setIsDirty(false);
            setLastSavedAt(result.updatedAt || new Date().toISOString());
          }
        } catch (err) {
          if (isSessionExpiredError(err)) {
            // Redirect already handled
            return;
          }
          setError(err.message);
          console.error('[BinderEditor] Autosave failed:', err);
        } finally {
          setSaving(false);
        }
      })();
    }, AUTOSAVE_DEBOUNCE_MS);

    // If user keeps editing, cancel previous timer and start a new one
    return () => clearTimeout(timer);
  }, [binderId, layout, isDirty, hasLoadedInitialLayout]);

  // Auto layout (server algorithm). This already saves to DB.
  const handleAutoLayout = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      const result = await autoLayout(binderId, {});
      if (result.ok && result.layout) {
        const safeLayout = {
          binderId,
          pages: applySectionDefaults(
            Array.isArray(result.layout.pages) ? result.layout.pages : []
          ),
          updatedAt: result.layout.updatedAt || new Date().toISOString()
        };

        safeLayout.pages = safeLayout.pages.map((page, index) => ({
          pageIndex:
            typeof page.pageIndex === 'number' ? page.pageIndex : index,
          layers: Array.isArray(page.layers) ? page.layers : [],
          ...page
        }));

        setLayout(safeLayout);

        if (safeLayout.pages.length > 0) {
          setSelectedPage(pickInitialPage(safeLayout.pages));
        } else {
          setSelectedPage(0);
        }

        // Auto layout wrote to DB, so editor is not dirty
        setIsDirty(false);
        setLastSavedAt(safeLayout.updatedAt);
      }
    } catch (err) {
      if (isSessionExpiredError(err)) {
        return;
      }
      setError(err.message);
      console.error('[BinderEditor] Failed to auto layout:', err);
    } finally {
      setSaving(false);
    }
  }, [binderId, applySectionDefaults]);

  // Update layer in current page
  const updateLayer = useCallback(
    (layerId, updates) => {
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
      setIsDirty(true);
    },
    [selectedPage]
  );

  // NOTE: handleAddPhoto is currently unused in this setup, but kept for completeness.
  const handleAddPhoto = useCallback(
    () => {
      setLayout((prev) => {
        const base = prev || {
          binderId,
          pages: [],
          updatedAt: new Date().toISOString()
        };

        const pages = [...(base.pages || [])];
        if (!pages[selectedPage]) {
          pages[selectedPage] = { pageIndex: selectedPage, layers: [] };
        }

        const frame = computeInitialPhotoFrame(pages, selectedPage, 1);
        const newLayer = {
          id: `layer-${Date.now()}`,
          type: 'photo',
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          rotation: 0,
          zIndex: frame.zIndex,
          photoId: null
        };

        const page = { ...pages[selectedPage] };
        page.layers = [...(page.layers || []), newLayer];
        pages[selectedPage] = page;

        return {
          ...base,
          pages: applySectionDefaults(pages)
        };
      });
      setIsDirty(true);
    },
    [binderId, selectedPage, applySectionDefaults]
  );

  const handleAddPhotosClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleUploadPhotos = useCallback(
    async (files) => {
      if (!files || !files.length) return;
      if (!binderId) return;

      const csrfToken =
        document
          .querySelector('#binder-editor-root')
          ?.getAttribute('data-csrf-token') || '';

      const formData = new FormData();
      files.forEach((file) => formData.append('photos', file));

      try {
        const res = await fetch(
          `/dashboard/binder/${encodeURIComponent(binderId)}/photos`,
          {
            method: 'POST',
            body: formData,
            headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
            credentials: 'same-origin'
          }
        );

        if (res.status === 401 || res.status === 403) {
          // Session expired while uploading → kick to login
          redirectToLoginForSessionExpiry();
          return;
        }

        if (!res.ok) {
          console.error('[BinderEditor] Upload failed', res.status);
          setError('Upload failed. Please try again.');
          return;
        }

        const data = await res.json().catch(() => null);
        if (!data || !Array.isArray(data.photos)) return;

        // Place all new photos on the current page in memory in one pass,
        // using collision-aware, "largest that fits" placement for each.
        setLayout((prev) => {
          const base = prev || {
            binderId,
            pages: [],
            updatedAt: new Date().toISOString()
          };

          const pages = [...(base.pages || [])];

          if (!pages[selectedPage]) {
            pages[selectedPage] = { pageIndex: selectedPage, layers: [] };
          }

          const page = { ...pages[selectedPage] };
          page.layers = Array.isArray(page.layers) ? [...page.layers] : [];

          // Build existing rect list once, and extend it as we place new photos
          const existingRects = page.layers.map((l) => ({
            x: typeof l.x === 'number' ? l.x : 0,
            y: typeof l.y === 'number' ? l.y : 0,
            width: typeof l.width === 'number' ? l.width : 0,
            height: typeof l.height === 'number' ? l.height : 0
          }));

          const nextLayers = [...page.layers];

          data.photos.forEach((photo, idx) => {
            const url =
              photo.signedUrl ||
              photo.publicUrl ||
              photo.url ||
              photo.previewUrl ||
              photo.src ||
              null;

            // For now, treat new photos as square; user can resize later.
            const frame = findLargestAvailableRect(existingRects, 1);

            const newLayer = {
              id: `layer-upload-${Date.now()}-${idx}`,
              type: 'photo',
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height,
              rotation: 0,
              zIndex: nextLayers.length, // put on top of existing
              photoId: null,
              storageKey: photo.storageKey || null,
              src: url
            };

            nextLayers.push(newLayer);
            existingRects.push({
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height
            });
          });

          const updatedPage = {
            ...page,
            layers: nextLayers
          };

          pages[selectedPage] = updatedPage;

          return {
            ...base,
            pages: applySectionDefaults(pages)
          };
        });

        setIsDirty(true);
      } catch (err) {
        console.error('[BinderEditor] Upload exception', err);
        setError('Upload failed due to a network error. Please try again.');
      }
    },
    // FIX: remove addLayer and layout?.pages from dependencies
    [binderId, selectedPage, applySectionDefaults]
  );

  const handleFileChange = useCallback(
    async (e) => {
      const files = Array.from(e.target.files || []);
      await handleUploadPhotos(files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [handleUploadPhotos]
  );

  const handleSelectLayer = useCallback((layerId) => {
    setSelectedLayerId(layerId || null);
  }, []);

  const handleSectionChange = useCallback((pageIndex, sectionKey) => {
    setLayout((prev) => {
      if (!prev || !prev.pages || !prev.pages[pageIndex]) return prev;
      const pages = [...prev.pages];
      pages[pageIndex] = { ...pages[pageIndex], sectionKey };
      return { ...prev, pages };
    });
    setIsDirty(true);
  }, []);

  const handleTidyLayout = useCallback(() => {
    setLayout((prev) => {
      if (!prev || !prev.pages || !prev.pages[selectedPage]) return prev;
      const pages = [...prev.pages];
      const page = { ...pages[selectedPage] };
      const layers = [...(page.layers || [])];

      const photos = layers.filter((l) => l.type === 'photo');
      if (photos.length === 0) return prev;

      // Actual A4 at 96 DPI: 794px × 1122px
      const PAGE_W = 794;
      const PAGE_H = 1122;
      const gutter = 12;

      const placeLayer = (layer, left, top, width, height) => {
        layer.x = Math.max(0, Math.min(left, PAGE_W - width));
        layer.y = Math.max(0, Math.min(top, PAGE_H - height));
        layer.width = width;
        layer.height = height;
        return layer;
      };

      const updatePhoto = (idx, fn) => {
        const photo = photos[idx];
        if (!photo) return;
        const updated = fn({ ...photo });
        const pos = layers.findIndex((l) => l.id === photo.id);
        if (pos >= 0) layers[pos] = updated;
      };

      if (photos.length === 1) {
        const w = Math.floor(PAGE_W * 0.7);
        const h = Math.floor(PAGE_H * 0.7);
        const x = Math.floor((PAGE_W - w) / 2);
        const y = Math.floor((PAGE_H - h) / 2);
        updatePhoto(0, (p) => placeLayer(p, x, y, w, h));
      } else if (photos.length === 2) {
        const w = Math.floor(PAGE_W * 0.48);
        const h = Math.floor(PAGE_H * 0.45);
        const y = gutter * 2;
        updatePhoto(0, (p) => placeLayer(p, gutter, y, w, h));
        updatePhoto(1, (p) =>
          placeLayer(p, PAGE_W - w - gutter, y, w, h)
        );
      } else if (photos.length === 3 || photos.length === 4) {
        const w = Math.floor(PAGE_W * 0.45);
        const h = Math.floor(PAGE_H * 0.35);
        const positions = [
          [gutter, gutter * 2],
          [PAGE_W - w - gutter, gutter * 2],
          [gutter, h + gutter * 3],
          [PAGE_W - w - gutter, h + gutter * 3]
        ];
        for (let i = 0; i < Math.min(photos.length, 4); i += 1) {
          const [x, y] = positions[i];
          updatePhoto(i, (p) => placeLayer(p, x, y, w, h));
        }
      } else if (photos.length > 4) {
        const w = Math.floor(PAGE_W * 0.45);
        const h = Math.floor(PAGE_H * 0.35);
        const positions = [
          [gutter, gutter * 2],
          [PAGE_W - w - gutter, gutter * 2],
          [gutter, h + gutter * 3],
          [PAGE_W - w - gutter, h + gutter * 3]
        ];
        for (let i = 0; i < 4; i += 1) {
          const [x, y] = positions[i];
          updatePhoto(i, (p) => placeLayer(p, x, y, w, h));
        }
      }

      pages[selectedPage] = { ...page, layers };
      setIsDirty(true);
      return { ...prev, pages };
    });
  }, [selectedPage]);

  // Delete layer and underlying photo from storage/DB if it has a storageKey
  const removeLayer = useCallback(
    async (layerId) => {
      // Find the layer to get its storageKey
      const currentPage = layout?.pages?.[selectedPage];
      const layer = currentPage?.layers?.find((l) => l.id === layerId);

      if (!layer) {
        console.error('[BinderEditor] Layer not found in removeLayer', {
          layerId,
          selectedPage,
          availableLayers: currentPage?.layers?.map((l) => l.id)
        });
        throw new Error('Layer not found');
      }

      // If layer has a storageKey, delete from server first
      if (layer?.storageKey && binderId) {
        try {
          await deleteBinderPhoto(binderId, layer.storageKey);
        } catch (err) {
          console.error('[BinderEditor] deleteBinderPhoto API error', err);

          if (isSessionExpiredError(err)) {
            // Redirect already handled
            return;
          }

          // Show error but still remove from layout so UI stays responsive
          setError(`Failed to delete photo from storage: ${err.message}`);
          // Continue to remove from layout even if server delete failed
        }
      }

      // Remove layer from layout
      setLayout((prev) => {
        if (!prev || !prev.pages || !prev.pages[selectedPage]) {
          console.error('[BinderEditor] Invalid layout state in removeLayer', {
            hasPrev: !!prev,
            hasPages: !!prev?.pages,
            selectedPage
          });
          return prev;
        }

        const newPages = [...prev.pages];
        const page = { ...newPages[selectedPage] };
        page.layers = (page.layers || []).filter(
          (layer) => layer.id !== layerId
        );
        newPages[selectedPage] = page;

        return { ...prev, pages: newPages };
      });

      setIsDirty(true);
    },
    [selectedPage, layout, binderId]
  );

  // Reorder pages via drag+drop:
  // - moves the WHOLE page object (layers/sectionKey/etc stay attached)
  // - renumbers pageIndex sequentially
  // - keeps the currently selected page selected (by id)
  // - saves immediately via applyLayout so Supabase stays in sync
  const handleReorderPages = useCallback(
    async (fromIndex, toIndex) => {
      if (!layout || !Array.isArray(layout.pages)) return;
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0) return;
      if (fromIndex >= layout.pages.length || toIndex >= layout.pages.length) return;

      const pagesBefore = layout.pages;
      const selectedId = pagesBefore?.[selectedPage]?.id || null;

      // Move item in array
      const moved = [...pagesBefore];
      const [picked] = moved.splice(fromIndex, 1);
      moved.splice(toIndex, 0, picked);

      // Renumber pageIndex to match new visual order
      const normalized = moved.map((p, idx) => ({
        ...p,
        pageIndex: idx
      }));

      // Keep selection attached to the same page (by stable id)
      const nextSelectedIndex =
        selectedId != null
          ? Math.max(0, normalized.findIndex((p) => p?.id === selectedId))
          : 0;

      const nextLayout = {
        ...layout,
        pages: normalized
      };

      // Update UI immediately
      setLayout(nextLayout);
      setSelectedPage(nextSelectedIndex);

      // Persist immediately so DB is aligned even if user refreshes right away
      try {
        setSaving(true);
        setError(null);

        const result = await applyLayout(binderId, nextLayout);
        if (result?.ok) {
          setLayout((prev) => ({
            ...(prev || nextLayout),
            updatedAt: result.updatedAt
          }));
          setIsDirty(false);
          setLastSavedAt(result.updatedAt || new Date().toISOString());
        } else {
          // If server didn't accept it, keep dirty so autosave can retry after next edit
          setIsDirty(true);
        }
      } catch (err) {
        if (isSessionExpiredError(err)) return;
        setError(err.message || 'Failed to save page order.');
        setIsDirty(true);
      } finally {
        setSaving(false);
      }
    },
    [layout, selectedPage, binderId]
  );

  // Delete a page (by index) and keep selection sane
  const handleDeletePage = useCallback((pageIndexToDelete) => {
    setLayout((prev) => {
      if (!prev || !Array.isArray(prev.pages)) return prev;
      const pages = prev.pages;
      if (
        pageIndexToDelete < 0 ||
        pageIndexToDelete >= pages.length
      ) {
        return prev;
      }

      const newPages = pages.filter((_, idx) => idx !== pageIndexToDelete);

      // Re-normalize pageIndex so it stays sequential
      const normalizedPages = newPages.map((page, index) => ({
        ...page,
        pageIndex: index
      }));

      // Adjust selected page
      if (normalizedPages.length === 0) {
        setSelectedPage(0);
      } else {
        const nextIndex = Math.min(
          pageIndexToDelete,
          normalizedPages.length - 1
        );
        setSelectedPage(nextIndex);
      }

      return {
        ...prev,
        pages: normalizedPages
      };
    });
    setIsDirty(true);
  }, []);

  // Export PDF handler
  const handleExportPdf = useCallback(
    async () => {
      if (exporting || !binderId || !layout) return;

      try {
        // Save any pending changes first
        if (isDirty) {
          await applyLayout(binderId, layout);
          setIsDirty(false);
        }

        setExporting(true);
        const blob = await exportBinderPdf(binderId);

        // Trigger browser download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `binder-${binderId || 'export'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch (err) {
        if (isSessionExpiredError(err)) {
          return;
        }
        setError(`Export failed: ${err.message}`);
        console.error('[BinderEditor] Export failed:', err);
      } finally {
        setExporting(false);
      }
    },
    [binderId, layout, isDirty, exporting]
  );

  if (loading) {
    const done = preloadProgress?.done || 0;
    const total = preloadProgress?.total || 0;
    const pct =
      total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

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
                <span>
                  {total > 0 ? `${done} / ${total}` : 'Starting…'}
                </span>
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
    layout?.pages?.[selectedPage] || {
      pageIndex: selectedPage,
      layers: []
    };

  const statusText = (() => {
    if (saving) return 'Saving changes…';
    if (isDirty) return 'Unsaved changes';
    if (lastSavedAt) return 'All changes saved';
    return 'Ready';
  })();

  return (
    <div
      className="binder-editor-app flex flex-col min-h-full bg-slate-50"
      onContextMenu={(e) => e.preventDefault()}
    >
      {error && (
        <div className="binder-editor-error max-w-2xl mx-auto mb-3 rounded-lg border border-rose-100 bg-rose-50 text-rose-800 shadow-sm">
          <p>Error: {error}</p>
          <button
            className="btn btn-small mt-2"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="binder-editor-workspace flex-1">
        <div className="binder-binder-card flex h-full bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <PageList
            pages={layout?.pages || []}
            selectedPageIndex={selectedPage}
            sectionLabels={SECTION_LABELS}
            onSelectPage={setSelectedPage}
            onReorderPages={handleReorderPages}
            onAddPage={() => {
              setLayout((prev) => {
                if (!prev) {
                  return {
                    binderId,
                    pages: applySectionDefaults([
                      { id: makePageId(), pageIndex: 0, layers: [] }
                    ]),
                    updatedAt: new Date().toISOString()
                  };
                }

                const pages = prev.pages || [];
                const nextIndex = pages.length;

                const newPages = [
                  ...pages,
                  {
                    id: makePageId(),
                    pageIndex: nextIndex,
                    layers: []
                  }
                ];

                return {
                  ...prev,
                  pages: applySectionDefaults(newPages)
                };
              });
              setIsDirty(true);
            }}
            onDeletePage={handleDeletePage}
          />

          <div className="workspace-canvas-wrapper">
            <Canvas
              page={{
                ...currentPage,
                binderId: layout?.binderId || binderId
              }}
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
            />
          </div>
        </div>

        <ActionSidebar
          onAddPhoto={handleAddPhotosClick}
          onDeleteSelected={() => {
            if (!selectedLayerId) {
              openModal({
                title: 'No photo selected',
                body: 'To delete a photo, first click a photo on the page to select it, then click "Delete photo" again.',
                confirmLabel: 'Got it',
                cancelLabel: null,
                onConfirm: () => {},
                onCancel: null
              });
              return;
            }

            // Find the layer to get its storageKey for confirmation message
            const currentPage = layout?.pages?.[selectedPage];
            const layer = currentPage?.layers?.find(
              (l) => l.id === selectedLayerId
            );

            if (!layer) {
              setError('Photo not found. Please refresh the page.');
              return;
            }

            const hasStorageKey = layer?.storageKey && binderId;

            const confirmMessage = hasStorageKey
              ? 'Delete this photo from your binder? This will remove it from this page and from our storage.'
              : 'Delete this photo from this page?';

            openModal({
              title: 'Delete photo',
              body: confirmMessage,
              confirmLabel: 'Delete photo',
              cancelLabel: 'Cancel',
              onConfirm: async () => {
                try {
                  await removeLayer(selectedLayerId);
                  setSelectedLayerId(null);
                } catch (err) {
                  if (isSessionExpiredError(err)) {
                    return;
                  }
                  setError(`Failed to delete photo: ${err.message}`);
                }
              },
              onCancel: () => {
                // User cancelled, do nothing
              }
            });
          }}
          onAutoLayout={handleAutoLayout}
          onExportPdf={handleExportPdf}
          onTidyLayout={handleTidyLayout}
          saving={saving}
          exporting={exporting}
          canExport={Boolean(binderId && layout && !loading)}
        />
      </div>

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif"
        multiple
        hidden
        onChange={handleFileChange}
      />
    </div>
  );
}

export default App;