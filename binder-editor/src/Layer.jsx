// File: binder-editor/src/Layer.jsx
// Description: Individual layer component
// Purpose: Render and edit a single layer on canvas

import React, { useState, useEffect, useRef } from 'react';
import { getPhotoViewUrl, updatePhotoCaption } from './api';

// Simple helpers (same idea as in Canvas.jsx)
const rectsOverlap = (l1, t1, w1, h1, l2, t2, w2, h2) => {
  return !(
    l1 + w1 <= l2 ||
    l1 >= l2 + w2 ||
    t1 + h1 <= t2 ||
    t1 >= t2 + h2
  );
};

const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

function stripEmojiClient(input) {
  if (!input || typeof input !== 'string') return '';
  try {
    return input.replace(/\p{Extended_Pictographic}/gu, '');
  } catch {
    // Fallback for older browsers: basic filter of some emoji ranges
    return input.replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
  }
}

function Layer({ layer, selected, onSelect, onUpdate, onRemove, onDragStart, binderId, zoom = 1 }) {
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef(null);
  // Start with any existing URL baked into the layout (legacy EJS binder)
  const [imageUrl, setImageUrl] = useState(layer.src || null);
  const [imageLoading, setImageLoading] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(layer.caption || '');
  const [savingCaption, setSavingCaption] = useState(false);
  const [captionError, setCaptionError] = useState('');

  const handleMouseDown = (e) => {
    const target = e.target;
    if (
      target.closest('.layer-caption-input') ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON'
    ) {
      // Let interactive elements work normally
      onSelect(layer.id);
      return;
    }
  
    // IMPORTANT: prevent the browser's default image drag behavior
    e.preventDefault();
    e.stopPropagation();
    onSelect(layer.id);
    onDragStart(layer.id, e);
  };

  const handleResizeStart = (e, corner) => {
    e.preventDefault();
    e.stopPropagation();

    const layerEl = e.currentTarget.closest('.binder-editor-layer');
    if (!layerEl) return;

    const canvasEl =
      layerEl.closest('.canvas-page') ||
      layerEl.closest('.canvas-stage') ||
      layerEl.closest('.binder-editor-canvas');
    const canvasRect = canvasEl?.getBoundingClientRect();
    const rect = layerEl.getBoundingClientRect();

    if (!canvasRect || !rect) return;

    // Convert from visual (scaled) coordinates to A4 coordinates
    const left = (rect.left - canvasRect.left) / zoom;
    const top = (rect.top - canvasRect.top) / zoom;
    const aspect =
      rect.width && rect.height ? rect.width / rect.height : 1;

    const startRect = {
      left,
      top,
      width: rect.width / zoom,  // Convert to A4 coordinates
      height: rect.height / zoom // Convert to A4 coordinates
    };

    resizeRef.current = {
      corner,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startRect,
      // lastRect = last collision-free rect during this resize
      lastRect: { ...startRect },
      aspect,
      canvasRect,
      canvasEl,
      layerEl,
      zoom: zoom
    };
    setResizing(true);
  };

  const handleResizeMove = (e) => {
    if (!resizing || !resizeRef.current) return;

    const {
      corner,
      startMouseX,
      startMouseY,
      startRect,
      lastRect,
      aspect,
      canvasRect,
      canvasEl,
      layerEl,
      zoom: storedZoom
    } = resizeRef.current;

    // Account for zoom: mouse movement needs to be divided by zoom to get A4 coordinates
    const dx = (e.clientX - startMouseX) / storedZoom;
    const dy = (e.clientY - startMouseY) / storedZoom;

    const isLeft = corner.includes('left');
    const isTop = corner.includes('top');

    // Base geometry (same as before, from startRect + mouse delta)
    let width = isLeft ? startRect.width - dx : startRect.width + dx;
    width = Math.max(50, width);
    let height = width / aspect;

    let left = isLeft ? startRect.left + (startRect.width - width) : startRect.left;
    let top = isTop ? startRect.top + (startRect.height - height) : startRect.top;

    // Clamp inside canvas (convert canvasRect to A4 coordinates)
    const canvasWidth = canvasRect.width / storedZoom;
    const canvasHeight = canvasRect.height / storedZoom;
    left = clamp(left, 0, canvasWidth - width);
    top = clamp(top, 0, canvasHeight - height);

    // If bottom/right overflow after clamping left/top and width/height, adjust
    if (left + width > canvasWidth) {
      width = Math.max(50, canvasWidth - left);
      height = width / aspect;
    }
    if (top + height > canvasHeight) {
      height = Math.max(50, canvasHeight - top);
      width = height * aspect;
      if (left + width > canvasWidth) {
        left = Math.max(0, canvasWidth - width);
      }
    }

    // Now enforce "no overlap with other layers" just like Canvas dragging

    const testRect = { left, top, width, height };

    let collides = false;
    if (canvasEl && layerEl) {
      const others = canvasEl.querySelectorAll('.binder-editor-layer');
      for (const other of others) {
        if (other === layerEl) continue;
        const r = other.getBoundingClientRect();
        // Convert to A4 coordinates
        const oLeft = (r.left - canvasRect.left) / storedZoom;
        const oTop = (r.top - canvasRect.top) / storedZoom;
        const oWidth = r.width / storedZoom;
        const oHeight = r.height / storedZoom;

        if (
          rectsOverlap(
            testRect.left,
            testRect.top,
            testRect.width,
            testRect.height,
            oLeft,
            oTop,
            oWidth,
            oHeight
          )
        ) {
          collides = true;
          break;
        }
      }
    }

    let finalRect;
    if (collides) {
      // Block resize: stay at last non-overlapping rect
      finalRect = { ...lastRect };
    } else {
      // Accept resize: update lastRect
      finalRect = { ...testRect };
      resizeRef.current.lastRect = finalRect;
    }

    onUpdate(layer.id, {
      width: finalRect.width,
      height: finalRect.height,
      x: finalRect.left,
      y: finalRect.top
    });
  };

  const handleResizeEnd = () => {
    setResizing(false);
    resizeRef.current = null;
  };

  React.useEffect(() => {
    if (resizing) {
      const handleMove = (e) => handleResizeMove(e);
      const handleEnd = () => {
        handleResizeEnd();
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);

      return () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
      };
    }
  }, [resizing, handleResizeMove]);

  // Use a nonce-protected style element for dynamic positioning (CSP-compliant)
  // We'll inject CSS rules into a style element with nonce
  React.useEffect(() => {
    const styleId = `layer-style-${layer.id}`;
    let styleEl = document.getElementById(styleId);

    if (!styleEl) {
      // Get nonce from the root element's data attribute (set by EJS template)
      const rootEl = document.getElementById('binder-editor-root');
      const nonce =
        rootEl?.getAttribute('data-csp-nonce') ||
        document.querySelector('style[nonce]')?.getAttribute('nonce') ||
        '';
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      if (nonce) styleEl.setAttribute('nonce', nonce);
      document.head.appendChild(styleEl);
    }

    // Inject CSS rule for this layer
    const selector = `[data-layer-id="${layer.id}"]`;
    const bgColor = layer.type === 'photo' ? '#f0f0f0' : layer.backgroundColor || '#fff';
    styleEl.textContent = `
      ${selector} {
        left: ${layer.x}px !important;
        top: ${layer.y}px !important;
        width: ${layer.width}px !important;
        height: ${layer.height}px !important;
        transform: rotate(${layer.rotation}deg) !important;
        z-index: ${layer.zIndex || 0} !important;
        background-color: ${bgColor} !important;
      }
    `;

    return () => {
      // Cleanup: remove style element when component unmounts
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
    };
  }, [
    layer.x,
    layer.y,
    layer.width,
    layer.height,
    layer.rotation,
    layer.zIndex,
    layer.type,
    layer.backgroundColor,
    layer.id
  ]);

  // Fetch signed URL for photo if storageKey exists.
  // Uses the shared in-memory cache in api.js so we only hit the server
  // once per (binderId, storageKey) per browser tab.
  useEffect(() => {
    if (layer.type !== 'photo') return;

    // If we already have a baked-in URL from the layout (e.g. initial EJS),
    // keep using it until/if the backend gives us a signed URL.
    if (layer.src && !imageUrl) {
      setImageUrl(layer.src);
    }

    if (!binderId || !layer.storageKey) {
      return;
    }

    let cancelled = false;
    setImageLoading(true);

    (async () => {
      const url = await getPhotoViewUrl(binderId, layer.storageKey);

      if (cancelled) return;

      if (url) {
        // This is a final, signed URL we can feed straight into <img src="...">
        setImageUrl(url);
      } else if (layer.src) {
        // Fallback: at least show whatever URL was baked into the layout
        setImageUrl(layer.src);
      } else {
        setImageUrl(null);
      }
    })().catch((err) => {
      if (cancelled) return;
      console.error('[BinderEditor] Failed to load photo URL:', err);
    }).finally(() => {
      if (!cancelled) {
        setImageLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // We only care when binderId / storageKey / type / src change.
  }, [binderId, layer.storageKey, layer.type, layer.src, imageUrl]);

  // Keep local draft in sync with props when layout is re-loaded
  useEffect(() => {
    setCaptionDraft(layer.caption || '');
  }, [layer.caption]);

  return (
    <div
      className={`binder-editor-layer ${selected ? 'selected' : ''} ${
        layer.type === 'photo' ? 'layer-type-photo' : 'layer-type-other'
      }`}
      data-layer-id={layer.id}
      onMouseDown={handleMouseDown}
    >
      {layer.type === 'photo' && (
        <>
          <div className="layer-photo-container">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Binder photo"
                className="layer-photo-image"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onError={() => {
                  console.warn('[BinderEditor] Image failed to load:', imageUrl);
                  // Fall back to placeholder UI instead of a broken image box
                  // setImageUrl(null);
                }}
              />
            ) : imageLoading ? (
              <div className="layer-photo-loading">
                <span>Loading...</span>
              </div>
            ) : (
              <div className="layer-photo-placeholder">
                <span>Photo</span>
                {layer.storageKey && (
                  <span className="photo-id" title={layer.storageKey}>
                    {layer.storageKey.split('/').pop() || 'No image'}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="layer-caption-shell">
            {editingCaption ? (
              <div className="layer-caption-edit">
                <textarea
                  className="layer-caption-input"
                  rows={2}
                  maxLength={300}
                  value={captionDraft}
                  placeholder="Describe what is happening in this photo (no emojis)."
                  onMouseDown={(e) => {
                    // Let the textarea get focus and be editable.
                    // This prevents the parent layer's onMouseDown from firing.
                    e.stopPropagation();
                  }}                  
                  onChange={(e) => {
                    const raw = e.target.value;
                    const noEmoji = stripEmojiClient(raw);
                    setCaptionDraft(noEmoji);
                    if (captionError) setCaptionError('');
                  }}
                />
                <button
                  type="button"
                  className="layer-caption-save"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!layer.storageKey || !binderId) return;

                    try {
                      setSavingCaption(true);
                      setCaptionError('');

                      const result = await updatePhotoCaption(
                        binderId,
                        layer.storageKey,
                        captionDraft
                      );

                      // Backend returns sanitized caption (no HTML, no emoji)
                      const newCaption =
                        (result && typeof result.caption === 'string'
                          ? result.caption
                          : '');

                      // Push into layout so autosave sees it
                      onUpdate(layer.id, { caption: newCaption });

                      setEditingCaption(false);
                      setCaptionDraft(newCaption);
                    } catch (err) {
                      setCaptionError(
                        err?.message || 'Unable to save caption right now.'
                      );
                    } finally {
                      setSavingCaption(false);
                    }
                  }}
                  disabled={savingCaption}
                >
                  <span className="layer-caption-save-icon" aria-hidden="true">
                    ✓
                  </span>
                  <span className="sr-only">Save caption</span>
                </button>
              </div>
            ) : (
              <div className="layer-caption-display">
                {layer.caption && layer.caption.trim().length > 0 ? (
                  <p className="layer-caption-text">{layer.caption}</p>
                ) : (
                  <p className="layer-caption-placeholder">
                    Add a short description for the visa officer
                  </p>
                )}
                <button
                  type="button"
                  className="layer-caption-edit-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingCaption(true);
                    setCaptionError('');
                  }}
                >
                  <span className="layer-caption-edit-icon" aria-hidden="true">
                    ✎
                  </span>
                  <span className="sr-only">
                    {layer.caption ? 'Edit caption' : 'Add caption'}
                  </span>
                </button>
              </div>
            )}

            {captionError && (
              <div className="layer-caption-error">
                {captionError}
              </div>
            )}
          </div>
        </>
      )}

      {layer.type === 'text' && layer.text && (
        <div className="layer-text">{layer.text}</div>
      )}

      {selected && (
        <>
          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
            <div
              key={pos}
              className={`layer-resize-handle layer-resize-${pos}`}
              onMouseDown={(e) => handleResizeStart(e, pos)}
              role="presentation"
            />
          ))}
        </>
      )}
    </div>
  );
}

export default Layer;