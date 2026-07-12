// File: binder-editor/src/App.jsx
// Description: Main React component for binder editor
// Purpose: Canvas editor with pages, layers, drag/resize + autosave

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  return !!err && err.message === 'SESSION_EXPIRED';
}

function uuidv4Fallback() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function makeId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return uuidv4Fallback();
}

function ensurePageIds(pages) {
  const arr = Array.isArray(pages) ? pages : [];
  return arr.map((p) => ({ ...p, id: p?.id || makeId() }));
}

function computeCascadingPhotoFrame({ index, aspectRatio = 1 }) {
  const safeAr = typeof aspectRatio === 'number' && aspectRatio > 0 ? aspectRatio : 1;

  let w = Math.round(PAGE_WIDTH * 0.55);
  let imageH = Math.round(w / safeAr);
  const maxImageH = Math.round(PAGE_HEIGHT * 0.55);

  if (imageH > maxImageH) {
    imageH = maxImageH;
    w = Math.round(imageH * safeAr);
  }

  const totalH = imageH + CAPTION_H;

  const baseX = Math.round((PAGE_WIDTH - w) / 2);
  const baseY = Math.round((PAGE_HEIGHT - totalH) / 2);
  const step = 24;
  const offset = (index % 8) * step;

  const x = Math.min(Math.max(baseX + offset, 0), PAGE_WIDTH - w);
  const y = Math.min(Math.max(baseY + offset, 0), PAGE_HEIGHT - totalH);

  return { x, y, width: w, height: totalH };
}

function App({ binderId }) {
  const [layout, setLayout] = useState(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preloadProgress, setPreloadProgress] = useState({ done: 0, total: 0 });
  const { openModal } = useModal();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [isDirty, setIsDirty] = useState(false);
  const [hasLoadedInitialLayout, setHasLoadedInitialLayout] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [selectedLayerId, setSelectedLayerId] = useState(null);

  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [zoom, setZoom] = useState(1);
  const canvasStageRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mobilePageListOpen, setMobilePageListOpen] = useState(false);

  // Keep latest layout in a ref (for saves that run later).
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Revision counter to avoid autosave races.
  const dirtyRevRef = useRef(0);
  const markDirty = useCallback(() => {
    dirtyRevRef.current += 1;
    setIsDirty(true);
  }, []);

  // Prevent overlapping saves; queue at most one follow-up.
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);

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

  const flushSaveNow = useCallback(
    async ({ reason } = {}) => {
      if (!binderId) return;
      if (!layoutRef.current) return;

      if (saveInFlightRef.current) {
        saveQueuedRef.current = true;
        return;
      }

      saveInFlightRef.current = true;
      saveQueuedRef.current = false;

      const startRev = dirtyRevRef.current;
      const snapshot = layoutRef.current;

      try {
        setSaving(true);
        setError(null);

        const result = await applyLayout(binderId, snapshot);

        if (result?.ok) {
          setLayout((prev) => (prev ? { ...prev, updatedAt: result.updatedAt } : prev));
          setLastSavedAt(result.updatedAt || new Date().toISOString());
        }

        // Only clear dirty if nothing changed since we started this save.
        if (dirtyRevRef.current === startRev) {
          setIsDirty(false);
        }
      } catch (err) {
        if (isSessionExpiredError(err)) return;
        setError(err.message || `Save failed${reason ? ` (${reason})` : ''}`);
        console.error('[BinderEditor] Save failed:', err);
      } finally {
        setSaving(false);
        saveInFlightRef.current = false;

        if (saveQueuedRef.current) {
          saveQueuedRef.current = false;
          // Run queued save on next tick.
          setTimeout(() => {
            flushSaveNow({ reason: 'queued' }).catch(() => {});
          }, 0);
        }
      }
    },
    [binderId]
  );

  useEffect(() => {
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
    return () => document.removeEventListener('mousedown', handleGlobalMouseDown);
  }, []);

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

  useEffect(() => {
    let mounted = true;
    const ac = new AbortController();

    async function load() {
      try {
        setLoading(true);

        const data = await getLayout(binderId);
        if (!mounted) return;

        if (data.ok && data.layout) {
          const safeLayout = {
            binderId,
            pages: applySectionDefaults(
              Array.isArray(data.layout.pages) ? data.layout.pages : []
            ),
            updatedAt: data.layout.updatedAt || new Date().toISOString()
          };

          safeLayout.pages = ensurePageIds(safeLayout.pages).map((page, index) => ({
            ...page,
            pageIndex: typeof page.pageIndex === 'number' ? page.pageIndex : index,
            layers: Array.isArray(page.layers) ? page.layers : []
          }));

          setLayout(safeLayout);
          setLastSavedAt(safeLayout.updatedAt);
          if (safeLayout.pages.length > 0) setSelectedPage(pickInitialPage(safeLayout.pages));

          // Reset dirty state after initial load.
          dirtyRevRef.current = 0;
          setIsDirty(false);

          const result = await preloadBinderPhotos({
            binderId,
            layout: safeLayout,
            signal: ac.signal,
            onProgress: (p) => {
              if (!mounted) return;
              setPreloadProgress({
                done: Number(p.done || 0),
                total: Number(p.total || 0)
              });
            }
          });

          if (result?.aborted) console.warn('[BinderEditor] preload aborted');
        } else {
          setLayout({ binderId, pages: [], updatedAt: new Date().toISOString() });
          setLastSavedAt(null);
        }

        setHasLoadedInitialLayout(true);
      } catch (err) {
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
      mounted = false;
      try {
        ac.abort();
      } catch {}
    };
  }, [binderId, applySectionDefaults]);

  useEffect(() => {
    const calculateFitZoom = () => {
      if (!canvasStageRef.current) return;

      const stageRect = canvasStageRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth <= 900;
      const padding = isMobile ? 16 : 24;
      const paddingTotal = padding * 2;

      const availableWidth = Math.max(200, stageRect.width - paddingTotal);
      const availableHeight = Math.max(200, stageRect.height - paddingTotal);

      const zoomX = availableWidth / PAGE_WIDTH;
      const zoomY = availableHeight / PAGE_HEIGHT;
      const fitZoom = Math.min(zoomX, zoomY, 1);

      setZoom((prevZoom) => {
        if (Math.abs(prevZoom - fitZoom) < 0.01) return prevZoom;
        return fitZoom;
      });
    };

    const timeoutId = setTimeout(calculateFitZoom, 100);

    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(calculateFitZoom, 150);
    };

    window.addEventListener('resize', handleResize);

    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(calculateFitZoom, 150);
    });
    if (canvasStageRef.current) observer.observe(canvasStageRef.current);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  const handleZoomChange = useCallback((newZoom) => {
    setZoom(Math.max(0.25, Math.min(2, newZoom)));
  }, []);

  const handleZoomFit = useCallback(() => {
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
    if (!hasLoadedInitialLayout) return;
    if (!layout) return;
    if (!isDirty) return;

    const timer = setTimeout(() => {
      flushSaveNow({ reason: 'autosave' }).catch(() => {});
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [layout, isDirty, hasLoadedInitialLayout, flushSaveNow]);

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
      markDirty();
    },
    [selectedPage, markDirty]
  );

  // Kept for Canvas prop compatibility; should be a no-op unless you actually implement it.
  const handleAddPhoto = useCallback(() => {}, []);

  const handleAddPhotosClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleUploadPhotos = useCallback(
    async (files) => {
      if (!files || !files.length) return;
      if (!binderId) return;

      try {
        const data = await uploadBinderPhotos(binderId, files);
        if (!data || !Array.isArray(data.photos)) return;

        const photoDataWithAspectRatios = await Promise.all(
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
              url = await getPhotoViewUrl(binderId, storageKey).catch(() => null);
            }

            if (!url) {
              return { ...photo, url: null, aspectRatio: 1, naturalWidth: 0, naturalHeight: 0 };
            }

            try {
              const { naturalWidth, naturalHeight, aspectRatio } = await captureImageDimensions(url);
              return { ...photo, url, aspectRatio, naturalWidth, naturalHeight };
            } catch {
              return { ...photo, url, aspectRatio: 1, naturalWidth: 0, naturalHeight: 0 };
            }
          })
        );

        setLayout((prev) => {
          const base = prev || { binderId, pages: [], updatedAt: new Date().toISOString() };
          const pages = [...(base.pages || [])];

          if (!pages[selectedPage]) {
            pages[selectedPage] = { id: makeId(), pageIndex: selectedPage, layers: [] };
          }

          const page = { ...pages[selectedPage] };
          page.layers = Array.isArray(page.layers) ? [...page.layers] : [];
          const nextLayers = [...page.layers];

          photoDataWithAspectRatios.forEach((photo) => {
            const url = photo.url || null;

            const imageAspectRatio =
              typeof photo.aspectRatio === 'number' && photo.aspectRatio > 0
                ? photo.aspectRatio
                : 1;

            const totalFrame = computeCascadingPhotoFrame({
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

          return { ...base, pages: applySectionDefaults(pages) };
        });

        markDirty();
      } catch (err) {
        if (isSessionExpiredError(err)) return;
        console.error('[BinderEditor] Upload exception', err);
        setError(err.message || 'Upload failed due to a network error. Please try again.');
      }
    },
    [binderId, selectedPage, applySectionDefaults, markDirty]
  );

  const handleFileChange = useCallback(
    async (e) => {
      const files = Array.from(e.target.files || []);
      await handleUploadPhotos(files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleUploadPhotos]
  );

  const handleSelectLayer = useCallback((layerId) => {
    setSelectedLayerId(layerId || null);
  }, []);

  const handleSectionChange = useCallback(
    (pageIndex, sectionKey) => {
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
      const current = layoutRef.current;
      const page = current?.pages?.[selectedPage];
      const layer = page?.layers?.find((l) => l.id === layerId);
      if (!layer) throw new Error('Layer not found');

      if (layer?.storageKey && binderId) {
        await deleteBinderPhoto(binderId, layer.storageKey);
      }

      setLayout((prev) => {
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
      const current = layoutRef.current;
      if (!current || !Array.isArray(current.pages)) return;
      if (typeof pageIndexToDelete !== 'number') return;
      if (pageIndexToDelete < 0 || pageIndexToDelete >= current.pages.length) return;

      const pagesBefore = current.pages;
      const pageToDelete = pagesBefore[pageIndexToDelete];
      const layers = Array.isArray(pageToDelete?.layers) ? pageToDelete.layers : [];

      const keysOnDeletedPage = new Set(
        layers
          .filter((l) => l && l.type === 'photo' && l.storageKey)
          .map((l) => String(l.storageKey))
      );

      const keysUsedElsewhere = new Set();
      pagesBefore.forEach((p, idx) => {
        if (!p || idx === pageIndexToDelete) return;
        const otherLayers = Array.isArray(p.layers) ? p.layers : [];
        otherLayers.forEach((l) => {
          if (l && l.type === 'photo' && l.storageKey) {
            keysUsedElsewhere.add(String(l.storageKey));
          }
        });
      });

      const keysToDelete = [...keysOnDeletedPage].filter((k) => !keysUsedElsewhere.has(k));

      const failures = [];
      if (binderId && keysToDelete.length > 0) {
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
      setSelectedPage((prevSelected) => {
        if (prevSelected === pageIndexToDelete) {
          return nextLen > 0 ? Math.min(pageIndexToDelete, nextLen - 1) : 0;
        }
        if (prevSelected > pageIndexToDelete) return prevSelected - 1;
        return prevSelected;
      });

      setSelectedLayerId(null);
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
    if (previewing || !binderId || !layoutRef.current) return;

    let url = null;

    try {
      if (isDirty) {
        await flushSaveNow({ reason: 'preview' });
      }

      setPreviewing(true);

      const blob = await exportBinderPdf(binderId);
      url = window.URL.createObjectURL(blob);

      openModal({
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
    if (exporting || !binderId || !layoutRef.current) return;

    try {
      if (isDirty) {
        await flushSaveNow({ reason: 'export' });
      }

      setExporting(true);
      const blob = await exportBinderPdf(binderId);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `binder-${binderId || 'export'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
    layout?.pages?.[selectedPage] || { pageIndex: selectedPage, layers: [] };

  return (
    <div
      className="binder-editor-app flex flex-col min-h-full bg-slate-50"
      onContextMenu={(e) => e.preventDefault()}
    >
      {error && (
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
            <div
              className="mobile-page-list-overlay"
              onClick={() => setMobilePageListOpen(false)}
              aria-hidden="true"
            />
          )}

          <PageList
            pages={layout?.pages || []}
            selectedPageIndex={selectedPage}
            sectionLabels={SECTION_LABELS}
            onSelectPage={(idx) => setSelectedPage(idx)}
            onReorderPages={handleReorderPages}
            onAddPage={() => {
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
          onAddPhoto={handleAddPhotosClick}
          onDeleteSelected={() => {
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
            const layer = p?.layers?.find((l) => l.id === selectedLayerId);

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
        type="file"
        ref={fileInputRef}
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif"
        multiple
        hidden
        onChange={handleFileChange}
      />

      <MobileMenu
        onAddPhoto={handleAddPhotosClick}
        onDeletePhoto={() => {
          if (!selectedLayerId) return;
          const layer = currentPage.layers?.find((l) => l.id === selectedLayerId);
          if (!layer) return;

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