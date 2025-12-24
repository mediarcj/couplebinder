// File: binder-editor/src/Canvas.jsx
// Description: Canvas editing surface (page + layers) with snapping + smart guide overlay
// Purpose: Display and manipulate layers on a page

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo
} from 'react';
import { createPortal } from 'react-dom';
import Layer from './Layer';
import { getPhotoFrameRectFromLayer, CAPTION_HEIGHT } from './utils/photoFrameMetrics';

// A4 logical size (must match your canvas-page CSS)
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1122;

// Photo caption height (now imported from shared helper)
const CAPTION_H = CAPTION_HEIGHT;

// Snap distance in *screen* pixels; we convert to logical using current zoom.
const SNAP_SCREEN_PX = 8;

// “Magnet” easing range in *screen* pixels.
const MAGNET_SCREEN_PX = 2;

// Ease-out cubic for the “magnet” feel
function easeOutCubic(t) {
  const tt = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - tt, 3);
}

function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return !(
    x1 + w1 <= x2 ||
    x1 >= x2 + w2 ||
    y1 + h1 <= y2 ||
    y1 >= y2 + h2
  );
}

function intersectionArea(ax, ay, aw, ah, bx, by, bw, bh) {
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

 /**
  * Snap rect for smart guides/snapping.
  * For photos: use ONLY the visible photo frame (exclude caption).
  */
 function getSnapRect(layer) {
   const x = typeof layer?.x === 'number' ? layer.x : 0;
   const y = typeof layer?.y === 'number' ? layer.y : 0;
   // Use helper for consistency (refactor only, same output)
   const { frameWidth, frameHeight } = getPhotoFrameRectFromLayer(layer);
   return { x, y, width: frameWidth, height: frameHeight };
 }

 function buildGuideCandidates(allLayers, movingLayerId) {
   const x = [];
   const y = [];

   // Page guides: left/center/right, top/middle/bottom
   x.push(0, PAGE_WIDTH / 2, PAGE_WIDTH);
   y.push(0, PAGE_HEIGHT / 2, PAGE_HEIGHT);

   // Other layers’ edges + centers (photos exclude caption)
   (allLayers || []).forEach((l) => {
     if (!l || l.id === movingLayerId) return;

     const r = getSnapRect(l);
     if (r.width <= 0 || r.height <= 0) return;

     x.push(r.x, r.x + r.width / 2, r.x + r.width);
     y.push(r.y, r.y + r.height / 2, r.y + r.height);
   });

   return { x, y };
 }

/**
 * Collision rect for overlap/outside prompts.
 * For photos, use ONLY the visible photo frame (exclude caption).
 */
function getCollisionRect(layer) {
  const x = typeof layer?.x === 'number' ? layer.x : 0;
  const y = typeof layer?.y === 'number' ? layer.y : 0;
  // Use helper for consistency (refactor only, same output)
  const { frameWidth, frameHeight } = getPhotoFrameRectFromLayer(layer);
  return { x, y, width: frameWidth, height: frameHeight };
}

/**
 * Compute how much of the PHOTO FRAME is outside the page, as 4 bands (top/left/right/bottom).
 * These values are in *layer-frame local pixels* and will drive the stripe overlay.
 */
function computePhotoOutsideBands(layer) {
  if (!layer || layer.type !== 'photo') {
    return { top: 0, left: 0, right: 0, bottom: 0, alpha: 0 };
  }

  const x = typeof layer.x === 'number' ? layer.x : 0;
  const y = typeof layer.y === 'number' ? layer.y : 0;
  // Use helper for consistency (refactor only, same output)
  const { frameWidth: w, frameHeight: frameH } = getPhotoFrameRectFromLayer(layer);

  if (w <= 0 || frameH <= 0) {
    return { top: 0, left: 0, right: 0, bottom: 0, alpha: 0 };
  }

  // Intersection of the photo-frame rect with the page rect
  const ix1 = Math.max(x, 0);
  const iy1 = Math.max(y, 0);
  const ix2 = Math.min(x + w, PAGE_WIDTH);
  const iy2 = Math.min(y + frameH, PAGE_HEIGHT);

  const insideW = Math.max(0, ix2 - ix1);
  const insideH = Math.max(0, iy2 - iy1);
  const insideArea = insideW * insideH;

  const frameArea = Math.max(1, w * frameH);
  const outsideArea = Math.max(0, frameArea - insideArea);

  const alpha = clamp(outsideArea / frameArea, 0, 1);

  // Bands in frame-local coords
  const top = Math.max(0, Math.round(iy1 - y));
  const left = Math.max(0, Math.round(ix1 - x));
  const right = Math.max(0, Math.round((x + w) - ix2));
  const bottom = Math.max(0, Math.round((y + frameH) - iy2));

  return { top, left, right, bottom, alpha };
}

/**
 * Snap 1 axis (x or y).
 */
function snapAxis(proposedStart, size, guides, threshold) {
  const candidates = [
    { kind: 'start', value: proposedStart },
    { kind: 'center', value: proposedStart + size / 2 },
    { kind: 'end', value: proposedStart + size }
  ];

  let best = null;

  for (const g of guides) {
    for (const c of candidates) {
      const delta = g - c.value;
      const abs = Math.abs(delta);
      if (abs <= threshold && (!best || abs < best.abs)) {
        best = { abs, delta, guidePos: g, kind: c.kind };
      }
    }
  }

  if (!best) {
    return {
      snappedStart: proposedStart,
      guidePos: null,
      delta: 0,
      abs: Infinity,
      kind: null
    };
  }

  return {
    snappedStart: proposedStart + best.delta,
    guidePos: best.guidePos,
    delta: best.delta,
    abs: best.abs,
    kind: best.kind
  };
}

function closestEdgeX(left, width, guidePos) {
  const l = left;
  const r = left + width;
  return Math.abs(guidePos - l) <= Math.abs(guidePos - r) ? 'left' : 'right';
}

function closestEdgeY(top, height, guidePos) {
  const t = top;
  const b = top + height;
  return Math.abs(guidePos - t) <= Math.abs(guidePos - b) ? 'top' : 'bottom';
}

/**
 * Cursor-follow badge rendered via portal to <body>,
 * so transforms/scales in the editor cannot offset it.
 */
function CursorBadge({ show, text, clientX, clientY }) {
  const badgeRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    if (!show) return;
    const el = badgeRef.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);

    setSize((prev) => {
      if (prev.w === w && prev.h === h) return prev;
      return { w, h };
    });
  }, [show, text]);

  if (!show) return null;

  const OFFSET = 12;
  const PAD = 8;

  const w = size.w || 180;
  const h = size.h || 32;

  const x = clamp(clientX + OFFSET, PAD, Math.max(PAD, window.innerWidth - w - PAD));
  const y = clamp(clientY + OFFSET, PAD, Math.max(PAD, window.innerHeight - h - PAD));

  return createPortal(
    <div
      ref={badgeRef}
      className="canvas-feedback-badge"
      style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
      role="status"
      aria-live="polite"
    >
      {text}
    </div>,
    document.body
  );
}

/**
 * Smart guides overlay (Figma/Canva-style dashed lines).
 * Drawn in logical page coords so it scales with the page transform.
 */
function SmartGuides({ guideX, guideY }) {
  const hasX = typeof guideX === 'number' && Number.isFinite(guideX);
  const hasY = typeof guideY === 'number' && Number.isFinite(guideY);

  if (!hasX && !hasY) return null;

  // Align to half-pixel for crisp 1px strokes in most browsers.
  const x = hasX ? clamp(guideX, 0, PAGE_WIDTH) + 0.5 : null;
  const y = hasY ? clamp(guideY, 0, PAGE_HEIGHT) + 0.5 : null;

  return (
    <svg
      className="canvas-guides"
      viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {hasX && <line className="canvas-guide-line" x1={x} y1={0} x2={x} y2={PAGE_HEIGHT} />}
      {hasY && <line className="canvas-guide-line" x1={0} y1={y} x2={PAGE_WIDTH} y2={y} />}
    </svg>
  );
}

function Canvas({
  page,
  layers,
  onUpdateLayer,
  onAddLayer,
  onRemoveLayer,
  onAddPhoto,
  sectionKey,
  sectionLabels,
  sectionOptions,
  onSectionChange,
  selectedLayerId,
  onSelectLayer,
  zoom = 1,
  onZoomChange,
  onZoomFit,
  canvasStageRef,
  onToggleMobilePageList,
  onAddPage,
  onDeletePage
}) {
  const [dragging, setDragging] = useState(false);

  const [dragFeedback, setDragFeedback] = useState({
    ids: [],
    pct: 0,
    outside: false,
    insidePct: 100,
    clientX: 0,
    clientY: 0
  });

  const [resizeFeedback, setResizeFeedback] = useState({
    ids: [],
    pct: 0,
    outside: false,
    clientX: 0,
    clientY: 0
  });

  // These were already in your file, but guides weren’t being drawn anywhere.
  const [activeGuides, setActiveGuides] = useState({ x: null, y: null });
  const [activeGlowEdges, setActiveGlowEdges] = useState({ x: null, y: null });

  const [snapAnimatingLayerId, setSnapAnimatingLayerId] = useState(null);
  const snapAnimTimerRef = useRef(null);

  const dragRef = useRef({
    active: false,
    layerId: null,
    pageEl: null,
    pageRect: null,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,

    w: 0,
    h: 0,

    cw: 0,
    ch: 0,
    isPhoto: false,

    lastX: 0,
    lastY: 0,
    otherRects: [],
    guides: { x: [], y: [] },
    snapTargets: { x: null, y: null },
    axisLock: null,

    pointerId: null,
    pointerEl: null,

    lastUi: {
      guideX: null,
      guideY: null,
      glowX: null,
      glowY: null,
      feedbackSig: null
    }
  });

  const rafRef = useRef(0);
  const lastEventRef = useRef(null);

  const moveHandlerRef = useRef(null);
  const upHandlerRef = useRef(null);
  const cancelHandlerRef = useRef(null);
  const blurHandlerRef = useRef(null);

  const setGuidesIfChanged = (x, y) => {
    const last = dragRef.current.lastUi;
    if (last.guideX === x && last.guideY === y) return;
    dragRef.current.lastUi = { ...last, guideX: x, guideY: y };
    setActiveGuides({ x, y });
  };

  const setGlowIfChanged = (x, y) => {
    const last = dragRef.current.lastUi;
    if (last.glowX === x && last.glowY === y) return;
    dragRef.current.lastUi = { ...last, glowX: x, glowY: y };
    setActiveGlowEdges({ x, y });
  };

  const setFeedbackIfChanged = (next) => {
    const d = dragRef.current;
    const idsSig = (next.ids || []).slice().sort().join(',');
    const insidePctRounded = Math.round(next.insidePct || 0);
    const sig = `${idsSig}|${next.outside ? 1 : 0}|${Math.round(next.pct || 0)}|${insidePctRounded}`;

    const coordsChanged =
      d.lastUi?.lastClientX !== next.clientX || d.lastUi?.lastClientY !== next.clientY;

    if (d.lastUi?.feedbackSig === sig && !coordsChanged) return;

    d.lastUi = {
      ...(d.lastUi || {}),
      feedbackSig: sig,
      lastClientX: next.clientX,
      lastClientY: next.clientY
    };
    setDragFeedback(next);
  };

  const handleResizeFeedback = useCallback((feedback) => {
    setResizeFeedback(feedback);
  }, []);

  const clearUi = () => {
    dragRef.current.lastUi = {
      guideX: null,
      guideY: null,
      glowX: null,
      glowY: null,
      feedbackSig: null
    };
    setActiveGuides({ x: null, y: null });
    setActiveGlowEdges({ x: null, y: null });
    setDragFeedback({ ids: [], pct: 0, outside: false, insidePct: 100, clientX: 0, clientY: 0 });
    setResizeFeedback({ ids: [], pct: 0, outside: false, clientX: 0, clientY: 0 });
  };

  const stopDragging = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

    lastEventRef.current = null;

    if (moveHandlerRef.current) {
      document.removeEventListener('pointermove', moveHandlerRef.current);
      document.removeEventListener('mousemove', moveHandlerRef.current);
      moveHandlerRef.current = null;
    }
    if (upHandlerRef.current) {
      document.removeEventListener('pointerup', upHandlerRef.current);
      document.removeEventListener('mouseup', upHandlerRef.current);
      upHandlerRef.current = null;
    }
    if (cancelHandlerRef.current) {
      document.removeEventListener('pointercancel', cancelHandlerRef.current);
      cancelHandlerRef.current = null;
    }
    if (blurHandlerRef.current) {
      window.removeEventListener('blur', blurHandlerRef.current);
      blurHandlerRef.current = null;
    }

    try {
      const d = dragRef.current;
      if (d.pointerEl && d.pointerId != null) {
        d.pointerEl.releasePointerCapture?.(d.pointerId);
      }
    } catch {}

    try {
      document.body.style.userSelect = '';
    } catch {}

    dragRef.current.active = false;
    dragRef.current.layerId = null;
    dragRef.current.axisLock = null;
    dragRef.current.pointerId = null;
    dragRef.current.pointerEl = null;
    dragRef.current.snapTargets = { x: null, y: null };

    setDragging(false);
    clearUi();
  }, []);

  const processMove = useCallback(() => {
    rafRef.current = 0;

    const ev = lastEventRef.current;
    if (!ev) return;

    const d = dragRef.current;
    if (!d.active || !d.layerId || !d.pageRect) return;

    if (ev.pointerId != null && d.pointerId != null && ev.pointerId !== d.pointerId) {
      return;
    }

    const zoomAtStart = d.zoom || 1;

    const px = (ev.clientX - d.pageRect.left) / zoomAtStart;
    const py = (ev.clientY - d.pageRect.top) / zoomAtStart;

    const desiredLeftRaw = px - d.offsetX;
    const desiredTopRaw = py - d.offsetY;

    const dx = desiredLeftRaw - d.lastX;
    const dy = desiredTopRaw - d.lastY;

    let proposedLeft = desiredLeftRaw;
    let proposedTop = desiredTopRaw;

    if (ev.shiftKey) {
      if (!d.axisLock) {
        d.axisLock = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }
      if (d.axisLock === 'x') proposedTop = d.lastY;
      else proposedLeft = d.lastX;
    } else {
      d.axisLock = null;
    }

    const snappingEnabled = !ev.altKey;

    const threshold = SNAP_SCREEN_PX / zoomAtStart;
    const magnetRange = MAGNET_SCREEN_PX / zoomAtStart;

    let guideX = null;
    let guideY = null;
    let glowXEdge = null;
    let glowYEdge = null;

    let xTarget = null;
    let yTarget = null;

    let snappedLeft = proposedLeft;
    let snappedTop = proposedTop;

    if (snappingEnabled) {
      // snapping is based on SNAP rect (photos exclude caption)
      const sw = typeof d.snapW === 'number' ? d.snapW : d.w;
      const sh = typeof d.snapH === 'number' ? d.snapH : d.h;

      const sx = snapAxis(proposedLeft, sw, d.guides.x || [], threshold);
      const sy = snapAxis(proposedTop, sh, d.guides.y || [], threshold);

      guideX = sx.guidePos;
      guideY = sy.guidePos;

      if (sx.guidePos !== null) {
        if (sx.kind === 'start') glowXEdge = 'left';
        else if (sx.kind === 'end') glowXEdge = 'right';
        else glowXEdge = closestEdgeX(proposedLeft, sw, sx.guidePos);
      }
      if (sy.guidePos !== null) {
        if (sy.kind === 'start') glowYEdge = 'top';
        else if (sy.kind === 'end') glowYEdge = 'bottom';
        else glowYEdge = closestEdgeY(proposedTop, sh, sy.guidePos);
      }

      let nextLeft = sx.snappedStart;
      let nextTop = sy.snappedStart;

      if (sx.guidePos !== null && sx.abs <= magnetRange && magnetRange > 0) {
        const t = 1 - sx.abs / magnetRange;
        const eased = easeOutCubic(t);
        nextLeft = proposedLeft + sx.delta * eased;
      }

      if (sy.guidePos !== null && sy.abs <= magnetRange && magnetRange > 0) {
        const t = 1 - sy.abs / magnetRange;
        const eased = easeOutCubic(t);
        nextTop = proposedTop + sy.delta * eased;
      }

      snappedLeft = nextLeft;
      snappedTop = nextTop;

      xTarget = sx.guidePos !== null ? sx.snappedStart : null;
      yTarget = sy.guidePos !== null ? sy.snappedStart : null;
    }

    const finalX = snappedLeft;
    const finalY = snappedTop;

    if (snappingEnabled) {
      setGuidesIfChanged(guideX, guideY);
      setGlowIfChanged(glowXEdge, glowYEdge);
      d.snapTargets = { x: xTarget, y: yTarget };
    } else {
      setGuidesIfChanged(null, null);
      setGlowIfChanged(null, null);
      d.snapTargets = { x: null, y: null };
    }

    // ===== Prompts are based on COLLISION RECT (photos exclude caption) =====
    const cw = d.cw;
    const ch = d.ch;

    const outside =
      finalX < 0 ||
      finalY < 0 ||
      finalX + cw > PAGE_WIDTH ||
      finalY + ch > PAGE_HEIGHT;

    const movingArea = Math.max(1, cw * ch);
    const insideArea = intersectionArea(finalX, finalY, cw, ch, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    const insidePct = (insideArea / movingArea) * 100;

    let ids = [];
    let maxPct = 0;

    for (const r of d.otherRects || []) {
      if (!r) continue;
      if (rectsOverlap(finalX, finalY, cw, ch, r.x, r.y, r.width, r.height)) {
        ids.push(r.id);
        const a = intersectionArea(finalX, finalY, cw, ch, r.x, r.y, r.width, r.height);
        const pct = (a / movingArea) * 100;
        if (pct > maxPct) maxPct = pct;
      }
    }

    setFeedbackIfChanged({
      ids,
      pct: maxPct,
      outside,
      insidePct,
      clientX: ev.clientX,
      clientY: ev.clientY
    });

    const changed =
      Math.abs(finalX - d.lastX) > 0.01 || Math.abs(finalY - d.lastY) > 0.01;

    if (changed) {
      d.lastX = finalX;
      d.lastY = finalY;
      onUpdateLayer(d.layerId, { x: finalX, y: finalY });
    }
  }, [onUpdateLayer]);

  const scheduleMove = useCallback(
    (ev) => {
      lastEventRef.current = ev;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(processMove);
    },
    [processMove]
  );

  const handleCanvasMouseDown = useCallback(
    (e) => {
      const layerEl = e.target.closest('.binder-editor-layer');
      if (!layerEl) onSelectLayer(null);
    },
    [onSelectLayer]
  );

  const handleDragStart = useCallback(
    (layerId, e) => {
      onSelectLayer(layerId);

      const layer = (layers || []).find((l) => l && l.id === layerId);
      if (!layer) return;

      const layerEl = e?.currentTarget;
      const pageEl = layerEl?.closest('.canvas-page');
      if (!pageEl) return;

      const pageRect = pageEl.getBoundingClientRect();
      const zoomAtStart = zoom || 1;
 
      const w = typeof layer.width === 'number' ? layer.width : 0;
      const h = typeof layer.height === 'number' ? layer.height : 0;
       // Smart guides/snapping should ignore photo captions
      const snapRect = getSnapRect(layer);
      const snapW = snapRect.width;
      const snapH = snapRect.height;
      const lx = typeof layer.x === 'number' ? layer.x : 0;
      const ly = typeof layer.y === 'number' ? layer.y : 0;

      const col = getCollisionRect(layer);
      const cw = col.width;
      const ch = col.height;

      const px = (e.clientX - pageRect.left) / zoomAtStart;
      const py = (e.clientY - pageRect.top) / zoomAtStart;
      const offsetX = px - lx;
      const offsetY = py - ly;

      dragRef.current = {
        ...dragRef.current,
        active: true,
        layerId,
        pageEl,
        pageRect,
        zoom: zoomAtStart,
        offsetX,
        offsetY,

        w,
        h,        

        snapW,
        snapH,

        cw,
        ch,

        lastX: lx,
        lastY: ly,
        otherRects: (layers || [])
          .filter((l) => l && l.id !== layerId)
          .map((l) => {
            const r = getCollisionRect(l);
            return { id: l.id, x: r.x, y: r.y, width: r.width, height: r.height };
          })
          .filter((r) => r.width > 0 && r.height > 0),
        guides: buildGuideCandidates(layers || [], layerId),
        snapTargets: { x: null, y: null },
        axisLock: null,

        pointerId: e.pointerId != null ? e.pointerId : null,
        pointerEl: layerEl || null,

        lastUi: { guideX: null, guideY: null, glowX: null, glowY: null, feedbackSig: null }
      };

      clearUi();
      setDragging(true);

      try {
        document.body.style.userSelect = 'none';
      } catch {}

      const onMove = (ev) => scheduleMove(ev);

      const onUp = (ev) => {
        const d = dragRef.current;

        if (ev?.pointerId != null && d.pointerId != null && ev.pointerId !== d.pointerId) {
          return;
        }

        let nextX = d.lastX;
        let nextY = d.lastY;

        const targetX = d.snapTargets?.x;
        const targetY = d.snapTargets?.y;

        if (targetX !== null) nextX = targetX;
        if (targetY !== null) nextY = targetY;

        // Clamp final position based on FULL layer size (keeps caption inside page)
        nextX = clamp(nextX, 0, PAGE_WIDTH - d.w);
        nextY = clamp(nextY, 0, PAGE_HEIGHT - d.h);

        if (d.active && d.layerId) {
          if (snapAnimTimerRef.current) {
            clearTimeout(snapAnimTimerRef.current);
            snapAnimTimerRef.current = null;
          }
          setSnapAnimatingLayerId(d.layerId);
          snapAnimTimerRef.current = setTimeout(() => setSnapAnimatingLayerId(null), 220);

          if (Math.abs(nextX - d.lastX) > 0.01 || Math.abs(nextY - d.lastY) > 0.01) {
            d.lastX = nextX;
            d.lastY = nextY;
            onUpdateLayer(d.layerId, { x: nextX, y: nextY });
          }
        }

        stopDragging();
      };

      const onCancel = () => stopDragging();
      const onBlur = () => stopDragging();

      moveHandlerRef.current = onMove;
      upHandlerRef.current = onUp;
      cancelHandlerRef.current = onCancel;
      blurHandlerRef.current = onBlur;

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel);

      // Compatibility fallback
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);

      window.addEventListener('blur', onBlur);
    },
    [layers, onSelectLayer, onUpdateLayer, scheduleMove, stopDragging, zoom]
  );

  useEffect(() => {
    return () => {
      stopDragging();
      if (snapAnimTimerRef.current) {
        clearTimeout(snapAnimTimerRef.current);
        snapAnimTimerRef.current = null;
      }
    };
  }, [stopDragging]);

  // ---- Cursor badge: choose drag feedback first, else resize feedback ----
  const badgeModel = useMemo(() => {
    const showDrag =
      dragging && (dragFeedback.outside || (dragFeedback.ids?.length || 0) > 0);

    if (showDrag) {
      return {
        show: true,
        text: dragFeedback.outside
          ? 'Outside page'
          : `Overlap: ${Math.max(1, Math.round(dragFeedback.pct || 0))}%`,
        clientX: dragFeedback.clientX || 0,
        clientY: dragFeedback.clientY || 0
      };
    }

    const showResize =
      (resizeFeedback.outside || (resizeFeedback.ids?.length || 0) > 0) &&
      (resizeFeedback.clientX || resizeFeedback.clientY);

    if (showResize) {
      return {
        show: true,
        text: resizeFeedback.outside
          ? 'Outside page'
          : `Overlap: ${Math.max(1, Math.round(resizeFeedback.pct || 0))}%`,
        clientX: resizeFeedback.clientX || 0,
        clientY: resizeFeedback.clientY || 0
      };
    }

    return { show: false, text: '', clientX: 0, clientY: 0 };
  }, [dragging, dragFeedback, resizeFeedback]);

  return (
    <div
      className="binder-editor-canvas bg-slate-50"
      onMouseDown={handleCanvasMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <CursorBadge
        show={badgeModel.show}
        text={badgeModel.text}
        clientX={badgeModel.clientX}
        clientY={badgeModel.clientY}
      />

      <div className="canvas-header bg-white/90 backdrop-blur">
        <div className="canvas-header-left">
          <label className="section-select-label">
            SECTION
            <select
              className="section-select"
              value={sectionKey || ''}
              onChange={(e) => onSectionChange?.(page.pageIndex, e.target.value)}
            >
              {sectionOptions?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="canvas-header-actions flex items-center gap-3">
          <button
            type="button"
            className="mobile-pages-btn"
            onClick={onToggleMobilePageList}
            aria-label="Show pages"
            title="Show pages"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="desktop-page-controls">
            <button
              type="button"
              className="page-control-btn page-control-add"
              onClick={onAddPage}
              aria-label="Add page"
              title="Add page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            {onDeletePage && (
              <button
                type="button"
                className="page-control-btn page-control-delete"
                onClick={() => onDeletePage(page.pageIndex)}
                aria-label="Delete page"
                title="Delete page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border border-slate-200 shadow-sm">
            <button
              type="button"
              onClick={onZoomFit}
              className="p-1.5 hover:bg-white rounded-md transition-all duration-200 hover:shadow-sm group"
              title="Fit to page"
            >
              <svg
                className="w-4 h-4 text-slate-600 group-hover:text-blue-600 transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </button>

            <div className="flex items-center gap-2 min-w-[140px]">
              <input
                type="range"
                min="0.25"
                max="2"
                step="0.05"
                value={zoom}
                onChange={(e) => onZoomChange?.(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-700 transition-all"
                title={`Zoom: ${Math.round(zoom * 100)}%`}
              />
            </div>

            <span className="text-sm font-medium text-slate-700 min-w-[45px] text-right tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div className="canvas-stage" ref={canvasStageRef}>
        <div
          className="canvas-page shadow-lg"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-out'
          }}
        >
          {/* ✅ Smart guides (dashed alignment lines) */}
          <SmartGuides guideX={activeGuides.x} guideY={activeGuides.y} />

          {layers.map((layer) => {
            const isDraggingLayer = dragging && dragRef.current.layerId === layer.id;
            const isSnapAnimating = snapAnimatingLayerId === layer.id;

            const dragInsidePct = isDraggingLayer ? (dragFeedback.insidePct ?? 100) : null;
            const isFullyOutside =
              isDraggingLayer && (dragInsidePct != null ? dragInsidePct <= 0.1 : false);

            const isPartiallyOutside =
              isDraggingLayer && (dragInsidePct != null ? dragInsidePct < 99.9 : false);

            const outsideBands =
              isDraggingLayer && layer?.type === 'photo'
                ? computePhotoOutsideBands(layer)
                : { top: 0, left: 0, right: 0, bottom: 0, alpha: 0 };

            return (
              <Layer
                key={layer.id}
                layer={layer}
                selected={selectedLayerId === layer.id}
                onSelect={() => onSelectLayer(layer.id)}
                onUpdate={onUpdateLayer}
                onRemove={onRemoveLayer}
                onDragStart={handleDragStart}
                onResizeFeedback={handleResizeFeedback}
                binderId={page.binderId || null}
                zoom={zoom}
                // ✅ Edge glow now matches the snap guide (modern feel)
                snapGlowX={isDraggingLayer ? activeGlowEdges.x : null}
                snapGlowY={isDraggingLayer ? activeGlowEdges.y : null}
                isDragging={isDraggingLayer}
                isOverlapping={false}
                isOutside={isPartiallyOutside}
                isOverlapped={false}
                snapAnimating={isSnapAnimating}
                isFullyOutside={isFullyOutside}
                insidePct={isDraggingLayer ? (dragInsidePct ?? 100) : 100}
                outsideBands={outsideBands}
              />
            );
          })}

          {layers.length === 0 && (
            <div className="canvas-empty">
              <p>No layers on this page. Click "Add Photo" to start.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Canvas;