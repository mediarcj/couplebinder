// File: binder-editor/src/Layer.jsx
// Description: Individual layer component
// Purpose: Render and edit a single layer on canvas

import React, { useEffect, useRef, useState } from 'react';
// I am importing `getPhotoViewUrl` from `./api` here because Layer.jsx uses it in the steps below.
import { getPhotoViewUrl, updatePhotoCaption } from './api';
// I am importing `getPhotoFrameRectFromLayer` from `./utils/photoFrameMetrics` here because Layer.jsx uses it in the steps below.
import { getPhotoFrameRectFromLayer } from './utils/photoFrameMetrics';
// I am importing `updateLayerWithNaturalDimensions` from `./utils/imageDimensions` here because Layer.jsx uses it in the steps below.
import { updateLayerWithNaturalDimensions } from './utils/imageDimensions';

// I am saving `PAGE_WIDTH` here so the nearby steps can reuse the same value without rebuilding it each time.
const PAGE_WIDTH = 794;
// I am saving `PAGE_HEIGHT` here so the nearby steps can reuse the same value without rebuilding it each time.
const PAGE_HEIGHT = 1122;

// I am saving `rectsOverlap` here so the nearby steps can reuse the same value without rebuilding it each time.
const rectsOverlap = (l1, t1, w1, h1, l2, t2, w2, h2) => {
  // Touching borders are allowed; only shared interior space counts as an overlap warning.
  return !(
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    l1 + w1 <= l2 ||
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    l1 >= l2 + w2 ||
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    t1 + h1 <= t2 ||
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    t1 >= t2 + h2
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am saving `clamp` here so the nearby steps can reuse the same value without rebuilding it each time.
const clamp = (value, min, max) => {
  // Resize uses this helper to keep saved geometry within the logical A4 page.
  return Math.min(Math.max(value, min), max);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am keeping `intersectionArea` as a named helper so the surrounding workflow can call this step when it needs it.
function intersectionArea(ax, ay, aw, ah, bx, by, bw, bh) {
  // Convert two rectangles into the shared area used for resize overlap percentages.
  const x1 = Math.max(ax, bx);
  // I am saving `y1` here so the nearby steps can reuse the same value without rebuilding it each time.
  const y1 = Math.max(ay, by);
  // I am saving `x2` here so the nearby steps can reuse the same value without rebuilding it each time.
  const x2 = Math.min(ax + aw, bx + bw);
  // I am saving `y2` here so the nearby steps can reuse the same value without rebuilding it each time.
  const y2 = Math.min(ay + ah, by + bh);
  // I am saving `w` here so the nearby steps can reuse the same value without rebuilding it each time.
  const w = x2 - x1;
  // I am saving `h` here so the nearby steps can reuse the same value without rebuilding it each time.
  const h = y2 - y1;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (w <= 0 || h <= 0) return 0;
  // This return sends the completed value or response back to the code that called this function.
  return w * h;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `stripEmojiClient` as a named helper so the surrounding workflow can call this step when it needs it.
function stripEmojiClient(input) {
  // Captions are filtered here for quick feedback; the fallback keeps older engines
  // usable when Unicode property escapes are unavailable.
  if (!input || typeof input !== 'string') return '';
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This return sends the completed value or response back to the code that called this function.
    return input.replace(/\p{Extended_Pictographic}/gu, '');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return input.replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `safeBandNumber` as a named helper so the surrounding workflow can call this step when it needs it.
function safeBandNumber(n) {
  // Canvas feedback can arrive during pointer movement, so normalize each CSS band defensively.
  const v = Number(n);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!Number.isFinite(v)) return 0;
  // This return sends the completed value or response back to the code that called this function.
  return Math.max(0, Math.round(v));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `Layer` as a named helper so the surrounding workflow can call this step when it needs it.
function Layer({
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  layer,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  selected,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  onSelect,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  onUpdate,
  onRemove, // kept for compatibility
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  onDragStart,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  onResizeFeedback,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  binderId,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  zoom = 1,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  snapGlowX = null,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  snapGlowY = null,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  isDragging = false,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  isOverlapping = false,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  isOverlapped = false,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  isOutside = false,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  snapAnimating = false,
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  isFullyOutside = false,
  insidePct = 100, // kept for compatibility (not used for stripes anymore)
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  outsideBands = { top: 0, left: 0, right: 0, bottom: 0, alpha: 0 }
// I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
}) {
  // Temporary resize and caption state stays separate from the saved layer model supplied
  // by Canvas, so cancelled UI work does not accidentally become persisted data.
  // The ref carries high-frequency resize geometry without causing a render for each field.
  const [resizing, setResizing] = useState(false);
  // I am saving `resizeRef` here so the nearby steps can reuse the same value without rebuilding it each time.
  const resizeRef = useRef(null);

  // I am saving `imageUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [imageUrl, setImageUrl] = useState(layer.src || null);
  // Loading state chooses between the spinner and storage-key fallback in the photo frame.
  const [imageLoading, setImageLoading] = useState(false);

  // Caption draft state lets the user edit locally before the API confirms the saved value.
  const [editingCaption, setEditingCaption] = useState(false);
  // I am saving `captionDraft` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [captionDraft, setCaptionDraft] = useState(layer.caption || '');
  // I am saving `savingCaption` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [savingCaption, setSavingCaption] = useState(false);
  // I am saving `captionError` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [captionError, setCaptionError] = useState('');

  // I am saving `resizeOverlap` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [resizeOverlap, setResizeOverlap] = useState(false);
  // These flags immediately feed the layer classes/CSP style while Canvas also shows a badge.
  const [resizeOutside, setResizeOutside] = useState(false);

  // I am saving `textareaRef` here so the nearby steps can reuse the same value without rebuilding it each time.
  const textareaRef = useRef(null);

  // ===== CSP-safe per-layer style element (create once, update often) =====
  const styleElRef = useRef(null);

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // 1. Reuse or create one style element for this stable layer ID.
    // 2. Copy the server nonce so strict CSP allows these geometry updates.
    // 3. Remove the element when this Layer unmounts or its identity changes.
    const styleId = `layer-style-${layer.id}`;
    // I am saving `styleEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    let styleEl = document.getElementById(styleId);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!styleEl) {
      // The dashboard route writes its CSP nonce on the editor root for React-created styles.
      const rootEl = document.getElementById('binder-editor-root');
      // I am saving `nonce` here so the nearby steps can reuse the same value without rebuilding it each time.
      const nonce =
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        rootEl?.getAttribute('data-csp-nonce') ||
        // I am finding the existing page element here so the following browser code can read or update that confirmed DOM target.
        document.querySelector('style[nonce]')?.getAttribute('nonce') ||
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        '';

      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      styleEl = document.createElement('style');
      // A per-layer ID makes remounts able to find the existing element before cleanup.
      styleEl.id = styleId;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (nonce) styleEl.setAttribute('nonce', nonce);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      document.head.appendChild(styleEl);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    styleElRef.current = styleEl;

    // This return sends the completed value or response back to the code that called this function.
    return () => {
      // Best-effort cleanup prevents stale geometry rules after a layer is deleted.
      try {
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        styleElRef.current?.parentNode?.removeChild(styleElRef.current);
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch {}
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      styleElRef.current = null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  }, [layer.id]);

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // Translate the saved layer model and live warning state into the CSP-approved rule above.
    const styleEl = styleElRef.current;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!styleEl) return;

    // I am saving `selector` here so the nearby steps can reuse the same value without rebuilding it each time.
    const selector = `[data-layer-id="${layer.id}"]`;
    // Photo pixels supply their own background; other layer types keep their chosen fill.
    const bgColor =
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      layer.type === 'photo' ? 'transparent' : layer.backgroundColor || '#fff';

    // Band sizes come from parent (outsideBands.*)
    const top = safeBandNumber(outsideBands?.top);
    // I am saving `left` here so the nearby steps can reuse the same value without rebuilding it each time.
    const left = safeBandNumber(outsideBands?.left);
    // I am saving `right` here so the nearby steps can reuse the same value without rebuilding it each time.
    const right = safeBandNumber(outsideBands?.right);
    // I am saving `bottom` here so the nearby steps can reuse the same value without rebuilding it each time.
    const bottom = safeBandNumber(outsideBands?.bottom);

    // Instant ON the moment anything is outside (no "ramp" that can feel delayed)
    const hasOutsidePixels = top + left + right + bottom > 0;
    // I am saving `outsideOn` here so the nearby steps can reuse the same value without rebuilding it each time.
    const outsideOn = hasOutsidePixels || isOutside || resizeOutside ? 1 : 0;

    // Put selected/active layer above everything so handles always work
    const BASE_Z = Number.isFinite(Number(layer.zIndex)) ? Number(layer.zIndex) : 0;
    // I am saving `BOOST_Z` here so the nearby steps can reuse the same value without rebuilding it each time.
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
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  }, [
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    layer.id,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    layer.x,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    layer.y,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    layer.width,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    layer.height,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    layer.rotation,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    layer.zIndex,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    layer.type,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    layer.backgroundColor,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    outsideBands?.top,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    outsideBands?.left,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    outsideBands?.right,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    outsideBands?.bottom,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    isOutside,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    resizeOutside,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    selected,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    isDragging,
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    resizing
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  ]);

  // I am saving `handlePointerDown` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handlePointerDown = (e) => {
    // Controls inside a layer select it without starting a drag. For a photo layer, only
    // the visible frame acts as the drag handle.
    const target = e.target;

    // I am saving `isInteractive` here so the nearby steps can reuse the same value without rebuilding it each time.
    const isInteractive =
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      target.closest?.('.layer-caption-shell') ||
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      target.closest?.('button') ||
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      target.closest?.('textarea') ||
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      target.closest?.('input') ||
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      target.closest?.('.layer-caption-input') ||
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      target.closest?.('.layer-resize-handle');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (isInteractive) {
      // Keep caption buttons and resize handles selectable without handing the event to Canvas drag.
      onSelect(layer.id);
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (layer.type === 'photo') {
      // I am saving `inPhotoFrame` here so the nearby steps can reuse the same value without rebuilding it each time.
      const inPhotoFrame = target.closest?.('.layer-photo-frame-wrapper');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!inPhotoFrame) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        onSelect(layer.id);
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.preventDefault();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.stopPropagation();
    // Selection is owned by App, then Canvas receives the same event to initialize drag math.
    onSelect(layer.id);

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // Pointer capture helps Canvas continue receiving a drag that leaves this frame.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {}

    // I am calling this helper here so the current workflow performs this step before it moves on.
    onDragStart(layer.id, e);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `handleResizeStart` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleResizeStart = (e, corner) => {
    // Capture starting geometry once and convert it back through zoom. Later moves can
    // preserve aspect ratio without accumulating rounding error.
    e.preventDefault();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    e.stopPropagation();

    // I am saving `layerEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const layerEl = e.currentTarget.closest('.binder-editor-layer');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!layerEl) return;

    // Always base resize math on the PAGE element (scaled by zoom)
    const pageEl = layerEl.closest('.canvas-page');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!pageEl) return;

    // I am saving `canvasRect` here so the nearby steps can reuse the same value without rebuilding it each time.
    const canvasRect = pageEl.getBoundingClientRect();
    // Measure both total layer and visible photo frame because captions are stored in total height.
    const layerRect = layerEl.getBoundingClientRect();

    // I am saving `frameEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const frameEl = layerEl.querySelector('.layer-photo-frame-wrapper') || layerEl;
    // I am saving `frameRect` here so the nearby steps can reuse the same value without rebuilding it each time.
    const frameRect = frameEl.getBoundingClientRect();

    // I am saving `storedZoom` here so the nearby steps can reuse the same value without rebuilding it each time.
    const storedZoom = zoom || 1;

    // Convert browser-scaled DOM measurements back into Canvas's logical page coordinates.
    const left = (frameRect.left - canvasRect.left) / storedZoom;
    // I am saving `top` here so the nearby steps can reuse the same value without rebuilding it each time.
    const top = (frameRect.top - canvasRect.top) / storedZoom;

    // Caption height in logical units (only used for saving total layer height)
    // Compute from actual DOM measurements (layerRect includes caption, frameRect does not)
    const captionHeight =
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      layer.type === 'photo'
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        ? Math.max(0, (layerRect.height - frameRect.height) / storedZoom)
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        : 0;

    // I am saving `aspect` here so the nearby steps can reuse the same value without rebuilding it each time.
    const aspect =
      // Prefer captured natural dimensions, then fall back to the currently rendered frame.
      typeof layer.photoAspectRatio === 'number' && layer.photoAspectRatio > 0
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        ? layer.photoAspectRatio
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        : frameRect.width && frameRect.height
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        ? frameRect.width / frameRect.height
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        : 1;

    // I am saving `startRect` here so the nearby steps can reuse the same value without rebuilding it each time.
    const startRect = {
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      left,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      top,
      // I am keeping the `width` field in this object so the receiving code can read that value by its expected name.
      width: frameRect.width / storedZoom,
      // I am keeping the `height` field in this object so the receiving code can read that value by its expected name.
      height: frameRect.height / storedZoom
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    resizeRef.current = {
      // Keep this starting snapshot unchanged so later moves do not accumulate rounding drift.
      corner,
      // I am keeping the `startMouseX` field in this object so the receiving code can read that value by its expected name.
      startMouseX: e.clientX,
      // I am keeping the `startMouseY` field in this object so the receiving code can read that value by its expected name.
      startMouseY: e.clientY,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      startRect,
      // I am keeping the `lastRect` field in this object so the receiving code can read that value by its expected name.
      lastRect: {
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        ...startRect,
        // I am keeping the `height` field in this object so the receiving code can read that value by its expected name.
        height: startRect.height + captionHeight
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      aspect,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      canvasRect,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      pageEl,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      layerEl,
      // I am keeping the `zoom` field in this object so the receiving code can read that value by its expected name.
      zoom: storedZoom,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      captionHeight
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setResizing(true);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `handleResizeMove` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleResizeMove = (e) => {
    // Resize the visible frame, include caption height in the saved layer, and calculate
    // overlap feedback from the frame alone so captions do not create false warnings.
    if (!resizing || !resizeRef.current) return;

    // I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
    const {
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      corner,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      startMouseX,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      startRect,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      aspect,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      canvasRect,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      pageEl,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      layerEl,
      // I am keeping the `zoom` field in this object so the receiving code can read that value by its expected name.
      zoom: storedZoom,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      captionHeight
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    } = resizeRef.current;

    // I am saving `dx` here so the nearby steps can reuse the same value without rebuilding it each time.
    const dx = (e.clientX - startMouseX) / storedZoom;

    // Horizontal movement controls width; the stored photo ratio determines matching height.
    const isLeft = corner.includes('left');
    // I am saving `isTop` here so the nearby steps can reuse the same value without rebuilding it each time.
    const isTop = corner.includes('top');

    // I am saving `width` here so the nearby steps can reuse the same value without rebuilding it each time.
    let width = isLeft ? startRect.width - dx : startRect.width + dx;
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    width = Math.max(50, width);

    // I am saving `imageHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
    let imageHeight = width / aspect;

    // I am saving `left` here so the nearby steps can reuse the same value without rebuilding it each time.
    let left = isLeft ? startRect.left + (startRect.width - width) : startRect.left;
    // Left/top handles move the origin so the opposite corner stays anchored.
    let top = isTop ? startRect.top + (startRect.height - imageHeight) : startRect.top;

    const canvasWidth = canvasRect.width / storedZoom;   // ~ PAGE_WIDTH
    const canvasHeight = canvasRect.height / storedZoom; // ~ PAGE_HEIGHT

    // Total layer height (image + caption) is what we SAVE.
    const totalHeight = layer.type === 'photo' ? imageHeight + (captionHeight || 0) : imageHeight;

    // Clamp position so the TOTAL layer stays in the page
    left = clamp(left, 0, canvasWidth - width);
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    top = clamp(top, 0, canvasHeight - totalHeight);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (left + width > canvasWidth) {
      // Shrink at the right boundary, then recompute image height from the same aspect ratio.
      width = Math.max(50, canvasWidth - left);
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      imageHeight = width / aspect;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (top + totalHeight > canvasHeight) {
      // Reserve caption room before deciding the tallest image that still fits vertically.
      const maxImageHeight =
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        layer.type === 'photo'
          // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
          ? Math.max(50, canvasHeight - top - (captionHeight || 0))
          // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
          : Math.max(50, canvasHeight - top);

      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      imageHeight = maxImageHeight;
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      width = imageHeight * aspect;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (left + width > canvasWidth) {
        // A vertical correction can widen landscape photos, so recheck the horizontal edge.
        left = Math.max(0, canvasWidth - width);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `nextTotalRect` here so the nearby steps can reuse the same value without rebuilding it each time.
    const nextTotalRect = {
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      left,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      top,
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      width,
      // I am keeping the `height` field in this object so the receiving code can read that value by its expected name.
      height: totalHeight
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // ===== Prompts are based on the PHOTO FRAME ONLY (exclude caption) =====
    const feedbackRect =
      // Canvas warnings intentionally ignore caption height for photo-to-photo overlap.
      layer.type === 'photo'
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        ? { left, top, width, height: imageHeight }
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        : { left, top, width, height: totalHeight };

    // I am saving `movingArea` here so the nearby steps can reuse the same value without rebuilding it each time.
    const movingArea = Math.max(1, feedbackRect.width * feedbackRect.height);
    // I am saving `ids` here so the nearby steps can reuse the same value without rebuilding it each time.
    let ids = [];
    // I am saving `maxPct` here so the nearby steps can reuse the same value without rebuilding it each time.
    let maxPct = 0;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (pageEl && layerEl) {
      // Measure sibling DOM frames because they may include live positions not yet painted elsewhere.
      const others = pageEl.querySelectorAll('.binder-editor-layer');

      // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
      for (const other of others) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (other === layerEl) continue;

        // If the other layer is a photo, use its FRAME wrapper rect (not caption box)
        const otherFrame = other.querySelector('.layer-photo-frame-wrapper');
        // I am saving `rectEl` here so the nearby steps can reuse the same value without rebuilding it each time.
        const rectEl = otherFrame || other;

        // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
        const r = rectEl.getBoundingClientRect();
        // Convert every sibling back through the zoom before comparing logical rectangles.
        const oLeft = (r.left - canvasRect.left) / storedZoom;
        // I am saving `oTop` here so the nearby steps can reuse the same value without rebuilding it each time.
        const oTop = (r.top - canvasRect.top) / storedZoom;
        // I am saving `oWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
        const oWidth = r.width / storedZoom;
        // I am saving `oHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
        const oHeight = r.height / storedZoom;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (
          // I am calling this helper here so the current workflow performs this step before it moves on.
          rectsOverlap(
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            feedbackRect.left,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            feedbackRect.top,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            feedbackRect.width,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            feedbackRect.height,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            oLeft,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            oTop,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            oWidth,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            oHeight
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          )
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        ) {
          // I am saving `otherId` here so the nearby steps can reuse the same value without rebuilding it each time.
          const otherId = other.getAttribute('data-layer-id');
          // IDs let Canvas know which saved layers are involved in the warning.
          if (otherId) ids.push(otherId);

          // I am saving `a` here so the nearby steps can reuse the same value without rebuilding it each time.
          const a = intersectionArea(
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            feedbackRect.left,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            feedbackRect.top,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            feedbackRect.width,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            feedbackRect.height,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            oLeft,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            oTop,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            oWidth,
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            oHeight
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          );
          // I am saving `pct` here so the nearby steps can reuse the same value without rebuilding it each time.
          const pct = (a / movingArea) * 100;
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (pct > maxPct) maxPct = pct;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `outside` here so the nearby steps can reuse the same value without rebuilding it each time.
    const outside =
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      feedbackRect.left < 0 ||
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      feedbackRect.top < 0 ||
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      feedbackRect.left + feedbackRect.width > PAGE_WIDTH ||
      // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
      feedbackRect.top + feedbackRect.height > PAGE_HEIGHT;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (onResizeFeedback) {
      // Canvas turns this shared model into the cursor-follow badge used by drag as well.
      onResizeFeedback({
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        ids,
        // I am keeping the `pct` field in this object so the receiving code can read that value by its expected name.
        pct: maxPct,
        // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
        outside,
        // I am keeping the `clientX` field in this object so the receiving code can read that value by its expected name.
        clientX: e.clientX,
        // I am keeping the `clientY` field in this object so the receiving code can read that value by its expected name.
        clientY: e.clientY
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if ((maxPct > 0) !== resizeOverlap) setResizeOverlap(maxPct > 0);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (outside !== resizeOutside) setResizeOutside(outside);

    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    resizeRef.current.lastRect = { ...nextTotalRect };

    // Save FULL layer size (keeps caption sizing correct)
    // App.updateLayer receives this through Canvas and marks the layout for autosave.
    onUpdate(layer.id, {
      // I am keeping the `width` field in this object so the receiving code can read that value by its expected name.
      width: nextTotalRect.width,
      // I am keeping the `height` field in this object so the receiving code can read that value by its expected name.
      height: nextTotalRect.height,
      // I am keeping the `x` field in this object so the receiving code can read that value by its expected name.
      x: nextTotalRect.left,
      // I am keeping the `y` field in this object so the receiving code can read that value by its expected name.
      y: nextTotalRect.top
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `handleResizeEnd` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleResizeEnd = () => {
    // Clear both local CSS flags and Canvas's shared feedback when the pointer is released.
    setResizing(false);
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    resizeRef.current = null;
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setResizeOverlap(false);
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setResizeOutside(false);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (onResizeFeedback) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      onResizeFeedback({ ids: [], pct: 0, outside: false, clientX: 0, clientY: 0 });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // Document listeners keep resize active when the pointer moves outside a small corner handle.
    if (!resizing) return;

    // I am saving `handleMove` here so the nearby steps can reuse the same value without rebuilding it each time.
    const handleMove = (e) => handleResizeMove(e);
    // I am saving `handleEnd` here so the nearby steps can reuse the same value without rebuilding it each time.
    const handleEnd = () => {
      // Remove immediately on pointer-up; the effect cleanup covers unmount or state changes.
      handleResizeEnd();
      // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
      document.removeEventListener('pointermove', handleMove);
      // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
      document.removeEventListener('pointerup', handleEnd);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('pointermove', handleMove);
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('pointerup', handleEnd);

    // This return sends the completed value or response back to the code that called this function.
    return () => {
      // Use the same local function references so the browser removes the correct listeners.
      document.removeEventListener('pointermove', handleMove);
      // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
      document.removeEventListener('pointerup', handleEnd);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  // Resolve photo view URL
  useEffect(() => {
    // Storage keys are private identifiers, so the browser asks the server for a usable
    // view URL and keeps an existing source as an immediate fallback.
    if (layer.type !== 'photo') return;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (layer.src) setImageUrl(layer.src);

    // Layers without a persisted storage key cannot ask the protected controller for a URL.
    if (!binderId || !layer.storageKey) return;

    // I am saving `cancelled` here so the nearby steps can reuse the same value without rebuilding it each time.
    let cancelled = false;
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setImageLoading(true);

    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (async () => {
      // api.getPhotoViewUrl caches the authorized URL shared with preloadPhotos.
      const url = await getPhotoViewUrl(binderId, layer.storageKey);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (cancelled) return;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (url) setImageUrl(url);
      // Keep the upload-provided source when view-url resolution is temporarily unavailable.
      else if (layer.src) setImageUrl(layer.src);
      // This alternative runs only when the condition above did not use its first path.
      else setImageUrl(null);
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    })()
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      .catch((err) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!cancelled) console.error('[BinderEditor] Failed to load photo URL:', err);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      .finally(() => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!cancelled) setImageLoading(false);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

    // This return sends the completed value or response back to the code that called this function.
    return () => {
      // Ignore a late promise result after this layer or storage key changes.
      cancelled = true;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  }, [binderId, layer.storageKey, layer.type, layer.src]);

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // Server-confirmed caption updates replace any stale draft when this layer prop changes.
    setCaptionDraft(layer.caption || '');
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  }, [layer.caption]);

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // Focus only after React has rendered the textarea for edit mode.
    if (!editingCaption) return;
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    textareaRef.current?.focus?.();
  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
  }, [editingCaption]);

  // I am saving `glowXClass` here so the nearby steps can reuse the same value without rebuilding it each time.
  const glowXClass = snapGlowX ? `snap-glow-x-${snapGlowX}` : '';
  // Convert Canvas gesture flags into CSS classes without altering the saved layer data.
  const glowYClass = snapGlowY ? `snap-glow-y-${snapGlowY}` : '';
  // I am saving `overlapClass` here so the nearby steps can reuse the same value without rebuilding it each time.
  const overlapClass = isOverlapping ? 'is-overlapping' : '';
  // I am saving `overlappedClass` here so the nearby steps can reuse the same value without rebuilding it each time.
  const overlappedClass = isOverlapped ? 'is-overlapped' : '';
  // I am saving `outsideClass` here so the nearby steps can reuse the same value without rebuilding it each time.
  const outsideClass = isOutside || resizeOutside ? 'is-outside' : '';
  // I am saving `draggingClass` here so the nearby steps can reuse the same value without rebuilding it each time.
  const draggingClass = isDragging ? 'is-dragging' : '';
  // I am saving `snappingClass` here so the nearby steps can reuse the same value without rebuilding it each time.
  const snappingClass = snapAnimating ? 'is-snapping' : '';
  // I am saving `fullyOutsideClass` here so the nearby steps can reuse the same value without rebuilding it each time.
  const fullyOutsideClass = isFullyOutside ? 'is-fully-outside' : '';

  // This return sends the completed value or response back to the code that called this function.
  return (
    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
    // I am opening the `div` element here. The `className`, `data-layer-id`, `onPointerDown` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here.
    <div
      className={`binder-editor-layer ${selected ? 'selected' : ''} ${
        layer.type === 'photo' ? 'layer-type-photo' : 'layer-type-other'
      } ${glowXClass} ${glowYClass} ${draggingClass} ${snappingClass} ${overlapClass} ${overlappedClass} ${outsideClass} ${fullyOutsideClass}`}
      data-layer-id={layer.id}
      onPointerDown={handlePointerDown}
    >
      {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
      {layer.type === 'photo' && (
        // Photo layers combine the image frame, resize handles, and persisted caption editor.
        <>
          {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `layer-photo-frame-wrapper` class name connects this markup to matching rules in App.css. */}
          <div className="layer-photo-frame-wrapper">
            {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `layer-photo-frame` class name connects this markup to matching rules in App.css. */}
            <div className="layer-photo-frame">
              {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
              {isFullyOutside ? (
                // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
                // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `layer-photo-outside-placeholder` class name connects this markup to matching rules in App.css.
                <div className="layer-photo-outside-placeholder" />
              // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
              ) : imageUrl ? (
                // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
                <>
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  {/* I am opening the `img` element here. The `src`, `alt`, `className`, `draggable`, `onDragStart`, `onLoad`, `onError` attributes pass the exact values this element or component uses. The confirmed `layer-photo-image` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. */}
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
                  {/* I am opening the `div` element here. The `className`, `aria-hidden` attributes pass the exact values this element or component uses. The confirmed `layer-photo-outside-bands` class name connects this markup to matching rules in App.css. The accessibility attributes give assistive technology the label or role already chosen for this control. */}
                  <div className="layer-photo-outside-bands" aria-hidden="true">
                    {/* Canvas supplies each band width through this layer's CSP style variables. */}
                    {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `layer-photo-outside-band`, `layer-photo-outside-band--top` class names connect this markup to matching rules in App.css. */}
                    <div className="layer-photo-outside-band layer-photo-outside-band--top" />
                    {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                    {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `layer-photo-outside-band`, `layer-photo-outside-band--bottom` class names connect this markup to matching rules in App.css. */}
                    <div className="layer-photo-outside-band layer-photo-outside-band--bottom" />
                    {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                    {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `layer-photo-outside-band`, `layer-photo-outside-band--left` class names connect this markup to matching rules in App.css. */}
                    <div className="layer-photo-outside-band layer-photo-outside-band--left" />
                    {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                    {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `layer-photo-outside-band`, `layer-photo-outside-band--right` class names connect this markup to matching rules in App.css. */}
                    <div className="layer-photo-outside-band layer-photo-outside-band--right" />
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  </div>
                {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                </>
              // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
              ) : imageLoading ? (
                // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
                // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses.
                <div className="layer-photo-loading">
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  {/* I am opening the `span` element here. It does not need any attributes at this point. */}
                  <span>Loading...</span>
                {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                </div>
              // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
              ) : (
                // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
                // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses.
                <div className="layer-photo-placeholder">
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  {/* I am opening the `span` element here. It does not need any attributes at this point. */}
                  <span>Photo</span>
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  {layer.storageKey && (
                    // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
                    // I am opening the `span` element here. The `className`, `title` attributes pass the exact values this element or component uses. The confirmed `photo-id` class name connects this markup to matching rules in App.css.
                    <span className="photo-id" title={layer.storageKey}>
                      {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                      {layer.storageKey.split('/').pop() || 'No image'}
                    {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                    </span>
                  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
                  )}
                {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                </div>
              // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
              )}
            {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
            </div>

            {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
            {selected && (
              // Handles appear only for App's selected layer so accidental resizes stay less likely.
              // I am opening the `div` element here. The `className`, `aria-hidden` attributes pass the exact values this element or component uses. The confirmed `layer-photo-selection` class name connects this markup to matching rules in App.css. The accessibility attributes give assistive technology the label or role already chosen for this control.
              <div className="layer-photo-selection" aria-hidden="true">
                {/* I am mapping the collection here so each input item becomes the output shape expected by the next step. */}
                {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
                  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
                  // I am opening the `div` element here. The `key`, `className`, `onPointerDown`, `role` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control.
                  <div
                    key={pos}
                    className={`layer-resize-handle layer-resize-${pos}`}
                    onPointerDown={(e) => handleResizeStart(e, pos)}
                    role="presentation"
                  />
                // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
                ))}
              {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
              </div>
            // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
            )}
          {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
          </div>

          {/* caption area unchanged */}
          {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `layer-caption-shell` class name connects this markup to matching rules in App.css. */}
          <div className="layer-caption-shell">
            {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
            {editingCaption ? (
              // Keep the draft local until the save button confirms it through the API route.
              // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `layer-caption-edit` class name connects this markup to matching rules in App.css.
              <div className="layer-caption-edit">
                {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `textarea` element here. The `ref`, `className`, `rows`, `maxLength`, `value`, `placeholder`, `onPointerDown`, `onMouseDown`, `onChange` attributes pass the exact values this element or component uses. The confirmed `layer-caption-input` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. */}
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
                {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `button` element here. The `type`, `className`, `onPointerDown`, `onClick`, `disabled` attributes pass the exact values this element or component uses. The confirmed `layer-caption-save` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The disabled expression keeps the existing busy or readiness guard on this control. */}
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
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  {/* I am opening the `span` element here. The `className`, `aria-hidden` attributes pass the exact values this element or component uses. The confirmed `layer-caption-save-icon` class name connects this markup to matching rules in App.css. The accessibility attributes give assistive technology the label or role already chosen for this control. */}
                  <span className="layer-caption-save-icon" aria-hidden="true">
                    {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                    ✓
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  </span>
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. */}
                  <span className="sr-only">Save caption</span>
                {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                </button>
              {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
              </div>
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            ) : (
              // Display mode shows saved text or a prompt, plus one small edit action.
              // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `layer-caption-display` class name connects this markup to matching rules in App.css.
              <div className="layer-caption-display">
                {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                {layer.caption && layer.caption.trim().length > 0 ? (
                  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
                  // I am opening the `p` element here. The `className`, `title` attributes pass the exact values this element or component uses. The confirmed `layer-caption-text` class name connects this markup to matching rules in App.css.
                  <p className="layer-caption-text" title={layer.caption}>
                    {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                    {layer.caption}
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  </p>
                // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
                ) : (
                  // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
                  // I am opening the `p` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `layer-caption-placeholder` class name connects this markup to matching rules in App.css.
                  <p className="layer-caption-placeholder">Add description.</p>
                // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
                )}
                {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `button` element here. The `type`, `className`, `onPointerDown`, `onClick` attributes pass the exact values this element or component uses. The confirmed `layer-caption-edit-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. */}
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
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  {/* I am opening the `span` element here. The `className`, `aria-hidden` attributes pass the exact values this element or component uses. The accessibility attributes give assistive technology the label or role already chosen for this control. */}
                  <span className="layer-caption-edit-icon" aria-hidden="true">
                    {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                    ✎
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  </span>
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. */}
                  <span className="sr-only">
                    {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                    {layer.caption ? 'Edit caption' : 'Add caption'}
                  {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                  </span>
                {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
                </button>
              {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
              </div>
            // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
            )}

            {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
            {captionError && <div className="layer-caption-error">{captionError}</div>}
          {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
          </div>
        {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
        </>
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      )}

      {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
      {layer.type === 'text' && layer.text && <div className="layer-text">{layer.text}</div>}

      {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
      {selected && layer.type !== 'photo' && (
        // Non-photo layers resize their whole box because they do not have a separate caption frame.
        <>
          {/* I am mapping the collection here so each input item becomes the output shape expected by the next step. */}
          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
            // I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues.
            // I am opening the `div` element here. The `key`, `className`, `onPointerDown`, `role` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control.
            <div
              key={pos}
              className={`layer-resize-handle layer-resize-${pos}`}
              onPointerDown={(e) => handleResizeStart(e, pos)}
              role="presentation"
            />
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          ))}
        {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
        </>
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      )}
    {/* I am keeping this line here because the surrounding Layer.jsx workflow expects this value or operation before it continues. */}
    </div>
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this as the main value from Layer.jsx so the module that imports this file receives the intended entry point.
export default Layer;