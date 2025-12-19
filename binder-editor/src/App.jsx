// File: binder-editor/src/App.jsx
// Description: Main React component for binder editor
// Purpose: Canvas editor with pages, layers, drag/resize + autosave

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getLayout, applyLayout, exportBinderPdf, deleteBinderPhoto } from './api';
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

// Photo layers store TOTAL height (image area + caption).
// This must match the minimum caption height in CSS (.layer-caption-shell).
const CAPTION_H = 88;

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

// Shared helper: compute login URL and redirect on session expiry
function redirectToLoginForSessionExpiry() {
  try {
    const returnTo = window.location.pathname + window.location.search;
    const loginUrl = `/login?reason=session_expired&returnTo=${encodeURIComponent(returnTo)}`;
    window.location.replace(loginUrl);
  } catch {
    window.location.href = '/login?reason=session_expired';
  }
}

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

function makePageId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return uuidv4Fallback();
}

function ensurePageIds(pages) {
  const arr = Array.isArray(pages) ? pages : [];
  return arr.map((p) => ({ ...p, id: p?.id || makePageId() }));
}

function App({ binderId /*, csrfToken */ }) {
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
  const [zoom, setZoom] = useState(1);
  const canvasStageRef = useRef(null);
  const fileInputRef = useRef(null);

  // PDF Preview state (only the “busy” flag remains)
  const [previewing, setPreviewing] = useState(false);

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

          safeLayout.pages = ensurePageIds(safeLayout.pages).map((page, index) => ({
            ...page,
            pageIndex: typeof page.pageIndex === 'number' ? page.pageIndex : index,
            layers: Array.isArray(page.layers) ? page.layers : []
          }));

          setLayout(safeLayout);
          setLastSavedAt(safeLayout.updatedAt);
          if (safeLayout.pages.length > 0) setSelectedPage(pickInitialPage(safeLayout.pages));

          const ac = new AbortController();
          const result = await preloadBinderPhotos({
            binderId,
            layout: safeLayout,
            signal: ac.signal,
            onProgress: (p) => {
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
        if (isSessionExpiredError(err)) return;
        setError(err.message);
        console.error('[BinderEditor] Failed to load layout:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [binderId, applySectionDefaults]);

  useEffect(() => {
    const calculateFitZoom = () => {
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
    };

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

  const handleZoomChange = useCallback((newZoom) => {
    setZoom(Math.max(0.25, Math.min(2, newZoom)));
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
            setLayout((prev) => ({ ...(prev || {}), updatedAt: result.updatedAt }));
            setIsDirty(false);
            setLastSavedAt(result.updatedAt || new Date().toISOString());
          }
        } catch (err) {
          if (isSessionExpiredError(err)) return;
          setError(err.message);
          console.error('[BinderEditor] Autosave failed:', err);
        } finally {
          setSaving(false);
        }
      })();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [binderId, layout, isDirty, hasLoadedInitialLayout]);

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

  const handleAddPhoto = useCallback(() => {
    // kept for compatibility (unused)
    setIsDirty(true);
  }, []);

  const handleAddPhotosClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleUploadPhotos = useCallback(
    async (files) => {
      if (!files || !files.length) return;
      if (!binderId) return;

      const csrfToken =
        document.querySelector('#binder-editor-root')?.getAttribute('data-csrf-token') || '';

      const formData = new FormData();
      files.forEach((file) => formData.append('photos', file));

      try {
        const res = await fetch(`/dashboard/binder/${encodeURIComponent(binderId)}/photos`, {
          method: 'POST',
          body: formData,
          headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
          credentials: 'same-origin'
        });

        if (res.status === 401 || res.status === 403) {
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

        const photoDataWithAspectRatios = await Promise.all(
          data.photos.map(async (photo) => {
            const url =
              photo.signedUrl ||
              photo.publicUrl ||
              photo.url ||
              photo.previewUrl ||
              photo.src ||
              null;

            if (!url) return { ...photo, aspectRatio: 1 };

            try {
              const aspectRatio = await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve((img.naturalWidth || 1) / (img.naturalHeight || 1));
                img.onerror = () => resolve(1);
                img.src = url;
              });
              return { ...photo, aspectRatio, url };
            } catch {
              return { ...photo, aspectRatio: 1, url };
            }
          })
        );

        setLayout((prev) => {
          const base = prev || { binderId, pages: [], updatedAt: new Date().toISOString() };
          const pages = [...(base.pages || [])];

          if (!pages[selectedPage]) pages[selectedPage] = { pageIndex: selectedPage, layers: [] };

          const page = { ...pages[selectedPage] };
          page.layers = Array.isArray(page.layers) ? [...page.layers] : [];
          const nextLayers = [...page.layers];

          photoDataWithAspectRatios.forEach((photo, idx) => {
            const url =
              photo.url ||
              photo.signedUrl ||
              photo.publicUrl ||
              photo.previewUrl ||
              photo.src ||
              null;

            const imageAspectRatio =
              typeof photo.aspectRatio === 'number' && photo.aspectRatio > 0
                ? photo.aspectRatio
                : 1;

            const totalFrame = computeCascadingPhotoFrame({
              index: nextLayers.length + idx,
              aspectRatio: imageAspectRatio
            });

            nextLayers.push({
              id: `layer-upload-${Date.now()}-${idx}`,
              type: 'photo',
              x: totalFrame.x,
              y: totalFrame.y,
              width: totalFrame.width,
              height: totalFrame.height,
              rotation: 0,
              zIndex: nextLayers.length,
              photoId: null,
              storageKey: photo.storageKey || null,
              src: url,
              photoAspectRatio: imageAspectRatio
            });
          });

          pages[selectedPage] = { ...page, layers: nextLayers };

          return { ...base, pages: applySectionDefaults(pages) };
        });

        setIsDirty(true);
      } catch (err) {
        console.error('[BinderEditor] Upload exception', err);
        setError('Upload failed due to a network error. Please try again.');
      }
    },
    [binderId, selectedPage, applySectionDefaults]
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
    // unchanged (kept as-is in your original)
    setIsDirty(true);
  }, []);

  const removeLayer = useCallback(
    async (layerId) => {
      const currentPage = layout?.pages?.[selectedPage];
      const layer = currentPage?.layers?.find((l) => l.id === layerId);
      if (!layer) throw new Error('Layer not found');

      if (layer?.storageKey && binderId) {
        try {
          await deleteBinderPhoto(binderId, layer.storageKey);
        } catch (err) {
          if (isSessionExpiredError(err)) return;
          setError(`Failed to delete photo from storage: ${err.message}`);
        }
      }

      setLayout((prev) => {
        if (!prev || !prev.pages || !prev.pages[selectedPage]) return prev;
        const newPages = [...prev.pages];
        const page = { ...newPages[selectedPage] };
        page.layers = (page.layers || []).filter((l) => l.id !== layerId);
        newPages[selectedPage] = page;
        return { ...prev, pages: newPages };
      });

      setIsDirty(true);
    },
    [selectedPage, layout, binderId]
  );

  const handleReorderPages = useCallback((fromIndex, toIndex) => {
    if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') return;
    if (fromIndex === toIndex) return;

    // Update selected page index so selection "follows" the moved tab
    setSelectedPage((prevSelected) => {
      if (prevSelected === fromIndex) return toIndex;

      // If a page is moved down, pages between shift up by 1
      if (fromIndex < toIndex && prevSelected > fromIndex && prevSelected <= toIndex) {
        return prevSelected - 1;
      }

      // If a page is moved up, pages between shift down by 1
      if (toIndex < fromIndex && prevSelected >= toIndex && prevSelected < fromIndex) {
        return prevSelected + 1;
      }

      return prevSelected;
    });

    // Reorder the pages array in layout
    setLayout((prev) => {
      if (!prev || !Array.isArray(prev.pages)) return prev;

      const pages = [...prev.pages];
      if (!pages[fromIndex] || toIndex < 0 || toIndex >= pages.length) return prev;

      const [moved] = pages.splice(fromIndex, 1);
      pages.splice(toIndex, 0, moved);

      // Keep pageIndex consistent with the visual order
      const normalizedPages = pages.map((p, idx) => ({
        ...p,
        pageIndex: idx
      }));

      return { ...prev, pages: normalizedPages };
    });

    setIsDirty(true);
  }, []);

 const handleDeletePage = useCallback(
   async (pageIndexToDelete) => {
     if (!layout || !Array.isArray(layout.pages)) return;
     if (typeof pageIndexToDelete !== 'number') return;
     if (pageIndexToDelete < 0 || pageIndexToDelete >= layout.pages.length) return;

     const pagesBefore = layout.pages;
     const pageToDelete = pagesBefore[pageIndexToDelete];
     const layers = Array.isArray(pageToDelete?.layers) ? pageToDelete.layers : [];

     // 1) Collect photo storageKeys on the page being deleted
     const keysOnDeletedPage = new Set(
       layers
         .filter((l) => l && l.type === 'photo' && l.storageKey)
         .map((l) => String(l.storageKey))
     );

     // 2) Collect photo storageKeys used on OTHER pages (so we don't delete shared photos)
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

     // 3) Only delete photos that are not referenced anywhere else
     const keysToDelete = [...keysOnDeletedPage].filter((k) => !keysUsedElsewhere.has(k));

     // Best-effort delete from storage+DB (keep going even if some fail)
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

     // 4) Remove the page from local layout + normalize pageIndex
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

     // 5) Fix selection after deletion
     const nextLen = newPages.length;
     let nextSelected = selectedPage;
     if (selectedPage === pageIndexToDelete) {
       nextSelected = nextLen > 0 ? Math.min(pageIndexToDelete, nextLen - 1) : 0;
     } else if (selectedPage > pageIndexToDelete) {
       nextSelected = selectedPage - 1;
     }
     setSelectedPage(nextSelected);
     setSelectedLayerId(null);

     // 6) Mark dirty so autosave persists the new pages array
     setIsDirty(true);

     // Optional: surface failures (page still deletes even if some photo deletes fail)
     if (failures.length > 0) {
       setError(
         `Page deleted, but ${failures.length} photo(s) could not be deleted from storage. Please retry deleting those photos later.`
       );
     }
   },
   [layout, binderId, selectedPage, applySectionDefaults]
 );

  // Preview PDF handler (now opens via ModalProvider)
  const handlePreviewPdf = useCallback(async () => {
    if (previewing || !binderId || !layout) return;

    let url = null;

    try {
      // Save pending changes first so preview matches export output
      if (isDirty) {
        const result = await applyLayout(binderId, layout);
        if (result?.ok) {
          setLayout((prev) => ({ ...(prev || layout), updatedAt: result.updatedAt }));
          setIsDirty(false);
          setLastSavedAt(result.updatedAt || new Date().toISOString());
        }
      }

      setPreviewing(true);

      const blob = await exportBinderPdf(binderId);
      url = window.URL.createObjectURL(blob);

      openModal({
        kind: 'pdf',
        title: 'PDF Preview',
        subtitle: '(A4-sized modal)',
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

      // If we created a blob URL but failed later, revoke it
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
  }, [previewing, binderId, layout, isDirty, openModal]);

  const handleExportPdf = useCallback(async () => {
    if (exporting || !binderId || !layout) return;

    try {
      if (isDirty) {
        await applyLayout(binderId, layout);
        setIsDirty(false);
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
  }, [binderId, layout, isDirty, exporting]);

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
                    pages: applySectionDefaults([{ id: makePageId(), pageIndex: 0, layers: [] }]),
                    updatedAt: new Date().toISOString()
                  };
                }

                const pages = prev.pages || [];
                const nextIndex = pages.length;

                const newPages = [
                  ...pages,
                  { id: makePageId(), pageIndex: nextIndex, layers: [] }
                ];

                return { ...prev, pages: applySectionDefaults(newPages) };
              });
              setIsDirty(true);
            }}
            onDeletePage={handleDeletePage}
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

            const currentPage = layout?.pages?.[selectedPage];
            const layer = currentPage?.layers?.find((l) => l.id === selectedLayerId);

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
    </div>
  );
}

export default App;