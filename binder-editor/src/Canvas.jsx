// File: binder-editor/src/Canvas.jsx
// Description: Canvas component for editing layers
// Purpose: Display and manipulate layers on a page

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Layer from './Layer';

// A4 logical size (must match your canvas-page CSS)
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1122;

// Snap distance in *screen* pixels; we convert to logical using current zoom.
const SNAP_SCREEN_PX = 8;

// “Magnet” easing range in *screen* pixels.
const MAGNET_SCREEN_PX = 2;

// Ease-out cubic for the “magnet” feel
function easeOutCubic(t) {
  const tt = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - tt, 3);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return !(
    x1 + w1 <= x2 ||
    x1 >= x2 + w2 ||
    y1 + h1 <= y2 ||
    y1 >= y2 + h2
  );
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
    { kind: 'start', value: proposedStart }, // left/top
    { kind: 'center', value: proposedStart + size / 2 }, // center
    { kind: 'end', value: proposedStart + size } // right/bottom
  ];

  let best = null;

  for (const g of guides) {
    for (const c of candidates) {
      const delta = g - c.value; // shift needed so candidate hits guide
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

function collidesWithRects(x, y, w, h, rects) {
  for (const r of rects) {
    if (!r) continue;
    if (
      rectsOverlap(
        x,
        y,
        w,
        h,
        r.x,
        r.y,
        r.width,
        r.height
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Soft collision resolver:
 * - Instead of “reverting” (sticky), we try to push the moving rect out
 *   along the dominant movement axis (dx/dy), so it “slides” along edges.
 */
function resolveCollisionsSoft({
  desiredX,
  desiredY,
  w,
  h,
  dx,
  dy,
  otherRects
}) {
  let x = desiredX;
  let y = desiredY;
  let collided = false;

  if (!otherRects || otherRects.length === 0) {
    return { x, y, collided: false };
  }

  // A couple of passes helps when we push out of one rect into another.
  for (let pass = 0; pass < 3; pass += 1) {
    let anyThisPass = false;

    for (const r of otherRects) {
      if (!r) continue;

      const hit = rectsOverlap(x, y, w, h, r.x, r.y, r.width, r.height);
      if (!hit) continue;

      collided = true;
      anyThisPass = true;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Prefer resolving along the axis the user is mostly moving.
      const resolveXFirst = absDx >= absDy;

      if (resolveXFirst) {
        if (dx > 0) {
          // moving right: park to the left of obstacle
          x = Math.min(x, r.x - w);
        } else if (dx < 0) {
          // moving left: park to the right of obstacle
          x = Math.max(x, r.x + r.width);
        } else {
          // no dx: fall back to y
          if (dy > 0) y = Math.min(y, r.y - h);
          else if (dy < 0) y = Math.max(y, r.y + r.height);
        }
      } else {
        if (dy > 0) {
          // moving down: park above obstacle
          y = Math.min(y, r.y - h);
        } else if (dy < 0) {
          // moving up: park below obstacle
          y = Math.max(y, r.y + r.height);
        } else {
          // no dy: fall back to x
          if (dx > 0) x = Math.min(x, r.x - w);
          else if (dx < 0) x = Math.max(x, r.x + r.width);
        }
      }

      // Keep inside page bounds after each adjustment
      x = clamp(x, 0, PAGE_WIDTH - w);
      y = clamp(y, 0, PAGE_HEIGHT - h);
    }

    if (!anyThisPass) break;
  }

  return { x, y, collided };
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
  canvasStageRef
}) {
  const [dragging, setDragging] = useState(false);

  // Guides (for rendering)
  const [activeGuides, setActiveGuides] = useState({ x: null, y: null });

  // Which edges to glow while snapping (only for the dragging layer)
  const [activeGlowEdges, setActiveGlowEdges] = useState({ x: null, y: null });

  // Refs for smooth drag
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
    lastUi: { guideX: null, guideY: null, glowX: null, glowY: null }
  });

  const rafRef = useRef(0);
  const lastEventRef = useRef(null);

  const docMoveHandlerRef = useRef(null);
  const docUpHandlerRef = useRef(null);

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

  const clearUi = () => {
    dragRef.current.lastUi = {
      guideX: null,
      guideY: null,
      glowX: null,
      glowY: null
    };
    setActiveGuides({ x: null, y: null });
    setActiveGlowEdges({ x: null, y: null });
  };

  const stopDragging = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

    lastEventRef.current = null;

    // Remove doc listeners
    if (docMoveHandlerRef.current) {
      document.removeEventListener('mousemove', docMoveHandlerRef.current);
      docMoveHandlerRef.current = null;
    }
    if (docUpHandlerRef.current) {
      document.removeEventListener('mouseup', docUpHandlerRef.current);
      docUpHandlerRef.current = null;
    }

    // Restore selection behavior
    try {
      document.body.style.userSelect = '';
    } catch {
      // ignore
    }

    dragRef.current.active = false;
    dragRef.current.layerId = null;
    setDragging(false);
    clearUi();
  }, []);

  const processMove = useCallback(() => {
    rafRef.current = 0;

    const ev = lastEventRef.current;
    if (!ev) return;

    const d = dragRef.current;
    if (!d.active || !d.layerId || !d.pageRect) return;

    const snappingEnabled = !ev.altKey;
    const collisionsEnabled = !ev.shiftKey;

    const zoomAtStart = d.zoom || 1;

    // pointer position in logical page coords
    const px = (ev.clientX - d.pageRect.left) / zoomAtStart;
    const py = (ev.clientY - d.pageRect.top) / zoomAtStart;

    const desiredLeftRaw = px - d.offsetX;
    const desiredTopRaw = py - d.offsetY;

    // movement delta (for collision resolver direction)
    const dx = desiredLeftRaw - d.lastX;
    const dy = desiredTopRaw - d.lastY;

    // bounds
    let proposedLeft = clamp(desiredLeftRaw, 0, PAGE_WIDTH - d.w);
    let proposedTop = clamp(desiredTopRaw, 0, PAGE_HEIGHT - d.h);

    // snapping
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

      // Closest-edge-only glow:
      // - start snap => that edge
      // - end snap => that edge
      // - center snap => closest edge to the guide position
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

      // Default: snap instantly
      let nextLeft = sx.snappedStart;
      let nextTop = sy.snappedStart;

      // Magnet easing: ease only the final tiny pixels (works for start/center/end)
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

    // clamp again (snap can push slightly out)
    snappedLeft = clamp(snappedLeft, 0, PAGE_WIDTH - d.w);
    snappedTop = clamp(snappedTop, 0, PAGE_HEIGHT - d.h);

    // collisions (soft slide)
    let finalX = snappedLeft;
    let finalY = snappedTop;
    let collided = false;

    if (collisionsEnabled && d.otherRects && d.otherRects.length > 0) {
      if (collidesWithRects(finalX, finalY, d.w, d.h, d.otherRects)) {
        const resolved = resolveCollisionsSoft({
          desiredX: finalX,
          desiredY: finalY,
          w: d.w,
          h: d.h,
          dx,
          dy,
          otherRects: d.otherRects
        });
        finalX = resolved.x;
        finalY = resolved.y;
        collided = resolved.collided;
      }
    }

    // Update UI (guides/glow) only if we didn't have to push away due to collision.
    if (snappingEnabled && !collided) {
      setGuidesIfChanged(guideX, guideY);
      setGlowIfChanged(glowXEdge, glowYEdge);
      d.snapTargets = { x: xTarget, y: yTarget };
    } else {
      setGuidesIfChanged(null, null);
      setGlowIfChanged(null, null);
      d.snapTargets = { x: null, y: null };
    }

    // Commit only if changed (avoid flooding state)
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
      const pageEl =
        layerEl?.closest('.canvas-page') ||
        layerEl?.closest('.canvas-stage') ||
        layerEl?.closest('.binder-editor-canvas');

      if (!pageEl) return;

      const pageRect = pageEl.getBoundingClientRect();
      const zoomAtStart = zoom || 1;

      const w = typeof layer.width === 'number' ? layer.width : 0;
      const h = typeof layer.height === 'number' ? layer.height : 0;
      const lx = typeof layer.x === 'number' ? layer.x : 0;
      const ly = typeof layer.y === 'number' ? layer.y : 0;

      // Pointer offset inside the layer (logical coords)
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
            x: typeof l.x === 'number' ? l.x : 0,
            y: typeof l.y === 'number' ? l.y : 0,
            width: typeof l.width === 'number' ? l.width : 0,
            height: typeof l.height === 'number' ? l.height : 0
          }))
          .filter((r) => r.width > 0 && r.height > 0),
        guides: buildGuideCandidates(layers || [], layerId),
        snapTargets: { x: null, y: null },
        lastUi: { guideX: null, guideY: null, glowX: null, glowY: null }
      };

      clearUi();
      setDragging(true);

      // Prevent accidental text selection while dragging
      try {
        document.body.style.userSelect = 'none';
      } catch {
        // ignore
      }

      // Document-level listeners for smooth dragging
      const onMove = (ev) => scheduleMove(ev);

      const onUp = () => {
        // On release, “settle” to perfect snap target if any
        const d = dragRef.current;
        if (d.active && d.layerId) {
          const targetX = d.snapTargets?.x;
          const targetY = d.snapTargets?.y;

          if (targetX !== null || targetY !== null) {
            const nextX = targetX !== null ? clamp(targetX, 0, PAGE_WIDTH - d.w) : d.lastX;
            const nextY = targetY !== null ? clamp(targetY, 0, PAGE_HEIGHT - d.h) : d.lastY;

            // Final collision resolve (if user wasn’t holding Shift)
            // (we can’t know Shift on mouseup reliably, so we keep collision ON here)
            let finalX = nextX;
            let finalY = nextY;

            if (d.otherRects && d.otherRects.length > 0) {
              if (collidesWithRects(finalX, finalY, d.w, d.h, d.otherRects)) {
                const resolved = resolveCollisionsSoft({
                  desiredX: finalX,
                  desiredY: finalY,
                  w: d.w,
                  h: d.h,
                  dx: finalX - d.lastX,
                  dy: finalY - d.lastY,
                  otherRects: d.otherRects
                });
                finalX = resolved.x;
                finalY = resolved.y;
              }
            }

            if (
              Math.abs(finalX - d.lastX) > 0.01 ||
              Math.abs(finalY - d.lastY) > 0.01
            ) {
              d.lastX = finalX;
              d.lastY = finalY;
              onUpdateLayer(d.layerId, { x: finalX, y: finalY });
            }
          }
        }

        stopDragging();
      };

      docMoveHandlerRef.current = onMove;
      docUpHandlerRef.current = onUp;

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [layers, onSelectLayer, onUpdateLayer, scheduleMove, stopDragging, zoom]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDragging();
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
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10V7m0 3h3m-3 0H10" />
              </svg>

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

              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </div>

            <span className="text-sm font-medium text-slate-700 min-w-[45px] text-right tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div className="canvas-stage" ref={canvasStageRef}>
        <div
          className="canvas-page shadow-lg transition-transform duration-200 ease-out"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center'
          }}
        >
          {layers.map((layer) => {
            const isDraggingLayer = dragging && dragRef.current.layerId === layer.id;
            return (
              <Layer
                key={layer.id}
                layer={layer}
                selected={selectedLayerId === layer.id}
                onSelect={() => onSelectLayer(layer.id)}
                onUpdate={onUpdateLayer}
                onRemove={onRemoveLayer}
                onDragStart={handleDragStart}
                binderId={page.binderId || null}
                zoom={zoom}
                snapGlowX={isDraggingLayer ? activeGlowEdges.x : null}
                snapGlowY={isDraggingLayer ? activeGlowEdges.y : null}
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