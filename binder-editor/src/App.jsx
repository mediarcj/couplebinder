// File: binder-editor/src/App.jsx
// Description: Main React component for binder editor
// Purpose: Canvas editor with pages, layers, drag/resize + autosave

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getLayout, applyLayout, autoLayout } from './api';
import Canvas from './Canvas';
import PageList from './PageList';
import Toolbar from './Toolbar';
import './App.css';

const AUTOSAVE_DEBOUNCE_MS = 1500; // 1.5s after last change

function App({ binderId /*, csrfToken */ }) {
  const [layout, setLayout] = useState(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [loading, setLoading] = useState(true);

  // saving = "we are writing layout to Supabase" (autosave OR auto layout)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Autosave state
  const [isDirty, setIsDirty] = useState(false);
  const [hasLoadedInitialLayout, setHasLoadedInitialLayout] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const fileInputRef = useRef(null);

  // Decide which page to land on first:
  // - Prefer the first page that actually has a real photo layer
  //   (storageKey / src / photoId).
  // - If there is none, fall back to the first non-empty page.
  // - Otherwise, use page 0.
  function pickInitialPage(pages) {
    if (!Array.isArray(pages) || pages.length === 0) return 0;

    const withPhotos = pages.findIndex((page) =>
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
            pages: Array.isArray(data.layout.pages) ? data.layout.pages : [],
            updatedAt: data.layout.updatedAt || new Date().toISOString()
          };

          // Ensure pageIndex is present and sequential
          safeLayout.pages = safeLayout.pages.map((page, index) => ({
            pageIndex: typeof page.pageIndex === 'number' ? page.pageIndex : index,
            layers: Array.isArray(page.layers) ? page.layers : [],
            ...page
          }));

          setLayout(safeLayout);
          setLastSavedAt(safeLayout.updatedAt);
          if (safeLayout.pages.length > 0) {
            setSelectedPage(pickInitialPage(safeLayout.pages));
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
        setError(err.message);
        console.error('[BinderEditor] Failed to load layout:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [binderId]);

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
          pages: Array.isArray(result.layout.pages) ? result.layout.pages : [],
          updatedAt: result.layout.updatedAt || new Date().toISOString()
        };

        safeLayout.pages = safeLayout.pages.map((page, index) => ({
          pageIndex: typeof page.pageIndex === 'number' ? page.pageIndex : index,
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
      setError(err.message);
      console.error('[BinderEditor] Failed to auto layout:', err);
    } finally {
      setSaving(false);
    }
  }, [binderId]);

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

  // Add layer to current page
  const addLayer = useCallback(
    (layer) => {
      setLayout((prev) => {
        if (!prev) {
          return {
            binderId,
            pages: [{ pageIndex: 0, layers: [layer] }],
            updatedAt: new Date().toISOString()
          };
        }

        const newPages = [...(prev.pages || [])];
        if (!newPages[selectedPage]) {
          newPages[selectedPage] = { pageIndex: selectedPage, layers: [] };
        }

        const page = { ...newPages[selectedPage] };
        page.layers = [...(page.layers || []), layer];
        newPages[selectedPage] = page;

        return { ...prev, pages: newPages };
      });
      setIsDirty(true);
    },
    [binderId, selectedPage]
  );

  const handleAddPhoto = useCallback(() => {
    const newLayer = {
      id: `layer-${Date.now()}`,
      type: 'photo',
      x: 50,
      y: 50,
      width: 200,
      height: 200,
      rotation: 0,
      zIndex: layout?.pages?.[selectedPage]?.layers?.length || 0,
      photoId: null
    };
    addLayer(newLayer);
  }, [addLayer, layout?.pages, selectedPage]);

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

      const res = await fetch(`/dashboard/binder/${encodeURIComponent(binderId)}/photos`, {
        method: 'POST',
        body: formData,
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
        credentials: 'same-origin'
      });

      if (!res.ok) {
        console.error('[BinderEditor] Upload failed', res.status);
        return;
      }

      const data = await res.json().catch(() => null);
      if (!data || !Array.isArray(data.photos)) return;

      data.photos.forEach((photo, idx) => {
        const url =
          photo.signedUrl || photo.publicUrl || photo.url || photo.previewUrl || photo.src || null;
        const newLayer = {
          id: `layer-upload-${Date.now()}-${idx}`,
          type: 'photo',
          x: 50,
          y: 50,
          width: 200,
          height: 200,
          rotation: 0,
          zIndex: layout?.pages?.[selectedPage]?.layers?.length || 0,
          photoId: null,
          storageKey: photo.storageKey || null,
          src: url
        };
        addLayer(newLayer);
      });
    },
    [addLayer, binderId, layout?.pages, selectedPage]
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

  const handleSelectLayer = useCallback(
    (layerId) => {
      setSelectedLayerId(layerId || null);
      if (!layerId) return;

      setLayout((prev) => {
        if (!prev || !prev.pages || !prev.pages[selectedPage]) return prev;
        const pages = [...prev.pages];
        const page = { ...pages[selectedPage] };
        const layers = [...(page.layers || [])];
        const idx = layers.findIndex((l) => l.id === layerId);
        if (idx === -1) return prev;

        const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex || 0), 0);
        layers[idx] = { ...layers[idx], zIndex: maxZ + 1 };
        page.layers = layers;
        pages[selectedPage] = page;
        return { ...prev, pages };
      });
    },
    [selectedPage]
  );

  // Remove layer from current page (does NOT delete underlying photo from S3/DB)
  const removeLayer = useCallback(
    (layerId) => {
      setLayout((prev) => {
        if (!prev || !prev.pages || !prev.pages[selectedPage]) return prev;

        const newPages = [...prev.pages];
        const page = { ...newPages[selectedPage] };
        page.layers = (page.layers || []).filter((layer) => layer.id !== layerId);
        newPages[selectedPage] = page;

        return { ...prev, pages: newPages };
      });
      setIsDirty(true);
    },
    [selectedPage]
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

  if (loading) {
    return (
      <div className="binder-editor-loading">
        <p>Loading binder editor...</p>
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
          <button className="btn btn-small mt-2" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="binder-editor-workspace flex-1 bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        <PageList
          pages={layout?.pages || []}
          selectedPageIndex={selectedPage}
          onSelectPage={setSelectedPage}
          onAddPage={() => {
            setLayout((prev) => {
              if (!prev) {
                return {
                  binderId,
                  pages: [{ pageIndex: 0, layers: [] }],
                  updatedAt: new Date().toISOString()
                };
              }

              const pages = prev.pages || [];
              const nextIndex = pages.length;

              const newPages = [
                ...pages,
                {
                  pageIndex: nextIndex,
                  layers: []
                }
              ];

              return {
                ...prev,
                pages: newPages
              };
            });
            setIsDirty(true);
          }}
          onDeletePage={handleDeletePage}
        />

        <div className="workspace-canvas-wrapper">
          <Toolbar
            onAddPhoto={handleAddPhotosClick}
            onDeleteSelected={() => {
              if (!selectedLayerId) return;
              removeLayer(selectedLayerId);
              setSelectedLayerId(null);
            }}
            onAutoLayout={handleAutoLayout}
            saving={saving}
            isDirty={isDirty}
            lastSavedAt={lastSavedAt}
            hasSelection={Boolean(selectedLayerId)}
          />

          <Canvas
            page={{ ...currentPage, binderId: layout?.binderId || binderId }}
            layers={currentPage.layers || []}
            onUpdateLayer={updateLayer}
            onAddLayer={addLayer}
            onRemoveLayer={removeLayer}
            selectedLayerId={selectedLayerId}
            onSelectLayer={handleSelectLayer}
          />

          <div className="canvas-photo-strip binder-react-photo-strip">
            <p className="panel-hint">
              React editor: photo uploads are managed by layers. Aligns with classic strip styling.
            </p>
          </div>

          <div className="canvas-footer">
            <span className="binder-status-text">{statusText}</span>
          </div>
        </div>
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