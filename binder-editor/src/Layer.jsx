// Description: Individual layer component
// Purpose: Render and edit a single layer on canvas

import React, { useEffect, useRef, useState } from 'react';
import { getPhotoViewUrl, updatePhotoCaption } from './api';
import { getPhotoFrameRectFromLayer } from './utils/photoFrameMetrics';
import { updateLayerWithNaturalDimensions } from './utils/imageDimensions';

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1122;

const rectsOverlap = (l1, t1, w1, h1, l2, t2, w2, h2) => {
  // Touching borders are allowed; only shared interior space counts as an overlap warning.
  return !(
    l1 + w1 <= l2 ||
    l1 >= l2 + w2 ||
    t1 + h1 <= t2 ||
    t1 >= t2 + h2
  );
};

const clamp = (value, min, max) => {
  // Resize uses this helper to keep saved geometry within the logical A4 page.
  return Math.min(Math.max(value, min), max);
};

function intersectionArea(ax, ay, aw, ah, bx, by, bw, bh) {
  // Convert two rectangles into the shared area used for resize overlap percentages.
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

function stripEmojiClient(input) {
  // Captions are filtered here for quick feedback; the fallback keeps older engines
  // usable when Unicode property escapes are unavailable.
  if (!input || typeof input !== 'string') return '';
  try {
    return input.replace(/\p{Extended_Pictographic}/gu, '');
  } catch {
    return input.replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
  }
}

function safeBandNumber(n) {
  // Canvas feedback can arrive during pointer movement, so normalize each CSS band defensively.
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v));
}

function Layer({
  layer,
  selected,
  onSelect,
  onUpdate,
  onRemove, // kept for compatibility
  onDragStart,
  onResizeFeedback,
  binderId,
  zoom = 1,
  snapGlowX = null,
  snapGlowY = null,
  isDragging = false,
  isOverlapping = false,
  isOverlapped = false,
  isOutside = false,
  snapAnimating = false,
  isFullyOutside = false,
  insidePct = 100, // kept for compatibility (not used for stripes anymore)
  outsideBands = { top: 0, left: 0, right: 0, bottom: 0, alpha: 0 }
}) {
  // Temporary resize and caption state stays separate from the saved layer model supplied
  // by Canvas, so cancelled UI work does not accidentally become persisted data.
  // The ref carries high-frequency resize geometry without causing a render for each field.
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef(null);

  const [imageUrl, setImageUrl] = useState(layer.src || null);
  // Loading state chooses between the spinner and storage-key fallback in the photo frame.
  const [imageLoading, setImageLoading] = useState(false);

  // Caption draft state lets the user edit locally before the API confirms the saved value.
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(layer.caption || '');
  const [savingCaption, setSavingCaption] = useState(false);
  const [captionError, setCaptionError] = useState('');

  const [resizeOverlap, setResizeOverlap] = useState(false);
  // These flags immediately feed the layer classes/CSP style while Canvas also shows a badge.
  const [resizeOutside, setResizeOutside] = useState(false);

  const textareaRef = useRef(null);

  // ===== CSP-safe per-layer style element (create once, update often) =====
  const styleElRef = useRef(null);

  useEffect(() => {
    // 1. Reuse or create one style element for this stable layer ID.
    // 2. Copy the server nonce so strict CSP allows these geometry updates.
    // 3. Remove the element when this Layer unmounts or its identity changes.
    const styleId = `layer-style-${layer.id}`;
    let styleEl = document.getElementById(styleId);

    if (!styleEl) {
      // The dashboard route writes its CSP nonce on the editor root for React-created styles.
      const rootEl = document.getElementById('binder-editor-root');
      const nonce =
        rootEl?.getAttribute('data-csp-nonce') ||
        document.querySelector('style[nonce]')?.getAttribute('nonce') ||
        '';

      styleEl = document.createElement('style');
      // A per-layer ID makes remounts able to find the existing element before cleanup.
      styleEl.id = styleId;
      if (nonce) styleEl.setAttribute('nonce', nonce);
      document.head.appendChild(styleEl);
    }

    styleElRef.current = styleEl;

    return () => {
      // Best-effort cleanup prevents stale geometry rules after a layer is deleted.
      try {
        styleElRef.current?.parentNode?.removeChild(styleElRef.current);
      } catch {}
      styleElRef.current = null;
    };
  }, [layer.id]);

  useEffect(() => {
    // Translate the saved layer model and live warning state into the CSP-approved rule above.
    const styleEl = styleElRef.current;
    if (!styleEl) return;

    const selector = `[data-layer-id="${layer.id}"]`;
    // Photo pixels supply their own background; other layer types keep their chosen fill.
    const bgColor =
      layer.type === 'photo' ? 'transparent' : layer.backgroundColor || '#fff';

    // Band sizes come from parent (outsideBands.*)
    const top = safeBandNumber(outsideBands?.top);
    const left = safeBandNumber(outsideBands?.left);
    const right = safeBandNumber(outsideBands?.right);
    const bottom = safeBandNumber(outsideBands?.bottom);

    // Instant ON the moment anything is outside (no "ramp" that can feel delayed)
    const hasOutsidePixels = top + left + right + bottom > 0;
    const outsideOn = hasOutsidePixels || isOutside || resizeOutside ? 1 : 0;

    // Put selected/active layer above everything so handles always work
    const BASE_Z = Number.isFinite(Number(layer.zIndex)) ? Number(layer.zIndex) : 0;
    const BOOST_Z = 60000;

    // Selected/dragging/resizing should always be on top (UI-only; not saved)
    const effectiveZ = selected || isDragging || resizing ? BOOST_Z : BASE_Z;

    // Updating textContent changes geometry without React inline-style attributes under CSP.
    styleEl.textContent = `
      ${selector} {
        left: ${layer.x}px !important;
        top: ${layer.y}px !important;
        width: ${layer.width}px !important;
        height: ${layer.height}px !important;
        transform: rotate(${layer.rotation}deg) !important;
        z-index: ${effectiveZ} !important;
        background-color: ${bgColor} !important;

        /* Stripe-band controls (partial outside only) */
        --cb-outside-top: ${top}px;
        --cb-outside-left: ${left}px;
        --cb-outside-right: ${right}px;
        --cb-outside-bottom: ${bottom}px;

        /* 0 or 1 => stripes appear immediately */
        --cb-outside-alpha: ${outsideOn};
      }
    `;
  }, [
    layer.id,
    layer.x,
    layer.y,
    layer.width,
    layer.height,
    layer.rotation,
    layer.zIndex,
    layer.type,
    layer.backgroundColor,
    outsideBands?.top,
    outsideBands?.left,
    outsideBands?.right,
    outsideBands?.bottom,
    isOutside,
    resizeOutside,
    selected,
    isDragging,
    resizing
  ]);

  const handlePointerDown = (e) => {
    // Controls inside a layer select it without starting a drag. For a photo layer, only
    // the visible frame acts as the drag handle.
    const target = e.target;

    const isInteractive =
      target.closest?.('.layer-caption-shell') ||
      target.closest?.('button') ||
      target.closest?.('textarea') ||
      target.closest?.('input') ||
      target.closest?.('.layer-caption-input') ||
      target.closest?.('.layer-resize-handle');

    if (isInteractive) {
      // Keep caption buttons and resize handles selectable without handing the event to Canvas drag.
      onSelect(layer.id);
      return;
    }

    if (layer.type === 'photo') {
      const inPhotoFrame = target.closest?.('.layer-photo-frame-wrapper');
      if (!inPhotoFrame) {
        onSelect(layer.id);
        return;
      }
    }

    e.preventDefault();
    e.stopPropagation();
    // Selection is owned by App, then Canvas receives the same event to initialize drag math.
    onSelect(layer.id);

    try {
      // Pointer capture helps Canvas continue receiving a drag that leaves this frame.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}

    onDragStart(layer.id, e);
  };

  const handleResizeStart = (e, corner) => {
    // Capture starting geometry once and convert it back through zoom. Later moves can
    // preserve aspect ratio without accumulating rounding error.
    e.preventDefault();
    e.stopPropagation();

    const layerEl = e.currentTarget.closest('.binder-editor-layer');
    if (!layerEl) return;

    // Always base resize math on the PAGE element (scaled by zoom)
    const pageEl = layerEl.closest('.canvas-page');
    if (!pageEl) return;

    const canvasRect = pageEl.getBoundingClientRect();
    // Measure both total layer and visible photo frame because captions are stored in total height.
    const layerRect = layerEl.getBoundingClientRect();

    const frameEl = layerEl.querySelector('.layer-photo-frame-wrapper') || layerEl;
    const frameRect = frameEl.getBoundingClientRect();

    const storedZoom = zoom || 1;

    // Convert browser-scaled DOM measurements back into Canvas's logical page coordinates.
    const left = (frameRect.left - canvasRect.left) / storedZoom;
    const top = (frameRect.top - canvasRect.top) / storedZoom;

    // Caption height in logical units (only used for saving total layer height)
    // Compute from actual DOM measurements (layerRect includes caption, frameRect does not)
    const captionHeight =
      layer.type === 'photo'
        ? Math.max(0, (layerRect.height - frameRect.height) / storedZoom)
        : 0;

    const aspect =
      // Prefer captured natural dimensions, then fall back to the currently rendered frame.
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
      // Keep this starting snapshot unchanged so later moves do not accumulate rounding drift.
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
      pageEl,
      layerEl,
      zoom: storedZoom,
      captionHeight
    };

    setResizing(true);
  };

  const handleResizeMove = (e) => {
    // Resize the visible frame, include caption height in the saved layer, and calculate
    // overlap feedback from the frame alone so captions do not create false warnings.
    if (!resizing || !resizeRef.current) return;

    const {
      corner,
      startMouseX,
      startRect,
      aspect,
      canvasRect,
      pageEl,
      layerEl,
      zoom: storedZoom,
      captionHeight
    } = resizeRef.current;

    const dx = (e.clientX - startMouseX) / storedZoom;

    // Horizontal movement controls width; the stored photo ratio determines matching height.
    const isLeft = corner.includes('left');
    const isTop = corner.includes('top');

    let width = isLeft ? startRect.width - dx : startRect.width + dx;
    width = Math.max(50, width);

    let imageHeight = width / aspect;

    let left = isLeft ? startRect.left + (startRect.width - width) : startRect.left;
    // Left/top handles move the origin so the opposite corner stays anchored.
    let top = isTop ? startRect.top + (startRect.height - imageHeight) : startRect.top;

    const canvasWidth = canvasRect.width / storedZoom;   // ~ PAGE_WIDTH
    const canvasHeight = canvasRect.height / storedZoom; // ~ PAGE_HEIGHT

    // Total layer height (image + caption) is what we SAVE.
    const totalHeight = layer.type === 'photo' ? imageHeight + (captionHeight || 0) : imageHeight;

    // Clamp position so the TOTAL layer stays in the page
    left = clamp(left, 0, canvasWidth - width);
    top = clamp(top, 0, canvasHeight - totalHeight);

    if (left + width > canvasWidth) {
      // Shrink at the right boundary, then recompute image height from the same aspect ratio.
      width = Math.max(50, canvasWidth - left);
      imageHeight = width / aspect;
    }

    if (top + totalHeight > canvasHeight) {
      // Reserve caption room before deciding the tallest image that still fits vertically.
      const maxImageHeight =
        layer.type === 'photo'
          ? Math.max(50, canvasHeight - top - (captionHeight || 0))
          : Math.max(50, canvasHeight - top);

      imageHeight = maxImageHeight;
      width = imageHeight * aspect;

      if (left + width > canvasWidth) {
        // A vertical correction can widen landscape photos, so recheck the horizontal edge.
        left = Math.max(0, canvasWidth - width);
      }
    }

    const nextTotalRect = {
      left,
      top,
      width,
      height: totalHeight
    };

    // ===== Prompts are based on the PHOTO FRAME ONLY (exclude caption) =====
    const feedbackRect =
      // Canvas warnings intentionally ignore caption height for photo-to-photo overlap.
      layer.type === 'photo'
        ? { left, top, width, height: imageHeight }
        : { left, top, width, height: totalHeight };

    const movingArea = Math.max(1, feedbackRect.width * feedbackRect.height);
    let ids = [];
    let maxPct = 0;

    if (pageEl && layerEl) {
      // Measure sibling DOM frames because they may include live positions not yet painted elsewhere.
      const others = pageEl.querySelectorAll('.binder-editor-layer');

      for (const other of others) {
        if (other === layerEl) continue;

        // If the other layer is a photo, use its FRAME wrapper rect (not caption box)
        const otherFrame = other.querySelector('.layer-photo-frame-wrapper');
        const rectEl = otherFrame || other;

        const r = rectEl.getBoundingClientRect();
        // Convert every sibling back through the zoom before comparing logical rectangles.
        const oLeft = (r.left - canvasRect.left) / storedZoom;
        const oTop = (r.top - canvasRect.top) / storedZoom;
        const oWidth = r.width / storedZoom;
        const oHeight = r.height / storedZoom;

        if (
          rectsOverlap(
            feedbackRect.left,
            feedbackRect.top,
            feedbackRect.width,
            feedbackRect.height,
            oLeft,
            oTop,
            oWidth,
            oHeight
          )
        ) {
          const otherId = other.getAttribute('data-layer-id');
          // IDs let Canvas know which saved layers are involved in the warning.
          if (otherId) ids.push(otherId);

          const a = intersectionArea(
            feedbackRect.left,
            feedbackRect.top,
            feedbackRect.width,
            feedbackRect.height,
            oLeft,
            oTop,
            oWidth,
            oHeight
          );
          const pct = (a / movingArea) * 100;
          if (pct > maxPct) maxPct = pct;
        }
      }
    }

    const outside =
      feedbackRect.left < 0 ||
      feedbackRect.top < 0 ||
      feedbackRect.left + feedbackRect.width > PAGE_WIDTH ||
      feedbackRect.top + feedbackRect.height > PAGE_HEIGHT;

    if (onResizeFeedback) {
      // Canvas turns this shared model into the cursor-follow badge used by drag as well.
      onResizeFeedback({
        ids,
        pct: maxPct,
        outside,
        clientX: e.clientX,
        clientY: e.clientY
      });
    }

    if ((maxPct > 0) !== resizeOverlap) setResizeOverlap(maxPct > 0);
    if (outside !== resizeOutside) setResizeOutside(outside);

    resizeRef.current.lastRect = { ...nextTotalRect };

    // Save FULL layer size (keeps caption sizing correct)
    // App.updateLayer receives this through Canvas and marks the layout for autosave.
    onUpdate(layer.id, {
      width: nextTotalRect.width,
      height: nextTotalRect.height,
      x: nextTotalRect.left,
      y: nextTotalRect.top
    });
  };

  const handleResizeEnd = () => {
    // Clear both local CSS flags and Canvas's shared feedback when the pointer is released.
    setResizing(false);
    resizeRef.current = null;
    setResizeOverlap(false);
    setResizeOutside(false);
    if (onResizeFeedback) {
      onResizeFeedback({ ids: [], pct: 0, outside: false, clientX: 0, clientY: 0 });
    }
  };

  useEffect(() => {
    // Document listeners keep resize active when the pointer moves outside a small corner handle.
    if (!resizing) return;

    const handleMove = (e) => handleResizeMove(e);
    const handleEnd = () => {
      // Remove immediately on pointer-up; the effect cleanup covers unmount or state changes.
      handleResizeEnd();
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);

    return () => {
      // Use the same local function references so the browser removes the correct listeners.
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  // Resolve photo view URL
  useEffect(() => {
    // Storage keys are private identifiers, so the browser asks the server for a usable
    // view URL and keeps an existing source as an immediate fallback.
    if (layer.type !== 'photo') return;

    if (layer.src) setImageUrl(layer.src);

    // Layers without a persisted storage key cannot ask the protected controller for a URL.
    if (!binderId || !layer.storageKey) return;

    let cancelled = false;
    setImageLoading(true);

    (async () => {
      // api.getPhotoViewUrl caches the authorized URL shared with preloadPhotos.
      const url = await getPhotoViewUrl(binderId, layer.storageKey);
      if (cancelled) return;

      if (url) setImageUrl(url);
      // Keep the upload-provided source when view-url resolution is temporarily unavailable.
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
      // Ignore a late promise result after this layer or storage key changes.
      cancelled = true;
    };
  }, [binderId, layer.storageKey, layer.type, layer.src]);

  useEffect(() => {
    // Server-confirmed caption updates replace any stale draft when this layer prop changes.
    setCaptionDraft(layer.caption || '');
  }, [layer.caption]);

  useEffect(() => {
    // Focus only after React has rendered the textarea for edit mode.
    if (!editingCaption) return;
    textareaRef.current?.focus?.();
  }, [editingCaption]);

  const glowXClass = snapGlowX ? `snap-glow-x-${snapGlowX}` : '';
  // Convert Canvas gesture flags into CSS classes without altering the saved layer data.
  const glowYClass = snapGlowY ? `snap-glow-y-${snapGlowY}` : '';
  const overlapClass = isOverlapping ? 'is-overlapping' : '';
  const overlappedClass = isOverlapped ? 'is-overlapped' : '';
  const outsideClass = isOutside || resizeOutside ? 'is-outside' : '';
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
        // Photo layers combine the image frame, resize handles, and persisted caption editor.
        <>
          <div className="layer-photo-frame-wrapper">
            <div className="layer-photo-frame">
              {isFullyOutside ? (
                <div className="layer-photo-outside-placeholder" />
              ) : imageUrl ? (
                <>
                  <img
                    src={imageUrl}
                    alt="Binder photo"
                    className="layer-photo-image"
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    onLoad={(e) => {
                      // Record the browser-decoded dimensions so resize and future crop math agree.
                      const nw = e.currentTarget?.naturalWidth || 0;
                      const nh = e.currentTarget?.naturalHeight || 0;
                      if (nw > 0 && nh > 0) {
                        const ar = nw / nh;
                        const prev =
                          typeof layer.photoAspectRatio === 'number'
                            ? layer.photoAspectRatio
                            : null;
                        // Prep work: also capture natural dimensions for future crop implementation
                        const updatedLayer = updateLayerWithNaturalDimensions(layer, nw, nh);
                        if (!prev || Math.abs(prev - ar) > 0.01) {
                          // Update ratio and dimensions together when the saved ratio is missing/stale.
                          onUpdate(layer.id, {
                            photoAspectRatio: ar,
                            photoNaturalWidth: updatedLayer.photoNaturalWidth,
                            photoNaturalHeight: updatedLayer.photoNaturalHeight
                          });
                        } else if (!layer.photoNaturalWidth || !layer.photoNaturalHeight) {
                          // Update natural dimensions even if aspect ratio hasn't changed
                          // This branch avoids marking a stable ratio as changed just to fill metadata.
                          onUpdate(layer.id, {
                            photoNaturalWidth: updatedLayer.photoNaturalWidth,
                            photoNaturalHeight: updatedLayer.photoNaturalHeight
                          });
                        }
                      }
                    }}
                    onError={() => {
                      console.warn('[BinderEditor] Image failed to load:', imageUrl);
                    }}
                  />

                  {/* 4-band stripes that ONLY cover the part outside the page */}
                  <div className="layer-photo-outside-bands" aria-hidden="true">
                    {/* Canvas supplies each band width through this layer's CSP style variables. */}
                    <div className="layer-photo-outside-band layer-photo-outside-band--top" />
                    <div className="layer-photo-outside-band layer-photo-outside-band--bottom" />
                    <div className="layer-photo-outside-band layer-photo-outside-band--left" />
                    <div className="layer-photo-outside-band layer-photo-outside-band--right" />
                  </div>
                </>
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
              // Handles appear only for App's selected layer so accidental resizes stay less likely.
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

          {/* caption area unchanged */}
          <div className="layer-caption-shell">
            {editingCaption ? (
              // Keep the draft local until the save button confirms it through the API route.
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
                    // Match server validation early and clear an older save error after new input.
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
                    // Captions persist against the binder photo row, so both identifiers are required.
                    if (!layer.storageKey || !binderId) return;

                    try {
                      // Lock the save button and clear an older message for this fresh request.
                      setSavingCaption(true);
                      setCaptionError('');

                      const sanitized = stripEmojiClient(captionDraft).slice(0, 100);
                      const result = await updatePhotoCaption(
                        // api.js sends this to binderController.updatePhotoCaption.
                        binderId,
                        layer.storageKey,
                        sanitized
                      );

                      const newCaption =
                        // Trust the controller's normalized caption rather than the raw draft.
                        result && typeof result.caption === 'string'
                          ? result.caption
                          : '';

                      onUpdate(layer.id, { caption: newCaption });

                      // Leave edit mode only after the server value has reached App's layout state.
                      setEditingCaption(false);
                      setCaptionDraft(newCaption.slice(0, 100));
                    } catch (err) {
                      // Keep edit mode and the draft available so the user can retry.
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
              // Display mode shows saved text or a prompt, plus one small edit action.
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
                    // Prevent the same click from starting a layer drag underneath the button.
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
        // Non-photo layers resize their whole box because they do not have a separate caption frame.
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