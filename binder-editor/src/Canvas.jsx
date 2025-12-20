// File: binder-editor/src/Canvas.jsx
// Description: Canvas component for editing layers
// Purpose: Display and manipulate layers on a page

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Layer from './Layer';

// A4 logical size (must match your canvas-page CSS)
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1122;

// Photo caption height in your CSS (.layer-caption-shell)
const CAPTION_H = 88;

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

function buildGuideCandidates(allLayers, movingLayerId) {
  const x = [];
  const y = [];

  // Page guides: left/center/right, top/middle/bottom
  x.push(0, PAGE_WIDTH / 2, PAGE_WIDTH);
  y.push(0, PAGE_HEIGHT / 2, PAGE_HEIGHT);

  // Other layers’ edges + centers
  (allLayers || []).forEach((l) => {
    if (!l || l.id === movingLayerId) return;

    const lx = typeof l.x === 'number' ? l.x : 0;
    const ly = typeof l.y === 'number' ? l.y : 0;
    const lw = typeof l.width === 'number' ? l.width : 0;
    const lh = typeof l.height === 'number' ? l.height : 0;

    if (lw <= 0 || lh <= 0) return;

    x.push(lx, lx + lw / 2, lx + lw);
    y.push(ly, ly + lh / 2, ly + lh);
  });

  return { x, y };
}

/**
 * Compute how much of the PHOTO FRAME is outside the page, as 4 bands (top/left/right/bottom).
 * These values are in *layer-frame local pixels* and will drive the stripe overlay.
 *
 * NOTE: This is for photo layers only, and uses (height - CAPTION_H) as the frame height.
 */
function computePhotoOutsideBands(layer) {
  if (!layer || layer.type !== 'photo') {
    return { top: 0, left: 0, right: 0, bottom: 0, alpha: 0 };
  }

  const x = typeof layer.x === 'number' ? layer.x : 0;
  const y = typeof layer.y === 'number' ? layer.y : 0;
  const w = Math.max(0, typeof layer.width === 'number' ? layer.width : 0);
  const totalH = Math.max(0, typeof layer.height === 'number' ? layer.height : 0);
  const frameH = Math.max(0, totalH - CAPTION_H);

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

  // Alpha 0..1: 0 when fully inside, 1 when fully outside
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
 * Returns:
 * - snappedStart: proposedStart adjusted to perfectly align (if snapping)
 * - guidePos: the guide position being used (or null)
 * - delta: shift needed to snap (snappedStart - proposedStart)
 * - abs: |delta|
 * - kind: which anchor snapped ("start" | "center" | "end")
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

function Canvas({
  page,
  layers,
  onUpdateLayer,
  onAddLayer, // unused here but kept for compatibility
  onRemoveLayer,
  onAddPhoto, // unused here but kept for compatibility
  sectionKey,
  sectionLabels, // unused here but kept for compatibility
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

  const [activeGuides, setActiveGuides] = useState({ x: null, y: null });
  const [activeGlowEdges, setActiveGlowEdges] = useState({ x: null, y: null });

  // For smooth “snap back” animation after release
  const [snapAnimatingLayerId, setSnapAnimatingLayerId] = useState(null);
  const snapAnimTimerRef = useRef(null);

  const overlapSet = new Set(dragFeedback.ids || []);

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
    lastX: 0,
    lastY: 0,
    otherRects: [],
    guides: { x: [], y: [] },
    snapTargets: { x: null, y: null },
    axisLock: null,

    // pointer capture tracking
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

  // Store handlers so stopDragging can always detach them
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

    if (d.lastUi?.feedbackSig === sig) return;
    d.lastUi = { ...(d.lastUi || {}), feedbackSig: sig };
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

    // Convert screen coordinates to logical coordinates
    // getBoundingClientRect() returns scaled dimensions when transform: scale() is applied
    // So we divide by zoom to get logical coordinates
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
      const sx = snapAxis(proposedLeft, d.w, d.guides.x || [], threshold);
      const sy = snapAxis(proposedTop, d.h, d.guides.y || [], threshold);

      guideX = sx.guidePos;
      guideY = sy.guidePos;

      if (sx.guidePos !== null) {
        if (sx.kind === 'start') glowXEdge = 'left';
        else if (sx.kind === 'end') glowXEdge = 'right';
        else glowXEdge = closestEdgeX(proposedLeft, d.w, sx.guidePos);
      }
      if (sy.guidePos !== null) {
        if (sy.kind === 'start') glowYEdge = 'top';
        else if (sy.kind === 'end') glowYEdge = 'bottom';
        else glowYEdge = closestEdgeY(proposedTop, d.h, sy.guidePos);
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

    // Outside + inside percentage (for “fully outside => empty box” look)
    const outside =
      finalX < 0 ||
      finalY < 0 ||
      finalX + d.w > PAGE_WIDTH ||
      finalY + d.h > PAGE_HEIGHT;

    const movingArea = Math.max(1, d.w * d.h);
    const insideArea = intersectionArea(finalX, finalY, d.w, d.h, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    const insidePct = (insideArea / movingArea) * 100;

    let ids = [];
    let maxPct = 0;

    for (const r of d.otherRects || []) {
      if (!r) continue;
      if (rectsOverlap(finalX, finalY, d.w, d.h, r.x, r.y, r.width, r.height)) {
        ids.push(r.id);
        const a = intersectionArea(finalX, finalY, d.w, d.h, r.x, r.y, r.width, r.height);
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
      // Always use canvas-page for coordinate calculations
      const pageEl = layerEl?.closest('.canvas-page');
      if (!pageEl) return;

      const pageRect = pageEl.getBoundingClientRect();
      const zoomAtStart = zoom || 1;

      const w = typeof layer.width === 'number' ? layer.width : 0;
      const h = typeof layer.height === 'number' ? layer.height : 0;
      const lx = typeof layer.x === 'number' ? layer.x : 0;
      const ly = typeof layer.y === 'number' ? layer.y : 0;

      // Convert screen coordinates to logical coordinates
      // getBoundingClientRect() returns scaled dimensions, so we divide by zoom
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
        lastX: lx,
        lastY: ly,
        otherRects: (layers || [])
          .filter((l) => l && l.id !== layerId)
          .map((l) => ({
            id: l.id,
            x: typeof l.x === 'number' ? l.x : 0,
            y: typeof l.y === 'number' ? l.y : 0,
            width: typeof l.width === 'number' ? l.width : 0,
            height: typeof l.height === 'number' ? l.height : 0
          }))
          .filter((r) => r.width > 0 && r.height > 0),
        guides: buildGuideCandidates(layers || [], layerId),
        snapTargets: { x: null, y: null },
        axisLock: null,

        pointerId: e.pointerId != null ? e.pointerId : null,
        pointerEl: layerEl || null,

        lastUi: {
          guideX: null,
          guideY: null,
          glowX: null,
          glowY: null,
          feedbackSig: null
        }
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

        // 1) Settle to perfect snap target (if any)
        let nextX = d.lastX;
        let nextY = d.lastY;

          const targetX = d.snapTargets?.x;
          const targetY = d.snapTargets?.y;

        if (targetX !== null) nextX = targetX;
        if (targetY !== null) nextY = targetY;

        // 2) Always snap back INSIDE bounds on release (clamp to page edge)
        nextX = clamp(nextX, 0, PAGE_WIDTH - d.w);
        nextY = clamp(nextY, 0, PAGE_HEIGHT - d.h);

        // 3) Animate the “snap back” (only after release)
        if (d.active && d.layerId) {
          if (snapAnimTimerRef.current) {
            clearTimeout(snapAnimTimerRef.current);
            snapAnimTimerRef.current = null;
          }
          setSnapAnimatingLayerId(d.layerId);
          snapAnimTimerRef.current = setTimeout(() => {
            setSnapAnimatingLayerId(null);
          }, 220);

          if (Math.abs(nextX - d.lastX) > 0.01 || Math.abs(nextY - d.lastY) > 0.01) {
            d.lastX = nextX;
            d.lastY = nextY;
            onUpdateLayer(d.layerId, { x: nextX, y: nextY });
          }
        }

        stopDragging();
      };

      const onCancel = () => {
        stopDragging();
      };

      const onBlur = () => {
        stopDragging();
      };

      moveHandlerRef.current = onMove;
      upHandlerRef.current = onUp;
      cancelHandlerRef.current = onCancel;
      blurHandlerRef.current = onBlur;

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel);

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

  return (
    <div
      className="binder-editor-canvas bg-slate-50"
      onMouseDown={handleCanvasMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
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
          {/* Mobile pages button - only visible on mobile */}
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
          
          {/* Desktop page controls - hidden on mobile */}
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

          {/* (unchanged zoom UI) */}
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
        {dragging && (dragFeedback.outside || (dragFeedback.ids?.length || 0) > 0) && (
          <div
            className="canvas-feedback-badge"
            style={{ left: dragFeedback.clientX, top: dragFeedback.clientY }}
            role="status"
            aria-live="polite"
          >
            {dragFeedback.outside
              ? 'Outside page'
              : `Overlap: ${Math.max(1, Math.round(dragFeedback.pct || 0))}%`}
          </div>
        )}

        {resizeFeedback.ids?.length > 0 && (
          <div
            className="canvas-feedback-badge"
            style={{ left: resizeFeedback.clientX, top: resizeFeedback.clientY }}
            role="status"
            aria-live="polite"
          >
            {resizeFeedback.outside
              ? 'Outside page'
              : `Overlap: ${Math.max(1, Math.round(resizeFeedback.pct || 0))}%`}
          </div>
        )}

        <div
          className="canvas-page shadow-lg"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-out'
          }}
        >
          {layers.map((layer) => {
            const isDraggingLayer = dragging && dragRef.current.layerId === layer.id;
            const isSnapAnimating = snapAnimatingLayerId === layer.id;

            const dragInsidePct = isDraggingLayer ? (dragFeedback.insidePct ?? 100) : null;
            const isFullyOutside =
              isDraggingLayer && (dragInsidePct != null ? dragInsidePct <= 0.1 : false);

            const isPartiallyOutside =
              isDraggingLayer && (dragInsidePct != null ? dragInsidePct < 99.9 : false);

            // NEW: outside stripe bands only matter while dragging photo layers
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
                snapGlowX={isDraggingLayer ? activeGlowEdges.x : null}
                snapGlowY={isDraggingLayer ? activeGlowEdges.y : null}
                isDragging={isDraggingLayer}
                isOverlapping={isDraggingLayer && (dragFeedback.ids?.length || 0) > 0}
                isOutside={isPartiallyOutside}
                isOverlapped={!isDraggingLayer && overlapSet.has(layer.id)}
                snapAnimating={isSnapAnimating}
                isFullyOutside={isFullyOutside}
                insidePct={isDraggingLayer ? (dragInsidePct ?? 100) : 100}
                outsideBands={outsideBands} // NEW
              />
            );
          })}

          {layers.length === 0 && (
            <div className="canvas-empty">
              <p>No layers on this page. Click "Add Photo" to start.</p>
            </div>
          )}

          {dragging && (activeGuides.x !== null || activeGuides.y !== null) && (
            <svg
              className="canvas-guides"
              width={PAGE_WIDTH}
              height={PAGE_HEIGHT}
              viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
              aria-hidden="true"
            >
              {activeGuides.x !== null && (
                <line
                  className="canvas-guide-line"
                  x1={activeGuides.x}
                  y1="0"
                  x2={activeGuides.x}
                  y2={PAGE_HEIGHT}
                />
              )}
              {activeGuides.y !== null && (
                <line
                  className="canvas-guide-line"
                  x1="0"
                  y1={activeGuides.y}
                  x2={PAGE_WIDTH}
                  y2={activeGuides.y}
                />
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

export default Canvas;