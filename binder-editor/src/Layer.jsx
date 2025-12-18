// File: binder-editor/src/Layer.jsx
// Description: Individual layer component
// Purpose: Render and edit a single layer on canvas

import React, { useEffect, useRef, useState } from 'react';
import { getPhotoViewUrl, updatePhotoCaption } from './api';

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1122;

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
    return input.replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
  }
}

function Layer({
  layer,
  selected,
  onSelect,
  onUpdate,
  onRemove, // kept for compatibility
  onDragStart,
  binderId,
  zoom = 1,
  snapGlowX = null,
  snapGlowY = null,
  isDragging = false,
  isOverlapping = false,
  isOverlapped = false,
  isOutside = false,
  snapAnimating = false,
  isFullyOutside = false
}) {
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef(null);

  const [imageUrl, setImageUrl] = useState(layer.src || null);
  const [imageLoading, setImageLoading] = useState(false);

  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(layer.caption || '');
  const [savingCaption, setSavingCaption] = useState(false);
  const [captionError, setCaptionError] = useState('');

  const [resizeOverlap, setResizeOverlap] = useState(false);
  const [resizeOutside, setResizeOutside] = useState(false);

  const textareaRef = useRef(null);

  const handlePointerDown = (e) => {
    const target = e.target;

    // Anything interactive inside the layer should NOT start dragging.
    // IMPORTANT: use closest('button') because the click target is often a child <span>.
    const isInteractive =
      target.closest?.('.layer-caption-shell') ||
      target.closest?.('button') ||
      target.closest?.('textarea') ||
      target.closest?.('input') ||
      target.closest?.('.layer-caption-input') ||
      target.closest?.('.layer-resize-handle');

    if (isInteractive) {
      onSelect(layer.id);
      return;
    }

    // Optional: if it's a photo layer, only allow drag from the photo frame area.
    // This prevents “grab caption to drag” from ever interfering.
    if (layer.type === 'photo') {
      const inPhotoFrame = target.closest?.('.layer-photo-frame-wrapper');
      if (!inPhotoFrame) {
        onSelect(layer.id);
        return;
      }
    }

    e.preventDefault();
    e.stopPropagation();
    onSelect(layer.id);

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}

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

    if (!canvasEl) return;

    const canvasRect = canvasEl.getBoundingClientRect();
    const layerRect = layerEl.getBoundingClientRect();

    const frameEl = layerEl.querySelector('.layer-photo-frame-wrapper') || layerEl;
    const frameRect = frameEl.getBoundingClientRect();

    const storedZoom = zoom || 1;

    const left = (frameRect.left - canvasRect.left) / storedZoom;
    const top = (frameRect.top - canvasRect.top) / storedZoom;

    const captionHeight =
      layer.type === 'photo'
        ? Math.max(0, (layerRect.height - frameRect.height) / storedZoom)
        : 0;

    const aspect =
      typeof layer.photoAspectRatio === 'number' && layer.photoAspectRatio > 0
        ? layer.photoAspectRatio
        : frameRect.width && frameRect.height
        ? frameRect.width / frameRect.height
        : 1;

    const startRect = {
      left,
      top,
      width: frameRect.width / storedZoom,
      height: frameRect.height / storedZoom
    };

    resizeRef.current = {
      corner,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startRect,
      lastRect: {
        ...startRect,
        height: startRect.height + captionHeight
      },
      aspect,
      canvasRect,
      canvasEl,
      layerEl,
      zoom: storedZoom,
      captionHeight
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
      aspect,
      canvasRect,
      canvasEl,
      layerEl,
      zoom: storedZoom,
      captionHeight
    } = resizeRef.current;

    const dx = (e.clientX - startMouseX) / storedZoom;
    const dy = (e.clientY - startMouseY) / storedZoom;

    const isLeft = corner.includes('left');
    const isTop = corner.includes('top');

    let width = isLeft ? startRect.width - dx : startRect.width + dx;
    width = Math.max(50, width);

    let imageHeight = width / aspect;

    let left = isLeft ? startRect.left + (startRect.width - width) : startRect.left;
    let top = isTop ? startRect.top + (startRect.height - imageHeight) : startRect.top;

    const canvasWidth = canvasRect.width / storedZoom;
    const canvasHeight = canvasRect.height / storedZoom;

    const totalHeight =
      layer.type === 'photo' ? imageHeight + (captionHeight || 0) : imageHeight;

    left = clamp(left, 0, canvasWidth - width);
    top = clamp(top, 0, canvasHeight - totalHeight);

    if (left + width > canvasWidth) {
      width = Math.max(50, canvasWidth - left);
      imageHeight = width / aspect;
    }

    if (top + (layer.type === 'photo' ? imageHeight + (captionHeight || 0) : imageHeight) > canvasHeight) {
      const maxImageHeight =
        layer.type === 'photo'
          ? Math.max(50, canvasHeight - top - (captionHeight || 0))
          : Math.max(50, canvasHeight - top);

      imageHeight = maxImageHeight;
      width = imageHeight * aspect;

      if (left + width > canvasWidth) {
        left = Math.max(0, canvasWidth - width);
      }
    }

    const testRect = {
      left,
      top,
      width,
      height: layer.type === 'photo' ? imageHeight + (captionHeight || 0) : imageHeight
    };

    let overlapped = false;
    if (canvasEl && layerEl) {
      const others = canvasEl.querySelectorAll('.binder-editor-layer');
      for (const other of others) {
        if (other === layerEl) continue;
        const r = other.getBoundingClientRect();
        const oLeft = (r.left - canvasRect.left) / storedZoom;
        const oTop = (r.top - canvasRect.top) / storedZoom;
        const oWidth = r.width / storedZoom;
        const oHeight = r.height / storedZoom;
        if (rectsOverlap(testRect.left, testRect.top, testRect.width, testRect.height, oLeft, oTop, oWidth, oHeight)) {
          overlapped = true;
          break;
        }
      }
    }

    const outside =
      testRect.left < 0 ||
      testRect.top < 0 ||
      testRect.left + testRect.width > PAGE_WIDTH ||
      testRect.top + testRect.height > PAGE_HEIGHT;

    if (overlapped !== resizeOverlap) setResizeOverlap(overlapped);
    if (outside !== resizeOutside) setResizeOutside(outside);

    resizeRef.current.lastRect = { ...testRect };

    onUpdate(layer.id, {
      width: testRect.width,
      height: testRect.height,
      x: testRect.left,
      y: testRect.top
    });
  };

  const handleResizeEnd = () => {
    setResizing(false);
    resizeRef.current = null;
    setResizeOverlap(false);
    setResizeOutside(false);
  };

  useEffect(() => {
    if (!resizing) return;

    const handleMove = (e) => handleResizeMove(e);
    const handleEnd = () => {
      handleResizeEnd();
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);

    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  // Inject per-layer positioning styles with CSP nonce support
  useEffect(() => {
    const styleId = `layer-style-${layer.id}`;
    let styleEl = document.getElementById(styleId);

    if (!styleEl) {
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

    const selector = `[data-layer-id="${layer.id}"]`;
    const bgColor =
      layer.type === 'photo' ? 'transparent' : layer.backgroundColor || '#fff';

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
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
    };
  }, [
    layer.id,
    layer.x,
    layer.y,
    layer.width,
    layer.height,
    layer.rotation,
    layer.zIndex,
    layer.type,
    layer.backgroundColor
  ]);

  // Resolve photo view URL
  useEffect(() => {
    if (layer.type !== 'photo') return;

    if (layer.src) setImageUrl(layer.src);

    if (!binderId || !layer.storageKey) return;

    let cancelled = false;
    setImageLoading(true);

    (async () => {
      const url = await getPhotoViewUrl(binderId, layer.storageKey);
      if (cancelled) return;

      if (url) setImageUrl(url);
      else if (layer.src) setImageUrl(layer.src);
      else setImageUrl(null);
    })()
      .catch((err) => {
        if (!cancelled) console.error('[BinderEditor] Failed to load photo URL:', err);
      })
      .finally(() => {
        if (!cancelled) setImageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [binderId, layer.storageKey, layer.type, layer.src]);

  useEffect(() => {
    setCaptionDraft(layer.caption || '');
  }, [layer.caption]);

  useEffect(() => {
    if (!editingCaption) return;
    textareaRef.current?.focus?.();
  }, [editingCaption]);

  const glowXClass = snapGlowX ? `snap-glow-x-${snapGlowX}` : '';
  const glowYClass = snapGlowY ? `snap-glow-y-${snapGlowY}` : '';
  const overlapClass = (isOverlapping || resizeOverlap) ? 'is-overlapping' : '';
  const overlappedClass = isOverlapped ? 'is-overlapped' : '';
  const outsideClass = (isOutside || resizeOutside) ? 'is-outside' : '';
  const draggingClass = isDragging ? 'is-dragging' : '';
  const snappingClass = snapAnimating ? 'is-snapping' : '';
  const fullyOutsideClass = isFullyOutside ? 'is-fully-outside' : '';

  return (
    <div
      className={`binder-editor-layer ${selected ? 'selected' : ''} ${
        layer.type === 'photo' ? 'layer-type-photo' : 'layer-type-other'
      } ${glowXClass} ${glowYClass} ${draggingClass} ${snappingClass} ${overlapClass} ${overlappedClass} ${outsideClass} ${fullyOutsideClass}`}
      data-layer-id={layer.id}
      onPointerDown={handlePointerDown}
    >
      {layer.type === 'photo' && (
        <>
          <div className="layer-photo-frame-wrapper">
            <div className="layer-photo-frame">
              {isFullyOutside ? (
                <div className="layer-photo-outside-placeholder" />
              ) : imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Binder photo"
                  className="layer-photo-image"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onLoad={(e) => {
                    const nw = e.currentTarget?.naturalWidth || 0;
                    const nh = e.currentTarget?.naturalHeight || 0;
                    if (nw > 0 && nh > 0) {
                      const ar = nw / nh;
                      const prev =
                        typeof layer.photoAspectRatio === 'number'
                          ? layer.photoAspectRatio
                          : null;
                      if (!prev || Math.abs(prev - ar) > 0.01) {
                        onUpdate(layer.id, { photoAspectRatio: ar });
                      }
                    }
                  }}
                  onError={() => {
                    console.warn('[BinderEditor] Image failed to load:', imageUrl);
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

            {selected && (
              <div className="layer-photo-selection" aria-hidden="true">
                {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
                  <div
                    key={pos}
                    className={`layer-resize-handle layer-resize-${pos}`}
                    onPointerDown={(e) => handleResizeStart(e, pos)}
                    role="presentation"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="layer-caption-shell">
            {editingCaption ? (
              <div className="layer-caption-edit">
                <textarea
                  ref={textareaRef}
                  className="layer-caption-input"
                  rows={5}
                  maxLength={100}
                  value={captionDraft}
                  placeholder="Add description."
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
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
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!layer.storageKey || !binderId) return;

                    try {
                      setSavingCaption(true);
                      setCaptionError('');

                      const sanitized = stripEmojiClient(captionDraft).slice(0, 100);
                      const result = await updatePhotoCaption(
                        binderId,
                        layer.storageKey,
                        sanitized
                      );

                      const newCaption =
                        result && typeof result.caption === 'string'
                          ? result.caption
                          : '';

                      onUpdate(layer.id, { caption: newCaption });

                      setEditingCaption(false);
                      setCaptionDraft(newCaption.slice(0, 100));
                    } catch (err) {
                      setCaptionError(err?.message || 'Unable to save caption right now.');
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
                  <p className="layer-caption-text" title={layer.caption}>
                    {layer.caption}
                  </p>
                ) : (
                  <p className="layer-caption-placeholder">Add description.</p>
                )}
                <button
                  type="button"
                  className="layer-caption-edit-btn"
                  onPointerDown={(e) => e.stopPropagation()}
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

            {captionError && <div className="layer-caption-error">{captionError}</div>}
          </div>
        </>
      )}

      {layer.type === 'text' && layer.text && <div className="layer-text">{layer.text}</div>}

      {selected && layer.type !== 'photo' && (
        <>
          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
            <div
              key={pos}
              className={`layer-resize-handle layer-resize-${pos}`}
              onPointerDown={(e) => handleResizeStart(e, pos)}
              role="presentation"
            />
          ))}
        </>
      )}
    </div>
  );
}

export default Layer;